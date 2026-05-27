/**
 * POST /api/admin/prospects/convert
 * Batch-convert INTERESTED prospects to customers + jobs.
 * Body: { prospect_ids: string[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { prospectToJob } from "@/lib/pipeline";

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const ids: string[] = body.prospect_ids || [];

  if (!ids.length) {
    return NextResponse.json(
      { error: "No prospect_ids provided" },
      { status: 400 }
    );
  }

  const results = { converted: 0, already_existed: 0, failed: 0, errors: [] as string[] };

  for (const id of ids) {
    try {
      const result = await prospectToJob(id, "manual_conversion");
      if (!result) {
        results.failed++;
        results.errors.push(`${id}: prospect not found`);
      } else if (result.existing) {
        results.already_existed++;
      } else {
        results.converted++;
      }
    } catch (err: any) {
      results.failed++;
      results.errors.push(`${id}: ${err.message}`);
    }
  }

  return NextResponse.json(results);
}
