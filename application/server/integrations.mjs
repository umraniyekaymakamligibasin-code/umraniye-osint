import {readInstagramAPIState} from './instagram-api-state.mjs';
import {nationalTelegramBlocked} from './telegram-local-only.mjs';
import {pendingReviewItems,reviewPublicationKey,matchingApproval,manualApproval} from './review-queue-policy.mjs';
import {compareRecordsNewest,retainedEvent,retentionCutoff} from '../src/retention.js';
import {localScopeAssessment,applyLocalScopeSafety} from './local-scope-policy.mjs';
import {createDeliveryScheduler} from './delivery-scheduler.mjs';
import {createCadencedTrigger} from './scan-trigger.mjs';
import {isModerationHidden} from './content-moderation.mjs';
import {isUmraniyesporContent} from './filters/umraniyespor.mjs';
import{deliveryFreshness}from './delivery-freshness.mjs';
import{analyzeGeoText,outsideLocalScope}from './geo-dictionary.mjs';
import{createEventQueue,withEventSources,updateEventMessages}from './telegram-event-queue.mjs';
import{primaryNewsShare}from './primary-news-share.mjs';
import {deliveryDecision,deliveryText,deliveryReference,deliveryEvents,enforceDistrictPriority} from './telegram-delivery.mjs';
import {createInstitutionalManager} from './institutional-manager.mjs';
import {loadInstitutionalTargets} from './institutional-targets.mjs';
import {centralKeywordState,manageCentralKeyword,centralProfile,centralRevision} from './central-keywords.mjs';
import {platformSources,managePlatformSources} from './panel-management.mjs';
import {newsRecords,isNewsRecord} from './content-streams.mjs';
import {categoryGroups} from './social-scope.mjs';
import {createFacebookManager} from './facebook-manager.mjs';
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {parseRSS,robotsAllows} from '../worker/index.js';
import {prioritize,publicationTime,turkeyTime} from './intelligence.mjs';
import {feedRequest,feedURL} from './safe-feed.mjs';
import {youtubeFeed,youtubeChannel} from './youtube.mjs';
import {apiJSON,verifyTelegram} from './telegram-api.mjs';
import {criticalNotification} from './critical-alerts.mjs';
import {socialScope} from './social-scope.mjs';
import {createBrowserResearch} from './browser-research.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const defaults={feeds:[],telegramEnabled:false,includeP2:false,telegramSources:['news','social']};
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export function createIntegrations(base,env,{origin,allowedHosts=[],token='',chatId='',telegramMode='dry-run',youtubeKey='',youtubeFetch=fetch,requestFeed=feedRequest,send=fetch,accountStore=null,socialFetch=fetch,browserKey='',loginManager=null,now=Date.now,log=console.log}={}){
 const research=createBrowserResearch(env.DB,{now});
 const institutional=createInstitutionalManager(env.DB,{origin,now});
 const publicResearch=c=>({...c,platformSources:(c.platformSources||[]).filter(s=>!s.institutional)});
 const facebook=createFacebookManager(env.DB,{dataDir:process.env.DATA_DIR||'/var/lib/umraniye-osint-deneme',research,deliveryAllowed:facebookDeliveryAllowed});
 const facebookScan=createCadencedTrigger(()=>facebook.scan());
 const hosts=new Set(allowedHosts.map(s=>s.trim().toLowerCase()).filter(Boolean));
 const youtubeCache=new Map();
 let running=null,dispatching=null,closed=false,recovery=null,telegramBaseline=null,nextDeliveryAt=0;
 function recover(){return recovery??=env.DB.batch([env.DB.prepare("UPDATE lab_outbox SET status='unknown',last_error='interrupted_delivery' WHERE status='sending'"),env.DB.prepare("UPDATE lab_runs SET status='interrupted',ended_at=? WHERE status='running'").bind(new Date(now()).toISOString())]);}
 async function config(){const row=await env.DB.prepare('SELECT * FROM lab_config WHERE id=?').bind('main').first();return {...defaults,...(row?JSON.parse(row.data):{}),revision:row?.revision||0};}
 const publicationDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'}).format(new Date(value));
 async function items(){const c=await config(),active=new Set(c.feeds.filter(f=>f.enabled&&f.kind!=='social').map(f=>f.id));active.add('dha-direct');const rows=(await env.DB.prepare('SELECT data FROM lab_items ORDER BY published_at DESC LIMIT 1000').all()).results;const cutoff=retentionCutoff(now());return newsRecords(rows.map(r=>JSON.parse(r.data))).filter(e=>!e.retentionExpired&&active.has(e.sourceId)&&e.publishedAt&&publicationDay(e.publishedAt)>=cutoff).sort(compareRecordsNewest);}

// OSINT_EDITORIAL_APPROVAL_V1 — reviewed social item promotion; DENEME only.
const editorialReady = {promise:null};
async function ensureEditorialTable(){
 if(!editorialReady.promise)editorialReady.promise=env.DB.prepare(`CREATE TABLE IF NOT EXISTS osint_editorial_approvals (
   item_key TEXT PRIMARY KEY, original_url TEXT NOT NULL, platform TEXT NOT NULL,
   title TEXT NOT NULL, description TEXT NOT NULL, source_name TEXT NOT NULL,
   published_at TEXT NOT NULL, approved_at TEXT NOT NULL, approved_by TEXT NOT NULL
 )`).run().catch(e=>{editorialReady.promise=null;throw e;});
 await editorialReady.promise;
}
const editorialHash=url=>hash(reviewPublicationKey(String(url))||String(url));
const editorialEscape=x=>String(x||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function editorialPublicEvent(row){
 const automatic=String(row.approved_by||'').startsWith('osint-auto-');const link=origin+'/haber/onaylanan/'+row.item_key;
 return {id:'editorial-'+row.item_key.slice(0,24),sourceId:'editorial-approved',sourceName:(automatic?'Instagram · Otomatik ön değerlendirme · ':'Onaylı sosyal medya · ')+row.source_name,
  title:row.title,description:row.description,fullText:row.description,
  url:link,originalUrl:row.original_url,publishedAt:row.published_at,
  platform:'editorial',social:false,stream:'news',editorialApproved:!automatic,autoSelected:automatic,verificationStatus:automatic?'source_reported_unverified':'human_reviewed',approvedAt:row.approved_at,
  priorityLevel:'P3',notificationEligible:false};
}
async function editorialEvents(){
 await ensureEditorialTable();
 const rows=(await env.DB.prepare('SELECT * FROM osint_editorial_approvals ORDER BY julianday(published_at) DESC,approved_at DESC,item_key LIMIT 300').all()).results||[];
 return rows.map(editorialPublicEvent).filter(e=>retainedEvent(e)).sort(compareRecordsNewest);
}
async function editorialApprove(request,actor){
 if(request.method!=='POST')return reply({error:'Yöntem geçersiz'},405);
 let input;try{const raw=await request.text();if(raw.length>7500)return reply({error:'İstek çok büyük'},413);input=JSON.parse(raw);}catch{return reply({error:'Geçersiz istek'},400);}
 const originalUrl=String(input.url||'').trim();let u;
 try{u=new URL(originalUrl);}catch{return reply({error:'Geçerli bir kaynak bağlantısı gerekli'},400);}
 const hosts=new Set(['x.com','www.x.com','twitter.com','www.twitter.com','www.instagram.com','instagram.com','facebook.com','www.facebook.com','m.facebook.com']);
 if(u.protocol!=='https:'||!hosts.has(u.hostname)||u.username||u.password||u.port||originalUrl.length>1500)return reply({error:'Onaylanacak kaynak adresi uygun değil'},400);
 u.hash='';const cleanUrl=u.href,requestedKey=editorialHash(cleanUrl);
 await ensureEditorialTable();const approvalRows=(await env.DB.prepare('SELECT item_key,original_url,approved_by FROM osint_editorial_approvals').all()).results||[];const existingApproval=matchingApproval(approvalRows,cleanUrl);if(existingApproval&&manualApproval(existingApproval))return reply({error:'Bu haber daha önce onaylandı',alreadyApproved:true,newsUrl:origin+'/haber/onaylanan/'+existingApproval.item_key},409);
 // Read the current review records from the existing authorized API, never trust an arbitrary URL submitted from the browser.
 const reviewResponse=await wrap(new Request(origin+'/api/admin/integrations/social-review',{headers:request.headers}),env,{});
 if(!reviewResponse.ok)return reply({error:'İnceleme kuyruğu okunamadı'},503);
 const review=(await reviewResponse.json()).items||[];
 const original=review.find(x=>{try{const v=new URL(String(x.url));v.hash='';return editorialHash(v.href)===requestedKey;}catch{return false;}});
 if(!original)return reply({error:'Bu bağlantı güncel inceleme kuyruğunda bulunamadı'},404);
 if(isUmraniyesporContent(original))return reply({error:'Ümraniyespor filtresi nedeniyle onaylanamaz'},400);
 const title=String(input.title||'').trim(),description=String(input.description||'').trim();
 if(title.length<12||title.length>240||description.length<40||description.length>2500)return reply({error:'Başlık (12–240) ve doğrulanmış haber metni (40–2500) gerekli'},400);
 const suppliedDate=String(input.publishedAt||original.publishedAt||'').trim(),parsedPublication=publicationTime(suppliedDate,now());const p=parsedPublication.precision==='instant'?parsedPublication.publishedAt:null;
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(p)||!Number.isFinite(Date.parse(p)))return reply({error:'Doğrulanmış yayın tarihi gerekli; keşif tarihi kullanılamaz'},400);
 if(!retainedEvent({publishedAt:p},retentionCutoff(now())))return reply({error:'Yayın tarihi iki aylık saklama süresinin dışında'},400);
 const publishedMs=Date.parse(p);if(publishedMs>now()+60000)return reply({error:'Yayın tarihi gelecekte olamaz'},400);
 if(input.confirm!==true)return reply({error:'Manuel haber onayı gerekli'},400);
 const key=existingApproval?.item_key||editorialHash(cleanUrl),approvedAt=new Date(now()).toISOString();
 await ensureEditorialTable();
 const result=await env.DB.prepare(`INSERT OR IGNORE INTO osint_editorial_approvals
 (item_key,original_url,platform,title,description,source_name,published_at,approved_at,approved_by)
 VALUES(?,?,?,?,?,?,?,?,?)`).bind(key,cleanUrl,String(original.provider||'unknown').slice(0,20),title,description,String(original.sourceName||'Sosyal Medya').slice(0,140),p,approvedAt,String(actor.email||'admin').slice(0,140)).run();
 if(!result.meta?.changes){const existing=await env.DB.prepare('SELECT approved_by FROM osint_editorial_approvals WHERE item_key=?').bind(key).first();if(String(existing?.approved_by||'').startsWith('osint-auto-')){await env.DB.prepare('UPDATE osint_editorial_approvals SET title=?,description=?,published_at=?,approved_at=?,approved_by=? WHERE item_key=?').bind(title,description,p,approvedAt,String(actor.email||'admin'),key).run();invalidatePrioritizedNews();return reply({ok:true,newsUrl:origin+'/haber/onaylanan/'+key,telegramStatus:'not_queued_manual_upgrade',detail:'Otomatik ön değerlendirme kaydı manuel onaya yükseltildi; Telegram gönderimi başlatılmadı.'});}return reply({error:'Bu haber daha önce onaylandı; Telegram tekrar gönderilmez',alreadyApproved:true},409);}
 await env.DB.prepare('INSERT INTO audit(id,actor,action,target,created_at) VALUES(?,?,?,?,?)')
  .bind(randomUUID(),String(actor.email||'admin'),'Sosyal medya haberi onaylandı',key,approvedAt).run();
 invalidatePrioritizedNews();
 // Always publish approved editorial item; send only through existing Telegram eligibility, freshness, and deduplication pipeline.
 let telegramStatus='not_queued';
 const configValue=await config();
 const maxAge=(original.provider==='instagram'?3:1)*3600000;
 const age=now()-publishedMs;
 if(age>=-60000&&age<=maxAge&&configValue.telegramEnabled&&configValue.telegramSources?.includes('news')){
  const e={id:'editorial-'+key.slice(0,24),sourceId:'editorial-approved',sourceName:'Onaylı sosyal medya · '+String(original.sourceName||'Sosyal Medya'),
   title,description,fullText:description,url:cleanUrl,publishedAt:p,platform:String(original.provider||'x'),social:false,stream:'news',
   priorityLevel:'P2',locationStatus:'source_reported',notificationEligible:true};
  try{
   await enqueue([e],configValue);
   const q=await env.DB.prepare('SELECT status,last_error FROM lab_outbox WHERE event_id=? ORDER BY created_at DESC LIMIT 1').bind(e.id).first();
   telegramStatus=q?(q.status==='sent'?'sent':q.status==='pending'?'pending':q.status==='unknown'?'unknown_do_not_retry':q.status==='dry-run'?'dry_run_not_sent':q.status==='expired'?'expired_not_sent':q.status):'filtered_or_previously_notified';
   if(q?.status==='pending')drain().catch(err=>log(JSON.stringify({event:'editorial_delivery_error',type:err?.name||'Error'})));
  }catch(error){telegramStatus='queue_error_news_kept';log(JSON.stringify({event:'editorial_queue_error',type:error?.name||'Error'}));}
 }else if(age>maxAge)telegramStatus='too_old_no_notification';
 else if(!configValue.telegramEnabled)telegramStatus='telegram_disabled';
 else telegramStatus='news_source_disabled';
 return reply({ok:true,newsUrl:origin+'/haber/onaylanan/'+key,telegramStatus,detail:'Telegram gönderimi canlı bağlantı, filtre, öncelik ve kuyruk kurallarına bağlıdır.'});
}

 async function facebookDeliveryAllowed(){
  const authorizationRow=await env.DB.prepare('SELECT data FROM lab_config WHERE id=?').bind('telegram-delivery-policy').first();
  const authorization=authorizationRow?JSON.parse(authorizationRow.data):{};
  if(authorization.sharedMainChannelEnabled===true){
   const live=await telegramConnection();
   return !!live.token&&live.mode==='live'&&live.chatId==='-1004290505089'&&hash(live.token)===authorization.authorizedBotHash&&hash(live.chatId)===authorization.authorizedChatHash&&(authorization.primaryArchiveRetired===true||await primaryNewsShare(now())!==null);
  }
  const row=await env.DB.prepare('SELECT data FROM lab_config WHERE id=?').bind('facebook-telegram-isolation').first();if(!row)return false;const policy=JSON.parse(row.data),botHashes=policy.productionBotHashes||[policy.productionBotHash].filter(Boolean),chatHashes=policy.productionChatHashes||[policy.productionChatHash].filter(Boolean);if(!botHashes.length||!chatHashes.length)return false;
  const live=await telegramConnection();return !!live.token&&/^-[0-9]+$/.test(live.chatId)&&live.mode==='live'&&!botHashes.includes(hash(live.token))&&!chatHashes.includes(hash(live.chatId));
 }
 async function telegramConnection(){const a=accountStore?await accountStore.read('telegram'):null;return a?{token:a.enabled?a.secret:'',chatId:a.accountId,mode:a.enabled?a.mode:'dry-run'}:{token,chatId,mode:telegramMode};}
 async function nationalTelegramTarget(){return ''; /* National Telegram disabled by explicit user policy. */}
 env.OSINT_LAB_EVENTS=items;
 async function settings(input,actor){
  if(!input||!Array.isArray(input.feeds)||input.feeds.length>20||!Number.isInteger(input.revision)||typeof input.telegramEnabled!=='boolean'||typeof input.includeP2!=='boolean')throw Error('Geçersiz ayarlar');
  const old=await config();if(old.revision!==input.revision)return reply({error:'Ayarlar başka oturumda değişti; yenileyin'},409);
  const seen=new Set(),feeds=input.feeds.map(f=>{
   if(typeof f.name!=='string'||!f.name.trim()||f.name.length>100||typeof f.url!=='string'||f.url.length>1000||typeof f.permissionBasis!=='string'||f.permissionBasis.trim().length<8||f.permissionBasis.length>300||typeof f.enabled!=='boolean'||!['rss','youtube','social'].includes(f.kind))throw Error('Kaynak adı, izin dayanağı ve türü gerekli');
   const u=feedURL(f.url,hosts);if(seen.has(u.href))throw Error('Aynı akış iki kez eklenemez');seen.add(u.href);
   if(f.kind==='youtube')youtubeChannel(u.href);
   return {id:'feed-'+hash(u.href).slice(0,24),name:f.name.trim(),url:u.href,kind:f.kind,permissionBasis:f.permissionBasis.trim(),enabled:f.enabled};
  });
  const telegramSources=input.telegramSources===undefined?['news','social']:input.telegramSources;if(!Array.isArray(telegramSources)||telegramSources.some(s=>!['news','social'].includes(s))||telegramSources.length>2)throw Error('Bildirim kaynağı geçersiz');
  const data={feeds,telegramEnabled:input.telegramEnabled,includeP2:input.includeP2,telegramSources:[...new Set(telegramSources)]};
  const result=await env.DB.prepare('INSERT INTO lab_config(id,data,revision,updated_at) VALUES(?,?,1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=lab_config.revision+1,updated_at=excluded.updated_at WHERE lab_config.revision=?').bind('main',JSON.stringify(data),new Date(now()).toISOString(),input.revision).run();
  if(!result.meta?.changes)return reply({error:'Ayarlar başka oturumda değişti; yenileyin'},409);
  await env.DB.prepare('INSERT INTO audit(id,actor,action,target,created_at) VALUES(?,?,?,?,?)').bind(randomUUID(),actor,'Deneme entegrasyon ayarları güncellendi','RSS ve bildirim kuralları',new Date(now()).toISOString()).run();return reply({ok:true});
 }
 async function collectFeed(f){
  const checkedAt=new Date(now()).toISOString();let status='error',count=0;
  try{
   const u=feedURL(f.url,hosts);let response;
   if(f.kind==='youtube')response={status:200,text:await youtubeFeed(f.url,{key:youtubeKey,send:youtubeFetch,cache:youtubeCache,now:now()})};
   else{const robots=await requestFeed(u.origin+'/robots.txt',{allowedHosts:hosts,maxBytes:256000});
    if(robots.status!==404&&robots.status!==410&&(robots.status!==200||/<html|<!doctype/i.test(robots.text)||!robotsAllows(robots.text,u.pathname+u.search)))throw Error('robots');
    response=await requestFeed(u.href,{allowedHosts:hosts});}
   if(response.status!==200||!/<(?:rss|feed)\b/i.test(response.text)||/<!ENTITY|<!DOCTYPE/i.test(response.text))throw Error('feed');
   // Validate original date before baseline parser can apply Date.parse's local-zone fallback.
   const dateByURL=new Map();
   const cleaned=response.text.replace(/<(item|entry)(\s[^>]*)?>[\s\S]*?<\/\1>/gi,block=>{
    const raw=block.match(/<(?:pubDate|published|updated)(?:\s[^>]*)?>([\s\S]*?)<\/(?:pubDate|published|updated)>/i)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g,'').trim();
    const time=publicationTime(raw,now());
    if(!time.publishedAt)return '';
    const key=block.match(/<link[^>]+href=["']([^"']+)/i)?.[1]||block.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i)?.[1];if(key)dateByURL.set(key.replace(/<!\[CDATA\[|\]\]>/g,'').trim(),time);
    return block;
   });
   const source={id:f.id,name:f.name,type:f.kind==='rss'?'Ek haber akışı':'Açık sosyal yayın',url:f.url,articleOrigins:[u.origin],externalLinks:false,national:true};
   const parsed=parseRSS(cleaned,source);const cutoff=retentionCutoff(now());
   for(const raw of parsed){
    if((f.kind==='social'||f.kind==='rss')&&!socialScope(raw.title,raw.description))continue;
    const time=dateByURL.get(raw.url)||publicationTime(raw.publishedAt,now());if(!time.publishedAt||publicationDay(time.publishedAt)<cutoff)continue;
    const item={...raw,social:f.kind==='social',publishedAt:time.publishedAt,datePrecision:time.precision,collectedAt:checkedAt,permissionBasis:f.permissionBasis,...prioritize({...raw,publishedAt:time.publishedAt},now())};
    item.id=f.id+'-'+hash(item.url).slice(0,24);if(item.social){const old=await env.DB.prepare('SELECT data FROM lab_items WHERE id=?').bind(item.id).first();const previous=old?JSON.parse(old.data):null;item.firstSeenAt=previous?.firstSeenAt||previous?.collectedAt||item.collectedAt;item.collectedAt=item.firstSeenAt;}item.sources=[{...item}];
    await env.DB.prepare('INSERT INTO lab_items(id,source_id,data,published_at,collected_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,published_at=excluded.published_at,collected_at=excluded.collected_at').bind(item.id,f.id,JSON.stringify(item),item.publishedAt,checkedAt).run();count++;
   }
   status=count?'healthy':'no_match';
  }catch(e){status=e.message==='robots'?'robots_denied':['credential_missing','quota_or_permission'].includes(e.message)?e.message:'error';}
  await env.DB.prepare('INSERT INTO lab_source_health(id,status,item_count,checked_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,item_count=excluded.item_count,checked_at=excluded.checked_at').bind(f.id,status,count,checkedAt).run();
  return {id:f.id,status,count};
 }
 const deliveryRefresh=createDeliveryScheduler(async()=>{await enqueue(await research.socialItems(),await config());await drain();},{onError:()=>log(JSON.stringify({event:'background_social_delivery_failed'}))});
 const eventQueue=createEventQueue(env.DB,{now});let enqueueWork=Promise.resolve();
 function enqueue(events,c){const next=enqueueWork.then(()=>enqueueSerial(events,c));enqueueWork=next.catch(()=>{});return next;}
 async function enqueueSerial(events,c){
  if(!c.telegramEnabled)return;
   const {chatId}=await telegramConnection(),nationalTarget=await nationalTelegramTarget();
  if(!telegramBaseline)telegramBaseline=new Set((await env.DB.prepare('SELECT reference_hash FROM lab_telegram_baseline').all()).results.map(r=>r.reference_hash));
  const coverageRow=await env.DB.prepare('SELECT data FROM lab_config WHERE id=?').bind('news-coverage-policy').first();
  const coverageStart=coverageRow?Date.parse(JSON.parse(coverageRow.data).startedAt):NaN;
  for(const e of deliveryEvents(events)){await new Promise(resolve=>setImmediate(resolve));if(nationalTelegramBlocked(e))continue;
   if(e.duplicateOf||!e.url||!/^https?:\/\//.test(e.url))continue;
   const stream=e.social||e.sourceId==='browser-research'||e.reviewOrigin?.startsWith('browser-')?'social':'news';if(!(c.telegramSources||['news','social']).includes(stream))continue;
   const reference=deliveryReference(e);if(!reference||telegramBaseline.has(hash(reference)))continue;
   const geo=analyzeGeoText(e.title+' '+(e.fullText||e.description||''));
    const destination=e.scope==='national'||e.nationalCritical===true?'national':'local';
    if(destination==='national'&&!nationalTarget)continue;
    if(destination==='local'&&!localScopeAssessment(e).local){
    if(localScopeAssessment(e).state==='review')continue;
    telegramBaseline.add(hash(reference));await env.DB.prepare('INSERT OR IGNORE INTO lab_telegram_baseline(reference_hash,created_at) VALUES(?,?)').bind(hash(reference),new Date(now()).toISOString()).run();continue;
   }
    if(!deliveryFreshness(e.publishedAt,now()).allowed){telegramBaseline.add(hash(reference));await env.DB.prepare('INSERT OR IGNORE INTO lab_telegram_baseline(reference_hash,created_at) VALUES(?,?)').bind(hash(reference),new Date(now()).toISOString()).run();continue;}

   const publication=Date.parse(e.publishedAt);
   if(stream==='news'&&Number.isFinite(coverageStart)&&(!Number.isFinite(publication)||publication<coverageStart&&now()-publication>3600000)){
    telegramBaseline.add(hash(reference));await env.DB.prepare('INSERT OR IGNORE INTO lab_telegram_baseline(reference_hash,created_at) VALUES(?,?)').bind(hash(reference),new Date(now()).toISOString()).run();continue;
   }

    const targetChatId=destination==='national'?nationalTarget:chatId;if(!targetChatId)continue;
    const decision=deliveryDecision(e,now(),{includeP2:c.includeP2!==false}),key=hash(targetChatId+'|'+reference);
    const payload={destination,platform:e.platform||null,scope:e.scope||null,nationalCritical:e.nationalCritical===true,stream,reference,eventId:e.id,title:String(e.title||'').slice(0,400),description:String(e.fullText||e.description||'').slice(0,1600),sourceName:e.sourceName||e.sources?.[0]?.sourceName||'Kaynak',publishedAt:e.publishedAt,url:e.url,...decision};
    await eventQueue.put(targetChatId,e,payload,key);
  }
 }
 async function processOutbox(){
  await recover();
  const c=await config();if(!c.telegramEnabled)return;
  const sharedPolicyRow=await env.DB.prepare('SELECT data FROM lab_config WHERE id=?').bind('telegram-delivery-policy').first();
  if(sharedPolicyRow&&JSON.parse(sharedPolicyRow.data).sharedMainChannelEnabled===true&&JSON.parse(sharedPolicyRow.data).primaryArchiveRetired!==true){
   const news=await primaryNewsShare(now());if(news===null)return;
   await enqueue(news,c);
  }
   const {token,chatId,mode:telegramMode}=await telegramConnection(),nationalTarget=await nationalTelegramTarget();
  if(telegramMode==='live'&&!await facebookDeliveryAllowed()){await env.DB.prepare("UPDATE lab_outbox SET last_error='DENEME Telegram hedef ayrımı gerekli' WHERE status='pending'").run();return;}
  if(telegramMode==='live'&&/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token)&&chatId){
   for(const [destination,target] of [['local',chatId],['national',nationalTarget]]){if(!target)continue;if(nextDeliveryAt>now())await new Promise(resolve=>setTimeout(resolve,Math.min(3100,nextDeliveryAt-now())));if(await updateEventMessages(env.DB,{token,chatId:target,send,render:deliveryText,now,destination}))nextDeliveryAt=now()+3100;}
  }
  const rows=(await env.DB.prepare("SELECT * FROM lab_outbox WHERE status='pending' AND next_at<=? ORDER BY CASE WHEN json_extract(data,'$.disableNotification')=0 THEN 0 ELSE 1 END,created_at LIMIT 20").bind(now()).all()).results;
  for(const row of rows){
   if(closed)break;
    const original=JSON.parse(row.data);if(nationalTelegramBlocked(original)){await env.DB.prepare("UPDATE lab_outbox SET status='expired',last_error='national_telegram_disabled_by_user' WHERE id=? AND status='pending'").bind(row.id).run();continue;}if(isUmraniyesporContent(original)||await isModerationHidden(env.DB,original)){await env.DB.prepare("UPDATE lab_outbox SET status='expired',last_error='umraniyespor_excluded' WHERE id=? AND status='pending'").bind(row.id).run();continue;}const destination=original.destination||((original.nationalCritical||original.scope==='national')?'national':'local'),targetChatId=destination==='national'?nationalTarget:chatId,item=enforceDistrictPriority(original),stream=item.stream||(item.eventId?.startsWith('browser-')?'social':'news');if(!(c.telegramSources||['news','social']).includes(stream)){await env.DB.prepare("UPDATE lab_outbox SET status='expired',last_error='Bildirim kaynağı kapatıldı' WHERE id=? AND status='pending'").bind(row.id).run();continue;}let status='failed',error='',next=now();
    if(destination==='national'&&!nationalTarget){await env.DB.prepare("UPDATE lab_outbox SET status='expired',last_error='Ulusal kanal ayarlanmamış; geçmiş içerik tekrar oynatılmadı' WHERE id=? AND status='pending'").bind(row.id).run();continue;}
    if(!targetChatId||row.id!==hash(targetChatId+'|'+(item.reference||item.url||item.eventId))){await env.DB.prepare("UPDATE lab_outbox SET status='expired',last_error='Bildirim hedefi değişti' WHERE id=? AND status='pending'").bind(row.id).run();continue;}
   const freshness=deliveryFreshness(item.publishedAt,now());
   const itemGeo=analyzeGeoText(item.title+' '+(item.description||''));
    if(!freshness.allowed||destination==='local'&&!localScopeAssessment(item).local||destination==='national'&&!item.nationalCritical&&item.scope!=='national'){await env.DB.prepare("UPDATE lab_outbox SET status='expired',last_error=? WHERE id=? AND status='pending'").bind(!freshness.allowed?freshness.reason:destination==='local'?'outside_district':'not_national',row.id).run();continue;}
   if(item.policyVersion!==2){await env.DB.prepare("UPDATE lab_outbox SET status='expired',last_error='Önceki gönderim politikası' WHERE id=? AND status='pending'").bind(row.id).run();continue;}
   // Re-evaluate audible delivery if a message waited in the queue past the freshness window.
   if(now()-Date.parse(item.publishedAt)>(item.platform==='instagram'?10800000:3600000)||!String(item.publishedAt||'').includes('T'))item.disableNotification=true;
   if(telegramMode!=='live'){await env.DB.prepare("UPDATE lab_outbox SET status='dry-run',last_error='Gönderim yapılmadı: deneme modu' WHERE id=? AND status='pending'").bind(row.id).run();continue;}
    if(!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token)||!/^(-?\d+|@[A-Za-z][A-Za-z0-9_]{4,})$/.test(targetChatId))return;
   if(nextDeliveryAt>now())await new Promise(resolve=>setTimeout(resolve,Math.min(3100,nextDeliveryAt-now())));
   if(closed)break;
   const claim=await env.DB.prepare("UPDATE lab_outbox SET status='sending',attempts=attempts+1 WHERE id=? AND status='pending'").bind(row.id).run();if(!claim.meta?.changes)continue;
   try{
    const text=withEventSources(deliveryText(item),item);
     const r=await send('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:targetChatId,text,disable_notification:item.disableNotification!==false,link_preview_options:{is_disabled:true}}),signal:AbortSignal.timeout(12000)});
    let data;try{data=await r.json()}catch{data=null}
    if(r.ok&&data?.ok===true){status='sent';if(Number.isSafeInteger(data.result?.message_id))await env.DB.prepare("UPDATE lab_outbox SET data=json_set(data,'$.telegramMessageId',?) WHERE id=?").bind(data.result.message_id,row.id).run();}
    else if((r.status===429||data?.error_code===429)&&row.attempts<4){status='pending';next=now()+Math.max(10000,Math.min(3600000,Number(data?.parameters?.retry_after||60)*1000));error='rate_limited';}
    else if(r.status>=500||r.ok){status='unknown';error='delivery_unconfirmed';}
    else {status='failed';error='telegram_rejected';}
   }catch{status='unknown';error='delivery_unconfirmed';}
   nextDeliveryAt=now()+3100;
   // Unknown delivery is held for human review: Telegram has no idempotency key.
   await env.DB.prepare('UPDATE lab_outbox SET status=?,next_at=?,sent_at=?,last_error=? WHERE id=?').bind(status,next,status==='sent'?new Date(now()).toISOString():null,error,row.id).run();
   if(error==='rate_limited'){await env.DB.prepare("UPDATE lab_outbox SET next_at=max(next_at,?) WHERE status='pending'").bind(next).run();break;}
  }
 }
 function drain(){if(dispatching)return dispatching;if(closed)return Promise.resolve();dispatching=processOutbox().finally(()=>{dispatching=null});return dispatching;}
 async function cycle(){
  await recover();const retention=await research.maintenance();if(retention)log(JSON.stringify({event:'content_retention',...retention}));
  const id=randomUUID(),started=new Date(now()).toISOString();
  await env.DB.prepare('INSERT INTO lab_runs(id,started_at,status) VALUES(?,?,?)').bind(id,started,'running').run();
  try{
   await recover();
   const c=await config(),results=[];for(const f of c.feeds.filter(f=>f.enabled)){if(closed)break;results.push(await collectFeed(f));}
   const response=await base.fetch(new Request(origin+'/api/config',{headers:{'X-OSINT-Service-Key':env.OSINT_LAB_SERVICE_KEY||''}}),env);
   if(!response.ok)throw Error('base_snapshot_unavailable');
   const data=await response.json();await enqueue([...data.initialData.events,...await research.socialItems()],c);await drain();
   // Six-month content cleanup runs through research.maintenance; delivery identity ledgers stay intact.
   await env.DB.prepare('DELETE FROM lab_runs WHERE started_at<?').bind(new Date(now()-14*86400000).toISOString()).run();
   await env.DB.prepare('UPDATE lab_runs SET status=?,ended_at=?,data=? WHERE id=?').bind('completed',new Date(now()).toISOString(),JSON.stringify({sources:results,events:data.initialData.events.length}),id).run();
   log(JSON.stringify({event:'lab_collection_completed',sources:results.length,at:new Date(now()).toISOString()}));
  }catch{await env.DB.prepare('UPDATE lab_runs SET status=?,ended_at=? WHERE id=?').bind('failed',new Date(now()).toISOString(),id).run();log(JSON.stringify({event:'lab_collection_failed',at:new Date(now()).toISOString()}));}
 }
 function run(){if(closed)return Promise.resolve();if(running)return running;running=cycle().finally(()=>{running=null});return running;}
 let prioritizedNewsCache=null,prioritizedNewsPending=null,prioritizedNewsGeneration=0;
 function invalidatePrioritizedNews(){prioritizedNewsCache=null;prioritizedNewsPending=null;prioritizedNewsGeneration++;}
 async function analyzeNews(events){const t0=Date.now(),analyzed=[];for(const e of newsRecords(events)){analyzed.push(applyLocalScopeSafety({...e,...prioritize(e,now())}));if(analyzed.length%8===0)await new Promise(resolve=>setImmediate(resolve));}const ms=Date.now()-t0;if(ms>500)console.log(JSON.stringify({event:'analyze_news_slow',ms,n:analyzed.length}));return analyzed;}
 let keywordReviewTask=null,keywordReviewPending=false,keywordReviewState={status:'idle'};
 function scheduleKeywordReview(){
  keywordReviewPending=true;keywordReviewState={status:'queued',revision:centralRevision(),notificationReplay:false};
  if(keywordReviewTask)return;
  keywordReviewTask=new Promise(resolve=>setImmediate(resolve)).then(async()=>{
   while(keywordReviewPending&&!closed){
    keywordReviewPending=false;let cursor='',evaluated=0;
    keywordReviewState={status:'running',revision:centralRevision(),evaluated,notificationReplay:false};
    while(!closed){
     const part=await facebook.reprocessStored({limit:25,afterId:cursor});evaluated+=part.evaluated;research.invalidateSocialCache();
     keywordReviewState={status:'running',revision:centralRevision(),evaluated,totalStored:part.totalStored,notificationReplay:false};
     if(keywordReviewPending||!part.nextAfter||!part.remaining)break;
     cursor=part.nextAfter;await new Promise(resolve=>setImmediate(resolve));
    }
    if(!keywordReviewPending)keywordReviewState={...keywordReviewState,status:'completed'};
   }
  }).catch(()=>{keywordReviewState={status:'failed',revision:centralRevision(),saved:true,notificationReplay:false};log(JSON.stringify({event:'keyword_background_review_failed'}));}).finally(()=>{keywordReviewTask=null;if(keywordReviewPending&&!closed)scheduleKeywordReview();});
 }
 async function wrap(request,_env,ctx){
  const u=new URL(request.url);
  if(u.pathname==='/kurumsal-etiketler'||u.pathname.startsWith('/api/admin/institutional/')){
   const response=await base.fetch(new Request(origin+'/api/session',{headers:request.headers}),env,ctx),actor=await response.json();
   if(!actor.adminUnlocked)return u.pathname.startsWith('/api/')?reply({error:'Yönetici oturumu gerekli'},401):Response.redirect(origin+'/yonetim',302);
   if(u.pathname.startsWith('/api/'))return institutional.handle(request,actor);
   if(request.method!=='GET')return reply({error:'Yöntem geçersiz'},405);
   return new Response(await readFile(new URL('./institutional.html',import.meta.url),'utf8'),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'same-origin'}});
  }
  if(['/api/admin/logout','/api/logout'].includes(u.pathname)&&request.method==='POST'&&request.headers.get('Origin')===origin){await institutional.lock(request);}
  if(u.pathname==='/api/admin/integrations/browser-facebook'){
   const supplied=Buffer.from(request.headers.get('X-OSINT-Browser-Key')||''),expected=Buffer.from(browserKey);if(!browserKey||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return reply({error:'Bulunamadı'},404);
   try{if(request.method==='GET')return reply(await facebook.publicWork());if(request.method==='POST'){const raw=await request.text();if(raw.length>180000)return reply({error:'İstek çok büyük'},413);const result=await facebook.publicIngest(JSON.parse(raw));research.invalidateSocialCache();return reply(result);}return reply({error:'Yöntem geçersiz'},405);}catch{return reply({error:'Facebook okuyucu sonucu alınamadı'},400);}
  }
  if(u.pathname==='/api/admin/integrations/browser-worker'){
   const supplied=Buffer.from(request.headers.get('X-OSINT-Browser-Key')||''),expected=Buffer.from(browserKey);if(!browserKey||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return reply({error:'Bulunamadı'},404);
   if(request.method==='GET'){facebookScan.request().catch(()=>log(JSON.stringify({event:'facebook_api_scan_failed'})));return reply(await research.config());}
   if(request.method==='POST'){try{const text=await request.text();if(text.length>60000)return reply({error:'İstek çok büyük'},413);await loadInstitutionalTargets(env.DB);const result=await research.ingest(JSON.parse(text));const scheduled=deliveryRefresh.request();ctx?.waitUntil?.(scheduled);return reply({ok:true,accepted:result.accepted,rejected:result.rejected,receipts:result.receipts||[]});}catch(e){console.log(JSON.stringify({event:'browser_worker_error_logged',errorType:e?.name||'Error',errorMessage:String(e?.message||'').slice(0,160)}));return reply({error:'Tarayıcı sonuçları alınamadı'},e.message==='revision_conflict'?409:400)}}
   return reply({error:'Bulunamadı'},404);
  }
   if(u.pathname==='/sosyal-medya'||u.pathname==='/api/social'||u.pathname==='/api/briefing/social'){const response=await base.fetch(new Request(origin+'/api/session',{headers:request.headers}),env,ctx);const actor=await response.json();if(!actor.member&&!actor.adminUnlocked)return u.pathname==='/sosyal-medya'?Response.redirect(origin+'/giris',302):reply({error:'Giriş gerekli'},401);if(u.pathname==='/api/social')return reply({items:(await research.socialItems()).filter(e=>e.nationalCritical||!outsideLocalScope(e))});if(u.pathname==='/api/briefing/social'){const items=(await research.socialItems()).filter(e=>e.nationalCritical||!outsideLocalScope(e));const dated=items.map(e=>{const sources=e.sources?.length?e.sources:[e],publishedAt=e.publishedAt||e.published_at||e.publicationDate||e.publication_date||e.postedAt||e.posted_at||sources.map(s=>s.publishedAt||s.published_at||s.publicationDate||s.publication_date||s.postedAt||s.posted_at).find(Boolean)||null;return {...e,publishedAt};});return reply({items:dated,undated:dated.filter(e=>!e.publishedAt).length});}return new Response(await readFile(new URL('./social.html',import.meta.url),'utf8'),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});}
  if(['/yonetim/entegrasyonlar','/yonetim/instagram-takip'].includes(u.pathname)||u.pathname.startsWith('/api/admin/integrations')){
   const session=await base.fetch(new Request(origin+'/api/session',{headers:request.headers}),env,ctx),actor=await session.json();
   if(!actor.adminUnlocked)return u.pathname.startsWith('/api/')?reply({error:'Yönetici girişi gerekli'},401):Response.redirect(origin+'/yonetim',302);
   if(request.method!=='GET'&&(request.method!=='POST'||request.headers.get('Origin')!==origin||request.headers.get('Sec-Fetch-Site')==='cross-site'))return reply({error:'İstek kaynağı reddedildi'},403);
    // OSINT_IG_ADMIN_V60: within existing adminUnlocked + Origin protections.
    // OSINT_INSTAGRAM_ACTION_FIX_V11: admin-only, same-origin, durable allowlist edits.
    if(u.pathname==='/api/admin/integrations/instagram-api-status'&&request.method==='GET')return reply(await readInstagramAPIState());
    if(u.pathname==='/api/admin/integrations/instagram-targets'){
      const fs=await import('node:fs/promises');
      const path='/opt/umraniye-osint-browser/.instagram-v60/targets.json';
      const lockpath=path+'.lock';
      const readTargets=async()=>{
        const st=await fs.lstat(path);
        if(!st.isFile()||st.isSymbolicLink())throw Error('invalid_target_file');
        const value=JSON.parse(await fs.readFile(path,'utf8'));
        if(value.version!==1||!Array.isArray(value.accounts)||!Number.isInteger(value.revision)||value.revision<1||value.accounts.length>200)throw Error('invalid_target_file');
        const handles=new Set();
        for(const a of value.accounts){
          if(!a||!/^[a-z0-9._]{1,30}$/.test(a.handle)||typeof a.enabled!=='boolean'||handles.has(a.handle))throw Error('invalid_target_file');
          handles.add(a.handle);
        }
        return value;
      };
      if(request.method==='GET'){
        try{return reply(await readTargets());}
        catch{return reply({error:'Instagram hesap listesi sunucuda okunamadı',code:'ig_targets_read_failed'},503);}
      }
      if(request.method!=='POST')return reply({error:'Yöntem desteklenmiyor'},405);
      let input;
      try{const raw=await request.text();if(raw.length>3000)return reply({error:'İstek çok büyük'},413);input=JSON.parse(raw);}
      catch{return reply({error:'Geçersiz JSON'},400);}
      const handle=String(input?.handle||'').trim().replace(/^@/,'').toLowerCase();
      if(!/^[a-z0-9._]{1,30}$/.test(handle)||handle==='.'||handle==='..')return reply({error:'Geçersiz Instagram hesabı'},400);
      if(!['add','remove','enable','disable'].includes(input?.action)||!Number.isInteger(input?.revision))return reply({error:'Geçersiz işlem veya liste sürümü'},400);
      let lock=null;
      try{
        try{lock=await fs.open(lockpath,'wx',0o600);}
        catch(error){
          if(error?.code==='EEXIST'){
            // Recover only a definitely stale lock; never remove an active lock.
            try{const st=await fs.lstat(lockpath);if(st.isFile()&&!st.isSymbolicLink()&&Date.now()-st.mtimeMs>180000){await fs.unlink(lockpath);lock=await fs.open(lockpath,'wx',0o600);}}
            catch{}
            if(!lock)return reply({error:'Başka hesap işlemi devam ediyor. Sayfayı yenileyip tekrar deneyin.',code:'ig_targets_locked'},409);
          }else return reply({error:'Instagram takip listesine yazma izni yok',code:'ig_target_lock_failed'},503);
        }
        const value=await readTargets();
        if(value.revision!==input.revision)return reply({error:'Hesap listesi değişmiş, tekrar deneyin.',code:'ig_revision_changed'},409);
        const idx=value.accounts.findIndex(a=>a.handle===handle);
        if(input.action==='add'){
          if(idx>=0)return reply({error:'Hesap zaten listede',code:'ig_account_exists'},409);
          if(value.accounts.length>=200)return reply({error:'Hesap limiti doldu'},409);
          value.accounts.push({handle,enabled:true});
        }else if(input.action==='remove'){
          if(idx<0)return reply({error:'Hesap listede bulunamadı',code:'ig_account_missing'},404);
          value.accounts.splice(idx,1);
        }else{
          if(idx<0)return reply({error:'Hesap listede bulunamadı',code:'ig_account_missing'},404);
          value.accounts[idx].enabled=input.action==='enable';
        }
        value.revision+=1;
        value.updatedAt=new Date().toISOString();
        const temp=path+'.tmp-'+randomUUID();
        try{
          await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o644});
          await fs.rename(temp,path);
        }finally{await fs.unlink(temp).catch(()=>{});}
        const saved=await readTargets();
        if(saved.revision!==value.revision)throw Error('write_verification_failed');
        const exists=saved.accounts.find(a=>a.handle===handle);
        if((input.action==='remove'&&exists)||
           (input.action==='add'&&!exists)||
           (input.action==='enable'&&exists?.enabled!==true)||
           (input.action==='disable'&&exists?.enabled!==false))throw Error('write_verification_failed');
        return reply({...saved,ok:true,action:input.action,handle});
      }catch(error){
        log(JSON.stringify({event:'instagram_target_update_failed_v11',errorType:error?.name||'Error',code:error?.code||'unknown'}));
        return reply({error:'Instagram hesap dosyasına değişiklik kaydedilemedi. Yazma iznini kontrol edin.',code:'ig_target_write_failed'},503);
      }finally{
        if(lock){try{await lock.close();}finally{await fs.unlink(lockpath).catch(()=>{});}}
      }
    }
    if(u.pathname==='/yonetim/instagram-takip'){
      if(request.method!=='GET')return reply({error:'Yöntem desteklenmiyor'},405);
      return new Response(await readFile(new URL('./instagram-targets.html',import.meta.url),'utf8'),
        {headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    }
   if(u.pathname==='/api/admin/integrations/social-review/approve')return editorialApprove(request,actor);
// UMRANIYE_IG_INTELLIGENCE_V1
    if(u.pathname==='/api/admin/integrations/instagram-intelligence'&&request.method==='GET'){
      try{const payload=JSON.parse(await readFile('/var/lib/umraniye-osint-deneme/instagram-intelligence-status.json','utf8'));
        const rows=(await env.DB.prepare('SELECT url,decision,reason,score FROM ig_intelligence_decisions ORDER BY examined_at DESC LIMIT 1700').all()).results||[];
        return reply({...payload,decisions:rows});}catch{return reply({error:'Henüz otomatik tarama sonucu bulunmuyor'},404);}
    }
   if(u.pathname==='/api/admin/integrations/social-review'){
    if(request.method!=='GET')return reply({error:'Yöntem geçersiz'},405);
    if(u.searchParams.get('view')==='1')return new Response(await readFile(new URL('./social-review.html',import.meta.url),'utf8'),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    const items=[];for(const provider of ['x','instagram']){try{const saved=JSON.parse(await readFile('/var/lib/umraniye-osint-deneme/'+provider+'-review.json','utf8'));for(const row of Object.values(saved.items||{}))items.push({...row,provider});}catch(error){if(error.code!=='ENOENT')return reply({error:'İnceleme kuyruğu okunamadı'},500);}}
    // OSINT_FACEBOOK_REVIEW_V2: review-only, sourced from managed Facebook posts.
    try {
      const fbRows=(await env.DB.prepare("SELECT p.data AS data,s.page_name AS page_name FROM facebook_posts p JOIN facebook_sources s ON s.source_id=p.source_id WHERE s.enabled=1 ORDER BY julianday(p.published_at) DESC,p.first_seen_at DESC LIMIT 500").all()).results;
      let count=0;
      const current=now();
      const used=new Set(items.map(e=>e.provider+'|'+e.url));
      for(const row of fbRows){
        if(count>=150)break;
        let p;try{p=JSON.parse(row.data);}catch{continue;}
        const body=String(p.full_text||p.text||'').trim();
        if(body.length<15||isUmraniyesporContent({title:body,description:body,platform:'facebook'}))continue;
        const decision=p.display_decision||{};
        const geo=p.geo_dictionary||{};
        const normalized=body.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
        const local=p.institutional_context===true||!!p.neighborhood||geo.localCandidate===true||decision.sourceContextUsed===true||/\b(?:umraniye|dudullu|elmalikent|ihlamurkuyu|armaganevler|yamanevler|altinsehir|parseller|tepeustu)\b/.test(normalized);
        if(!local)continue;
        const url=String(p.canonical_url||'');
        let u;try{u=new URL(url);}catch{continue;}
        if(u.protocol!=='https:'||!['facebook.com','www.facebook.com','m.facebook.com'].includes(u.hostname)||u.username||u.password||u.port)continue;
        const postPath=/^\/(?:.+\/)?(?:posts|videos)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)||/^\/(?:reel|videos|permalink)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)||['/permalink.php','/story.php'].includes(u.pathname)&&/^\d+$/.test(u.searchParams.get('story_fbid')||'');
        if(!postPath)continue;
        const pub=String(p.published_at||''),pubMs=Date.parse(pub),seen=String(p.first_seen_at||''),seenMs=Date.parse(seen);
        const dated=Number.isFinite(pubMs),dateRecent=dated&&current-pubMs>=-60000&&current-pubMs<=48*3600000;
        const unknownRecent=!dated&&Number.isFinite(seenMs)&&current-seenMs>=-60000&&current-seenMs<=3*3600000;
        if(!dateRecent&&!unknownRecent)continue;
        const reason=!dated?'facebook_date_missing':decision.requiresReview===true?'facebook_local_review':p.bridge_status==='existing_social_feed'?'facebook_record_review':'facebook_unbridged';
        const key='facebook|'+url;if(used.has(key))continue;used.add(key);
        items.push({provider:'facebook',url,sourceName:String(row.page_name||p.source||'Facebook').slice(0,120),title:body.slice(0,220),description:body.slice(0,2500),publishedAt:dated?pub:null,firstSeenAt:seen,lastSeenAt:String(p.last_seen_at||seen),reason,notificationEligible:false,reviewOrigin:'facebook-managed-review'});
        count++;
      }
    }catch(error){log(JSON.stringify({event:'facebook_review_v2_read_failed',errorType:error?.name||'Error'}));}
    await ensureEditorialTable();const approvals=(await env.DB.prepare('SELECT item_key,original_url,approved_by FROM osint_editorial_approvals').all()).results||[];return reply({items:pendingReviewItems(items,approvals,retentionCutoff(now())).slice(0,2000)});
   }
   if(u.pathname==='/api/admin/integrations/platform-sources'){
    if(request.method==='GET'){const state=await platformSources(env.DB);return reply({...state,sources:state.sources.filter(s=>!s.institutional)});}
    try{const raw=await request.text();if(raw.length>12000)return reply({error:'İstek çok büyük'},413);const data=await managePlatformSources(env.DB,JSON.parse(raw));await loadInstitutionalTargets(env.DB);return reply({...data,sources:data.sources.filter(s=>!s.institutional)});}catch(e){return reply({error:e.message==='revision_conflict'?'Başka oturumda değişti; yenileyin':e.message},e.message==='revision_conflict'?409:400);}
   }
   if(u.pathname==='/api/admin/integrations/keywords'){
    if(request.method==='GET')return reply({...await centralKeywordState(env.DB),keywordReview:keywordReviewState});
    try{const text=await request.text();if(text.length>12000)return reply({error:'İstek çok büyük'},413);const state=await manageCentralKeyword(env.DB,JSON.parse(text));research.invalidateSocialCache();invalidatePrioritizedNews();scheduleKeywordReview();return reply({...state,keywordReview:keywordReviewState,saved:true});}catch(e){return reply({error:e.message==='revision_conflict'?'Liste değişti; yenileyin':e.message},e.message==='revision_conflict'?409:400);}
   }
   if(u.pathname==='/api/admin/integrations/shared-rules'){
    if(request.method==='GET')return reply({revision:centralRevision(),data:{scope:'umraniye_only',nationalNewsEnabled:false,requiresLocalContext:true,groups:Object.fromEntries((centralProfile('x')||[]).map(g=>[g.id,{name:g.name,priority:g.priority,enabled:g.enabled,keywords:g.terms}]))}});
    return reply({error:'Kelimeler tek ortak listeden yönetiliyor. Genel Ayarlar > Ortak Anahtar Kelimeler bölümünü kullanın.'},409);
   }
   if(u.pathname==='/api/admin/integrations/facebook'){if(request.method==='GET')return reply(await facebook.state());try{const raw=await request.text();if(raw.length>8000)return reply({error:'İstek çok büyük'},413);await facebook.manage(JSON.parse(raw));return reply({ok:true});}catch(e){return reply({error:String(e.message).slice(0,160)},400);}}
   if(u.pathname==='/api/admin/integrations/browser-status'&&request.method==='GET')return reply({instagramAPI:await readInstagramAPIState(),research:publicResearch(await research.config()),login:loginManager?await loginManager.status():{available:false},facebookPages:await facebook.health(),browserAutomation:{available:!!browserKey,status:await research.browserStatus()}});
   if(u.pathname==='/api/admin/integrations/social'&&request.method==='GET')return reply({items:(await research.socialItems()).filter(e=>e.nationalCritical||!outsideLocalScope(e))});
   if(u.pathname==='/api/admin/integrations/login'&&request.method==='POST'){try{const input=await request.json();if(!['x','facebook','instagram'].includes(input.provider))return reply({error:'Platform geçersiz'},400);if(input.provider==='instagram'&&!['pause','resume'].includes(input.action))return reply({error:'Instagram API ile okunuyor; tarayıcı giriş ve araştırma işlemleri kullanılmıyor.'},409);const a=await research.ensureAccount(input.provider);if(['pause','resume'].includes(input.action)){if(input.action==='resume')await research.resume(input.provider);const c=await research.rawConfig();await research.save({...c,automationEnabled:input.action==='resume'?true:c.automationEnabled,accounts:c.accounts.map(v=>v.provider===input.provider?{...v,enabled:input.action==='resume'}:v)});return reply({ok:true});}if(!loginManager)return reply({error:'Sunucu giriş bileşeni henüz güncellenmedi'},503);return reply(await loginManager.action(input.action,a));}catch{return reply({error:'Giriş penceresi açılamadı; başka bir pencere açık olabilir veya sunucu bileşeni eksik'},409)}}
   /* single_entry_redirect: oturum açıksa /yonetim doğrudan panele gider */
  if(u.pathname==='/yonetim'&&request.method==='GET'){try{const _s=await base.fetch(new Request(origin+'/api/session',{headers:request.headers}),env,ctx),_w=await _s.json();if(_w.adminUnlocked)return Response.redirect(origin+'/yonetim/entegrasyonlar',302);}catch{}}
  if(u.pathname==='/yonetim/entegrasyonlar')return new Response(await readFile(new URL('../src/admin.html',import.meta.url),'utf8'),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    if(u.pathname==='/api/admin/integrations'&&request.method==='GET'){const t=await telegramConnection();return reply({instagramAPI:await readInstagramAPIState(),nationalTelegramEnabled:false,release:'panel-v4-2026-11-02',config:await config(),nationalTelegramTarget:await nationalTelegramTarget(),research:publicResearch(await research.config()),login:loginManager?await loginManager.status():{available:false},facebookPages:await facebook.health(),browserAutomation:{available:!!browserKey,status:await research.browserStatus()},accounts:accountStore?await accountStore.list():[],vaultAvailable:!!accountStore,allowedHosts:[...hosts],unattended:env.OSINT_AUTO_UPDATE_ENABLED==='true',telegram:{mode:t.mode,configured:!!t.token&&!!t.chatId},running:!!running,sources:(await env.DB.prepare('SELECT * FROM lab_source_health').all()).results,outbox:(await env.DB.prepare("SELECT id,event_id,json_extract(data,'$.title') AS title,json_extract(data,'$.priorityLevel') AS priority,status,attempts,created_at,sent_at,last_error FROM lab_outbox ORDER BY created_at DESC LIMIT 50").all()).results,runs:(await env.DB.prepare('SELECT * FROM lab_runs ORDER BY started_at DESC LIMIT 10').all()).results});}
    if(u.pathname==='/api/admin/integrations/national-target'){
     if(request.method!=='GET')return reply({error:'Ulusal gündem Telegram gönderimi yönetici talebiyle kapatıldı.'},409);
     if(request.method==='GET')return reply({chatId:await nationalTelegramTarget()});
     if(request.method!=='POST')return reply({error:'Yöntem geçersiz'},405);
     try{const raw=await request.text();if(raw.length>2000)return reply({error:'İstek çok büyük'},413);const input=JSON.parse(raw),target=String(input.chatId||'').trim();if(!/^(-100[0-9]{6,}|@[A-Za-z][A-Za-z0-9_]{4,})$/.test(target))return reply({error:'Kanal kimliği -100… biçiminde veya @kanal adı olmalı'},400);const primary=await telegramConnection();if(target===primary.chatId)return reply({error:'Ulusal kanal, mevcut yerel haber kanalından farklı olmalı'},409);if(input.action==='verify'){if(!accountStore)return reply({error:'Güvenli hesap kasası hazır değil'},503);const a=await accountStore.read('telegram');if(!a?.secret||!a.enabled)return reply({error:'Önce etkin Telegram botunu kaydedin'},400);const result=await verifyTelegram({...a,accountId:target},{send:socialFetch});return reply({ok:true,info:result.info});}await env.DB.prepare('INSERT INTO lab_config(id,data,revision,updated_at) VALUES(?,?,1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=lab_config.revision+1,updated_at=excluded.updated_at').bind('telegram-national-target',JSON.stringify({chatId:target}),new Date(now()).toISOString()).run();await env.DB.prepare('INSERT INTO audit(id,actor,action,target,created_at) VALUES(?,?,?,?,?)').bind(randomUUID(),actor.email||'admin','Ulusal Telegram hedefi güncellendi','Ulusal gündem kanalı',new Date(now()).toISOString()).run();return reply({ok:true,chatId:target});}catch(e){return reply({error:e.message==='send_permission_missing'?'Bot kanalda yönetici değil veya mesaj gönderme izni yok':e.message==='target_unavailable'?'Kanal bulunamadı; botun kanala eklendiğini kontrol edin':'Kanal doğrulanamadı'},400);}
    }
   if(u.pathname==='/api/admin/integrations/research'&&request.method==='POST'){
    try{const text=await request.text();if(text.length>16000)return reply({error:'İstek çok büyük'},413);const input=JSON.parse(text);if(input.action==='evidence')await research.evidence(input);else await research.save(input);await env.DB.prepare('INSERT INTO audit(id,actor,action,target,created_at) VALUES(?,?,?,?,?)').bind(randomUUID(),actor.email||'admin','Tarayıcı araştırması güncellendi',input.action==='evidence'?'Kaynaklı bulgu':'Araştırma hesabı ve ifadeler',new Date(now()).toISOString()).run();return reply({ok:true});}catch(e){return reply({error:e.message==='revision_conflict'?'Başka oturumda değişti; yenileyin':'Araştırma bilgilerini, yayın tarihini ve platform bağlantısını kontrol edin'},e.message==='revision_conflict'?409:400);}
   }
   if(u.pathname==='/api/admin/integrations/account'&&request.method==='POST'){
    if(!accountStore)return reply({error:'Güvenli hesap kasası bu sunucuda hazır değil'},503);
    try{const text=await request.text();if(text.length>10000)return reply({error:'İstek çok büyük'},413);const input=JSON.parse(text);if(input.provider!=='telegram')return reply({error:'Sosyal ağlar tarayıcı oturumuyla kullanılır; API anahtarı alınmaz'},400);
     if(input.action==='check'||input.action==='test-message'){
      const a=await accountStore.read(input.provider);if(!a)return reply({error:'Önce bağlantıyı kaydedin'},400);
      let status,info=null;if(input.action==='test-message'){if(a.provider!=='telegram'||!a.enabled||input.confirm!==true)return reply({error:'Bağlantı etkin olmalı ve test gönderimi onaylanmalı'},400);await apiJSON('https://api.telegram.org/bot'+a.secret+'/sendMessage','',{send:socialFetch,method:'POST',body:{chat_id:a.accountId,text:'ÜMRANİYE OSINT · Bağlantı testi. Bu mesaj bir olay bildirimi değildir.'}});status='test_message_sent';}
      else{try{const verified=await verifyTelegram(a,{send:socialFetch});status=verified.status;info=verified.info;}catch(e){await accountStore.health(a.provider,'error');throw e;}}await accountStore.health(a.provider,status,info);
     }else await accountStore.save(input);
     await env.DB.prepare('INSERT INTO audit(id,actor,action,target,created_at) VALUES(?,?,?,?,?)').bind(randomUUID(),actor.email||'admin','Sosyal bağlantı: '+(input.action||'save'),String(input.provider).slice(0,20),new Date(now()).toISOString()).run();return reply({ok:true});
    }catch(e){const errors={target_unavailable:'Hedef grup veya kanal bulunamadı',send_permission_missing:'Botun hedefe mesaj gönderme yetkisi yok',revision_conflict:'Bağlantı başka oturumda değişti; durumu yenileyin',permission_or_token:'Anahtar geçersiz veya API yetkisi eksik',rate_limited:'Platform kotası doldu; daha sonra deneyin',connection_failed:'Platforma bağlantı kurulamadı',numeric_account_id_required:'Sayısal sayfa / profesyonel hesap kimliği gerekli',live_confirmation_required:'Gerçek Telegram gönderimini onaylayın',credential_key_mismatch:'Sunucunun kasa anahtarı eşleşmiyor; yedek anahtarı geri yükleyin'};return reply({error:errors[e.message]||'Bilgiler doğrulanamadı; alanları ve platform yetkilerini kontrol edin'},e.message==='revision_conflict'?409:400);}
   }
   if(u.pathname==='/api/admin/integrations/settings'&&request.method==='POST'){
    try{const text=await request.text();if(text.length>16000)return reply({error:'İstek çok büyük'},413);return await settings(JSON.parse(text),actor.email||'admin');}catch{return reply({error:'Ayarlar geçersiz; izinli alan adları ve kaynak dayanağını kontrol edin'},400);}
   }
   if(u.pathname==='/api/admin/integrations/scan'&&request.method==='POST'){run().catch(()=>{});return reply({ok:true,message:'Tarama başlatıldı; çalışma geçmişinden izleyin'},202);}
   return reply({error:'Bulunamadı'},404);
  }
  if(/^\/haber\/onaylanan\/[a-f0-9]{64}$/.test(u.pathname)){
    const session=await base.fetch(new Request(origin+'/api/session',{headers:request.headers}),env,ctx),who=await session.json();
    if(!who.adminUnlocked&&!who.member)return Response.redirect(origin+'/giris',302);
    await ensureEditorialTable();
    const row=await env.DB.prepare('SELECT * FROM osint_editorial_approvals WHERE item_key=?').bind(u.pathname.split('/').at(-1)).first();
    if(!row||!retainedEvent({publishedAt:row.published_at},retentionCutoff(now())))return reply({error:'Onaylı haber bulunamadı veya saklama süresi doldu'},404);
    const esc=editorialEscape;
    const body=`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(row.title)} · Ümraniye OSINT</title><style>body{font:17px/1.6 system-ui;max-width:800px;margin:40px auto;padding:16px;color:#192335}h1{line-height:1.25}a{color:#b01820}p{white-space:pre-wrap}small{color:#667085}</style><a href="/">Haber Gündemi</a><h1>${esc(row.title)}</h1><small>${String(row.approved_by||'').startsWith('osint-auto-')?'Otomatik ön değerlendirme · Bağımsız teyit yok':'İnceleme onayı'} · ${esc(row.approved_at)} · Kaynak: ${esc(row.source_name)}</small><p>${esc(row.description)}</p><a href="${esc(row.original_url)}" rel="noopener noreferrer" target="_blank">Orijinal sosyal medya paylaşımı</a></html>`;
    return new Response(body,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
   }
  const response=await base.fetch(request,env,ctx);
  if(response.ok&&u.pathname==='/yonetim'&&response.headers.get('Content-Type')?.includes('text/html'))return response;
  if(response.ok&&response.headers.get('Content-Type')?.includes('application/json')&&['/api/config','/api/workspace','/api/admin/config'].includes(u.pathname)){
   const data=await response.json();if(data.initialData?.events){if(u.pathname==='/api/config'&&prioritizedNewsCache&&prioritizedNewsCache.expires>now())data.initialData.events=prioritizedNewsCache.events;else if(u.pathname==='/api/config'){/* Önbellek süresi dolunca eşzamanlı istekler aynı analizi paylaşır; her biri tüm listeyi yeniden hesaplamaz. */if(!prioritizedNewsPending){const generation=prioritizedNewsGeneration;let task;task=prioritizedNewsPending=analyzeNews(data.initialData.events).then(events=>{if(generation===prioritizedNewsGeneration)prioritizedNewsCache={events,expires:now()+10000};return events;}).finally(()=>{if(prioritizedNewsPending===task)prioritizedNewsPending=null;});}data.initialData.events=await prioritizedNewsPending;}else data.initialData.events=await analyzeNews(data.initialData.events);}if(data.events)data.events=newsRecords(data.events).map(e=>applyLocalScopeSafety({...e,...prioritize(e,now())}));/* UMRANIYE_IG_INTELLIGENCE_V1 */ const approvedNews=await editorialEvents();if(approvedNews.length){if(Array.isArray(data.initialData?.events))data.initialData.events=[...approvedNews,...data.initialData.events.filter(e=>!approvedNews.some(a=>a.url===e.url))];if(Array.isArray(data.events))data.events=[...approvedNews,...data.events.filter(e=>!approvedNews.some(a=>a.url===e.url))];}if(Array.isArray(data.initialData?.events))data.initialData.events.sort(compareRecordsNewest);if(Array.isArray(data.events))data.events.sort(compareRecordsNewest);return new Response(JSON.stringify(data),{status:response.status,headers:response.headers});
  }
  return response;
 }
 async function enqueuePublished(){
  const response=await base.fetch(new Request(origin+'/api/config',{headers:{'X-OSINT-Service-Key':env.OSINT_LAB_SERVICE_KEY||''}}),env);
  if(!response.ok)throw Error('published_news_unavailable');
  const data=await response.json();await enqueue(data.initialData.events,await config());
 }
 return {worker:{async fetch(request,...args){try{return await wrap(request,...args);}catch(error){if(new URL(request.url).pathname.startsWith('/api/')){log(JSON.stringify({event:'admin_api_failed',path:new URL(request.url).pathname,errorType:error?.name||'Error'}));return reply({error:'Panel verileri alınamadı; sunucu bağlantısı veya kayıt okuması başarısız.',code:'api_response_failed'},503);}throw error;}}},run,drain,config,items,enqueuePublished,socialItems:research.socialItems,get running(){return !!running},async stop(){closed=true;await deliveryRefresh.stop();await keywordReviewTask;await facebook.idle();await running;await dispatching;}};
}
