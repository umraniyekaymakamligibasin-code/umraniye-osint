// CLI-only, read-only verification of existing data and the real social projection.
import {DatabaseSync} from 'node:sqlite';
import {writeFile,rename,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createBrowserResearch} from './browser-research.mjs';
import {loadCentralKeywords} from './central-keywords.mjs';
import {loadGeoDictionary} from './geo-dictionary.mjs';
import {loadInstitutionalTargets} from './institutional-targets.mjs';
import {localScopeAssessment,applyLocalScopeSafety} from './local-scope-policy.mjs';
import {groupEventRecordsAsync,publicationKey} from '../src/grouping.js';
export async function auditDatabase(raw,{since:sinceValue,normalRounds=[]}={}){
const DB={prepare(sql){let args=[];return{bind(...values){args=values;return this;},async first(){return raw.prepare(sql).get(...args)||null;},async all(){return{results:raw.prepare(sql).all(...args)};},async run(){throw Error('read_only_audit');}};}};
 raw.exec('PRAGMA query_only=ON');
 await loadGeoDictionary(DB);await loadCentralKeywords(DB);await loadInstitutionalTargets(DB);
 const since=Date.parse(sinceValue||''),research=createBrowserResearch(DB),social=await research.socialItems(),visible=new Set(social.flatMap(e=>[e.id,...(e.relatedIds||[]),...(e.sources||[]).map(s=>s.id)].filter(Boolean)));
 const rows=raw.prepare("SELECT data FROM lab_items WHERE source_id='browser-research' ORDER BY collected_at DESC LIMIT 3000").all().map(r=>JSON.parse(r.data));
 const brief=e=>{if(!e)return null;const first=e.firstSeenAt||e.collectedAt,lag=(Date.parse(first)-Date.parse(e.publishedAt))/1000;return{id:e.id,url:e.url,publishedAt:e.publishedAt,firstSeenAt:first,detectionLagSeconds:Number.isFinite(lag)&&/T/.test(e.publishedAt||'')?Math.round(lag):null,visibleThroughSocialModel:visible.has(e.id),locationStatus:e.locationStatus||null};};
 const providers={};for(const provider of ['x','facebook','instagram']){
  const records=rows.filter(e=>e.platform===provider),added=records.filter(e=>Number.isFinite(since)&&Date.parse(e.firstSeenAt||e.collectedAt)>=since);
  providers[provider]={stored:records.length,visibleInSocialModel:social.filter(e=>e.platform===provider).length,newStoredSinceVerification:added.length,newVisibleSinceVerification:added.filter(e=>visible.has(e.id)).length,latestStored:brief(records[0]),newSamples:added.slice(0,3).map(brief),newCaptureVerified:added.some(e=>visible.has(e.id))};
 }
 const newsByID=new Map();for(const row of raw.prepare('SELECT data FROM snapshots').all())for(const e of JSON.parse(row.data).events||[])newsByID.set(e.id,e);
 const storedNews=[...newsByID.values()],scopes={local:0,outside:0,review:0};for(const e of storedNews)scopes[localScopeAssessment(e).state]++;
 const grouped=await groupEventRecordsAsync(storedNews.map(applyLocalScopeSafety)),keys=new Set(),duplicates=new Set();
 for(const e of rows){const key=publicationKey(e);if(keys.has(key))duplicates.add(key);keys.add(key);}
 const pending=raw.prepare("SELECT data FROM lab_outbox WHERE status='pending' LIMIT 500").all();
 const report={at:new Date().toISOString(),normalRounds,since:Number.isFinite(since)?new Date(since).toISOString():null,readOnly:true,databaseChanged:false,scope:'stored_data_and_server_projection_not_external_browser',providers,news:{storedPublications:storedNews.length,scopeCounts:scopes,groupedEvents:grouped.length,multiSourceEvents:grouped.filter(e=>e.sources?.length>1).length,rawRecordsDeleted:0},social:{rawDuplicatePublicationKeys:duplicates.size,unsafeProjectedLocalPriority:social.filter(e=>!e.nationalCritical&&!localScopeAssessment(e).local&&(e.priorityLevel==='P1'||e.policePriority||e.notificationEligible===true)).length},telegram:{states:raw.prepare('SELECT status,count(*) AS count FROM lab_outbox GROUP BY status').all(),pendingLocalScopeRisks:pending.filter(row=>{const e=JSON.parse(row.data);return e.destination!=='national'&&!localScopeAssessment(e).local;}).length,messagesSentByAudit:0},externalBrowserVerified:false};
 return report;
}
if(process.argv?.[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const raw=new DatabaseSync('/var/lib/umraniye-osint-deneme/osint.sqlite',{readOnly:true});
 try{
  let normalRounds=[];if(process.argv[3]){if(process.argv[3]!=='/var/lib/umraniye-osint-deneme/system-four-rounds.json')throw Error('invalid_rounds_path');normalRounds=JSON.parse(await readFile(process.argv[3],'utf8'));}
  const report=await auditDatabase(raw,{since:process.argv[2],normalRounds}),output='/var/lib/umraniye-osint-deneme/system-four-verification.json',temp=output+'.'+process.pid+'.tmp';
  await writeFile(temp,JSON.stringify(report,null,2),{mode:0o600});await rename(temp,output);
  console.log(JSON.stringify({result:'read_only_system_verification',at:report.at,providers:report.providers,news:report.news,social:report.social,telegram:report.telegram,externalBrowserVerified:false}));
 }catch(error){console.error(JSON.stringify({result:'read_only_audit_failed',errorType:error.name,code:error.code||null}));process.exitCode=1;}finally{raw.close();}
}
