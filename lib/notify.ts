/**
 * Admin notification helper — sends internal alerts to ADMIN_NOTIFY_EMAIL.
 * Uses the first configured Hostinger mailbox.
 * Never throws — failures are logged but don't break the triggering request.
 */
import { sendEmail } from '@/lib/notify-email';

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || process.env.OUTREACH_MAILBOX_1_EMAIL || '';
const SITE_URL    = process.env.NEXT_PUBLIC_SITE_URL || 'https://roofworksoftexas.com';
const ADMIN_URL   = 'https://admin.roofworksoftexas.com';

function fmt(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Estimate submitted ───────────────────────────────────────────────────────

interface EstimateLineItem {
  label:    string;
  category: string;
  qty:      number;
  unit:     string;
  insAmt:   number;
  ourAmt:   number;
  delta:    number;
}

export async function notifyNewEstimate(opts: {
  estimateId:     string;
  customerName:   string;
  customerPhone:  string;
  customerEmail?: string | null;
  address:        string;
  insurer?:       string | null;
  claimNo?:       string | null;
  ourTotal:       number;
  insuranceTotal: number;
  lineItems:      EstimateLineItem[];
}) {
  if (!ADMIN_EMAIL) return;

  const viewUrl  = `${ADMIN_URL}/admin/estimates/${opts.estimateId}`;
  const savings  = opts.insuranceTotal - opts.ourTotal;
  const savePct  = opts.insuranceTotal > 0 ? (savings / opts.insuranceTotal * 100).toFixed(1) : '0';

  // Group line items by category
  const groups = new Map<string, EstimateLineItem[]>();
  for (const li of opts.lineItems) {
    const cat = li.category || 'Other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(li);
  }

  const lineItemsHtml = Array.from(groups.entries()).map(([cat, items]) => `
    <tr>
      <td colspan="5" style="padding:10px 12px 4px;background:#111827;color:#dc2626;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em">
        ${cat}
      </td>
    </tr>
    ${items.map(li => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #1f2937;color:#e5e7eb;font-size:12px">${li.label}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:12px;text-align:right">${li.qty % 1 === 0 ? li.qty : li.qty.toFixed(2)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:12px;text-align:right">${li.unit}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #1f2937;color:#a78bfa;font-size:12px;text-align:right">${fmt(li.insAmt)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #1f2937;color:#34d399;font-size:12px;text-align:right">${fmt(li.ourAmt)}</td>
    </tr>`).join('')}
  `).join('');

  await sendEmail({
    to:      ADMIN_EMAIL,
    subject: `🏠 New Estimate — ${opts.customerName} · ${fmt(opts.ourTotal)}`,
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:20px;background:#0f172a;font-family:Arial,sans-serif;color:#e5e7eb">
  <div style="max-width:640px;margin:0 auto">

    <!-- Header -->
    <div style="background:#7f1d1d;padding:16px 20px;border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:space-between">
      <div>
        <h2 style="margin:0;color:#fff;font-size:18px">New Estimate Submitted</h2>
        <p style="margin:4px 0 0;color:#fca5a5;font-size:12px">Roof Works of Texas · ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} CT</p>
      </div>
      <div style="text-align:right">
        <div style="color:#fff;font-size:22px;font-weight:bold">${fmt(opts.ourTotal)}</div>
        <div style="color:#fca5a5;font-size:11px">Our Price</div>
      </div>
    </div>

    <!-- Customer info -->
    <div style="background:#1f2937;padding:16px 20px;border:1px solid #374151;border-top:0">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #374151;color:#9ca3af;font-size:12px;width:120px">Customer</td>
          <td style="padding:6px 0;border-bottom:1px solid #374151;color:#fff;font-weight:bold">${opts.customerName}</td>
          <td style="padding:6px 0;border-bottom:1px solid #374151;color:#9ca3af;font-size:12px;width:100px">Phone</td>
          <td style="padding:6px 0;border-bottom:1px solid #374151"><a href="tel:${opts.customerPhone}" style="color:#f87171;font-weight:bold">${opts.customerPhone}</a></td>
        </tr>
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #374151;color:#9ca3af;font-size:12px">Property</td>
          <td colspan="3" style="padding:6px 0;border-bottom:1px solid #374151;color:#fff">${opts.address}</td>
        </tr>
        ${opts.customerEmail ? `
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #374151;color:#9ca3af;font-size:12px">Email</td>
          <td colspan="3" style="padding:6px 0;border-bottom:1px solid #374151"><a href="mailto:${opts.customerEmail}" style="color:#f87171">${opts.customerEmail}</a></td>
        </tr>` : ''}
        ${opts.insurer ? `
        <tr>
          <td style="padding:6px 0;color:#9ca3af;font-size:12px">Insurer</td>
          <td colspan="3" style="padding:6px 0;color:#fff">${opts.insurer}${opts.claimNo ? ` · Claim #${opts.claimNo}` : ''}</td>
        </tr>` : ''}
      </table>
    </div>

    <!-- Line items table -->
    <div style="background:#111827;border:1px solid #374151;border-top:0">
      <div style="padding:10px 12px;background:#0f172a;border-bottom:1px solid #374151">
        <span style="color:#9ca3af;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em">Line Items (${opts.lineItems.length})</span>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#0f172a">
            <th style="padding:6px 12px;text-align:left;color:#6b7280;font-size:11px;font-weight:600">Item</th>
            <th style="padding:6px 8px;text-align:right;color:#6b7280;font-size:11px;font-weight:600">Qty</th>
            <th style="padding:6px 8px;text-align:right;color:#6b7280;font-size:11px;font-weight:600">Unit</th>
            <th style="padding:6px 8px;text-align:right;color:#6b7280;font-size:11px;font-weight:600">Ins.</th>
            <th style="padding:6px 12px;text-align:right;color:#6b7280;font-size:11px;font-weight:600">Ours</th>
          </tr>
        </thead>
        <tbody>${lineItemsHtml}</tbody>
      </table>
    </div>

    <!-- Totals -->
    <div style="background:#1f2937;padding:16px 20px;border:1px solid #374151;border-top:0">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:4px 0;color:#9ca3af;font-size:13px">Insurance Allowance</td>
          <td style="padding:4px 0;color:#a78bfa;font-weight:bold;text-align:right">${fmt(opts.insuranceTotal)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#9ca3af;font-size:13px">Roof Works Price</td>
          <td style="padding:4px 0;color:#34d399;font-weight:bold;font-size:16px;text-align:right">${fmt(opts.ourTotal)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#9ca3af;font-size:13px">Customer Savings</td>
          <td style="padding:4px 0;color:#34d399;font-size:12px;text-align:right">${fmt(savings)} (${savePct}% below allowance)</td>
        </tr>
      </table>
    </div>

    <!-- CTA -->
    <div style="background:#111827;padding:16px 20px;border-radius:0 0 8px 8px;border:1px solid #374151;border-top:0;text-align:center">
      <a href="${viewUrl}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">
        View Full Estimate in Admin →
      </a>
    </div>

  </div>
</body>
</html>`,
  }).catch(err => console.error('[notify] estimate email failed:', err));
}

// ─── Estimate customer confirmation ──────────────────────────────────────────

export async function notifyEstimateCustomer(opts: {
  estimateId:     string;
  customerName:   string;
  customerEmail:  string;
  address:        string;
  insurer?:       string | null;
  claimNo?:       string | null;
  ourTotal:       number;
  insuranceTotal: number;
  lineItems:      EstimateLineItem[];
}) {
  const groups = new Map<string, EstimateLineItem[]>();
  for (const li of opts.lineItems) {
    const cat = li.category || 'Other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(li);
  }

  const lineItemsHtml = Array.from(groups.entries()).map(([cat, items]) => `
    <tr>
      <td colspan="4" style="padding:8px 12px 4px;background:#f3f4f6;color:#374151;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em">
        ${cat}
      </td>
    </tr>
    ${items.map(li => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:13px">${li.label}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;text-align:right">${li.qty % 1 === 0 ? li.qty : li.qty.toFixed(2)} ${li.unit}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;text-align:right">${fmt(li.insAmt)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;color:#b91c1c;font-size:12px;text-align:right;font-weight:600">${fmt(li.ourAmt)}</td>
    </tr>`).join('')}
  `).join('');

  const savings  = opts.insuranceTotal - opts.ourTotal;
  const savePct  = opts.insuranceTotal > 0 ? (savings / opts.insuranceTotal * 100).toFixed(1) : '0';
  const viewUrl  = `${SITE_URL}/estimate`;

  await sendEmail({
    to:      opts.customerEmail,
    subject: `Your Roof Works of Texas Estimate — ${fmt(opts.ourTotal)}`,
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:20px;background:#f9fafb;font-family:Arial,sans-serif;color:#1f2937">
  <div style="max-width:620px;margin:0 auto">

    <!-- Logo -->
    <div style="text-align:center;padding:24px 0 8px">
      <img src="https://roofworksoftexas.com/images/logo-3d.png" width="200" alt="Roof Works of Texas" style="display:block;margin-bottom:16px;margin-left:auto;margin-right:auto;" />
    </div>

    <!-- Header -->
    <div style="background:#7f1d1d;padding:20px 24px;border-radius:8px 8px 0 0">
      <h2 style="margin:0;color:#fff;font-size:20px">Your Estimate Comparison</h2>
      <p style="margin:6px 0 0;color:#fca5a5;font-size:13px">Roof Works of Texas · DFW Roofing Contractor</p>
    </div>

    <!-- Greeting -->
    <div style="background:#fff;padding:20px 24px;border:1px solid #e5e7eb;border-top:0">
      <p style="margin:0 0 12px">Hi ${opts.customerName},</p>
      <p style="margin:0 0 16px;color:#374151;line-height:1.6">
        Thank you for using our online estimate tool. Below is your detailed comparison between your insurance allowance and our price.
        A member of our team will follow up with you shortly to answer any questions.
      </p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        ${opts.address ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px;width:130px">Property</td><td style="padding:4px 0;color:#1f2937">${opts.address}</td></tr>` : ''}
        ${opts.insurer ? `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px">Insurer</td><td style="padding:4px 0;color:#1f2937">${opts.insurer}${opts.claimNo ? ` · Claim #${opts.claimNo}` : ''}</td></tr>` : ''}
      </table>

      <!-- Summary boxes -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr>
          <td style="padding:12px;background:#eff6ff;border-radius:8px;text-align:center;width:33%">
            <div style="color:#6b7280;font-size:11px;margin-bottom:4px">Insurance Allowance</div>
            <div style="color:#1e40af;font-size:18px;font-weight:bold">${fmt(opts.insuranceTotal)}</div>
          </td>
          <td style="width:8px"></td>
          <td style="padding:12px;background:#fef2f2;border-radius:8px;text-align:center;width:33%">
            <div style="color:#6b7280;font-size:11px;margin-bottom:4px">Roof Works Price</div>
            <div style="color:#b91c1c;font-size:18px;font-weight:bold">${fmt(opts.ourTotal)}</div>
          </td>
          <td style="width:8px"></td>
          <td style="padding:12px;background:#f0fdf4;border-radius:8px;text-align:center;width:33%">
            <div style="color:#6b7280;font-size:11px;margin-bottom:4px">Your Savings</div>
            <div style="color:#15803d;font-size:18px;font-weight:bold">${fmt(savings)}</div>
            <div style="color:#6b7280;font-size:10px">${savePct}% below allowance</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Line items -->
    <div style="background:#fff;border:1px solid #e5e7eb;border-top:0">
      <div style="padding:10px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb">
        <span style="color:#6b7280;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em">Estimate Breakdown (${opts.lineItems.length} items)</span>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f9fafb">
            <th style="padding:6px 12px;text-align:left;color:#9ca3af;font-size:11px;font-weight:600">Item</th>
            <th style="padding:6px 8px;text-align:right;color:#9ca3af;font-size:11px;font-weight:600">Qty</th>
            <th style="padding:6px 8px;text-align:right;color:#9ca3af;font-size:11px;font-weight:600">Insurance</th>
            <th style="padding:6px 12px;text-align:right;color:#9ca3af;font-size:11px;font-weight:600">Our Price</th>
          </tr>
        </thead>
        <tbody>${lineItemsHtml}</tbody>
        <tfoot>
          <tr style="background:#fef2f2">
            <td colspan="2" style="padding:10px 12px;font-weight:bold;color:#1f2937">TOTAL</td>
            <td style="padding:10px 8px;text-align:right;font-weight:bold;color:#1e40af">${fmt(opts.insuranceTotal)}</td>
            <td style="padding:10px 12px;text-align:right;font-weight:bold;color:#b91c1c;font-size:15px">${fmt(opts.ourTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Footer CTA -->
    <div style="background:#fff;padding:20px 24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;text-align:center">
      <p style="margin:0 0 16px;color:#374151;font-size:13px">
        Questions? Call us or reply to this email — we're happy to walk you through every line item.
      </p>
      <a href="tel:2147953905" style="display:inline-block;background:#b91c1c;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">
        📞 Call 214-795-3905
      </a>
      <p style="margin:16px 0 0;font-size:11px;color:#9ca3af">
        Roof Works of Texas · DFW Roofing Contractor · GAF Certified<br>
        This estimate is based on quantities you provided. Final pricing subject to on-site inspection.
      </p>
    </div>

  </div>
</body>
</html>`,
  }).catch(err => console.error('[notify] customer estimate email failed:', err));
}

// ─── Contact form submitted ───────────────────────────────────────────────────

export async function notifyNewContact(opts: {
  name:    string;
  phone:   string;
  email?:  string | null;
  message: string;
  source?: string;
}) {
  if (!ADMIN_EMAIL) return;

  await sendEmail({
    to:      ADMIN_EMAIL,
    subject: `📞 New Contact — ${opts.name}`,
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:20px;background:#111827;font-family:Arial,sans-serif;color:#e5e7eb">
  <div style="max-width:520px;margin:0 auto">
    <div style="background:#1e3a5f;padding:16px 20px;border-radius:8px 8px 0 0">
      <h2 style="margin:0;color:#fff;font-size:18px">New Contact Form Submission</h2>
      <p style="margin:4px 0 0;color:#93c5fd;font-size:13px">Roof Works of Texas${opts.source ? ` · ${opts.source}` : ''}</p>
    </div>
    <div style="background:#1f2937;padding:20px;border-radius:0 0 8px 8px;border:1px solid #374151;border-top:0">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #374151;color:#9ca3af;font-size:13px;width:100px">Name</td>
          <td style="padding:8px 0;border-bottom:1px solid #374151;color:#fff;font-weight:bold">${opts.name}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #374151;color:#9ca3af;font-size:13px">Phone</td>
          <td style="padding:8px 0;border-bottom:1px solid #374151"><a href="tel:${opts.phone}" style="color:#60a5fa;font-weight:bold">${opts.phone}</a></td>
        </tr>
        ${opts.email ? `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #374151;color:#9ca3af;font-size:13px">Email</td>
          <td style="padding:8px 0;border-bottom:1px solid #374151"><a href="mailto:${opts.email}" style="color:#60a5fa">${opts.email}</a></td>
        </tr>` : ''}
        <tr>
          <td style="padding:8px 0;color:#9ca3af;font-size:13px;vertical-align:top">Message</td>
          <td style="padding:8px 0;color:#e5e7eb;line-height:1.5">${opts.message.replace(/\n/g, '<br>')}</td>
        </tr>
      </table>
      <div style="margin-top:20px;text-align:center">
        <a href="${ADMIN_URL}/admin/leads" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">
          View in Admin →
        </a>
        <a href="tel:${opts.phone}" style="display:inline-block;background:#374151;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-size:14px;margin-left:8px">
          Call Now
        </a>
      </div>
      <p style="margin-top:16px;font-size:11px;color:#6b7280;text-align:center">
        Submitted at ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT
      </p>
    </div>
  </div>
</body>
</html>`,
  }).catch(err => console.error('[notify] contact email failed:', err));
}
