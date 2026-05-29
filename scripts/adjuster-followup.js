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
  await t.sendMail({from:`"Roof Works of Texas" <${env.OUTREACH_MAILBOX_1_EMAIL}>`,to,subject,html});
}

// Enroll any claims filed 3+ days ago with no followups yet
async function enrollNewClaims(db){
  await db.query(`
    INSERT INTO adjuster_followups(id,claim_id,customer_id,step,send_at)
    SELECT gen_random_uuid()::text, ic.id, j.customer_id, 1, NOW()
    FROM insurance_claims ic
    JOIN jobs j ON j.id=ic.job_id
    WHERE ic.status IN ('FILED','PENDING','INSPECTION_SCHEDULED','NEGOTIATING')
      AND ic.date_filed IS NOT NULL
      AND ic.date_filed <= NOW() - INTERVAL '3 days'
      AND NOT EXISTS (SELECT 1 FROM adjuster_followups af WHERE af.claim_id=ic.id)
  `).catch(err=>console.error('[adjuster] Enroll error:',err.message));
}

const STEPS_MSG=[
  null, // step 0 unused
  (n,claimNo,adj)=>`Hi ${n}, Roof Works of Texas following up on your insurance claim${claimNo?' #'+claimNo:''}. ${adj?`Has ${adj} been in contact with you yet?`:'Have you heard from the insurance adjuster yet?'} Call us at (214) 795-3905 — we're here to help. Reply STOP to opt out.`,
  (n,claimNo)=>`${n}, just checking in on your roof insurance claim${claimNo?' #'+claimNo:''}. We want to make sure your claim is moving forward. Call us at (214) 795-3905 if you need any help with the process. Reply STOP to opt out.`,
  (n,claimNo)=>`Hi ${n}, final update on your insurance claim${claimNo?' #'+claimNo:''}. We can help you navigate any issues or delays. Please call us at (214) 795-3905 — Roof Works of Texas.`,
];
const STEP_GAPS=[0,7,14]; // days between steps

async function main(){
  const env=loadEnv(ENV_PATH);
  const db=new Client({connectionString:DB_URL});
  await db.connect();
  await enrollNewClaims(db);

  const{rows}=await db.query(`
    SELECT af.id, af.claim_id, af.customer_id, af.step,
           ic.claim_no, ic.adjuster_name, ic.adjuster_email,
           c.name, c.phone, c.email
    FROM adjuster_followups af
    JOIN insurance_claims ic ON ic.id=af.claim_id
    JOIN customers c ON c.id=af.customer_id
    WHERE af.sent_at IS NULL AND af.send_at<=NOW()
    ORDER BY af.send_at ASC
  `);
  console.log(`[adjuster-followup] ${rows.length} items due`);

  for(const row of rows){
    const name=row.name?row.name.split(' ')[0]:'there';
    const phone=normalizePhone(row.phone||'');
    const step=row.step;
    if(step<1||step>3){
      await db.query(`UPDATE adjuster_followups SET sent_at=NOW() WHERE id=$1`,[row.id]);
      continue;
    }
    try{
      if(phone){
        const{rows:dnc}=await db.query(`SELECT 1 FROM dnc_list WHERE phone=$1`,[phone]);
        if(!dnc.length){
          await sendSms(env,phone,STEPS_MSG[step](name,row.claim_no,row.adjuster_name));
          console.log(`[adjuster-followup] Step ${step} SMS to ${phone}`);
        }
      }
      if(row.email&&step===1){
        await sendEmail(env,row.email,
          `Following up on your insurance claim${row.claim_no?' #'+row.claim_no:''}`,
          `<div style="font-family:Arial,sans-serif;max-width:520px;padding:24px;">
            <h2 style="color:#1a3a5c;">Insurance Claim Update</h2>
            <p>Hi ${name},</p>
            <p>We're following up on your roofing insurance claim${row.claim_no?' #<strong>'+row.claim_no+'</strong>':''}.
            ${row.adjuster_name?`Has your adjuster, <strong>${row.adjuster_name}</strong>, been in contact with you yet?`:'Have you heard from the insurance adjuster yet?'}</p>
            <p>We're here to help guide you through the process and make sure your claim gets approved. Don't hesitate to reach out.</p>
            <p><strong>(214) 795-3905</strong> | info@roofworksoftexas.com</p>
            <p>— Roof Works of Texas</p>
          </div>`
        ).catch(()=>{});
      }
      await db.query(`UPDATE adjuster_followups SET sent_at=NOW() WHERE id=$1`,[row.id]);
      // Schedule next step
      const nextStep=step+1;
      if(nextStep<=3){
        const gapDays=STEP_GAPS[nextStep-1]||7;
        await db.query(`
          INSERT INTO adjuster_followups(id,claim_id,customer_id,step,send_at)
          VALUES(gen_random_uuid()::text,$1,$2,$3,NOW()+($4::int||' days')::interval)
        `,[row.claim_id,row.customer_id,nextStep,gapDays]);
      }
    }catch(err){console.error(`[adjuster-followup] Error ${row.id}:`,err.message);}
  }

  await db.end();
  console.log('[adjuster-followup] Done');
}
main().catch(err=>{console.error('[adjuster-followup] Fatal:',err.message);process.exit(1);});
