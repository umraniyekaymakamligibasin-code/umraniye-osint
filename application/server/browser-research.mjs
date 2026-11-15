import {sourceNeighborhoodContext,sourceContextFields} from './social-source-context.mjs';
import {scanPacingState} from './scan-pacing-state.mjs';
import {purgeContent} from './content-retention.mjs';
import {readerHealth} from './reader-health.mjs';
import {localScopeAssessment,applyLocalScopeSafety} from './local-scope-policy.mjs';
import {footballNoise} from './football-noise.mjs';
import {localSportsNews} from './local-sports.mjs';
import {centralProfile,centralRevision,matchCentralKeywords} from './central-keywords.mjs';
import {geoDictionaryState} from './geo-dictionary.mjs';
import {platformSources} from './panel-management.mjs';
import {isSocialRecord,withCorrelation} from './content-streams.mjs';
import {institutionalReference} from './institutional-reference.mjs';
import {canonicalFacebookDisplay,facebookDisplayWindow} from './facebook-display-model.mjs';
import {isGovernorActivity,governorDisplayTime} from './governor-activity.mjs';
import {dedupeFacebookRecords} from './facebook-dedupe.mjs';
import {freshFacebookTime,applyFacebookSafety} from './facebook-safety-v4.mjs';
import { socialQualityReason } from './social-quality.mjs';
import {reviewLocalLocation} from './location-review.mjs';
import {createHash} from 'node:crypto';
import {publicationTime,prioritize,districtPriorityEligible} from './intelligence.mjs';
import {criticalSignal,criticalNotification} from './critical-alerts.mjs';
import {relevance} from '../worker/index.js';
import {socialScope,categoryGroups,categoryMatches} from './social-scope.mjs';
import {curateSocial} from './social-quality.mjs';
import {retentionCutoff} from '../src/retention.js';
const names={x:'X',facebook:'Facebook',instagram:'Instagram'};
// Keep locally relevant incident posts available for institutional backfill even
// when the general social-quality gate cannot verify a location or event signal.
function institutionalBackfillCandidate(input){
  const text=String([input?.title,input?.description,input?.fullText].filter(Boolean).join(' ')).toLocaleLowerCase('tr-TR');
  const local=/(ümraniye|umraniye|kazım karabekir|kazim karabekir|namık kemal|namik kemal|dudullu|atakent|inkılap|inkilap|ıhlamurkuyu|ihlamurkuyu|tantavi|tepeüstü|tepeustu|saray|çekmeköy|cekmekoy)/u.test(text);
  const incident=/(kavga|darp|saldırı|saldiri|silah|bıçak|bicak|yaralı|yarali|gözaltı|gozalti|şüpheli|supheli|hırsız|hirsiz|soygun|cinayet|trafik kaz|kaza|yangın|yangin|patlama|ambulans|zehirlenme|su baskını|su baskini|çökme|cokme|elektrik|doğalgaz|dogalgaz)/u.test(text);
  return local&&incident;
}
function postKey(url,provider){const u=new URL(url);const id=provider==='x'?u.pathname.match(/\/status\/(\d+)/)?.[1]:provider==='instagram'?u.pathname.match(/^\/(?:p|reel)\/([A-Za-z0-9_-]+)/)?.[1]:u.searchParams.get('story_fbid')||u.pathname.match(/\/(?:posts|permalink|reel|videos)\/([A-Za-z0-9_-]+)/)?.[1];return id?provider+':'+id:url;}
function platformURL(value,provider){const u=new URL(value),hosts={x:['x.com','www.x.com','twitter.com','www.twitter.com'],facebook:['facebook.com','www.facebook.com','m.facebook.com'],instagram:['instagram.com','www.instagram.com']};if(u.protocol!=='https:'||u.port||u.username||u.password||!hosts[provider]?.includes(u.hostname)||u.pathname==='/')throw Error('platform_url_invalid');const query=new URLSearchParams();if(provider==='facebook')for(const k of ['id','story_fbid','fbid']){const v=u.searchParams.get(k);if(v&&/^[A-Za-z0-9_]{1,100}$/.test(v))query.set(k,v)}u.search=query.toString();u.hash='';return u.href;}
export function createBrowserResearch(DB,{now=Date.now}={}){
 async function config(){const r=await DB.prepare('SELECT * FROM lab_config WHERE id=?').bind('browser-research').first();return {automationEnabled:false,...(r?JSON.parse(r.data):{accounts:[],keywords:['Ümraniye','Ümraniye Kaymakamlığı','Yüksel Çelik']}),revision:r?.revision||0};}
 async function save(input){
  if(!Number.isInteger(input.revision)||!Array.isArray(input.accounts)||input.accounts.length>12||!Array.isArray(input.keywords)||!input.keywords.length||input.keywords.length>1000)throw Error('invalid');
  const accounts=input.accounts.map(a=>{if(!names[a.provider]||typeof a.label!=='string'||a.label.trim().length<2||a.label.length>100||typeof a.profileURL!=='string'||a.profileURL.length>400)throw Error('invalid');return {provider:a.provider,label:a.label.trim(),profileURL:platformURL(a.profileURL,a.provider),enabled:a.enabled!==false};});
  const keywords=input.keywords.map(s=>{if(typeof s!=='string'||!s.trim()||s.length>80||/[\r\n\x00]/.test(s))throw Error('invalid');return s.trim()});
  const data={accounts,keywords:[...new Set(keywords)],automationEnabled:input.automationEnabled===true},r=await DB.prepare('INSERT INTO lab_config(id,data,revision,updated_at) VALUES(?,?,1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=lab_config.revision+1,updated_at=excluded.updated_at WHERE lab_config.revision=?').bind('browser-research',JSON.stringify(data),new Date(now()).toISOString(),input.revision).run();if(!r.meta.changes)throw Error('revision_conflict');
 }
 async function evidence(input){
  if(!names[input.provider]||typeof input.title!=='string'||input.title.trim().length<8||input.title.length>400||typeof input.description!=='string'||input.description.length>3000||typeof input.sourceName!=='string'||input.sourceName.trim().length<2||input.sourceName.length>100||typeof input.url!=='string'||input.url.length>600)throw Error('invalid');
  if(!osintSocialScope(input.title,input.provider==='x'?(input.fullText||input.description):input.description)&&!canonicalFacebookDisplay(input)&&!institutionalReference(input)&&!institutionalBackfillCandidate(input)&&!sourceNeighborhoodContext(input))throw Error('outside_governor_scope');
  const url=platformURL(input.url,input.provider),time=publicationTime(input.publishedAt,now());if(!time.publishedAt){
  console.log(JSON.stringify({
    event:'social_date_rejected',
    reason:'date_unparseable',
    rawDate:String(input.publishedAt??'').slice(0,60)
  }));
  throw Error('date_unparseable');
}
if(time.publishedAt.slice(0,10)<retentionCutoff(now())){
  console.log(JSON.stringify({
    event:'social_date_rejected',
    reason:'date_outside_retention',
    rawDate:String(input.publishedAt??'').slice(0,60),
    parsedDate:time.publishedAt,
    cutoff:retentionCutoff(now())
  }));
  throw Error('date_outside_retention');
}
  if(input.provider==='facebook'&&input.browserAutomated===true&&!freshFacebookTime(time,now())&&!governorDisplayTime(input,now())&&!facebookDisplayWindow(input,now()))throw Error('facebook_not_fresh');
  const item={fullText:input.fullText||input.description,platform:input.provider,id:'browser-'+createHash('sha256').update(url).digest('hex').slice(0,24),sourceId:'browser-research',sourceName:_osintSource({url,sourceName:input.sourceName.trim()+' · '+names[input.provider]}).sourceName,sourceType:'Tarayıcıda incelenen paylaşım',title:input.title.trim(),description:input.description,url,publishedAt:time.publishedAt,datePrecision:time.precision,collectedAt:new Date(now()).toISOString(),scope:'local',relevant:true,topic:'Sosyal medya',neighborhood:'Belirtilmemiş',permissionBasis:'Açık paylaşım, yetkili tarayıcı oturumunda manuel inceleme',reviewOrigin:'browser-manual'};
  if(canonicalFacebookDisplay(input))Object.assign(item,{facebookDecision:input.facebookDecision,facebookManaged:true,fullText:input.fullText});
  const old=await DB.prepare('SELECT data FROM lab_items WHERE id=?').bind(item.id).first();let previous=old?JSON.parse(old.data):null;
  if(!previous&&input.provider==='facebook'&&/^[0-9]{1,40}$/.test(String(input.facebookPostId||''))){
    const same=await DB.prepare("SELECT data FROM lab_items WHERE source_id='browser-research' AND json_extract(data,'$.facebookPostId')=? LIMIT 1").bind(String(input.facebookPostId)).first();
    if(same){previous=JSON.parse(same.data);item.id=previous.id;}
  }
  if(!previous){const key=postKey(url,input.provider);const candidates=(await DB.prepare("SELECT data FROM lab_items WHERE source_id='browser-research' AND json_extract(data,'$.url') LIKE ? LIMIT 100").bind('%'+key.split(':').at(-1)+'%').all()).results;previous=candidates.map(r=>JSON.parse(r.data)).find(e=>postKey(e.url,input.provider)===key)||null;if(previous)item.id=previous.id;}
  if(!previous&&input.provider==='facebook'){
   const candidates=(await DB.prepare("SELECT data FROM lab_items WHERE json_extract(data,'$.platform')='facebook' AND published_at=? ORDER BY collected_at ASC LIMIT 100").bind(item.publishedAt).all()).results;
   for(const row of candidates){const candidate=JSON.parse(row.data);if(candidate.duplicateOf)continue;if(dedupeFacebookRecords([candidate,item]).length===1){previous=candidate;item.id=candidate.id;break;}}
  }
  item.firstSeenAt=previous?.firstSeenAt||previous?.collectedAt||(['instagram_graph_api','x_twscrape_backup','facebook_fbgql_backup'].includes(input.collectionMethod)&&typeof input.firstSeenAt==='string'&&Number.isFinite(Date.parse(input.firstSeenAt))&&Date.parse(input.firstSeenAt)<=now()+60000?input.firstSeenAt:item.collectedAt);item.collectedAt=item.firstSeenAt;item.lastSeenAt=new Date(now()).toISOString();
  if(['x_twscrape_backup','facebook_fbgql_backup'].includes(input.collectionMethod)&&!previous){item.collectionMethod=input.collectionMethod;item.sourceType=input.provider==='facebook'?'Facebook yedek okuyucu':'X yedek okuyucu';item.permissionBasis=input.provider==='facebook'?'Kamuya açık Facebook paylaşımı':'Kullanıcının yetkili X oturumu';}
  Object.assign(item,reviewLocalLocation(item.title,input.fullText||item.description));const dictionary=await shared(input.provider);item.categoryGroups=categoryMatches(item.title,item.description,dictionary.groups);item.categoryPriority=item.categoryGroups[0]?.priority||null;item.scope='local';item.nationalCritical=false;Object.assign(item,prioritize(item,now()));if(item.locationStatus==='review_required'){if(['P1','P2'].includes(item.priorityLevel))item.priorityLevel='P3';item.notificationEligible=false;item.priorityExplanation='Konum dogrulamasi gerekli; acil bildirim kapali';}item.scope='local';item.nationalCritical=false;const critical=criticalNotification(item,now());if(critical.eligible&&item.locationStatus!=='review_required'){item.criticalAlert=true;item.criticalCategory=critical.category;if(!['P1','P2'].includes(item.priorityLevel))item.priorityLevel='P1';}if(item.platform==='facebook'){
    item.facebookPostId=/^[0-9]{1,40}$/.test(String(input.facebookPostId||''))?String(input.facebookPostId):null;
    item.dateEvidence=input.dateEvidence==='facebook_story_creation_time'?input.dateEvidence:null;
    item.readerVersion=input.readerVersion==='facebook-live-v4'?input.readerVersion:null;
    item.contentFingerprint=createHash('sha256').update((item.description||item.title).toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu,' ').trim()).digest('hex');
    const matching=await DB.prepare("SELECT id FROM lab_items WHERE source_id='browser-research' AND id<>? AND json_extract(data,'$.contentFingerprint')=? LIMIT 1").bind(item.id,item.contentFingerprint).first();
    applyFacebookSafety(item,{previous:!!previous,duplicate:!!matching,now:now()});
  }
  if(localSportsNews(item.fullText||item.description)){item.priorityLevel='P3';item.notificationEligible=false;item.criticalAlert=false;item.priorityExplanation='Yerel spor başarısı · normal gündem';}
  const reference=institutionalReference(item);if(reference){item.institutionalReference=reference;item.priorityLevel='P3';item.notificationEligible=false;item.criticalAlert=false;item.locationStatus='review_required';item.locationVerified=false;}
  if(input.provider==='x'&&footballNoise(item.fullText||[item.title,item.description].filter(Boolean).join(' ')))throw Error('football_noise');
   item.matchedKeywordIds=matchCentralKeywords(item.fullText||item.description||item.title,input.provider);
  Object.assign(item,sourceContextFields(item));
  const districtAssessment=localScopeAssessment(item);if(districtAssessment.state==='outside')throw Error('outside_local_scope');item.districtScope=districtAssessment.state;if(!districtAssessment.local){item.locationStatus='review_required';item.locationVerified=false;item.notificationEligible=false;item.criticalAlert=false;item.priorityLevel='P3';}
  item.sources=[{...item}];const inserted=await DB.prepare('INSERT OR IGNORE INTO lab_items(id,source_id,data,published_at,collected_at) VALUES(?,?,?,?,?)').bind(item.id,item.sourceId,JSON.stringify(item),item.publishedAt,item.collectedAt).run();
  if(!inserted.meta.changes){const current=await DB.prepare('SELECT data,collected_at FROM lab_items WHERE id=?').bind(item.id).first();if(!current)throw Error('concurrent_record_missing');const persisted=JSON.parse(current.data);item.firstSeenAt=persisted.firstSeenAt||persisted.collectedAt||current.collected_at;item.collectedAt=item.firstSeenAt;const {sources,...source}=item;item.sources=[source];await DB.prepare('UPDATE lab_items SET data=?,published_at=?,collected_at=? WHERE id=?').bind(JSON.stringify(item),item.publishedAt,item.collectedAt,item.id).run();}
  Object.defineProperty(item,'ingestionIsNew',{value:inserted.meta.changes===1});return item;
 }
 async function browserStatus(){const row=await DB.prepare('SELECT data FROM lab_config WHERE id=?').bind('browser-status').first();if(!row)return null;const status=JSON.parse(row.data),pacing=await scanPacingState(process.env.DATA_DIR||'/var/lib/umraniye-osint-deneme');return {...status,results:(status.results||[]).map(r=>({...r,pacing:pacing[r.provider]||null}))};}
 async function ingest(input){
  // X_BACKUP_BRIDGE_V1: reuse existing admission, keep browser session health independent.
  const facebookBackup=input.reader==='fbgql-backup';const backup=input.reader==='twscrape-backup'||facebookBackup;
  if(backup&&(input.sessionCheck===true||!Array.isArray(input.results)||input.results.some(r=>r.provider!==(facebookBackup?'facebook':'x'))))throw Error('invalid');
  const c=await config();const dictionary=await shared();if((!c.automationEnabled&&input.sessionCheck!==true)||c.revision!==input.revision||(input.sessionCheck!==true&&input.groupRevision!==dictionary.revision))throw Error('revision_conflict');
  if(!Array.isArray(input.results)||input.results.length>12||input.sessionCheck===true&&input.results.some(r=>!Array.isArray(r.posts)||r.posts.length))throw Error('invalid');let accepted=0,rejected=0;const results=[],receipts=[];
  for(const r of input.results){let account=c.accounts.find(a=>a.provider===r.provider&&a.profileURL===r.profileURL);
   if(facebookBackup){const source=await DB.prepare('SELECT source_id,page_name,page_url FROM facebook_sources WHERE source_id=? AND enabled=1').bind(String(r.source_id||'')).first();if(!source||source.page_url!==r.profileURL||r.posts?.some(p=>p.sourcePageUrl!==source.page_url))throw Error('invalid');for(const post of r.posts||[])post.sourceName=source.page_name;account={provider:'facebook',profileURL:source.page_url,label:source.page_name,enabled:true};}
   if(!account||input.sessionCheck!==true&&account.enabled===false||!Array.isArray(r.posts)||r.posts.length>20||!['session_ready','session_unverified','collected','partial','time_budget','login_required','challenge_required','verification_paused','no_visible_results','date_missing','selector_changed','filtered_no_eligible_posts','profile_busy','browser_error','robots_denied'].includes(r.status))throw Error('invalid');
   const providerDictionary=await shared(r.provider);
   let createdCount=0,updatedCount=0;const acceptedBefore=accepted,rejectedBefore=rejected;const acknowledgedUrls=[],retryUrls=[],storedUrls=[];const rejectionReasons=Object.create(null);for(const post of r.posts){await new Promise(resolve=>setImmediate(resolve));try{if(backup){const t=Date.parse(post.publishedAt);if(!Number.isFinite(t)||t>now()||now()-t>3600000)throw Error('backup_not_fresh');post.collectionMethod=facebookBackup?'facebook_fbgql_backup':'x_twscrape_backup';}if(!_osintValidText(post))throw Error('placeholder_text');const candidate=institutionalBackfillCandidate(post);const curated=curateSocial({..._osintSource(post),platform:r.provider});if(!curated&&!candidate)throw Error(socialQualityReason(post));if(curated)Object.assign(post,curated);if((!institutionalReference(post)&&!candidate&&(!providerDictionary.groups.length||(!osintSocialScope(post.title,r.provider==='x'?(post.fullText||post.description):post.description)&&!sourceNeighborhoodContext({...post,platform:r.provider}))))||dictionary.excludedTerms.some(t=>(post.title+' '+post.description).toLocaleLowerCase('tr').includes(String(t).toLocaleLowerCase('tr'))))throw Error('irrelevant');const item=await evidence({...post,browserAutomated:true,provider:account.provider,sourceName:typeof post.sourceName==='string'&&post.sourceName.trim()?post.sourceName.slice(0,100):account.label});await DB.prepare('UPDATE lab_items SET data=? WHERE id=?').bind(JSON.stringify({...item,reviewOrigin:'browser-automation'}),item.id).run();accepted++;storedUrls.push(post.url);if(item.ingestionIsNew)createdCount++;else updatedCount++;acknowledgedUrls.push(post.url);}catch(error){ 
    rejected++;
    const message=String(error?.message||'unknown');
    const reason=/^[a-z][a-z0-9_]{0,59}$/.test(message)
      ?message:'other_error';
    rejectionReasons[reason]=(rejectionReasons[reason]||0)+1;
    const permanent=new Set(['backup_not_fresh','personal_chatter','football_noise','placeholder_text','irrelevant','outside_governor_scope','outside_local_scope','date_unparseable','date_outside_retention','facebook_not_fresh','invalid','invalid_entry','platform_url_invalid','short_text','event_signal_missing','source_text_noise','location_missing','commercial_content','content_unusable']);
    if(permanent.has(reason))acknowledgedUrls.push(post.url);else retryUrls.push(post.url);
  }}
   receipts.push({provider:r.provider,profileURL:r.profileURL,acknowledgedUrls,retryUrls,...(backup?{storedUrls}:{})});
   if(backup){results.push({provider:r.provider,newCount:createdCount,updatedCount,acceptedCount:accepted-acceptedBefore,rejectedCount:rejected-rejectedBefore,rejectionReasons});continue;}
   const previous=(await browserStatus())?.results?.find(v=>v.provider===r.provider),at=new Date(now()).toISOString();const latestStored=await DB.prepare("SELECT max(collected_at) AS at FROM lab_items WHERE source_id='browser-research' AND json_extract(data,'$.platform')=?").bind(r.provider).first();
   const health=readerHealth(r,{newCount:createdCount,updatedCount,rejectionReasons});
   /* UMRANIYE_XIG_FILTERED_STATUS_V1 */const observed=Number.isSafeInteger(r.readCount)?Math.max(0,r.readCount):r.posts.length;const success=r.status==='session_ready'||health.phase==='confirmed_empty'||(['collected','partial','filtered_no_eligible_posts'].includes(r.status)&&observed>0);
   console.log(JSON.stringify({event:'social_rejection_breakdown',provider:r.provider,reasons:rejectionReasons}));results.push({provider:r.provider,rejectionReasons:rejectionReasons,label:account.label,health,newCount:createdCount,updatedCount,lastReadAt:health.contentRead?at:previous?.lastReadAt||null,lastNewAt:latestStored?.at||previous?.lastNewAt||null,sessionName:typeof r.sessionName==='string'?r.sessionName.slice(0,100):previous?.sessionName||null,status:r.status,count:r.posts.length,readCount:observed,acceptedCount:accepted-acceptedBefore,rejectedCount:rejected-rejectedBefore,queuePending:Number.isSafeInteger(r.queuePending)?Math.max(0,r.queuePending):0,heartbeatAt:at,checkedAt:r.status==='verification_paused'?previous?.checkedAt||null:at,lastSuccessAt:success?at:previous?.lastSuccessAt||null,needsAttention:['login_required','challenge_required','verification_paused'].includes(r.status)||(!success&&previous?.needsAttention===true),terms:Array.isArray(r.terms)?r.terms.filter(t=>typeof t==='string'&&t.length<=80).slice(0,20):[],durationMs:Number.isFinite(r.durationMs)?Math.max(0,Math.min(300000,r.durationMs)):null});
  }
  if(backup){const data={at:new Date(now()).toISOString(),reader:input.reader,accepted,rejected,results};await DB.prepare('INSERT INTO lab_config(id,data,revision,updated_at) VALUES(?,?,1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=lab_config.revision+1,updated_at=excluded.updated_at').bind(facebookBackup?'facebook-backup-status':'x-backup-status',JSON.stringify(data),data.at).run();return {...data,receipts};}
  const previousStatus=await browserStatus();const merged=[...(previousStatus?.results||[]).filter(r=>!results.some(n=>n.provider===r.provider)),...results];const data={at:new Date(now()).toISOString(),accepted,rejected,results:merged,history:[...results.map(r=>({provider:r.provider,status:r.status,at:r.heartbeatAt,count:r.count,newCount:r.newCount,updatedCount:r.updatedCount,healthPhase:r.health.phase,issues:r.health.issues,reasons:r.health.reasons})),...(previousStatus?.history||[])].slice(0,50)};await DB.prepare('INSERT INTO lab_config(id,data,revision,updated_at) VALUES(?,?,1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=lab_config.revision+1,updated_at=excluded.updated_at').bind('browser-status',JSON.stringify(data),data.at).run();return {...data,receipts};
 }
 async function shared(provider='x'){const row=await DB.prepare('SELECT data FROM workspace_settings WHERE id=?').bind('main').first();const settings=row?JSON.parse(row.data):{};const saved=await DB.prepare('SELECT data,revision FROM lab_config WHERE id=?').bind('social-keyword-groups').first();return {groups:centralProfile(provider)||categoryGroups(saved?JSON.parse(saved.data):null),revision:centralRevision()??saved?.revision??0,excludedTerms:settings.excludedTerms||[]};}
 async function sharedConfig(){const c=await config(),dictionary=await shared(),status=await browserStatus();return {...c,platformSources:(await platformSources(DB)).sources,geographicTerms:geoDictionaryState().records.filter(r=>r.enabled!==false).flatMap(r=>[r.name,...r.aliases]),intervalSeconds:300,scanIntervals:{x:300,facebook:300,instagram:600},accounts:c.accounts.map(a=>({...a,needsAttention:status?.results?.find(r=>r.provider===a.provider)?.needsAttention===true})),keywords:[...new Set(dictionary.groups.filter(g=>g.enabled).flatMap(g=>g.terms))],keywordGroups:dictionary.groups,keywordProfiles:Object.fromEntries(['x','facebook','instagram'].map(provider=>[provider,centralProfile(provider)])),groupRevision:dictionary.revision,scope:'umraniye_only',nationalNewsEnabled:false,requiresLocalContext:true,excludedTerms:dictionary.excludedTerms};}
 async function resume(provider){const status=await browserStatus();if(!status)return;status.results=status.results.map(r=>r.provider===provider?{...r,needsAttention:false}:r);await DB.prepare('UPDATE lab_config SET data=? WHERE id=?').bind(JSON.stringify(status),'browser-status').run();}
 async function ensureAccount(provider){if(!names[provider])throw Error('invalid');const c=await config();let a=c.accounts.find(a=>a.provider===provider);if(!a){a={provider,label:names[provider]+' hesabı',enabled:false,profileURL:{x:'https://x.com/home',facebook:'https://www.facebook.com/me',instagram:'https://www.instagram.com/accounts/edit/'}[provider]};await save({...c,accounts:[...c.accounts,a]});a=(await config()).accounts.find(v=>v.provider===provider);}return a;}
 
function _osintSource(e){
  if(!e||typeof e!=='object')return e;
  const name=String(e.sourceName||'').trim();
  if(name&&!/^Facebook hesabı(?:\s*·\s*Facebook)?$/iu.test(name))
    return e;
  try{
    const u=new URL(e.url);
    if(!['facebook.com','www.facebook.com','m.facebook.com'].includes(u.hostname))
      return e;
    const m=u.pathname.match(/^\/([a-z0-9._-]{3,80})\/posts\//i);
    if(!m)return e;
    return {...e,sourceName:'@'+m[1]+(name.includes('·')?' · Facebook':'')};
  }catch{return e}
}
function _osintValidText(e){
  if(!e)return false;
  const isFacebook=e.platform==='facebook'||
    /^https:\/\/(?:www\.|m\.)?facebook\.com\//i.test(e.url||'');
  if(!isFacebook)return true;

  const title=String(e.title||'');
  const description=String(e.description||'');
  const head=(title.match(/\p{L}+/gu)||[]).slice(0,18);
  const words=(title+' '+description).match(/\p{L}+/gu)||[];

  const leading=head.length>=12&&
    head.filter(w=>w.toLowerCase()==='facebook').length>=12;
  const dominant=words.length>=10&&
    words.filter(w=>w.toLowerCase()==='facebook').length/words.length>=0.65;

  return !(leading||dominant);
}


// OSINT_LOCAL_SCOPE_V2
function osintSocialScope(title,description){
  if(socialScope(title,description))return true;

  const text=(
    String(title||'')+' '+String(description||'')
  ).toLocaleLowerCase('tr-TR')
   .normalize('NFKD')
   .replace(/[\u0300-\u036f]/g,'')
   .replace(/ı/g,'i')
   .replace(/['’`]/g,'');

  return /\b(?:umraniye|dudullu|ihlamurkuyu|elmalikent|armaganevler|yamanevler)(?:deki|daki|den|dan|nin|nun|de|da|ye|ya|li)?\b/.test(text);
}

let socialMemo=null,socialPending=null,socialEpoch=0,lastCleanup=0,facebookUrlIndex=null;
 // node:sqlite eşzamanlıdır: canonical_url araması indekssiz yapılırsa her sosyal liste yenilemesinde facebook_posts tablosu
 // 100'lük gruplar halinde defalarca baştan sona taranır ve sunucu (tüm HTTP istekleri) yüzlerce ms bloklanır.
 function ensureFacebookUrlIndex(){return facebookUrlIndex??=Promise.resolve().then(()=>DB.prepare("CREATE INDEX IF NOT EXISTS facebook_posts_canonical_url ON facebook_posts(json_extract(data,'$.canonical_url'))").run()).catch(()=>{facebookUrlIndex=null;});}
 function invalidateSocialCache(){socialEpoch++;socialMemo=null;socialPending=null;}
 async function maintenance(){if(now()-lastCleanup<3600000)return;const report=await purgeContent(DB,{now:now()});lastCleanup=report.incomplete?now()-3300000:now();invalidateSocialCache();return report;}
 async function buildSocialItems(){
 const cutoff=retentionCutoff(now());
 const rows=(await DB.prepare("SELECT data FROM lab_items WHERE source_id!='dha-direct' AND (source_id='browser-research' OR json_extract(data,'$.social')=1) ORDER BY published_at DESC,id DESC LIMIT 2000").all()).results;
 const urls=new Set();for(const row of rows){try{const e=JSON.parse(row.data);if(e.url)urls.add(e.url);for(const source of e.sources||[])if(source.url)urls.add(source.url);}catch{}}
 await ensureFacebookUrlIndex();
 const fbMap=new Map(),keys=[...urls];for(let i=0;i<keys.length;i+=100){const batch=keys.slice(i,i+100);const found=(await DB.prepare("SELECT data FROM facebook_posts WHERE json_extract(data,'$.canonical_url') IN ("+batch.map(()=>'?').join(',')+')').bind(...batch).all()).results;for(const row of found){try{const p=JSON.parse(row.data);fbMap.set(p.canonical_url,p);}catch{}}}
 const candidates=[];for(let i=0;i<rows.length;i++){let item;try{item=JSON.parse(rows[i].data);}catch{}if(item&&!item.retentionExpired&&item.sourceId!=='dha-direct'&&!item.duplicateOf&&isSocialRecord(item)){const curated=curateSocial(_osintSource(item));if(curated&&_osintValidText(curated))candidates.push(withCorrelation(curated));}if(i%4===3)await new Promise(resolve=>setImmediate(resolve));}
 const decorate=e=>({...applyFacebookSafety(e,{now:now()}),sources:(e.sources||[]).filter(s=>isSocialRecord({...s,platform:s.platform||e.platform})).map(s=>{const p=fbMap.get(s.url);return p?{...s,platform:'facebook',sourceName:p.source||s.sourceName,description:p.text||s.description,fullText:p.full_text||p.text||s.fullText,publishedAt:p.published_at,firstSeenAt:p.first_seen_at}:s;}).map(s=>districtPriorityEligible({...e,...s})?s:{...s,priorityLevel:s.priorityLevel==='P1'?'P3':s.priorityLevel,policePriority:false})});const decorated=[];for(let i=0;i<candidates.length;i++){decorated.push(decorate(candidates[i]));if(i%4===3)await new Promise(resolve=>setImmediate(resolve));}
 return dedupeFacebookRecords(decorated.map(applyLocalScopeSafety).filter(e=>localScopeAssessment(e).state!=='outside').filter(e=>e.publishedAt&&(/^\d{4}-\d{2}-\d{2}$/.test(e.publishedAt)?e.publishedAt:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'}).format(new Date(e.publishedAt)))>=cutoff&&(e.institutionalReference||e.geoDictionary?.localCandidate||sourceNeighborhoodContext(e)||canonicalFacebookDisplay(e)||isGovernorActivity(e)||osintSocialScope(e.title,e.platform==='x'?(e.fullText||e.description||''):(e.description||'')))).sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)||a.id.localeCompare(b.id)));}
 async function socialItems(){
  if(socialMemo&&socialMemo.expires>now())return structuredClone(socialMemo.value);
  if(!socialPending){const epoch=socialEpoch;const pending=buildSocialItems().then(value=>{if(epoch===socialEpoch)socialMemo={value,expires:now()+10000};return value;}).finally(()=>{if(socialPending===pending)socialPending=null;});socialPending=pending;}
  return structuredClone(await socialPending);
 }
 const invalidating=fn=>async(...args)=>{try{return await fn(...args);}finally{invalidateSocialCache();}};


 return {config:sharedConfig,rawConfig:config,save:invalidating(save),evidence:invalidating(evidence),browserStatus,ingest:invalidating(ingest),ensureAccount,socialItems,resume,maintenance,invalidateSocialCache};
}
