import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')

  if (!email) {
    return new NextResponse(page('Invalid unsubscribe link.', false), {
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const normalized = email.toLowerCase().trim()

  await Promise.all([
    // Mark matching prospects as DNC
    prisma.storm_prospects.updateMany({
      where: { email: { equals: normalized, mode: 'insensitive' as any } },
      data:  { status: 'DNC' as any, updated_at: new Date() },
    }).catch(() => {}),

    // Record in DNC list keyed by email
    prisma.dnc_list.upsert({
      where:  { phone: `email:${normalized}` },
      create: { id: `dnc_em_${Date.now()}`, phone: `email:${normalized}`, reason: 'Email unsubscribe', source: 'email_unsub' },
      update: { reason: 'Email unsubscribe', source: 'email_unsub' },
    }).catch(() => {}),
  ])

  return new NextResponse(page('You have been unsubscribed.', true), {
    headers: { 'Content-Type': 'text/html' },
  })
}

function page(msg: string, ok: boolean) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Unsubscribed — Roof Works of Texas</title>
  <style>
    body{margin:0;background:#f1f5f9;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;}
    .card{background:#fff;border:1px solid #cbd5e1;max-width:460px;width:90%;padding:48px 40px;text-align:center;}
    h1{margin:0 0 12px;font-size:20px;color:#1a3a5c;}
    p{margin:0;font-size:15px;color:#374151;line-height:1.7;}
    .brand{font-size:11px;font-weight:700;letter-spacing:1.4px;color:#94a3b8;margin:0 0 20px;}
  </style>
</head>
<body>
  <div class="card">
    <p class="brand">ROOF WORKS OF TEXAS</p>
    <h1>${msg}</h1>
    ${ok
      ? '<p>You will not receive further emails from Roof Works of Texas at this address. If this was a mistake, you can reply directly to any of our previous emails.</p>'
      : '<p>Please use the unsubscribe link from one of our emails.</p>'
    }
  </div>
</body>
</html>`
}
