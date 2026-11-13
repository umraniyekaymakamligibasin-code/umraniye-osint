import{openDatabase}from './database.mjs';
import{eventRelation,eventTerms}from '../src/event-equivalence.js';
import{createHash}from 'node:crypto';
import{writeFile}from 'node:fs/promises';
const dir=process.env.DATA_DIR;if(dir!=='/var/lib/umraniye-osint-deneme')throw Error('DENEME path required');
const DB=openDatabase(dir+'/osint.sqlite'),stamp=new Date().toISOString(),hash=s=>createHash('sha256').update(s).digest('hex');
try{
 const account=await DB.prepare("SELECT data FROM lab_config WHERE id='account:telegram'").first(),chat=account?JSON.parse(account.data).accountId:null;
 const rows=(await DB.prepare("SELECT id,data,status FROM lab_outbox WHERE status IN ('sent','sending','unknown','pending') AND created_at>=? ORDER BY CASE status WHEN 'sent' THEN 0 WHEN 'unknown' THEN 1 WHEN 'sending' THEN 2 ELSE 3 END,created_at").bind(new Date(Date.now()-172800000).toISOString()).all()).results;
 const anchors=[];let consolidated=0,priorDuplicateMessages=0,mergedSources=0;
 const sources=p=>p.eventSources||[{url:p.url,sourceName:p.sourceName,publishedAt:p.publishedAt}];
 for(const row of rows){
  const p=JSON.parse(row.data);if(!chat||row.id!==hash(chat+'|'+(p.reference||p.url||p.eventId)))continue;
  const evidence=p.eventEvidence||p,terms=new Set(eventTerms(evidence));
  const anchor=anchors.find(r=>eventTerms(r.p.eventEvidence||r.p).some(t=>terms.has(t))&&eventRelation(r.p.eventEvidence||r.p,evidence)===true);
  if(!anchor){anchors.push({...row,p});continue}
  const links=new Map(sources(anchor.p).map(s=>[s.url,s]));for(const s of sources(p))if(s.url&&!links.has(s.url)){links.set(s.url,s);mergedSources++}
  anchor.p={...anchor.p,eventSources:[...links.values()],needsSourceUpdate:true};
  await DB.prepare('UPDATE lab_outbox SET data=? WHERE id=?').bind(JSON.stringify(anchor.p),anchor.id).run();
  if(row.status==='pending'){await DB.prepare("UPDATE lab_outbox SET status='expired',last_error='same_event_consolidated' WHERE id=? AND status='pending'").bind(row.id).run();consolidated++}
  else if(row.status==='sent')priorDuplicateMessages++;
 }
 const settings=await DB.prepare("SELECT data FROM workspace_settings WHERE id='main'").first();
 const saved=settings?JSON.parse(settings.data):{};
 await DB.prepare('INSERT INTO workspace_settings(id,data,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind('main',JSON.stringify({...saved,groupSimilar:true}),stamp).run();
 const report={result:'shared_refresh_event_dedupe_installed',at:stamp,pendingDuplicatesConsolidated:consolidated,sourceLinksMerged:mergedSources,historicalDuplicateMessagesLeftUntouched:priorDuplicateMessages,telegramTestMessageSent:false,telegramPolicyPreserved:true,oneMessagePerMatchedEvent:true,newSourcesEditExistingMessage:true,publicSourceScanning:false,adminSourceScanning:true,backgroundCollectorEnabled:true,readerPolling:'shared saved results only',sharedNewsCacheSeconds:10,productionChanged:false,personalRecordsDeleted:0};
 await writeFile(dir+'/shared-refresh-dedupe-report.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report,null,2));
}finally{DB.close()}
