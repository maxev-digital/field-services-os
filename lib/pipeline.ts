/**
 * lib/pipeline.ts
 * Central pipeline functions for converting storm prospects to customers and jobs.
 * Used by retell webhook, manual conversion, and other entry points.
 */
import prisma from "@/lib/prisma";

interface ProspectToCustomerOpts {
  prospectId: string;
  source?: string; // "storm_campaign", "web_form", "inbound_call", etc.
}

/**
 * When a prospect becomes INTERESTED, auto-create customer if not exists.
 * Matches by phone first, then address.
 */
export async function convertProspectToCustomer(opts: ProspectToCustomerOpts) {
  const prospect = await prisma.storm_prospects.findUnique({
    where: { id: opts.prospectId },
  });
  if (!prospect) return null;

  // Check if customer already exists by phone or address
  let customer = null;
  if (prospect.phone) {
    customer = await prisma.customers.findFirst({
      where: { phone: prospect.phone },
    });
  }
  if (!customer && prospect.address) {
    customer = await prisma.customers.findFirst({
      where: { address: { contains: prospect.address, mode: "insensitive" } },
    });
  }

  if (!customer) {
    customer = await prisma.customers.create({
      data: {
        name: prospect.name || "Storm Lead",
        phone: prospect.phone || "",
        email: prospect.email || null,
        address: prospect.address || null,
        notes: `Auto-created from storm prospect. Source: ${opts.source || "storm_campaign"}. Damage: ${prospect.damage_type || "N/A"}`,
      },
    });
  }

  return customer;
}

/**
 * Create a job in LEAD status when prospect books an inspection.
 */
export async function createInspectionJob(
  customerId: string,
  address: string,
  source: string,
  notes?: string
) {
  return prisma.jobs.create({
    data: {
      customer_id: customerId,
      address,
      status: "LEAD",
      notes: notes || `Inspection requested. Source: ${source}`,
    },
  });
}

/**
 * Full pipeline: prospect -> customer -> job (LEAD).
 * Idempotent: won't create duplicates.
 */
export async function prospectToJob(
  prospectId: string,
  source: string = "storm_campaign"
) {
  const customer = await convertProspectToCustomer({ prospectId, source });
  if (!customer) return null;

  const prospect = await prisma.storm_prospects.findUnique({
    where: { id: prospectId },
  });
  if (!prospect) return null;

  // Check if job already exists for this address + customer
  const existingJob = await prisma.jobs.findFirst({
    where: { customer_id: customer.id, address: prospect.address },
  });
  if (existingJob) return { customer, job: existingJob, existing: true };

  const job = await createInspectionJob(
    customer.id,
    prospect.address,
    source,
    `Storm lead — ${prospect.damage_type || "storm damage"}. Source: ${source}`
  );

  // Update prospect status to CONVERTED
  await prisma.storm_prospects.update({
    where: { id: prospectId },
    data: { status: "CONVERTED", updated_at: new Date() },
  });

  return { customer, job, existing: false };
}
