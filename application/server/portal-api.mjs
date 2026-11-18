import {groupedSocialRecords,recordPlatforms} from './portal-records.mjs';
import {compareRecordsNewest} from '../src/retention.js';
import {localScopeAssessment} from './local-scope-policy.mjs';
import {moderationHiddenKeys,moderationIsHiddenRecord} from './content-moderation.mjs';
import {randomUUID} from 'node:crypto';
import {isUmraniyesporContent} from './filters/umraniyespor.mjs';
import {createBrowserResearch} from './browser-research.mjs';
import {analyzeGeoText} from './geo-dictionary.mjs';
import {createNewsThumbnails} from './news-thumbnails.mjs';
import {join,resolve} from 'node:path';
import {readFile,writeFile,rename} from 'node:fs/promises';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const fold=value=>String(value||'').toLocaleLowerCase('tr-TR').replace(/ı/g,'i').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const day=value=>{if(!value)return null;if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;const date=new Date(value);return Number.isFinite(+date)?new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'}).format(date):null;};
const published=e=>e.publishedAt||null;
const rank=e=>e.priorityLevel==='P1'?'critical':e.priorityLevel==='P2'?'important':'normal';
const reviewLabels={new:'İncelenmedi',reviewing:'İnceleniyor',referred:'İlgili birime iletildi',tracking:'Takipte',resolved:'Sonuçlandı'};
const firstSeen=e=>e.firstSeenAt||e.collectedAt||null;
function safeURL(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
function image(e){for(const value of [e.imageUrl,e.image,e.thumbnailUrl,e.thumbnail,e.media?.imageUrl,e.media?.thumbnailUrl,...(e.sources||[]).map(s=>s.imageUrl||s.thumbnailUrl)]){if(typeof value==='string'&&(value.startsWith('/assets/')||safeURL(value)?.startsWith('https:')))return value;}return null;}
function platform(e){const p=fold(e.platform);if(['facebook','x','instagram'].includes(p))return p;const u=e.url||e.sources?.[0]?.url||'';try{const host=new URL(u).hostname.toLowerCase().replace(/^(?:www\.|m\.)/,'');return host==='facebook.com'?'facebook':['x.com','twitter.com'].includes(host)?'x':host==='instagram.com'?'instagram':'news';}catch{return 'news';}}
function location(e){return e.locationVerified===true?'Konum doğrulandı':e.locationStatus==='local_indicated'?'Yerel konum belirtilmiş (teyitsiz)':'İnceleme Gerekli';}
export function createPortalAPI(base,env,{origin,live=false,socialItems=null}){
 const research=createBrowserResearch(env.DB);let cached=null,pending=null,generation=0,caseCache=null,caseCacheAt=0;
 const thumbnails=createNewsThumbnails({directory:join(resolve(process.env.DATA_DIR||'./data'),'news-thumbnails'),python:new URL('../image-tools/bin/python',import.meta.url).pathname,script:new URL('./thumbnail.py',import.meta.url).pathname});
 const preloadThumbnails=result=>{setTimeout(()=>{for(const e of result.news.slice(0,16)){const source=safeURL(e.url||e.sources?.[0]?.url);if(!source)continue;try{const page=new URL(source);if(page.protocol==='http:')page.protocol='https:';thumbnails.get(page.href,image(e)).catch(()=>{});}catch{}}},0);};
 async function actor(request){const r=await base.fetch(new Request(origin+'/api/account',{headers:request.headers}),env,{});if(!r.ok)return null;return (await r.json()).actor;}
 // Hız: kullanıcı istekleri tam yeniden kurmayı beklemez; bayat veri hemen sunulur, tazeleme arka planda tekilleştirilir.
 let newsCache=null,socialCache=null,lastRebuildAt=0,lastPreloadAt=0,refreshTimer=null;
 const maxStale=live?300000:1800000,minRebuildGap=live?12000:0;
 async function snapshotsSignature(){try{const r=await env.DB.prepare('SELECT count(*) AS n,max(updated_at) AS u FROM snapshots').first();return r?String(r.n||0)+':'+String(r.u||''):null;}catch{return null;}}
 // Açılışta diskteki son başarılı sonuç yüklenir; kullanıcı soğuk kurmayı beklemez.
 const cacheFile=join(resolve(process.env.DATA_DIR||'./data'),'portal-cache.json');
 let hydratePromise=null;
 async function hydrate(){
  if(hydratePromise)return hydratePromise;
  hydratePromise=(async()=>{try{
   const saved=JSON.parse(await readFile(cacheFile,'utf8'));
   if(!Array.isArray(saved?.news)||!Array.isArray(saved?.social))return;
   if(Date.now()-Number(saved.at||0)>900000)return;
   const sig=await snapshotsSignature();if(!sig||saved.sig!==sig)return;
   const builtAt=Date.now();
   cached={news:saved.news,social:saved.social,all:[...saved.news,...saved.social].sort(compareRecordsNewest),syncedAt:saved.syncedAt||null,builtAt,generation,expires:builtAt+(live?30000:300000)};
   newsCache={sig,at:builtAt,news:saved.news,syncedAt:saved.syncedAt||null};
   if(saved.socialSig)socialCache={sig:saved.socialSig,at:builtAt,social:saved.social};
   console.log(JSON.stringify({event:'portal_cache_loaded',news:saved.news.length,social:saved.social.length,ageMs:builtAt-Number(saved.at||0)}));
  }catch{}})();
  return hydratePromise;
 }
 async function persist(result){
  try{
   const payload={at:Date.now(),sig:newsCache?.sig||null,socialSig:socialCache?.sig||null,syncedAt:result.syncedAt||null,news:result.news,social:result.social};
   const temp=cacheFile+'.'+process.pid+'.tmp';
   await writeFile(temp,JSON.stringify(payload),{mode:0o600});
   await rename(temp,cacheFile);
  }catch{}
 }
 async function loadNews(request){
  const sig=await snapshotsSignature(),now=Date.now();
  if(newsCache&&sig!==null&&newsCache.sig===sig&&now-newsCache.at<20000)return {news:newsCache.news,syncedAt:newsCache.syncedAt,reused:true};
  const response=await base.fetch(new Request(origin+'/api/config',{headers:request.headers}),env,{});
  if(!response.ok)throw Error('source_unavailable');
  const config=await response.json();
  const news=(config.initialData?.events||[]).filter(e=>!e.social&&!['x','instagram','facebook'].includes(e.platform)).map(e=>({...e,stream:'news'})).sort(compareRecordsNewest);
  const syncedAt=config.initialData?.syncedAt||null;
  newsCache={sig,at:now,news,syncedAt};return {news,syncedAt,reused:false};
 }
 async function loadSocial(settings){
  const t0=Date.now();
  const records=await (socialItems?socialItems():research.socialItems());
  const fetchMs=Date.now()-t0;
  const sig=records.length+':'+(records[0]?.id||'')+':'+(records[0]?.publishedAt||'')+':'+(settings.groupSimilar?'1':'0')+':'+(settings.splitEventIds?.length||0);
  if(socialCache&&socialCache.sig===sig&&Date.now()-socialCache.at<120000)return {social:socialCache.social,reused:true};
  const social=await groupedSocialRecords(records,settings);
  const ms=Date.now()-t0;if(ms>500)console.log(JSON.stringify({event:'social_build_slow',ms,fetchMs,groupMs:ms-fetchMs,n:records.length}));
  socialCache={sig,at:Date.now(),social};return {social,reused:false};
 }
 function rebuild(request){
  const startedGeneration=generation,t0=Date.now(),stage={};
  return (async()=>{const {news,syncedAt,reused:newsReused}=await loadNews(request);stage.news=Date.now()-t0;const settingsRow=await env.DB.prepare('SELECT data FROM workspace_settings WHERE id=?').bind('main').first();let settings={};try{const saved=JSON.parse(settingsRow?.data||'{}');settings={groupSimilar:saved?.groupSimilar!==false,splitEventIds:Array.isArray(saved?.splitEventIds)?saved.splitEventIds.filter(id=>typeof id==='string'&&id.length<=180).slice(-200):[]};}catch{}const {social,reused:socialReused}=await loadSocial(settings);stage.social=Date.now()-t0-stage.news;const all=[...news,...social].sort(compareRecordsNewest);const hidden=await moderationHiddenKeys(env.DB);stage.hidden=Date.now()-t0-stage.news-stage.social;const visibleNews=news.filter(e=>!isUmraniyesporContent(e)&&!moderationIsHiddenRecord(e,hidden));const visibleSocial=social.filter(e=>!isUmraniyesporContent(e)&&!moderationIsHiddenRecord(e,hidden));const visibleAll=[...visibleNews,...visibleSocial].sort(compareRecordsNewest);const builtAt=Date.now(),result={news:visibleNews,social:visibleSocial,all:visibleAll,syncedAt,builtAt,generation:startedGeneration,expires:builtAt+(live?30000:300000)};console.log(JSON.stringify({event:'snapshot_built',ms:builtAt-t0,news:news.length,social:social.length,newsReused,socialReused,stage}));return result;})();
 }
 function queueRefresh(request){
  if(pending)return pending.promise;
  lastRebuildAt=Date.now();
  const promise=rebuild(request).then(result=>{cached=result;if(live&&Date.now()-lastPreloadAt>60000){lastPreloadAt=Date.now();preloadThumbnails(result);}void persist(result);return result;}).finally(()=>{if(pending?.promise===promise)pending=null;});
  pending={promise,generation};promise.catch(()=>{});
  return promise;
 }
 async function snapshot(request){
  const now=Date.now();
  await hydrate();
  if(cached&&cached.generation===generation&&cached.expires>now)return cached;
  if(cached&&now-cached.builtAt<=maxStale){
   if(!pending){const wait=lastRebuildAt+minRebuildGap-now;if(wait<=0)queueRefresh(request).catch(()=>{});else if(!refreshTimer)refreshTimer=setTimeout(()=>{refreshTimer=null;if(!pending)queueRefresh(request).catch(()=>{});},wait);}
   return cached;
  }
  // İlk açılışta veya bayat sınırı aşıldığında taze veri beklenir; eşzamanlı istekler tek kurmayı paylaşır.
  if(pending&&pending.generation===generation)return pending.promise;
  return queueRefresh(request);
 }
 async function cases(){if(caseCache&&Date.now()-caseCacheAt<15000)return caseCache;const rows=(await env.DB.prepare('SELECT id,event_id,status,revision,updated_at,assignee FROM case_records ORDER BY updated_at DESC,revision DESC,id').all()).results;caseCache=new Map();for(const row of rows)if(!caseCache.has(row.event_id))caseCache.set(row.event_id,row);caseCacheAt=Date.now();return caseCache;}
 function caseFor(e,rows){for(const id of [e.id,...(e.relatedIds||[])]){const found=rows.get(id);if(found)return found;}return null;}
 function card(e,rows){const c=caseFor(e,rows),scopeAssessment=localScopeAssessment(e),scopeReview=!e.nationalCritical&&!scopeAssessment.local;return {id:e.id,stream:e.stream,platform:platform(e),platforms:recordPlatforms(e),title:e.title||'Başlık belirtilmemiş',description:String(e.fullText||e.description||e.text||'').slice(0,600),sourceName:e.sourceName||e.publisherNames?.join(', ')||e.sources?.[0]?.sourceName||'Kaynak belirtilmemiş',sourceId:e.sourceId||null,accountName:e.accountName||e.account||e.sourceName||null,publishedAt:published(e),firstSeenAt:firstSeen(e),lastSeenAt:e.lastSeenAt||null,datePrecision:e.datePrecision||null,url:safeURL(e.url||e.sources?.[0]?.url),imageUrl:e.stream==='news'&&safeURL(e.url||e.sources?.[0]?.url)?'/api/portal/thumbnail?id='+encodeURIComponent(e.id):image(e),priority:scopeReview?'normal':rank(e),priorityLevel:scopeReview?'P3':e.priorityLevel||null,scopeAssessment,priorityExplanation:e.priorityExplanation||null,location:e.neighborhood||e.locationName||e.nationalLocation||null,locationLabel:scopeReview?'İnceleme Gerekli':location(e),locationVerified:!scopeReview&&e.locationVerified===true,needsReview:scopeReview||e.locationStatus==='review_required'||!c||c.status==='new',nationalCritical:!!e.nationalCritical,topic:e.topic||e.nationalCategory||null,sourceCount:e.sources?.length||1,reviewStatus:c?.status||'new',reviewLabel:reviewLabels[c?.status||'new'],caseId:c?.id||null,caseRevision:c?.revision||0};}
 function filtered(all,params,rows){
  const isDay=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?v:null;
  const q=fold(params.get('q')).slice(0,300),source=params.get('source'),priority=params.get('priority'),start=isDay(params.get('start')),end=isDay(params.get('end')),period=params.get('period'),tab=params.get('tab'),type=params.get('type'),today=day(new Date().toISOString());
  return all.filter(e=>{
   if(type&&type!=='all'&&e.stream!==type)return false;
   if(params.get('platform')&&params.get('platform')!=='all'&&!recordPlatforms(e).includes(params.get('platform')))return false;
   if(source&&![e.sourceName,...(e.sources||[]).map(s=>s.sourceName)].includes(source))return false;
   if(priority&&rank(e)!==priority)return false;
   const date=day(published(e));
   if(start&&(!date||date<start)||end&&(!date||date>end))return false;
   if((period==='24h'||tab==='24h')&&(!published(e)||/^\d{4}-\d{2}-\d{2}$/.test(published(e))||Date.parse(published(e))<Date.now()-86400000||Date.parse(published(e))>Date.now()+300000))return false;
   if(period==='today'&&date!==today)return false;
   if(tab==='priority'&&rank(e)==='normal')return false;
   if(tab==='local'&&!localScopeAssessment(e).local)return false;
   if(tab==='national'&&!e.nationalCritical)return false;
   const review=caseFor(e,rows);
   if(tab==='review'&&review&&review.status!=='new'&&e.locationStatus!=='review_required')return false;
   if(q&&!fold([e.title,e.description,e.text,e.neighborhood,e.sourceName,...(e.matchedKeywords||[]),...(e.sources||[]).map(s=>s.sourceName)].join(' ')).includes(q))return false;
   return true;
  });
 }
 async function fetch(request){
  const u=new URL(request.url);if(!u.pathname.startsWith('/api/portal/'))return null;
  const a=await actor(request);if(!a)return json({error:'Kullanıcı girişi gerekli'},401);
  if(request.method!=='GET'&&(request.method!=='POST'||request.headers.get('Origin')!==origin))return json({error:'İstek kaynağı reddedildi'},403);
  if(!['GET','POST'].includes(request.method))return json({error:'Yöntem desteklenmiyor'},405);
  try{
   const data=await snapshot(request),rows=await cases(),route=u.pathname.slice(12),today=day(new Date().toISOString());
   if(route==='thumbnail'){
    const id=u.searchParams.get('id');if(!id||id.length>180)return new Response(null,{status:400});
    const e=data.news.find(e=>e.id===id);if(!e)return new Response(null,{status:404});
    const source=safeURL(e.url||e.sources?.[0]?.url);if(!source)return new Response(null,{status:404});
    const page=new URL(source);if(page.protocol==='http:')page.protocol='https:';
    let bytes;try{bytes=await thumbnails.get(page.href,image(e));}catch(error){if(error.code==='thumbnail_pending')return new Response(null,{status:202,headers:{'Cache-Control':'private,no-store','Retry-After':'3'}});throw error;}
    return bytes?new Response(bytes,{headers:{'Content-Type':'image/webp','Content-Length':String(bytes.length),'Cache-Control':'private,max-age=604800','X-Content-Type-Options':'nosniff','Vary':'Cookie'}}):new Response(null,{status:404,headers:{'Cache-Control':'private,max-age=1800'}});
   }
   if(route==='summary'){
    const localNews=data.news.filter(e=>localScopeAssessment(e).local),localSocial=data.social.filter(e=>localScopeAssessment(e).local),localAll=[...localNews,...localSocial];
    return json({actor:{id:a.id,name:a.name,admin:a.admin},snapshot:!live,syncedAt:data.syncedAt,counters:{todayNews:localNews.filter(e=>day(published(e))===today).length,social:localSocial.length,priority:localAll.filter(e=>rank(e)!=='normal').length,review:localAll.filter(e=>e.locationStatus==='review_required').length},headlines:localNews.slice(0,4).map(e=>card(e,rows)),latest:localNews.slice(4,14).map(e=>card(e,rows)),priority:localAll.filter(e=>rank(e)!=='normal').sort(compareRecordsNewest).slice(0,5).map(e=>card(e,rows)),social:localSocial.slice(0,5).map(e=>card(e,rows)),allCounts:{news:data.news.length,social:data.social.length},sources:[...new Set(data.all.flatMap(e=>[e.sourceName,...(e.sources||[]).map(s=>s.sourceName)]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'))});
   }
   if(route==='list'||route==='export'){
    let all=u.searchParams.get('stream')==='news'?data.news:u.searchParams.get('stream')==='social'?data.social:data.all;
    if(u.searchParams.get('section')==='alerts')all=all.filter(e=>!e.nationalCritical&&localScopeAssessment(e).state!=='outside'&&(rank(e)!=='normal'||e.locationStatus==='review_required'||!localScopeAssessment(e).local));
    if(u.searchParams.get('section')==='home')all=all.filter(e=>localScopeAssessment(e).local);
    all=filtered(all,u.searchParams,rows).sort(compareRecordsNewest);
    if(route==='export'){
     if(!a.admin)return json({error:'CSV dışa aktarımı yönetici yetkisi gerektirir'},403);
     const cell=v=>'"'+String(v??'').replace(/^(?=\s*[=+@\-\t\r\n])/,"'").replace(/"/g,'""')+'"';
     const csv=[['Başlık','İçerik türü','Platform','Kaynak','Yayın tarihi','İlk tespit','Konum','Öncelik','İnceleme durumu','Bağlantı'],...all.map(e=>{const c=card(e,rows);return[c.title,c.stream,c.platform,c.sourceName,c.publishedAt,c.firstSeenAt,c.location,c.priorityLevel,c.reviewLabel,c.url];})].map(r=>r.map(cell).join(';')).join('\r\n');
     return new Response('\ufeff'+csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="Umraniye_OSINT_'+today+'.csv"','Cache-Control':'no-store'}});
    }
    // A page beyond the end (filters changed, records expired) is moved to the last existing page instead of returning an empty page.
    const limit=Math.max(1,Math.min(50,Math.floor(Number(u.searchParams.get('limit')))||20)),pages=Math.ceil(all.length/limit),requested=Math.max(1,Math.min(100000,Math.floor(Number(u.searchParams.get('page')))||1)),page=Math.min(requested,Math.max(1,pages));return json({items:all.slice((page-1)*limit,page*limit).map(e=>card(e,rows)),total:all.length,page,limit,pages,requestedPage:requested,syncedAt:data.syncedAt});
   }
   if(route==='event'){
    const id=u.searchParams.get('id');if(!id||id.length>180)return json({error:'Geçersiz olay kimliği'},400);
    const e=data.all.find(e=>e.id===id||(e.relatedIds||[]).includes(id));if(!e)return json({error:'Olay bulunamadı; kayıt saklama süresi dolmuş olabilir'},404);
    const groupIDs=new Set([e.id,...(e.relatedIds||[])]),related=data.all.filter(other=>other.id!==e.id&&(groupIDs.has(other.id)||(other.relatedIds||[]).some(id=>groupIDs.has(id))));
    const sources=[...e.sources||[],...related.flatMap(e=>e.sources||[e])];if(!sources.length)sources.push(e);
    const seen=new Set(),unique=sources.filter(s=>{const k=s.url||s.id;if(!k||seen.has(k))return false;seen.add(k);return true;}).map(s=>({sourceName:s.sourceName||e.sourceName,platform:platform(s),title:s.title||e.title,url:safeURL(s.url),publishedAt:published(s),firstSeenAt:firstSeen(s)})).sort(compareRecordsNewest);
    const geo=e.geoDictionary||analyzeGeoText([e.title,e.description||e.text].join(' ')),discoveryTimes=unique.map(s=>s.firstSeenAt).filter(v=>v&&Number.isFinite(Date.parse(v))).sort((a,b)=>Date.parse(a)-Date.parse(b));
    return json({event:{...card(e,rows),description:e.fullText||e.description||e.text||'',groupingReason:e.groupingReason||null,matchedKeywords:e.matchedKeywords||[],geoMatches:geo.matches||[],sources:unique,related:related.map(e=>card(e,rows)),firstPublishedAt:e.firstPublishedAt||published(e),lastPublishedAt:e.lastPublishedAt||published(e),lastNewRecordAt:discoveryTimes.at(-1)||firstSeen(e)},reviewStatuses:reviewLabels,canReview:true,relationNote:related.length?'Mevcut olay kimliği ilişkileri gösteriliyor.':'Diğer platformlarla doğrulanmış ortak kayıt ilişkisi bulunmuyor.'});
   }
   if(route==='review'){
    if(request.method!=='POST')return json({error:'POST gerekli'},405);
    const raw=await request.text();if(raw.length>3000)return json({error:'İstek çok büyük'},413);let input;try{input=JSON.parse(raw);}catch{return json({error:'Geçersiz inceleme bilgisi'},400);}
    if(!input||typeof input!=='object'||typeof input.eventId!=='string'||!Object.hasOwn(reviewLabels,input.status)||!Number.isInteger(input.revision))return json({error:'Geçersiz inceleme bilgisi'},400);
    const e=data.all.find(e=>e.id===input.eventId);if(!e)return json({error:'Olay bulunamadı'},404);
    const existing=caseFor(e,rows);if((existing?.revision||0)!==input.revision)return json({error:'Kayıt başka oturumda değişti; dosyayı yeniden açın'},409);
    if(existing&&!a.admin&&existing.assignee&&existing.assignee!==a.id)return json({error:'Bu dosya başka personele atanmış; yöneticiye başvurun'},403);
    const id=existing?.id||randomUUID(),at=new Date().toISOString();
    const update=existing?env.DB.prepare('UPDATE case_records SET status=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?').bind(input.status,at,a.name,id,input.revision):env.DB.prepare('INSERT INTO case_records(id,event_id,status,assignee,due_at,latitude,longitude,location_note,event_data,revision,updated_at,updated_by) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM case_records WHERE event_id=?)').bind(id,e.id,input.status,'',null,null,null,'',JSON.stringify(e),1,at,a.name,e.id);
    const history=env.DB.prepare('INSERT INTO case_history(id,case_id,actor,action,note,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM case_records WHERE id=? AND revision=? AND updated_at=?)').bind(randomUUID(),id,a.name,'Durum: '+input.status,live?'Gündem merkezinde güncellendi':'Arayüz DENEME ortamında güncellendi',at,id,input.revision+1,at);
    const result=await env.DB.batch([update,history]);if(!result[0].meta?.changes)return json({error:'Kayıt eşzamanlı değişti'},409);caseCache=null;caseCacheAt=0;return json({ok:true,status:input.status,revision:input.revision+1});
   }
   if(route==='report'){
    const all=filtered(data.all,u.searchParams,rows),counts=new Map(),weekly=[];
    for(const e of all){const s=e.sourceName||'Kaynak belirtilmemiş';counts.set(s,(counts.get(s)||0)+1);}
    for(let n=6;n>=0;n--){const key=day(new Date(Date.now()-n*86400000).toISOString());weekly.push({day:key,count:all.filter(e=>day(published(e))===key).length});}
    return json({total:all.length,today:all.filter(e=>day(published(e))===today).length,social:all.filter(e=>e.stream==='social').length,priority:all.filter(e=>rank(e)!=='normal').length,weekly,sources:[...counts].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,count])=>({name,count})),availableOnly:true});
   }
   return json({error:'Bulunamadı'},404);
  }catch(error){console.error(JSON.stringify({event:'portal_request_failed',kind:error.name}));return json({error:'Kayıtlar şu anda hazırlanamadı. Biraz sonra tekrar deneyin.'},503);}
 }
 return {fetch,actor,invalidate(immediate=false){generation++;if(cached)cached.expires=0;if(immediate){cached=null;newsCache=null;}},warm(headers){return (async()=>{await hydrate();if(cached&&Date.now()-cached.builtAt<60000)return cached;return queueRefresh(new Request(origin+'/api/config',{headers}));})().catch(()=>{});}};
}
