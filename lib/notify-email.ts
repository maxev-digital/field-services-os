/**
 * Thin wrapper around nodemailer — used only for internal admin notifications.
 * Separated from mailer.ts to avoid circular imports and keep it minimal.
 */
import nodemailer from 'nodemailer';

const FROM_EMAIL = process.env.OUTREACH_MAILBOX_1_EMAIL || '';
const FROM_PASS  = process.env.OUTREACH_MAILBOX_1_PASS  || '';
const FROM_NAME  = process.env.OUTREACH_MAILBOX_1_NAME  || 'Roof Works Admin';
const SMTP_HOST  = process.env.SMTP_HOST || 'smtp.hostinger.com';
const SMTP_PORT  = parseInt(process.env.SMTP_PORT || '465');

export async function sendEmail(opts: { to: string; subject: string; html: string }) {
  if (!FROM_EMAIL || !FROM_PASS) {
    console.warn('[notify-email] SMTP not configured — skipping notification');
    return;
  }

  const transport = nodemailer.createTransport({
    host:   SMTP_HOST,
    port:   SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth:   { user: FROM_EMAIL, pass: FROM_PASS },
    tls:    { rejectUnauthorized: true },
  });

  await transport.sendMail({
    from:    `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to:      opts.to,
    subject: opts.subject,
    html:    opts.html,
  });
}
