import {openDatabase} from '/opt/umraniye-osint-deneme/server/database.mjs';
import {createBrowserResearch} from '/opt/umraniye-osint-deneme/server/browser-research.mjs';
import {groupEventRecordsAsync} from '/opt/umraniye-osint-deneme/src/grouping.js';
const clean=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const redact=s=>clean(s).replace(/\b\d{11}\b/g,'[kimlik bilgisi çıkarıldı]').replace(/(?:\+90|0)?\s*5\d{2}[\s()-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b/g,'[telefon çıkarıldı]').replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g,'[e-posta çıkarıldı]');
const db=openDatabase('/var/lib/umraniye-osint-deneme/osint.sqlite');
try{
 const records=[];for(const r of (await db.prepare('SELECT data FROM snapshots').all()).results)records.push(...(JSON.parse(r.data).events||[]));records.push(...await createBrowserResearch(db).socialItems());
 const row=await db.prepare("SELECT data FROM workspace_settings WHERE id='main'").first(),settings=JSON.parse(row?.data||'{}');
 const groups=await groupEventRecordsAsync(records,{groupSimilar:settings.groupSimilar!==false,splitEventIds:settings.splitEventIds||[]});
 const byId=new Map();for(const e of groups)for(const id of [e.id,...(e.relatedIds||[])])if(id)byId.set(id,e);
 const report={evaluated:0,updated:0,sourceNotFound:0,emailMessagesSent:0,telegramMessagesSent:0};
 for(const c of (await db.prepare('SELECT c.id,c.source_event_id,t.sensitivity FROM coord_cases c JOIN coord_topics t ON t.id=c.topic_id').all()).results){
  report.evaluated++;const e=byId.get(c.source_event_id);if(!e){report.sourceNotFound++;continue}
  const title=redact(e.title).slice(0,300);if(!title){report.sourceNotFound++;continue}
  let summary=redact(e.fullText||e.description||e.text).split(/ilgili haberler|benzer haberler|diğer haberler|diger haberler/i)[0].slice(0,1400);
  if(c.sensitivity!=='ordinary')summary=title+'\n\nHassas içerik: ayrıntılar kurum görünümünde sınırlandırılmıştır. Yetkili kaynak bağlantılarından inceleyin.';
  else if(!summary)summary='Kaynak kaydında başlık dışında açıklama bulunmuyor. Orijinal haber bağlantısını açabilirsiniz.';
  await db.prepare('UPDATE coord_cases SET title=?,summary_redacted=?,updated_at=? WHERE id=?').bind(title,summary,new Date().toISOString(),c.id).run();report.updated++;
 }
 console.log(JSON.stringify(report,null,2));
}finally{db.close()}
