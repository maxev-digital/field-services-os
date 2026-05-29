'use strict';
const { Client } = require('pg');
const fs = require('fs');

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

const PH='(214) 795-3905';
const MSGS=[
  (n,addr)=>`Hi ${n}, just checking in on the roofing estimate we sent for ${addr}. Any questions? Happy to walk you through everything. Call/text ${PH} or reply here. — Roof Works of Texas. Reply STOP to opt out.`,
  (n,addr)=>`${n}, don't forget — insurance-covered repairs often cost you nothing out of pocket. Your estimate for ${addr} is still available. Call ${PH} or reply here. — Roof Works of Texas. Reply STOP to opt out.`,
  (n,addr)=>`Hi ${n}, last follow-up on your roof estimate for ${addr}. We want to make sure you're taken care of. Ready to move forward? ${PH} — Roof Works of Texas. Reply STOP to opt out.`,
];

async function main(){
  const env=loadEnv(ENV_PATH);
  const db=new Client({connectionString:DB_URL});
  await db.connect();

  const{rows}=await db.query(`
    SELECT e.id, e.address, e.sent_at,
           c.name, c.phone,
           COALESCE((SELECT COUNT(*) FROM estimate_followups ef WHERE ef.estimate_id=e.id),0)::int AS followup_count
    FROM estimates e
    JOIN customers c ON c.id=e.customer_id
    WHERE e.status='SENT'
      AND e.sent_at IS NOT NULL
      AND e.sent_at <= NOW() - INTERVAL '3 days'
      AND NOT EXISTS (
        SELECT 1 FROM estimate_followups ef
        WHERE ef.estimate_id=e.id AND ef.sent_at >= NOW() - INTERVAL '3 days'
      )
  `);
  console.log(`[stale-estimate] ${rows.length} estimates to follow up`);

  for(const row of rows){
    const fc=row.followup_count;
    if(fc>=3){continue;}
    const phone=normalizePhone(row.phone||'');
    const name=row.name?row.name.split(' ')[0]:'there';
    if(!phone){continue;}
    const{rows:dnc}=await db.query(`SELECT 1 FROM dnc_list WHERE phone=$1`,[phone]);
    if(dnc.length){console.log(`[stale-estimate] DNC skip ${phone}`);continue;}
    try{
      await sendSms(env,phone,MSGS[fc](name,row.address));
      await db.query(`INSERT INTO estimate_followups(estimate_id,step) VALUES($1,$2)`,[row.id,fc+1]);
      console.log(`[stale-estimate] Follow-up ${fc+1} sent to ${phone} for estimate ${row.id}`);
    }catch(err){console.error(`[stale-estimate] Error ${row.id}:`,err.message);}
  }

  await db.end();
  console.log('[stale-estimate] Done');
}
main().catch(err=>{console.error('[stale-estimate] Fatal:',err.message);process.exit(1);});
