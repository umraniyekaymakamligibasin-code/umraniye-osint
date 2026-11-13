import {nationalTelegramBlocked} from './telegram-local-only.mjs';
import {isModerationHidden} from './content-moderation.mjs';
import {isUmraniyesporContent} from './filters/umraniyespor.mjs';
import{eventRelation,eventCandidateTerms}from '../src/event-equivalence.js';
import{createHash}from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
const sourceList=p=>p.eventSources?.length?p.eventSources:[{url:p.url,sourceName:p.sourceName,publishedAt:p.publishedAt}];
export function createEventQueue(DB,{now=Date.now}={}){
 let peers=[],loadedAt=0,loadedChat=null,byId=new Map(),byTerm=new Map();
 function index(r){byId.set(r.id,r);for(const term of eventCandidateTerms(r.p.eventEvidence||r.p)){if(!byTerm.has(term))byTerm.set(term,new Set());byTerm.get(term).add(r)}}
 async function load(chat){if(loadedChat===chat&&now()-loadedAt<60000)return;loadedChat=chat;loadedAt=now();
  peers=(await DB.prepare("SELECT id,data,status FROM lab_outbox WHERE status IN ('pending','sent','sending','unknown') AND created_at>=? ORDER BY created_at DESC LIMIT 2000").bind(new Date(now()-172800000).toISOString()).all()).results.flatMap(r=>{try{const p=JSON.parse(r.data);return r.id===hash(chat+'|'+(p.reference||p.url||p.eventId))?[{...r,p}]:[]}catch{return[]}});
  byId=new Map();byTerm=new Map();peers.forEach(index);
 }
 async function put(chat,e,payload,id,retries=0){if(nationalTelegramBlocked(e)||nationalTelegramBlocked(payload))return{suppressed:true,id};if(isUmraniyesporContent(e)||isUmraniyesporContent(payload)||await isModerationHidden(DB,e)||await isModerationHidden(DB,payload))return{suppressed:true,id};
  await load(chat);const candidates=new Set();for(const term of eventCandidateTerms(e))for(const r of byTerm.get(term)||[])candidates.add(r);
  const match=byId.get(id)||[...candidates].find(r=>eventRelation(r.p.eventEvidence||r.p,e)===true);
  if(match){
   byId.set(id,match);
   if(sourceList(payload).every(s=>sourceList(match.p).some(old=>old.url===s.url)))return{merged:true,id:match.id};
   const current=await DB.prepare('SELECT data,status FROM lab_outbox WHERE id=?').bind(match.id).first();if(!current){loadedChat=null;return put(chat,e,payload,id)}
   const old=JSON.parse(current.data),urls=new Map(sourceList(old).map(s=>[s.url,s]));for(const s of sourceList(payload))if(s.url&&!urls.has(s.url))urls.set(s.url,s);
   if(urls.size>sourceList(old).length){
    const updated={...old,eventSources:[...urls.values()],needsSourceUpdate:true};
    if(current.status==='pending'&&payload.disableNotification===false)Object.assign(updated,{disableNotification:false,priorityLevel:payload.priorityLevel,notificationEligible:true});
    const result=await DB.prepare('UPDATE lab_outbox SET data=? WHERE id=? AND data=?').bind(JSON.stringify(updated),match.id,current.data).run();
    if(!result.meta?.changes){loadedChat=null;if(retries>=3)throw Error('outbox_concurrent_update');return put(chat,e,payload,id,retries+1)}
    match.p=updated;
   }
   return{merged:true,id:match.id};
  }
  const p={...payload,eventEvidence:{title:e.title,description:String(e.fullText||e.description||'').slice(0,4000),publishedAt:e.publishedAt,neighborhood:e.neighborhood},eventSources:sourceList(payload)};
  await DB.prepare('INSERT OR IGNORE INTO lab_outbox(id,event_id,data,status,next_at,created_at) VALUES(?,?,?,?,?,?)').bind(id,e.id,JSON.stringify(p),'pending',now(),new Date(now()).toISOString()).run();const row={id,p,status:'pending'};peers.unshift(row);index(row);if(peers.length>2000){peers.pop();loadedAt=0}return{merged:false,id};
 }
 return{put};
}
export function withEventSources(text,item){const sources=sourceList(item);if(sources.length<2)return text;let result=text.slice(0,2000)+'\n\nKaynaklar ('+sources.length+'):\n',shown=0;for(const s of sources){const line=String(s.sourceName||'Kaynak').slice(0,80)+'\n'+s.url+'\n';if(result.length+line.length>3800)break;result+=line;shown++}return result+(shown<sources.length?'Diğer '+(sources.length-shown)+' kaynak gündem panelinde.':'');}
export async function updateEventMessages(DB,{token,chatId,send,render,now=Date.now,destination='local'}){
 const rows=(await DB.prepare("SELECT id,data FROM lab_outbox WHERE status='sent' AND json_extract(data,'$.needsSourceUpdate')=1 AND json_extract(data,'$.telegramMessageId') IS NOT NULL AND coalesce(json_extract(data,'$.sourceUpdateAfter'),0)<=? AND coalesce(json_extract(data,'$.destination'),CASE WHEN json_extract(data,'$.nationalCritical')=1 OR json_extract(data,'$.scope')='national' THEN 'national' ELSE 'local' END)=? ORDER BY created_at LIMIT 100").bind(now(),destination).all()).results;
 for(const row of rows){const p=JSON.parse(row.data);if(destination==='national'||nationalTelegramBlocked(p))continue;if(row.id!==hash(chatId+'|'+(p.reference||p.url||p.eventId))){await DB.prepare("UPDATE lab_outbox SET data=json_set(data,'$.needsSourceUpdate',json('false'),'$.sourceUpdateReason','target_changed') WHERE id=? AND data=?").bind(row.id,row.data).run();continue;}
  try{
   const r=await send('https://api.telegram.org/bot'+token+'/editMessageText',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,message_id:p.telegramMessageId,text:withEventSources(render(p),p),link_preview_options:{is_disabled:true}}),signal:AbortSignal.timeout(12000)});
   const d=await r.json();if(d?.ok||d?.error_code===400&&/message is not modified/i.test(d.description||''))await DB.prepare("UPDATE lab_outbox SET data=json_set(data,'$.needsSourceUpdate',json('false')) WHERE id=? AND data=?").bind(row.id,row.data).run();
   else await DB.prepare("UPDATE lab_outbox SET data=json_set(data,'$.sourceUpdateAfter',?) WHERE id=?").bind(now()+Math.max(60000,Math.min(86400000,Number(d?.parameters?.retry_after||3600)*1000)),row.id).run();
  }catch{await DB.prepare("UPDATE lab_outbox SET data=json_set(data,'$.sourceUpdateAfter',?) WHERE id=?").bind(now()+300000,row.id).run()}
  return true;
 }
 return false;
}
