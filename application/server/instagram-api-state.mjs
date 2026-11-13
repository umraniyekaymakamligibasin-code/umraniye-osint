import {readFile,stat} from 'node:fs/promises';
const statusPath='/var/lib/umraniye-osint-instagram-api-public/status.json';
let cached=null,loaded=0;
const count=v=>Number.isSafeInteger(v)?Math.max(0,Math.min(v,1000000)):0;
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
const safe=v=>typeof v==='string'&&/^[a-z0-9_]{1,60}$/.test(v)?v:null;
export function publicInstagramAPIState(value,now=Date.now()){
 const rows=Array.isArray(value.sources)?value.sources:[];
 const completed=date(value.completedAt)||date(value.at);
 const expired=!!date(value.tokenExpiresAt)&&Date.parse(value.tokenExpiresAt)<=now;
 return {available:true,transport:'instagram_graph_api',status:expired?'token_expired':safe(value.status)||'unknown',
  at:date(value.at),completedAt:completed,stale:!completed||now-Date.parse(completed)>900000,
  nextExpectedScanAt:date(value.retryAt)|| (completed?new Date(Date.parse(completed)+300000).toISOString():null),
  retryAt:date(value.retryAt),pauseReason:safe(value.pauseReason),pauseCode:Number.isSafeInteger(value.pauseCode)?value.pauseCode:null,sourceBudgetPerRound:count(value.sourceBudgetPerRound),deferredSources:count(value.deferredSources),
  intervalSeconds:300,activeSources:count(value.activeSources),pending:count(value.pending),
  tokenExpiresAt:date(value.tokenExpiresAt),tokenRenewalDue:expired||value.tokenRenewalDue===true,
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
