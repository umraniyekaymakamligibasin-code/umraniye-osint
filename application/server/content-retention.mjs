import {retentionCutoff,retainedEvents} from '../src/retention.js';
import {withNewsStateLock} from './news-state-lock.mjs';
import {readFile,readdir,writeFile,rename,lstat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
const execute=promisify(execFile),yieldTurn=()=>new Promise(r=>setImmediate(r));
export function contentExpired(item,cutoff){
 const value=item.publishedAt||item.published_at;
 const usable=v=>v&&Number.isFinite(Date.parse(v));
 const date=usable(value)?value:[item.firstSeenAt,item.collectedAt,item.first_seen_at,item.collected_at,item.created_at].find(usable);
 if(!date)return false;
 return /^\d{4}-\d{2}-\d{2}$/.test(date)?date<cutoff:Date.parse(date)<Date.parse(cutoff+'T00:00:00+03:00');
}
export function expiredTombstone(item){return {id:item.id,sourceId:item.sourceId,platform:item.platform,url:item.url,publishedAt:item.publishedAt,firstSeenAt:item.firstSeenAt,collectedAt:item.collectedAt,retentionExpired:true,notificationEligible:false,criticalAlert:false};}
export async function purgeContent(DB,{now=Date.now(),dataDir=process.env.DATA_DIR||'/var/lib/umraniye-osint-deneme',cleanPrivate=true,limit=500}={}){
 const cutoff=retentionCutoff(now),instant=new Date(cutoff+'T00:00:00+03:00').toISOString(),report={cutoff,deleted:0,compacted:0,cacheRemoved:0,privateRemoved:0,incomplete:false};
 const tables=new Set((await DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.map(r=>r.name));
 const all=async(sql,...args)=>(await DB.prepare(sql).bind(...args).all()).results;
 // Only fixed identifiers below enter SQL; timestamps and values are always bound.
 const old=(pub,fallback)=>`julianday(CASE WHEN julianday(${pub}) IS NOT NULL THEN CASE WHEN length(${pub})=10 THEN ${pub}||'T00:00:00+03:00' ELSE ${pub} END ELSE ${fallback} END)<julianday(?)`;
 if(tables.has('lab_items')){
  const rows=await all(`SELECT id,data FROM lab_items WHERE ${old('published_at','collected_at')} AND coalesce(json_extract(data,'$.retentionExpired'),0)<>1 LIMIT ?`,instant,limit);if(rows.length===limit)report.incomplete=true;
  for(const row of rows){
   const protectedRow=tables.has('institutional_reviews')&&await DB.prepare('SELECT 1 FROM institutional_reviews WHERE record_id=? LIMIT 1').bind(row.id).first();
   if(protectedRow){const r=await DB.prepare('UPDATE lab_items SET data=? WHERE id=? AND data=?').bind(JSON.stringify(expiredTombstone(JSON.parse(row.data))),row.id,row.data).run();report.compacted+=r.meta?.changes||0;}
   else{const guard=tables.has('institutional_reviews')?' AND NOT EXISTS(SELECT 1 FROM institutional_reviews WHERE record_id=lab_items.id)':'';const r=await DB.prepare('DELETE FROM lab_items WHERE id=? AND data=?'+guard).bind(row.id,row.data).run();report.deleted+=r.meta?.changes||0;if(!r.meta?.changes)report.incomplete=true;}
   await yieldTurn();
  }
 }
 if(tables.has('facebook_posts')){
  const rows=await all(`SELECT stable_post_id,data FROM facebook_posts WHERE ${old('published_at','first_seen_at')} LIMIT ?`,instant,limit);if(rows.length===limit)report.incomplete=true;
  for(const row of rows){const batch=[];if(tables.has('facebook_post_matches'))batch.push(DB.prepare('DELETE FROM facebook_post_matches WHERE post_id=? AND EXISTS(SELECT 1 FROM facebook_posts WHERE stable_post_id=? AND data=?)').bind(row.stable_post_id,row.stable_post_id,row.data));batch.push(DB.prepare('DELETE FROM facebook_posts WHERE stable_post_id=? AND data=?').bind(row.stable_post_id,row.data));const r=await DB.batch(batch);report.deleted+=r.at(-1).meta?.changes||0;await yieldTurn();}
 }
 if(tables.has('osint_editorial_approvals')){const r=await DB.prepare(`DELETE FROM osint_editorial_approvals WHERE item_key IN(SELECT item_key FROM osint_editorial_approvals WHERE ${old('published_at','approved_at')} LIMIT ?)`).bind(instant,limit).run();report.deleted+=r.meta?.changes||0;if(r.meta?.changes===limit)report.incomplete=true;}
 if(tables.has('snapshots'))for(const row of await all('SELECT id,data FROM snapshots')){let state;try{state=JSON.parse(row.data);}catch{continue;}const events=(state.events||[]).filter(e=>!contentExpired(e,cutoff));const kept=retainedEvents(events,cutoff);if(JSON.stringify(kept)!==JSON.stringify(state.events||[])){const r=await DB.prepare('UPDATE snapshots SET data=? WHERE id=? AND data=?').bind(JSON.stringify({...state,events:kept}),row.id,row.data).run();if(!r.meta?.changes)report.incomplete=true;report.cacheRemoved+=(state.events||[]).length-kept.length;}await yieldTurn();}
 if(tables.has('lab_outbox')){
  const rows=await all(`SELECT id,data,status,created_at FROM lab_outbox WHERE ${old("json_extract(data,'$.publishedAt')",'created_at')} AND coalesce(json_extract(data,'$.retentionExpired'),0)<>1 LIMIT ?`,instant,limit);if(rows.length===limit)report.incomplete=true;
  for(const row of rows){const p=JSON.parse(row.data),compact={...expiredTombstone(p),reference:p.reference,eventId:p.eventId,destination:p.destination,telegramMessageId:p.telegramMessageId,needsSourceUpdate:false};const status=['pending','dry-run'].includes(row.status)?'expired':row.status;const r=await DB.prepare('UPDATE lab_outbox SET data=?,status=? WHERE id=? AND data=? AND status=?').bind(JSON.stringify(compact),status,row.id,row.data,row.status).run();report.compacted+=r.meta?.changes||0;await yieldTurn();}
 }
 // Personal/case notes, users, settings and delivery identities are deliberately retained.
 if(tables.has('case_records'))for(const row of await all("SELECT id,event_data FROM case_records WHERE event_data<>'{}'")){let item;try{item=JSON.parse(row.event_data);}catch{continue;}if(!item.retentionExpired&&contentExpired(item,cutoff))await DB.prepare('UPDATE case_records SET event_data=? WHERE id=? AND event_data=?').bind(JSON.stringify(expiredTombstone(item)),row.id,row.event_data).run();await yieldTurn();}
 const directory=join(dataDir,'news-reader');let entries=[];try{entries=await readdir(directory);}catch(error){if(error.code!=='ENOENT')throw error;}
 for(const name of entries.filter(n=>/^[a-z0-9_-]+\.json$/i.test(n))){const path=resolve(directory,name);await withNewsStateLock(path,async()=>{const info=await lstat(path);if(info.isSymbolicLink()||info.size>32000000){report.incomplete=true;return;}const state=JSON.parse(await readFile(path,'utf8'));let removed=0;for(const [key,row] of Object.entries(state.rows||{}))if(contentExpired({...row.item,firstSeenAt:row.item?.firstSeenAt||new Date(row.seen).toISOString()},cutoff)){delete state.rows[key];removed++;}if(removed){const tmp=path+'.retention-'+process.pid+'.tmp';await writeFile(tmp,JSON.stringify(state),{mode:0o600});await rename(tmp,path);report.cacheRemoved+=removed;}});await yieldTurn();}
 const overflowPath=join(directory,'pending-overflow.sqlite');let overflow;
 try{const info=await lstat(overflowPath);if(info.isSymbolicLink())throw Error('unsafe_overflow_file');overflow=new DatabaseSync(overflowPath);overflow.exec('PRAGMA busy_timeout=1000');const rows=overflow.prepare('SELECT source,url,data,seen FROM pending LIMIT 20000').all();for(const row of rows){const state=JSON.parse(row.data);if(contentExpired({...state.item,firstSeenAt:state.item?.firstSeenAt||new Date(row.seen).toISOString()},cutoff))report.cacheRemoved+=Number(overflow.prepare('DELETE FROM pending WHERE source=? AND url=? AND data=?').run(row.source,row.url,row.data).changes);}if(rows.length===20000)report.incomplete=true;}catch(error){if(error.code!=='ENOENT')throw error;}finally{overflow?.close();}
 if(cleanPrivate){const {stdout}=await execute('/opt/umraniye-osint-browser/venv/bin/python',['/opt/umraniye-osint-browser/review_retention.py','--root',dataDir,'--cutoff',cutoff],{timeout:15000,maxBuffer:16384});const result=JSON.parse(stdout);report.privateRemoved=result.removed;report.incomplete ||= result.busy>0;}
 return report;
}
