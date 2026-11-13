import {withNewsStateLock} from './news-state-lock.mjs';
import {resolve} from 'node:path';
import {openNewsOverflow} from './news-overflow.mjs';
import{mkdir,readFile,writeFile,rename}from 'node:fs/promises';
import{join}from 'node:path';
const fold=s=>String(s||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll('ı','i');
export function judicialFollowup(title){return /yargitay|istinaf|iddianame|mahkeme|dava|muebbet|ceza(?:si|sinin)? (?:onandi|kesinlesti)|hukum|sanik/.test(fold(title))&&/sehit|katil|saldiri|cinayet|polis|suc|ceza|tutuk/.test(fold(title));}
export function candidateScore(e,now){
 const t=fold(e.title+' '+(e.description||''));
 const age=Math.max(0,now-Date.parse(e.firstSeenAt||e.collectedAt||new Date(now).toISOString()));
 return (e.relevant?100:0)+(/seyda yilmaz|yunus emre gecti|umraniye|dudullu/.test(t)?90:0)+(/polis|sehit|cinayet|saldiri|kaza|yangin|yargitay|mahkeme|muebbet|egitim|belediye|kaymakam/.test(t)?35:0)+Math.min(180,Math.floor(age/60000));
}
export function newsPublication(html,url){
 const found=[];
 const scan=v=>{
  if(!v||typeof v!=='object')return;
  const types=Array.isArray(v['@type'])?v['@type']:[v['@type']];
  if(types.some(t=>/^(?:NewsArticle|Article|ReportageNewsArticle)$/.test(t))){
   const declared=v.url||v.mainEntityOfPage?.['@id']||v.mainEntityOfPage;
   let same=true;if(typeof declared==='string'){try{same=new URL(declared,url).pathname===new URL(url).pathname}catch{same=false}}
   if(same&&typeof v.datePublished==='string')found.push(v.datePublished);
  }
  if(Array.isArray(v))v.forEach(scan);else if(Array.isArray(v['@graph']))v['@graph'].forEach(scan);
 };
 for(const s of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{scan(JSON.parse(s[1]))}catch{}}
 return [...new Set(found)].length===1?found[0]:null;
}
async function readNewsCandidatesUnlocked(source,candidates,{fetchDetail,parseDetail,allowed,now=Date.now(),stateDir=process.env.DATA_DIR?join(process.env.DATA_DIR,'news-reader'):null,limit=4}={}){
 const filename=stateDir&&join(stateDir,source.id.replace(/[^a-z0-9_-]/gi,'_')+'.json');
 let state={version:1,rows:{}};
 if(filename){try{state=JSON.parse(await readFile(filename,'utf8'));if(state.version!==1||!state.rows)throw Error()}catch{state={version:1,rows:{}}}}
 const stats={discovered:candidates.length,detailRead:0,detailAccepted:0,detailErrors:0,detailErrorReasons:{},robotsBlocked:0,unrelated:0,alreadyRead:0,pending:0,overflow:0};
 let overflowStore=openNewsOverflow(stateDir,source.id),overflowAck=[];
 try{
 if(overflowStore){const recovered=overflowStore.recover(state.rows,Math.max(0,3000-Object.keys(state.rows).length));for(const [url,row]of recovered.rows)state.rows[url]=row;overflowAck=recovered.ack;}
 // Keep unseen candidates between cycles; a read limit must not become a silent discard.
 for(const item of candidates){
  const old=state.rows[item.url];
  const fingerprint=JSON.stringify([item.title,item.description,item.publishedAt]);
  if(!old)state.rows[item.url]={item:{...item,firstSeenAt:item.firstSeenAt||new Date(now).toISOString()},fingerprint,seen:now,status:'pending',attempts:0,next:0};
  else if(old.fingerprint!==fingerprint){Object.assign(old,{item:{...item,firstSeenAt:old.item.firstSeenAt},fingerprint,status:'pending',attempts:0,next:0})}
  else if(old.status==='accepted'&&old.result)stats.alreadyRead++;
 }
 for(const [url,row]of Object.entries(state.rows))if(now-row.seen>172800000&&row.status!=='pending')delete state.rows[url];
 const queue=Object.values(state.rows).filter(r=>r.status==='pending'&&(r.next||0)<=now).sort((a,b)=>candidateScore(b.item,now)-candidateScore(a.item,now));
 for(const row of queue.slice(0,limit)){
  if(!allowed(row.item.url)){row.next=now+3600000;stats.robotsBlocked++;continue}
  try{
   const html=await fetchDetail(row.item.url);stats.detailRead++;
   const detail=parseDetail(html,row.item.url);
   if(detail?.relevant){
    row.result={...row.item,...detail,publishedAt:detail.publishedAt||row.item.publishedAt,datePrecision:detail.publishedAt?detail.datePrecision:row.item.datePrecision,dateWarning:detail.publishedAt?detail.dateWarning:row.item.dateWarning,firstSeenAt:row.item.firstSeenAt,collectedAt:row.item.collectedAt};
    if(judicialFollowup(row.result.title))Object.assign(row.result,{followupDevelopment:true,eventTimeContext:'past_event_followup',notificationEligible:false,criticalAlert:false});
    row.status='accepted';stats.detailAccepted++;
   }else{row.status='unrelated';stats.unrelated++}
  }catch(error){row.attempts++;row.next=now+Math.min(21600000,600000*2**Math.min(row.attempts-1,6));stats.detailErrors++;const reason=error.name==='TimeoutError'?'timeout':String(error.message||'read_failed').slice(0,160);stats.detailErrorReasons[reason]=(stats.detailErrorReasons[reason]||0)+1}
 }
 stats.pending=Object.values(state.rows).filter(r=>r.status==='pending').length;
 const all=Object.entries(state.rows);
 if(all.length>3000){
  const removable=all.filter(([,r])=>r.status!=='pending').sort((a,b)=>a[1].seen-b[1].seen);
  while(Object.keys(state.rows).length>3000&&removable.length)delete state.rows[removable.shift()[0]];
  stats.overflow=Math.max(0,Object.keys(state.rows).length-3000);
 }
 // A single publisher cannot make this local state grow without a bound.
 if(stats.overflow&&stateDir){const pending=Object.entries(state.rows).sort((a,b)=>candidateScore(b[1].item,now)-candidateScore(a[1].item,now));overflowStore=overflowStore||openNewsOverflow(stateDir,source.id,{create:true});overflowStore.spill(pending.slice(3000),item=>candidateScore(item,now));state.rows=Object.fromEntries(pending.slice(0,3000));stats.pending=Object.values(state.rows).filter(r=>r.status==='pending').length;}
 stats.oldestPendingAt=Object.values(state.rows).filter(r=>r.status==='pending').sort((a,b)=>a.seen-b.seen)[0]?.item.firstSeenAt||null;
 if(filename){await mkdir(stateDir,{recursive:true,mode:0o700});const temp=filename+'.'+process.pid+'.tmp';await writeFile(temp,JSON.stringify(state),{mode:0o600});await rename(temp,filename)}
 if(overflowStore){overflowStore.acknowledge(overflowAck.filter(url=>Object.hasOwn(state.rows,url)));stats.durableOverflow=overflowStore.count;}
 return{items:Object.values(state.rows).filter(r=>r.status==='accepted'&&r.result).map(r=>r.result),stats};
 }finally{overflowStore?.close();}
}

export function readNewsCandidates(source,candidates,options={}){
 const dir=options.stateDir===undefined?(process.env.DATA_DIR?join(process.env.DATA_DIR,'news-reader'):null):options.stateDir;
 if(!dir)return readNewsCandidatesUnlocked(source,candidates,options);
 const key=resolve(dir,source.id.replace(/[^a-z0-9_-]/gi,'_')+'.json');
 return withNewsStateLock(key,()=>readNewsCandidatesUnlocked(source,candidates,options));
}
