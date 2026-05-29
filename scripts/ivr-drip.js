'use strict';
const { Client } = require('pg');
const fs = require('fs');

const DB_URL   = 'postgresql://roofworks:roofworks_secure_2026@localhost:5440/roofworks';
const ENV_PATH = '/var/www/roof-works-admin/.env';

function loadEnv(p) {
  const e = {};
  try { fs.readFileSync(p,'utf8').split('\n').forEach(l=>{const m=l.match(/^([^#=]+)=(.*)/);if(m)e[m[1].trim()]=m[2].trim().replace(/^["']|["']$/g,'');});}catch{}
  return e;
}

function normalizePhone(raw) {
  const d=(raw||'').replace(/\D/g,'');
  if(d.length===10)return`+1${d}`;
  if(d.length===11&&d.startsWith('1'))return`+${d}`;
  return d.length>10?`+${d}`:'';
}

async function sendSms(env,to,body){
  const{TWILIO_ACCOUNT_SID:sid,TWILIO_AUTH_TOKEN:tok,TWILIO_FROM_NUMBER:from}=env;
  if(!sid||!tok||!from)return;
  const auth=Buffer.from(`${sid}:${tok}`).toString('base64');
  const res=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,{
    method:'POST',
    headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({To:to,From:from,Body:body}).toString(),
    signal:AbortSignal.timeout(12000),
  });
  const d=await res.json();
  if(d.error_code)throw new Error(`Twilio ${d.error_code}: ${d.message}`);
}

const CALENDLY='https://calendly.com/roofworksoftexas/30min';
const PH='(214) 795-3905';

const STEPS=[
  n=>`Hi ${n}, this is Roof Works of Texas following up. Were you able to book your free roof inspection? Grab a time here: ${CALENDLY} — Call/text us at ${PH}. Reply STOP to opt out.`,
  n=>`Hi ${n}, just a reminder — storm damage repairs are often 100% covered by insurance. Book your free inspection before slots fill up: ${CALENDLY} — Roof Works of Texas ${PH}. Reply STOP to opt out.`,
  n=>`${n}, last follow-up from Roof Works of Texas. No cost, no obligation — we handle everything with your insurance. Interested? ${CALENDLY} or call ${PH}. Reply STOP to opt out.`,
];

async function main(){
  const env=loadEnv(ENV_PATH);
  const db=new Client({connectionString:DB_URL});
  await db.connect();

  const{rows}=await db.query(`
    SELECT q.id,q.prospect_id,q.step,
           sp.name,sp.phone,sp.status
    FROM ivr_drip_queue q
    JOIN storm_prospects sp ON sp.id=q.prospect_id
    WHERE q.completed=FALSE AND q.cancelled=FALSE
      AND q.next_send_at<=NOW()
  `);
  console.log(`[ivr-drip] ${rows.length} items due`);

  for(const row of rows){
    try{
      if(['DNC','CONVERTED','APPOINTMENT_SET'].includes(row.status)){
        await db.query(`UPDATE ivr_drip_queue SET cancelled=TRUE WHERE id=$1`,[row.id]);
        console.log(`[ivr-drip] Cancelled ${row.prospect_id} (${row.status})`);
        continue;
      }
      const phone=normalizePhone(row.phone||'');
      const name=row.name?row.name.split(' ')[0]:'there';
      const step=row.step;
      if(step>=STEPS.length){
        await db.query(`UPDATE ivr_drip_queue SET completed=TRUE WHERE id=$1`,[row.id]);
        continue;
      }
      if(phone){
        const{rows:dnc}=await db.query(`SELECT 1 FROM dnc_list WHERE phone=$1`,[phone]);
        if(!dnc.length){
          await sendSms(env,phone,STEPS[step](name));
          console.log(`[ivr-drip] Step ${step} sent to ${phone}`);
        }
      }
      const nextStep=step+1;
      if(nextStep>=STEPS.length){
        await db.query(`UPDATE ivr_drip_queue SET step=$1,completed=TRUE WHERE id=$2`,[nextStep,row.id]);
      }else{
        const gapHours=[22,24][step]||24;
        const nextSend=new Date(Date.now()+gapHours*3600*1000);
        await db.query(`UPDATE ivr_drip_queue SET step=$1,next_send_at=$2 WHERE id=$3`,[nextStep,nextSend.toISOString(),row.id]);
      }
    }catch(err){console.error(`[ivr-drip] Error ${row.prospect_id}:`,err.message);}
  }
  await db.end();
  console.log('[ivr-drip] Done');
}

main().catch(err=>{console.error('[ivr-drip] Fatal:',err.message);process.exit(1);});
