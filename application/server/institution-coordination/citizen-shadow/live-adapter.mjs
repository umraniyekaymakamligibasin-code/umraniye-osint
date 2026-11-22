import {randomUUID,createHash} from 'node:crypto';
import {shadowBatch} from './integration.mjs';
import {catalog} from './catalog.mjs';
import {deriveLocality} from './locality.mjs';
import{canonicalSource,validPublication}from'./source-url.mjs';
import{legacyCodes,fallbackDecision}from'./legacy-rules.mjs';
const known=new Set([...catalog.map(r=>r.code),...legacyCodes]);
export function adaptEvent(event){
 const locality=deriveLocality(event);
 const body=String(event.fullText||event.description||event.title||'').toLocaleLowerCase('tr-TR').replace(/\s+/g,' ').trim();
 const day=String(event.publishedAt||'').slice(0,10);
 const correlation=body.length>=60&&/^\d{4}-\d{2}-\d{2}$/.test(day)?createHash('sha256').update(body+'|'+day).digest('hex'):null;
 return {...event,locality,eventIdentity:event.eventIdentity||event.canonicalEventId||correlation||event.id};
}
export function snapshot(db){return {institutions:db.prepare('SELECT * FROM coord_institutions').all(),topics:db.prepare('SELECT * FROM coord_topics').all(),grants:db.prepare('SELECT * FROM coord_institution_topic_grants').all()};}
export function findLegacyCase(db,e,institution,topic){
 const rows=db.prepare(`SELECT c.*,l.data source_data FROM coord_cases c JOIN coord_institutions i ON i.id=c.institution_id JOIN coord_topics t ON t.id=c.topic_id LEFT JOIN lab_items l ON l.id=c.source_event_id WHERE i.code=? AND t.code=? AND NOT(c.status='dismissed' AND EXISTS(SELECT 1 FROM coord_audit a WHERE a.target_id=c.id AND a.action='legacy_projection_dismissed') AND NOT EXISTS(SELECT 1 FROM coord_case_history h WHERE h.coord_case_id=c.id AND h.action='status_change' AND h.to_value='dismissed'))`).all(institution,topic);
 return rows.find(c=>{if(c.source_event_id===e.id)return true;try{return adaptEvent(JSON.parse(c.source_data)).eventIdentity===e.eventIdentity;}catch{return false;}});
}
export function preview(db,events,options={}){const state=snapshot(db),adapted=events.map(adaptEvent),plan=shadowBatch(adapted,state,options);for(let i=0;i<plan.results.length;i++)if(plan.results[i].reason==='no_eligible_task'){const fallback=fallbackDecision(adapted[i],state);if(fallback.tasks.length)plan.results[i]=fallback;}return plan;}
// Caller must opt in explicitly. Every permission is rechecked in the transaction.
// No mail/Telegram outbox statements exist in this adapter.
export function persistPlan(db,plan,{allowWrites=false,now=()=>new Date().toISOString(),transaction=true}={}){
 if(!allowWrites)throw Error('writes_not_explicitly_enabled');
 if(plan.mode!=='shadow'||!Array.isArray(plan.results))throw Error('invalid_plan');
 const report={inserted:0,duplicates:0,held:0,notifications:0};const legacyCache=new Map();
 if(transaction)db.exec('BEGIN IMMEDIATE');else if(!db.isTransaction)throw Error('outer_transaction_required');
 try{
  for(const result of plan.results)for(const task of result.tasks||[]){
   if(!known.has(task.topic)||!task.sourceEventId||task.locality?.district!=='Ümraniye'){report.held++;continue;}
   const allowed=db.prepare(`SELECT i.id institution_id,t.id topic_id FROM coord_institutions i
    JOIN coord_institution_topic_grants g ON g.institution_id=i.id AND g.granted=1 AND length(trim(g.approval_reference))>0
    JOIN coord_topics t ON t.id=g.topic_id AND t.enabled=1 AND t.approval_status='approved' AND t.sensitivity='ordinary' AND length(trim(t.approval_reference))>0
    WHERE i.code=? AND t.code=? AND i.enabled=1 AND i.approval_status='approved' AND length(trim(i.approval_reference))>0`).get(task.institution,task.topic);
   if(!allowed){report.held++;continue;}
   const source=db.prepare('SELECT data FROM lab_items WHERE id=?').get(task.sourceEventId);
   if(!source){report.held++;continue;}
   const e=adaptEvent(JSON.parse(source.data));
   // Re-run against fresh source and current grants; a stale preview is not authority.
   const fresh=preview(db,[e]).results[0].tasks.find(t=>t.key===task.key);
   if(!fresh){report.held++;continue;}
   const publication=validPublication(e.publishedAt),seen=validPublication(e.firstSeenAt||e.collectedAt);
   if(publication===undefined||seen===undefined){report.held++;continue;}
   if(fresh.legacyTopic){
    const cacheKey=allowed.institution_id+'|'+fresh.legacyTopic;
    if(!legacyCache.has(cacheKey)){const prior=db.prepare('SELECT c.source_event_id,l.data FROM coord_cases c JOIN coord_topics t ON t.id=c.topic_id LEFT JOIN lab_items l ON l.id=c.source_event_id WHERE c.institution_id=? AND t.code=? AND NOT(c.status=\'dismissed\' AND EXISTS(SELECT 1 FROM coord_audit a WHERE a.target_id=c.id AND a.action=\'legacy_projection_dismissed\') AND NOT EXISTS(SELECT 1 FROM coord_case_history h WHERE h.coord_case_id=c.id AND h.action=\'status_change\' AND h.to_value=\'dismissed\'))').all(allowed.institution_id,fresh.legacyTopic);const identities=new Set();for(const p of prior){identities.add(p.source_event_id);if(p.data){try{identities.add(adaptEvent(JSON.parse(p.data)).eventIdentity);}catch{}}}legacyCache.set(cacheKey,identities);}
    const prior=legacyCache.get(cacheKey);if(prior.has(e.id)||prior.has(e.eventIdentity)){report.duplicates++;continue;}
   }
   const stamp=now(),id=randomUUID(),key=JSON.stringify([allowed.institution_id,e.eventIdentity||task.sourceEventId,allowed.topic_id]);
   const inserted=db.prepare(`INSERT INTO coord_cases(id,institution_id,topic_id,source_event_id,source_revision,idempotency_key,title,summary_redacted,neighborhood,location_precision,first_published_at,first_seen_at,confidence,status,priority,sensitivity,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'new',?,'ordinary',?,?) ON CONFLICT DO NOTHING`).run(id,allowed.institution_id,allowed.topic_id,task.sourceEventId,createHash('sha256').update(source.data).digest('hex'),key,fresh.title,fresh.summary,fresh.locality.neighborhood,fresh.locality.precision,publication,seen||stamp,0.86,fresh.risk==='high'?'important':'normal',stamp,stamp);
   if(!inserted.changes){report.duplicates++;continue;}
   report.inserted++;
   for(const s of e.sources?.length?e.sources:[e]){
    const url=canonicalSource(s?.url);if(!url)continue;
     db.prepare('INSERT OR IGNORE INTO coord_case_sources VALUES(?,?,?,?,?,?,?)').run(randomUUID(),id,url,String(s.sourceName||'Kaynak').slice(0,120),String(s.platform||e.platform||'web').slice(0,32),validPublication(s.publishedAt)||publication,stamp);
   }
   db.prepare("INSERT INTO coord_audit(id,actor_account_id,actor_kind,institution_id,action,target_type,target_id,request_id,created_at) VALUES(?,NULL,'system',?,'cit_projection','case',?,NULL,?)").run(randomUUID(),allowed.institution_id,id,stamp);
  }
  if(transaction)db.exec('COMMIT');return report;
 }catch(error){if(transaction)db.exec('ROLLBACK');throw error;}
}
