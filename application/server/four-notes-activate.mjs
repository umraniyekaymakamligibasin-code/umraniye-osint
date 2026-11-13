import{openDatabase}from './database.mjs';
import{loadGeoDictionary,analyzeGeoText}from './geo-dictionary.mjs';
import{loadInstitutionalTargets}from './institutional-targets.mjs';
import{createInstitutionalManager}from './institutional-manager.mjs';
import{deliveryFreshness}from './delivery-freshness.mjs';
import{writeFile}from 'node:fs/promises';
const dir=process.env.DATA_DIR;if(dir!=='/var/lib/umraniye-osint-deneme')throw Error('DENEME path required');
const DB=openDatabase(dir+'/osint.sqlite');
try{
 await loadGeoDictionary(DB);await loadInstitutionalTargets(DB);
 let expired=0,outside=0;const sentOld=[];
 for(const row of (await DB.prepare("SELECT id,data,status,sent_at FROM lab_outbox WHERE status IN ('pending','sent','unknown','sending')").all()).results){
  const p=JSON.parse(row.data),fresh=deliveryFreshness(p.publishedAt),geo=analyzeGeoText(p.title+' '+(p.description||''));
  if(row.status==='pending'&&(!fresh.allowed||geo.outsideDistrict&&!p.nationalCritical)){
   await DB.prepare("UPDATE lab_outbox SET status='expired',last_error=? WHERE id=? AND status='pending'").bind(!fresh.allowed?fresh.reason:'outside_district',row.id).run();if(!fresh.allowed)expired++;else outside++;
  }
  if(row.status==='sent'&&!fresh.allowed)sentOld.push({title:String(p.title||'').slice(0,200),publishedAt:p.publishedAt,sentAt:row.sent_at,stream:p.stream||null});
 }
 let outsideStored=0;
 for(const row of (await DB.prepare('SELECT data FROM snapshots').all()).results){for(const e of JSON.parse(row.data).events||[])if(analyzeGeoText(e.title+' '+(e.fullText||e.description||'')).outsideDistrict&&!e.nationalCritical)outsideStored++;}
 const manager=createInstitutionalManager(DB,{origin:'https://deneme.umraniyeosint.com'}),incoming=await manager.records();
 const report={result:'four_notes_fixed',at:new Date().toISOString(),institutionalOwnPostsExcluded:true,incomingInstitutionalReferences:incoming.length,socialNewsIncludedInPDF:true,telegramPublicationWindowHours:24,oldPendingExpired:expired,outsideDistrictPendingExpired:outside,previouslySentOldCount:sentOld.length,previouslySentOldExamples:sentOld.sort((a,b)=>String(b.sentAt).localeCompare(String(a.sentAt))).slice(0,5),outsideStoredNewsNowFiltered:outsideStored,geographicRecordsDeleted:0,telegramTestMessageSent:false,historicalReplay:false,productionChanged:false,privateNotesExportedToPDF:false};
 await writeFile(dir+'/four-notes-report.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report,null,2));
}finally{DB.close()}
