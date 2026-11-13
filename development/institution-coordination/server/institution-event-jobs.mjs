import {createHash} from 'node:crypto';
import {projectMultiInstitutionEvent} from './route-event.mjs';
const at=()=>new Date().toISOString();
const changes=r=>Number(r?.meta?.changes??0);
export function createInstitutionEventJobs({db,rules,project=projectMultiInstitutionEvent}){
 let running=null;
 async function enqueue(event,{historical=false}={}){
  if(typeof event?.id!=='string'||!event.id||!rules.version)throw Error('event_identity_and_policy_version_required');
  const payload=JSON.stringify({...event,historical:historical||event.historical===true});
  if(Buffer.byteLength(payload)>65536)throw Error('event_too_large');
  const key=createHash('sha256').update(rules.version+'\n'+payload).digest('hex');
  const r=await db.prepare(`INSERT INTO coord_event_jobs(job_key,event_id,policy_version,event_json,state,available_at,created_at)
    VALUES(?,?,?,?,'queued',?,?) ON CONFLICT(job_key) DO NOTHING`).bind(key,event.id,String(rules.version),payload,at(),at()).run();
  return {queued:changes(r)===1};
 }
 async function drain({limit=10}={}){
  if(running)return running;
  running=(async()=>{
   await db.prepare(`UPDATE coord_event_jobs SET state=CASE WHEN attempts>=5 THEN 'dead' ELSE 'queued' END,
    available_at=?,lease_until=NULL WHERE state='processing' AND lease_until<=?`).bind(at(),at()).run();
   const jobs=(await db.prepare(`SELECT job_key,event_json FROM coord_event_jobs WHERE state='queued' AND available_at<=? AND attempts<5
    ORDER BY created_at,job_key LIMIT ?`).bind(at(),Math.max(1,Math.min(25,limit|0))).all()).results;
   const result={processed:0,failed:0};
   for(const job of jobs){
    const claim=await db.prepare(`UPDATE coord_event_jobs SET state='processing',attempts=attempts+1,lease_until=? WHERE job_key=? AND state='queued'`)
     .bind(new Date(Date.now()+300000).toISOString(),job.job_key).run();if(changes(claim)!==1)continue;
    try{
     const decision=await project({db,event:JSON.parse(job.event_json),rules});
     // Projection commits before acknowledgment. Replays are idempotent if a crash happens here.
     const summary={decision:decision.decision,reason:decision.reason,routes:(decision.routes||[]).map(r=>({institution:r.institution,topic:r.topic,decision:r.decision,reason:r.reason}))};
     await db.prepare(`UPDATE coord_event_jobs SET state='completed',decision_json=?,completed_at=?,lease_until=NULL WHERE job_key=? AND state='processing'`)
      .bind(JSON.stringify(summary),at(),job.job_key).run();result.processed++;
    }catch{
     await db.prepare(`UPDATE coord_event_jobs SET state=CASE WHEN attempts>=5 THEN 'dead' ELSE 'queued' END,
      available_at=?,lease_until=NULL WHERE job_key=? AND state='processing'`).bind(new Date(Date.now()+60000).toISOString(),job.job_key).run();result.failed++;
    }
   }return result;
  })();try{return await running}finally{running=null}
 }
 return {enqueue,drain};
}
