import {readFile,stat} from 'node:fs/promises';
const statusPath='/var/lib/umraniye-osint-instagram-api-public/status.json';
let cached=null,loaded=0;
const count=v=>Number.isSafeInteger(v)?Math.max(0,Math.min(v,1000000)):0;
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
const safe=v=>typeof v==='string'&&/^[a-z0-9_]{1,60}$/.test(v)?v:null;
export function publicInstagramAPIState(value,now=Date.now()){
 const actualRows=Array.isArray(value.sources)?value.sources:[];
 const waiting=Array.isArray(value.waitingSourceStates)?value.waitingSourceStates:[];
 const seen=new Set(actualRows.map(r=>r.handle));
 const rows=[...actualRows,...waiting.filter(r=>!seen.has(r.handle)).map(r=>({...r,status:'backoff',read:0}))];
 const completed=date(value.completedAt)||date(value.at);
 const expired=!!date(value.tokenExpiresAt)&&Date.parse(value.tokenExpiresAt)<=now;
 const authRequired=expired||['token_expired','token_renewal_required'].includes(value.status);
 let status=safe(value.status)||'unknown';
 // Older publishers called a round with no attempted source "completed" too.
 if(status==='completed'&&!actualRows.length&&count(value.activeSources))status=count(value.waitingSources)||waiting.length?'source_backoff':'no_sources_attempted';
 const retries=waiting.map(r=>date(r.retryAt)).filter(Boolean).sort();
 const retryAt=date(value.retryAt)||(status==='source_backoff'?retries[0]||null:null);
 return {available:true,transport:'instagram_graph_api',status:expired?'token_expired':status,
  at:date(value.at),completedAt:completed,stale:!completed||now-Date.parse(completed)>900000,
  lastContentReadAt:date(value.lastContentReadAt),
  nextExpectedScanAt:authRequired?null:retryAt|| (completed?new Date(Date.parse(completed)+300000).toISOString():null),
  retryAt,pauseReason:safe(value.pauseReason),pauseCode:Number.isSafeInteger(value.pauseCode)?value.pauseCode:null,sourceBudgetPerRound:count(value.sourceBudgetPerRound),deferredSources:count(value.deferredSources),
  waitingSources:count(value.waitingSources),attemptedSources:count(value.attemptedSources),readSources:count(value.readSources),failedSources:count(value.failedSources),
  intervalSeconds:300,activeSources:count(value.activeSources),pending:count(value.pending),
  tokenExpiresAt:date(value.tokenExpiresAt),tokenRenewalDue:expired||value.tokenRenewalDue===true,
  sourceHealth:(Array.isArray(value.sourceHealth)?value.sourceHealth:[]).slice(0,200).filter(r=>typeof r.handle==='string'&&/^[a-z0-9_.]{1,30}$/.test(r.handle)).map(r=>({
   handle:r.handle,status:safe(r.healthStatus)||'unknown',lastAttemptAt:date(r.lastAttemptAt),lastContentReadAt:date(r.lastContentReadAt),lastNewPostAt:date(r.lastNewPostAt),nextScanAt:date(r.nextScanAt),
   totalRead:count(r.totalRead),uniquePosts:count(r.uniquePosts),newPosts:count(r.newPosts),duplicates:count(r.duplicates),requests:count(r.requests),latencySamples:count(r.latencySamples),
   meanDiscoverySeconds:typeof r.meanDiscoverySeconds==='number'&&Number.isFinite(r.meanDiscoverySeconds)&&r.meanDiscoverySeconds>=0&&r.meanDiscoverySeconds<=10800?r.meanDiscoverySeconds:null,
   p95DiscoverySeconds:typeof r.p95DiscoverySeconds==='number'&&Number.isFinite(r.p95DiscoverySeconds)&&r.p95DiscoverySeconds>=0&&r.p95DiscoverySeconds<=10800?r.p95DiscoverySeconds:null,
   lastErrorKind:typeof r.lastErrorKind==='string'&&/^[A-Za-z0-9_]{1,80}$/.test(r.lastErrorKind)?r.lastErrorKind:null,verificationRequired:r.verificationRequired===true,
   rejectedByReason:Object.fromEntries(Object.entries(r.rejectedByReason||{}).filter(([k,n])=>/^[a-z_]{1,60}$/.test(k)&&Number.isSafeInteger(n)&&n>=0&&n<=1000000000))})),
  sources:rows.slice(0,200).filter(r=>typeof r.handle==='string'&&/^[a-z0-9_.]{1,30}$/.test(r.handle)).map(r=>({
   handle:r.handle,status:safe(r.status)||'unknown',read:count(r.read),newPending:count(r.newPending),
   retryAt:date(r.retryAt),code:Number.isSafeInteger(r.code)?r.code:null,subcode:Number.isSafeInteger(r.subcode)?r.subcode:null,
   textMissing:count(r.reasons?.text_missing),baseline:count(r.reasons?.baseline),known:count(r.reasons?.known),
   paginationLimitReached:r.paginationLimitReached===true})),
  accepted:(Array.isArray(value.ingestion)?value.ingestion:[]).reduce((a,r)=>a+count(r.accepted),0),
  rejected:(Array.isArray(value.ingestion)?value.ingestion:[]).reduce((a,r)=>a+count(r.rejected),0),
  panelHealthUpdated:value.panelHealthUpdated===true};
}
export async function readInstagramAPIState(){
 if(cached&&Date.now()-loaded<10000)return cached;
 try{const meta=await stat(statusPath);if(!meta.isFile()||meta.size>512000)throw Error('invalid_status_file');
  cached=publicInstagramAPIState(JSON.parse(await readFile(statusPath,'utf8')));
 }catch(error){cached={available:false,transport:'instagram_graph_api',status:'status_unavailable',reason:error.code==='EACCES'?'status_access_denied':'status_not_ready',sources:[]};}
 loaded=Date.now();return cached;
}
