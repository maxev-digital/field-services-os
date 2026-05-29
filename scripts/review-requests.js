'use strict';
const { Client } = require('pg');
const fs = require('fs');
const nodemailer = require('nodemailer');

const DB_URL   = 'postgresql://roofworks:roofworks_secure_2026@localhost:5440/roofworks';
const ENV_PATH = '/var/www/roof-works-admin/.env';

function loadEnv(p){
  const e={};
  try{fs.readFileSync(p,'utf8').split('\n').forEach(l=>{const m=l.match(/^([^#=]+)=(.*)/);if(m)e[m[1].trim()]=m[2].trim().replace(/^["']|["']$/g,'');});}catch{}
  return e;
}
function normalizePhone(raw){
  const d=(raw||'').replace(/\D/g,'');
  if(d.length===10)return`+1${d}`;
  if(d.length===11&&d.startsWith('1'))return`+${d}`;
  return d.length>10?`+${d}`:'';
}
async function sendSms(env,to,body){
  const{TWILIO_ACCOUNT_SID:sid,TWILIO_AUTH_TOKEN:tok,TWILIO_FROM_NUMBER:from}=env;
  if(!sid||!tok||!from)return;
  const auth=Buffer.from(`${sid}:${tok}`).toString('base64');
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,{
    method:'POST',
    headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({To:to,From:from,Body:body}).toString(),
    signal:AbortSignal.timeout(12000),
  });
}
async function sendEmail(env,to,subject,html){
  if(!env.SMTP_HOST||!to)return;
  const t=nodemailer.createTransport({
    host:env.SMTP_HOST,port:parseInt(env.SMTP_PORT)||465,secure:true,
    auth:{user:env.OUTREACH_MAILBOX_1_EMAIL,pass:env.OUTREACH_MAILBOX_1_PASS},
  });
  await t.sendMail({
    from:`"Roof Works of Texas" <${env.OUTREACH_MAILBOX_1_EMAIL}>`,
    to,subject,html,
  });
}

async function main(){
  const env=loadEnv(ENV_PATH);
  const reviewUrl=env.GOOGLE_REVIEW_URL||'https://g.page/r/roofworksoftexas/review';
  const db=new Client({connectionString:DB_URL});
  await db.connect();

  const{rows}=await db.query(`
    SELECT j.id AS job_id, j.address, j.updated_at,
           c.name, c.phone, c.email
    FROM jobs j
    JOIN customers c ON c.id=j.customer_id
    WHERE j.status='PAID'
      AND j.review_requested_at IS NULL
      AND j.updated_at <= NOW() - INTERVAL '3 days'
      AND NOT EXISTS (SELECT 1 FROM review_requests r WHERE r.job_id=j.id)
  `);
  console.log(`[review-requests] ${rows.length} jobs ready for review request`);

  for(const row of rows){
    const phone=normalizePhone(row.phone||'');
    const name=row.name?row.name.split(' ')[0]:'there';
    try{
      if(phone){
        const{rows:dnc}=await db.query(`SELECT 1 FROM dnc_list WHERE phone=$1`,[phone]);
        if(!dnc.length){
          await sendSms(env,phone,
            `Hi ${name}, thank you for choosing Roof Works of Texas! We hope you're loving your new roof. Could you take 30 seconds to leave us a review? It means the world to us: ${reviewUrl} — (214) 795-3905. Reply STOP to opt out.`
          );
          console.log(`[review-requests] SMS sent to ${phone}`);
        }
      }
      if(row.email){
        await sendEmail(env,row.email,
          'How did we do? Leave us a quick review!',
          `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
            <h2 style="color:#dc2626;">Thank You, ${name}!</h2>
            <p>We hope you're thrilled with your new roof at ${row.address}.</p>
            <p>Could you take 30 seconds to leave us a Google review? Your feedback helps other homeowners find trusted contractors and means the world to our team.</p>
            <p style="text-align:center;margin:24px 0;">
              <a href="${reviewUrl}" style="background:#dc2626;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Leave a Review</a>
            </p>
            <p style="color:#6b7280;font-size:13px;">Thank you again for trusting Roof Works of Texas. — The Roof Works Team<br>(214) 795-3905 | roofworksoftexas.com</p>
          </div>`
        ).catch(()=>{});
        console.log(`[review-requests] Email sent to ${row.email}`);
      }
      await db.query(`
        INSERT INTO review_requests(id,job_id,sent_via)
        VALUES(gen_random_uuid()::text,$1,'sms+email')
        ON CONFLICT(job_id) DO NOTHING
      `,[row.job_id]);
      await db.query(`UPDATE jobs SET review_requested_at=NOW() WHERE id=$1`,[row.job_id]);
    }catch(err){console.error(`[review-requests] Error ${row.job_id}:`,err.message);}
  }

  await db.end();
  console.log('[review-requests] Done');
}
main().catch(err=>{console.error('[review-requests] Fatal:',err.message);process.exit(1);});
