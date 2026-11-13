import{randomBytes,createHash}from 'node:crypto';
import{writeFile}from 'node:fs/promises';
import{openDatabase}from './database.mjs';
import{loadGeoDictionary}from './geo-dictionary.mjs';
import{loadCentralKeywords}from './central-keywords.mjs';
import worker,{SOURCES}from '../worker/index.js';
const dir=process.env.DATA_DIR;if(dir!=='/var/lib/umraniye-osint-deneme')throw Error('DENEME data path required');
const db=openDatabase(dir+'/osint.sqlite'),key=randomBytes(32).toString('hex'),origin='https://deneme.umraniyeosint.com';
try{
 await loadGeoDictionary(db);await loadCentralKeywords(db);
 const stamp=new Date().toISOString();
 // The installer runs this with the DENEME server stopped; its old leases cannot
 // belong to a surviving request. Leave other platforms' locks untouched.
 await db.prepare("DELETE FROM refresh_locks WHERE id LIKE 'batch-%'").run();
 await db.prepare('INSERT INTO lab_config(id,data,revision,updated_at) VALUES(?,?,1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=lab_config.revision+1,updated_at=excluded.updated_at').bind('news-coverage-policy',JSON.stringify({version:1,startedAt:stamp,sourceIntervalMinutes:10,detailConcurrency:2,detailLimitPerSource:4,persistentBacklog:true}),stamp).run();
 const env={DB:db,OSINT_AUTO_UPDATE_ENABLED:'true',OSINT_AUTOMATION_KEY_SHA256:createHash('sha256').update(key).digest('hex')};
 const r=await worker.fetch(new Request(origin+'/api/automation/refresh?batch=0',{method:'POST',headers:{'X-OSINT-Service-Key':key}}),env);
 if(!r.ok)throw Error('Initial news batch failed: '+r.status);
 const batch=await r.json();
 const published=await worker.fetch(new Request(origin+'/api/config',{headers:{'X-OSINT-Service-Key':key}}),env);
 if(!published.ok)throw Error('Published feed unavailable: '+published.status);
 const feed=await published.json();
 const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'}),today=day.format(new Date());
 const matches=feed.initialData.events.filter(e=>/şeyda|seyda|yunus emre geçti/i.test(e.title+' '+e.description)&&Number.isFinite(Date.parse(e.publishedAt))&&day.format(new Date(e.publishedAt))===today);
 const report={result:'news_coverage_installed',at:new Date().toISOString(),configuredSources:SOURCES.length,firstBatchResults:batch.results,firstBatchCached:!!batch.cached,caseVisibleInExistingNewsFeed:matches.length>0,caseRecords:matches.map(e=>({id:e.id,title:e.title,url:e.url,publishedAt:e.publishedAt,firstSeenAt:e.firstSeenAt,notificationEligible:e.notificationEligible})),generalCollectorEnabled:true,persistentBacklog:true,detailConcurrency:2,extraBrowsers:0,extraTimers:0,historicalTelegramReplay:false,telegramTestMessageSent:false,productionDatabaseChanged:false};
 await writeFile(dir+'/news-coverage-report.json',JSON.stringify(report,null,2),{mode:0o600});
 console.log(JSON.stringify(report,null,2));
}finally{db.close()}
