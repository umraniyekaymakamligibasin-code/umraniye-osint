import{DatabaseSync}from'node:sqlite';
import{createHash,randomUUID}from'node:crypto';
import{readFileSync}from'node:fs';
import{preview,persistPlan,snapshot,adaptEvent}from'./live-adapter.mjs';
import{canonicalSource}from'./source-url.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const hour=3600000;
export function initDelivery(db){
 db.exec(readFileSync(new URL('./delivery-queue.sql',import.meta.url),'utf8'));
 if(!db.prepare("SELECT 1 FROM cit_delivery_meta WHERE key='seeded'").get()){
  db.exec('BEGIN IMMEDIATE');try{
   db.exec('INSERT OR IGNORE INTO cit_delivery_jobs(event_id) SELECT id FROM lab_items');
   db.prepare("INSERT OR IGNORE INTO cit_delivery_meta VALUES('seeded','1')").run();db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
}
export function currentPolicy(db){
 const files=['engine.mjs','language.mjs','locality.mjs','catalog.mjs','domain-catalog.mjs','extended-catalog.mjs','incident-rules.mjs','live-adapter.mjs','legacy-rules.mjs','../kurum/topic-terms.json','pipeline.mjs'];
 let dictionary='';try{dictionary=db.prepare("SELECT data FROM workspace_settings WHERE id='location-dictionary'").get()?.data||'';}catch{}
 const approvals=snapshot(db);for(const rows of Object.values(approvals))rows.sort((a,b)=>String(a.id||a.institution_id+'|'+a.topic_id).localeCompare(String(b.id||b.institution_id+'|'+b.topic_id)));
 return hash(files.map(f=>readFileSync(new URL(f,import.meta.url),'utf8')).join('\n')+JSON.stringify(approvals)+dictionary);
}
function audit(db,caseId,institutionId,action,stamp){db.prepare("INSERT INTO coord_audit VALUES(?,NULL,'system',?,?,'case',?,NULL,?)").run(randomUUID(),institutionId,action,caseId,new Date(stamp).toISOString());}
function permitted(db,c){return Boolean(db.prepare(`SELECT 1 FROM coord_institutions i JOIN coord_topics t ON t.id=? JOIN coord_institution_topic_grants g ON g.institution_id=i.id AND g.topic_id=t.id WHERE i.id=? AND i.enabled=1 AND i.approval_status='approved' AND length(trim(i.approval_reference))>0 AND t.enabled=1 AND t.approval_status='approved' AND length(trim(t.approval_reference))>0 AND g.granted=1 AND length(trim(g.approval_reference))>0`).get(c.topic_id,c.institution_id));}
function resolveCase(db,e,task){
 // IDs in persistent keys are database IDs, not public institution/topic codes.
 return db.prepare(`SELECT c.* FROM coord_cases c JOIN coord_institutions i ON i.id=c.institution_id JOIN coord_topics t ON t.id=c.topic_id WHERE i.code=? AND t.code=? AND (c.source_event_id=? OR c.idempotency_key=?) LIMIT 1`).get(task.institution,task.topic,e.id,JSON.stringify([db.prepare('SELECT id FROM coord_institutions WHERE code=?').get(task.institution)?.id,e.eventIdentity||e.id,db.prepare('SELECT id FROM coord_topics WHERE code=?').get(task.topic)?.id]));
}
function synchronize(db,e,plan,revision,now){
 const desired=new Set();let updated=0,withdrawn=0,restored=0,verified=0;
 for(const task of plan.results[0].tasks){
  let c=resolveCase(db,e,task);
  if(!c&&task.legacyTopic)c=db.prepare(`SELECT c.* FROM coord_cases c JOIN coord_institutions i ON i.id=c.institution_id JOIN coord_topics t ON t.id=c.topic_id WHERE i.code=? AND t.code=? AND c.source_event_id=? LIMIT 1`).get(task.institution,task.legacyTopic,e.id);
  if(!c||!permitted(db,c))throw Error('delivery_verification_failed');
  desired.add(c.id);verified++;
  // Adopt only cases created by this engine; legacy/human records are preserved.
  const owned=db.prepare("SELECT 1 FROM coord_audit WHERE target_id=? AND action='cit_projection' LIMIT 1").get(c.id);
  if(!owned)continue;
  const prior=db.prepare('SELECT * FROM cit_case_links WHERE event_id=? AND case_id=?').get(e.id,c.id);
  if(prior?.active===0&&c.status==='dismissed'&&prior.previous_status&&c.updated_at===prior.auto_status_at){
   db.prepare('UPDATE coord_cases SET status=?,updated_at=? WHERE id=?').run(prior.previous_status,new Date(now).toISOString(),c.id);audit(db,c.id,c.institution_id,'cit_auto_restored',now);restored++;
  }
  const expectedUrls=(e.sources?.length?e.sources:[e]).map(s=>canonicalSource(s?.url)).filter(Boolean);
  const actualUrls=db.prepare('SELECT source_url FROM coord_case_sources WHERE coord_case_id=?').all(c.id).map(s=>s.source_url);
  const primary=c.source_event_id===e.id;
  if((primary&&c.source_revision!==revision)||expectedUrls.some(url=>!actualUrls.includes(url))){
   if(primary)db.prepare('UPDATE coord_cases SET source_revision=?,title=?,summary_redacted=?,neighborhood=?,location_precision=?,updated_at=? WHERE id=?').run(revision,task.title,task.summary,task.locality.neighborhood,task.locality.precision,new Date(now).toISOString(),c.id);
   updated++;
   // A shared case keeps every active source, without alternating its owner revision.
   const events=[e];
   for(const row of db.prepare('SELECT l.data FROM lab_items l JOIN cit_case_links k ON k.event_id=l.id WHERE k.case_id=? AND k.active=1 AND k.event_id<>?').all(c.id,e.id)){try{events.push(JSON.parse(row.data));}catch{}}
   db.prepare('DELETE FROM coord_case_sources WHERE coord_case_id=?').run(c.id);
   for(const event of events)for(const s of event.sources?.length?event.sources:[event]){const url=canonicalSource(s?.url);if(url)db.prepare('INSERT OR IGNORE INTO coord_case_sources VALUES(?,?,?,?,?,?,?)').run(randomUUID(),c.id,url,String(s.sourceName||'Kaynak').slice(0,120),String(s.platform||event.platform||'web').slice(0,32),c.first_published_at,new Date(now).toISOString());}
   audit(db,c.id,c.institution_id,'cit_auto_updated',now);
  }
  db.prepare(`INSERT INTO cit_case_links(event_id,case_id,topic_code,institution_code,active,source_revision,verified_at) VALUES(?,?,?,?,1,?,?) ON CONFLICT(event_id,case_id) DO UPDATE SET active=1,source_revision=excluded.source_revision,verified_at=excluded.verified_at`).run(e.id,c.id,task.topic,task.institution,revision,now);
 }
 // Include pre-queue cases owned by this engine so changed rules can withdraw them.
 const old=db.prepare(`SELECT DISTINCT c.* FROM coord_cases c JOIN coord_audit a ON a.target_id=c.id AND a.action='cit_projection' WHERE c.source_event_id=? UNION SELECT c.* FROM coord_cases c JOIN cit_case_links l ON l.case_id=c.id WHERE l.event_id=?`).all(e.id,e.id);
 for(const c of old){if(desired.has(c.id))continue;
  db.prepare('UPDATE cit_case_links SET active=0,verified_at=? WHERE event_id=? AND case_id=?').run(now,e.id,c.id);
  if(db.prepare('SELECT 1 FROM cit_case_links WHERE case_id=? AND active=1 LIMIT 1').get(c.id))continue;
  if(['resolved','dismissed'].includes(c.status))continue;
  db.prepare(`INSERT INTO cit_case_links(event_id,case_id,topic_code,institution_code,active,source_revision,previous_status,auto_status_at,verified_at) SELECT ?,c.id,t.code,i.code,0,?,?,?,? FROM coord_cases c JOIN coord_topics t ON t.id=c.topic_id JOIN coord_institutions i ON i.id=c.institution_id WHERE c.id=? ON CONFLICT(event_id,case_id) DO UPDATE SET previous_status=excluded.previous_status,auto_status_at=excluded.auto_status_at,active=0,verified_at=excluded.verified_at`).run(e.id,revision,c.status,new Date(now).toISOString(),now,c.id);
  db.prepare("UPDATE coord_cases SET status='dismissed',updated_at=? WHERE id=?").run(new Date(now).toISOString(),c.id);audit(db,c.id,c.institution_id,'cit_auto_withdrawn',now);withdrawn++;
 }
 return{updated,withdrawn,restored,verified};
}
export function auditDeliveries(db,{now=Date.now(),limit=10}={}){
 let checked=0,requeued=0,inaccessible=0;
 const rows=db.prepare(`SELECT l.event_id,l.case_id,l.source_revision,c.source_event_id,c.institution_id,c.topic_id,c.title,c.summary_redacted,c.source_revision case_revision FROM cit_case_links l JOIN coord_cases c ON c.id=l.case_id WHERE l.active=1 ORDER BY l.verified_at,l.case_id LIMIT ?`).all(limit);
 for(const c of rows){
  const raw=db.prepare('SELECT data FROM lab_items WHERE id=?').get(c.event_id);if(!raw)continue;
  let e;try{e=JSON.parse(raw.data);}catch{continue;}checked++;
  const expected=(e.sources?.length?e.sources:[e]).map(s=>canonicalSource(s?.url)).filter(Boolean);
  const sources=db.prepare('SELECT source_url FROM coord_case_sources WHERE coord_case_id=?').all(c.case_id).map(s=>s.source_url);
  const allowed=permitted(db,c),members=db.prepare(`SELECT count(*) n FROM coord_memberships m JOIN team_accounts a ON a.id=m.account_id AND a.active=1 WHERE m.institution_id=? AND m.active=1`).get(c.institution_id).n;
  if(!members)inaccessible++;
  if(!allowed||(c.event_id===c.source_event_id&&c.source_revision!==c.case_revision)||hash(raw.data)!==c.source_revision||!c.title||!c.summary_redacted||expected.some(u=>!sources.includes(u))){
   requeued+=Number(db.prepare("UPDATE cit_delivery_jobs SET state='pending',available_at=0 WHERE event_id=? AND state NOT IN('pending','processing')").run(c.event_id).changes);
  }
  db.prepare('UPDATE cit_case_links SET verified_at=? WHERE event_id=? AND case_id=?').run(now,c.event_id,c.case_id);
 }
 return{checked,requeued,inaccessible};
}
export function runBatch(db,{now=Date.now(),limit=25,policyVersion=currentPolicy(db),beforeAck=null}={}){
 initDelivery(db);limit=Math.max(1,Math.min(50,limit));
 db.prepare("UPDATE cit_delivery_jobs SET state='retry',claim_token=NULL,lease_until=NULL,available_at=? WHERE state='processing' AND lease_until<=?").run(now,now);
 // Rule/grant changes enqueue bounded chunks, rather than reclassifying the archive.
 db.prepare(`UPDATE cit_delivery_jobs SET state='pending',available_at=0,attempts=0 WHERE event_id IN(SELECT event_id FROM cit_delivery_jobs WHERE state IN('done','retry') AND policy_version<>? ORDER BY event_id LIMIT 250)`).run(policyVersion);
 const deliveryAudit=auditDeliveries(db,{now,limit:10});
 const jobs=db.prepare(`SELECT j.* FROM cit_delivery_jobs j WHERE j.state IN('pending','retry') AND j.available_at<=? ORDER BY j.priority DESC,j.available_at,j.event_id LIMIT ?`).all(now,limit);
 const report={at:new Date(now).toISOString(),examined:0,inserted:0,duplicates:0,updated:0,withdrawn:0,restored:0,verified:0,failed:0,reasons:{},messagesSent:0,policyVersion,deliveryAudit};
 for(const job of jobs){
  const token=randomUUID();if(!db.prepare("UPDATE cit_delivery_jobs SET state='processing',claim_token=?,lease_until=?,policy_version=? WHERE event_id=? AND generation=? AND state IN('pending','retry')").run(token,now+120000,policyVersion,job.event_id,job.generation).changes)continue;
  try{
   db.exec('BEGIN IMMEDIATE');const row=db.prepare('SELECT data FROM lab_items WHERE id=?').get(job.event_id);
   if(!row){db.prepare("UPDATE cit_delivery_jobs SET state='waiting_source',outcome='source_missing',lease_until=NULL,claim_token=NULL WHERE event_id=?").run(job.event_id);db.exec('COMMIT');continue;}
   const event=JSON.parse(row.data);if(!event||typeof event!=='object'||event.id!==job.event_id)throw Error('source_identity_invalid');
   const revision=hash(row.data),e=adaptEvent(event),plan=preview(db,[event]);
   const result=persistPlan(db,plan,{allowWrites:true,transaction:false,now:()=>new Date(now).toISOString()});
   if(result.held)throw Error('projection_held');
   const synced=synchronize(db,e,plan,revision,now),decision=plan.results[0];
   if(beforeAck)beforeAck(db,job);
   const unassigned=!decision.tasks.length;
   db.prepare(`UPDATE cit_delivery_jobs SET state=?,priority=0,attempts=0,available_at=?,lease_until=NULL,claim_token=NULL,policy_version=?,source_revision=?,outcome=?,error_code=NULL,updated_at=? WHERE event_id=? AND claim_token=? AND generation=?`).run(unassigned?'retry':'done',unassigned?now+6*hour:0,policyVersion,revision,decision.reason,now,job.event_id,token,job.generation);
   db.exec('COMMIT');report.examined++;report.inserted+=result.inserted;report.duplicates+=result.duplicates;for(const k of ['updated','withdrawn','restored','verified'])report[k]+=synced[k];report.reasons[decision.reason]=(report.reasons[decision.reason]||0)+1;
  }catch(error){
   if(db.isTransaction)db.exec('ROLLBACK');
   const attempt=job.attempts+1,delay=Math.min(6*hour,30000*2**Math.min(attempt,10));
   const code=['source_identity_invalid','projection_held','delivery_verification_failed'].includes(error.message)?error.message:error instanceof SyntaxError?'source_json_invalid':'processing_error';
   db.prepare("UPDATE cit_delivery_jobs SET state='retry',attempts=?,available_at=?,lease_until=NULL,claim_token=NULL,error_code=?,updated_at=? WHERE event_id=? AND claim_token=?").run(attempt,now+delay,code,now,job.event_id,token);report.failed++;
  }
 }
 report.queue=db.prepare('SELECT state,count(*) count FROM cit_delivery_jobs GROUP BY state').all();
 db.prepare("INSERT INTO cit_delivery_meta VALUES('last_run',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(report));
 return report;
}
export function runPipeline({dbPath='/var/lib/umraniye-osint-deneme/osint.sqlite',limit=25}={}){const db=new DatabaseSync(dbPath,{timeout:5000});try{db.exec('PRAGMA foreign_keys=ON');return runBatch(db,{limit});}finally{db.close();}}
