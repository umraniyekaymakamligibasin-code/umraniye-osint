import {createHash,randomUUID} from 'node:crypto';
import {isUmraniyesporContent} from './filters/umraniyespor.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const s=(x,n=1000)=>String(x??'').slice(0,n);
const urlOf=e=>s(e?.url||e?.reference||e?.sources?.[0]?.url||e?.eventSources?.[0]?.url||'',2000);
const idOf=e=>s(e?.id||e?.eventId||'',180);
function canonical(u){
  try{const x=new URL(u);if(!/^https?:$/.test(x.protocol))return '';x.hash='';
    for(const key of [...x.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(key))x.searchParams.delete(key);
    return x.href.replace(/\/$/,'');
  }catch{return '';}
}
function identities(e){
  const ids=[idOf(e),...(Array.isArray(e?.relatedIds)?e.relatedIds:[])].filter(Boolean);
  const urls=[urlOf(e),...(e?.sources||[]).map(x=>x.url),...(e?.eventSources||[]).map(x=>x.url)].map(canonical).filter(Boolean);
  return {ids,urls};
}
const primaryKey=e=>{const ids=identities(e);return sha(ids.urls[0]||ids.ids[0]||'');};
const ready=new WeakMap();
const hiddenCache=new WeakMap();
export async function ensureModeration(db){
  if(!ready.has(db)){
    const task=(async()=>{
      await db.prepare(`CREATE TABLE IF NOT EXISTS osint_content_moderation (
        key TEXT PRIMARY KEY,event_id TEXT,url TEXT,title TEXT,stream TEXT,
        state TEXT NOT NULL,actor TEXT,reason TEXT,created_at TEXT,updated_at TEXT
      )`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS osint_content_moderation_audit (
        id TEXT PRIMARY KEY,actor TEXT,action TEXT,target TEXT,created_at TEXT
      )`).run();
    })();
    ready.set(db,task);
    task.catch(()=>{ready.delete(db)});
  }
  await ready.get(db);
}
export async function moderationHiddenKeys(db){
  const cached=hiddenCache.get(db);if(cached&&Date.now()-cached.time<3000)return cached.value;
  await ensureModeration(db);
  const rows=(await db.prepare("SELECT event_id,url FROM osint_content_moderation WHERE state='hidden'").all()).results||[];
  const value={ids:new Set(rows.map(x=>x.event_id).filter(Boolean)),urls:new Set(rows.map(x=>x.url).filter(Boolean))};
  hiddenCache.set(db,{time:Date.now(),value});return value;
}
export function moderationIsHiddenRecord(item,keys){
  const {ids,urls}=identities(item);
  return ids.some(x=>keys.ids.has(x))||urls.some(x=>keys.urls.has(x));
}
export async function isModerationHidden(db,item){
  return moderationIsHiddenRecord(item,await moderationHiddenKeys(db));
}
export async function moderationFilter(db,items){
  const keys=await moderationHiddenKeys(db);
  return items.filter(e=>!isUmraniyesporContent(e)&&!moderationIsHiddenRecord(e,keys));
}
function publicItem(e){
  return {id:idOf(e),url:urlOf(e),title:s(e?.title||e?.text||'Başlık belirtilmemiş',400),
    description:s(e?.description||e?.fullText||e?.text,350),sourceName:s(e?.sourceName||e?.sources?.[0]?.sourceName||'',120),
    stream:s(e?.stream||e?.platform||'news',30),publishedAt:s(e?.publishedAt||'',80)};
}
const html=String.raw`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>İçerik Denetim Merkezi — Ümraniye OSINT</title>
<link rel="stylesheet" href="/assets/content-moderation-ui.css?v=bulk-v2"></head><body><header><a href="/">← Ümraniye Kaymakamlığı OSINT</a><h1>İçerik Denetim Merkezi</h1><div>Basın ve Halkla İlişkiler Müdürlüğü · Yalnızca yönetici</div></header>
<main><p>İçerikler silinmez; gizlenir veya bildirim kuyruğundan çıkarılır. Tüm yönetici işlemleri kaydedilir.</p>
<nav id="tabs"><button data-tab="active" class="active">Görünür haberler</button><button data-tab="filtered">Otomatik elenenler</button><button data-tab="queue">Bildirim kuyruğu</button><button data-tab="removed">Kaldırılanlar</button></nav>
<div id="status" class="message" role="status"></div><div id="items"></div><small>Gönderilmiş Telegram bildirimleri bu panelden geri alınamaz. Belirsiz durumda bulunan bildirimler yeniden gönderilmez.</small></main>
<script src="/assets/content-moderation-ui.js?v=bulk-v2" defer></script></body></html>`;

export function createContentModeration({base,env,origin,socialItems,actor,invalidate}){
 const db=env.DB;
 async function rawEvents(request){
   const r=await base.fetch(new Request(origin+'/api/config',{headers:request.headers}),env,{});
   if(!r.ok)throw Error('source_unavailable');
   const d=await r.json();
   const news=(d.initialData?.events||[]).filter(e=>!e.social&&!['facebook','instagram','x'].includes(e.platform)).map(e=>({...e,stream:'news'}));
   const social=(await (socialItems?socialItems():Promise.resolve([]))).map(e=>({...e,stream:'social'}));
   return [...news,...social];
 }
 async function audit(who,action,target){
   await db.prepare('INSERT INTO osint_content_moderation_audit(id,actor,action,target,created_at) VALUES(?,?,?,?,?)').bind(randomUUID(),s(who,180),'mod_'+action,s(target,180),new Date().toISOString()).run();
 }
 async function save(item,state,who,reason){
   const e=publicItem(item),ident=identities(item),id=ident.ids[0]||'',url=ident.urls[0]||'';
   if(!id&&!url)throw Error('Kayıt kimliği veya bağlantısı yok');
   const key=primaryKey(item),now=new Date().toISOString();
   await db.prepare(`INSERT INTO osint_content_moderation(key,event_id,url,title,stream,state,actor,reason,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET
    event_id=excluded.event_id,url=excluded.url,title=excluded.title,stream=excluded.stream,state=excluded.state,actor=excluded.actor,reason=excluded.reason,updated_at=excluded.updated_at`)
     .bind(key,id,url,e.title,e.stream,state,s(who,180),s(reason,500),now,now).run();
   if(state==='hidden')await db.prepare(`UPDATE lab_outbox SET status='expired',last_error='admin_hidden' WHERE status='pending' AND (event_id=? OR json_extract(data,'$.url')=?)`).bind(id,url).run();
   await audit(who,state,key);hiddenCache.delete(db);invalidate(true);return key;
 }
 async function handle(request){
   const a=await actor(request);if(!a)return Response.json({error:'Giriş gerekli'},{status:401});
   if(!a.admin)return Response.json({error:'Yönetici yetkisi gerekli'},{status:403});
   const pathname=new URL(request.url).pathname;
   try{
    await ensureModeration(db);
    if(request.method==='GET'&&pathname==='/api/moderation/items'){
      const bucket=new URL(request.url).searchParams.get('bucket')||'active';let items=[],total=0;
      if(bucket==='queue'){
        const rows=(await db.prepare("SELECT id,status,data,created_at FROM lab_outbox WHERE status IN ('pending','sending','unknown') ORDER BY created_at DESC LIMIT 300").all()).results||[];
        items=rows.map(row=>{let d={};try{d=JSON.parse(row.data)}catch{}return {...publicItem(d),queueId:row.id,status:row.status,created_at:row.created_at};});
      }else if(bucket==='removed'){
        items=(await db.prepare("SELECT key,event_id,url,title,stream,reason,updated_at FROM osint_content_moderation WHERE state='hidden' ORDER BY updated_at DESC LIMIT 300").all()).results.map(x=>({key:x.key,id:x.event_id,url:x.url,title:x.title,stream:x.stream,description:x.reason,publishedAt:x.updated_at}));
      }else if(bucket==='filtered'||bucket==='active'){
        const all=await rawEvents(request);const hidden=await moderationHiddenKeys(db);
        const dismissed=(await db.prepare("SELECT event_id,url FROM osint_content_moderation WHERE state='dismissed'").all()).results;
        const muted={ids:new Set(dismissed.map(x=>x.event_id).filter(Boolean)),urls:new Set(dismissed.map(x=>x.url).filter(Boolean))};
        const matches=all.filter(e=>bucket==='filtered'?(isUmraniyesporContent(e)&&!moderationIsHiddenRecord(e,muted)):(!isUmraniyesporContent(e)&&!moderationIsHiddenRecord(e,hidden)));
        total=matches.length;items=matches.sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)).slice(0,400).map(publicItem);
      }else return Response.json({error:'Bilinmeyen liste'},{status:400});
      return Response.json({items,total:total||items.length},{headers:{'Cache-Control':'no-store'}});
    }
    if(request.method==='POST'&&pathname==='/api/moderation/action'){
      if(request.headers.get('Origin')!==origin)return Response.json({error:'İstek kaynağı reddedildi'},{status:403});
      const raw=await request.text();if(raw.length>5000)return Response.json({error:'İstek çok büyük'},{status:413});
      let input;try{input=JSON.parse(raw);}catch{return Response.json({error:'Geçersiz istek'},{status:400});}
      if(!input||typeof input!=='object')return Response.json({error:'Geçersiz istek'},{status:400});
      const action=input.action,item=input.item||{},who=a.id||a.name||'admin';
      if(!['hide','dismiss','restore','suppress'].includes(action))return Response.json({error:'Geçersiz işlem'},{status:400});
      if(action==='restore'){
        if(typeof item.key!=='string'||!/^[a-f0-9]{64}$/.test(item.key))return Response.json({error:'Geçersiz kayıt'},{status:400});
        const change=await db.prepare("UPDATE osint_content_moderation SET state='restored',actor=?,updated_at=? WHERE key=? AND state='hidden'").bind(s(who,180),new Date().toISOString(),item.key).run();
        if(!change.meta?.changes)return Response.json({error:'Kayıt bulunamadı'},{status:404});
        await audit(who,'restore',item.key);hiddenCache.delete(db);invalidate(true);
      }else if(action==='suppress'){
        if(typeof item.queueId!=='string'||item.queueId.length>200)return Response.json({error:'Geçersiz kuyruk kaydı'},{status:400});
        const row=await db.prepare('SELECT data,status FROM lab_outbox WHERE id=?').bind(item.queueId).first();
        if(!row||!['pending','unknown'].includes(row.status))return Response.json({error:'Bu kayıt artık kuyruktan çıkarılamaz'},{status:409});
        let e;try{e=JSON.parse(row.data)}catch{return Response.json({error:'Kuyruk verisi bozuk'},{status:400})}
        await save(e,'hidden',who,'Yönetici kuyruktan kaldırdı');
        await db.prepare("UPDATE lab_outbox SET status='expired',last_error='admin_suppressed' WHERE id=? AND status IN ('pending','unknown')").bind(item.queueId).run();
      }else{
        // Istemcinin gonderdigi url/title/stream guvenilmez: kayit sunucu verisinden id (yoksa baglanti) ile bulunur.
        const want=idOf(item),link=want?'':canonical(urlOf(item));if(!want&&!link)return Response.json({error:'Geçersiz kayıt'},{status:400});
        const found=(await rawEvents(request)).find(e=>{const k=identities(e);return want?k.ids.includes(want):k.urls.includes(link);});
        if(!found)return Response.json({error:'Kayıt bulunamadı'},{status:404});
        if(action==='dismiss')await save(found,'dismissed',who,'Filtrelenenler listesinden arşivlendi');
        else await save(found,'hidden',who,s(input.reason,500));
      }
      return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
    }
    return Response.json({error:'Bulunamadı'},{status:404});
   }catch(e){console.error('moderation_request_failed',e?.message);return Response.json({error:'İşlem tamamlanamadı'},{status:500});}
 }
 return {handle,html,filter:items=>moderationFilter(db,items)};
}
