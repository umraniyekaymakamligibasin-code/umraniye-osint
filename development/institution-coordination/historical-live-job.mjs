export const historicalDuties=[
 ['UMR_EMNIYET','public_safety','Asayiş olayı','silahli saldiri|silahli olay|bicakli saldiri|cinayet|hirsizlik|gozalti|uyusturucu operasyon'],
 ['UMR_EMNIYET','traffic_safety','Trafik güvenliği','trafik kazasi|zincirleme kaza|yol trafige kapali|serit trafige kapali'],
 ['ISTANBUL_ITFAIYE','fire_rescue','Yangın ve kurtarma','yangin|alev aldi|mahsur kal|kurtarma calismasi'],
 ['UMR_ILCE_MEM','school_facility','Eğitim hizmetleri','okul|ogrenci|ogretmen|milli egitim|lise'],
 ['ISKI_UMR','water_leak','Su altyapısı','su borusu|su kacagi|sebeke suyu'],
 ['ISKI_UMR','water_outage','Su kesintisi','su kesintisi|sular kesik|sular kesildi'],
 ['ISKI_UMR','sewer_overflow','Kanalizasyon','kanalizasyon|atik su|rogar tasti'],
 ['AYEDAS_UMR','power_outage','Elektrik dağıtımı','elektrik kesintisi|elektrikler kesildi|elektrik arizasi'],
 ['AYEDAS_UMR','fallen_power_equipment','Elektrik altyapısı','elektrik diregi|elektrik kablosu|trafo patla'],
 ['IGDAS_UMR','gas_leak_public_hazard','Doğal gaz güvenliği','dogalgaz kacagi|dogal gaz kacagi|gaz kokusu'],
 ['UMR_BELEDIYE','waste_container','Atık hizmeti','cop konteyneri|cop toplanmiyor|cop birik'],
 ['UMR_BELEDIYE','parks_public_space','Park hizmeti','park ekipmani|oyun grubu|park bakimi'],
 ['UMR_SYDV','social_assistance_service_access','Sosyal yardım hizmeti','maddi yardim|sosyal yardim basvurusu|gida yardimi|yakacak yardimi'],
 ['UMR_SHM','social_service_access','Sosyal hizmet','sosyal hizmet|bakim ihtiyaci|korunma ihtiyaci'],
 ['IETT','bus_service_disruption','Otobüs hizmeti','iett|otobus sefer|otobus duragi'],
 ['METRO_ISTANBUL','metro_service_disruption','Metro işletmesi','metro sefer|metro istasyon|metro ariza']
];
export const fold=s=>String(s||'').toLocaleLowerCase('tr').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
export function historicalRoutes(event){
 const title=fold(event.title),text=title+' '+fold(event.fullText||event.description||event.text).slice(0,3000);
 if(/reklam|sponsorlu|indirim kodu/.test(text))return [];
 const found=new Map();
 for(const [institution,topic,label,pattern] of historicalDuties){
  const re=new RegExp('(?:'+pattern+')','u');
  if(!re.test(text))continue;
  // Rutin tebrik/başarı paylaşımları açık kurum görevi değildir.
  if(institution==='UMR_ILCE_MEM'&&/sampiyon|madalya|tebrik|kutluyor/.test(text)&&!/okulda.*(?:yangin|kaza|saldiri|ariza)/.test(text))continue;
  if(!found.has(institution))found.set(institution,{institution,topic,label,reason:'İçerikte kurum görev konusuna ilişkin ifade eşleşmesi; resmî teyit değildir.'});
 }
 return [...found.values()];
}

import {openDatabase} from '/opt/umraniye-osint-deneme/server/database.mjs';
import {createBrowserResearch} from '/opt/umraniye-osint-deneme/server/browser-research.mjs';
import {groupEventRecordsAsync} from '/opt/umraniye-osint-deneme/src/grouping.js';
import {localScopeAssessment} from '/opt/umraniye-osint-deneme/server/local-scope-policy.mjs';
import {moderationHiddenKeys,moderationIsHiddenRecord} from '/opt/umraniye-osint-deneme/server/content-moderation.mjs';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const db=openDatabase('/var/lib/umraniye-osint-deneme/osint.sqlite');
try{
 let news=[];for(const row of (await db.prepare('SELECT data FROM snapshots').all()).results){const d=JSON.parse(row.data);news.push(...(d.events||[]))}
 const social=await createBrowserResearch(db).socialItems();
 const settingsRow=await db.prepare("SELECT data FROM workspace_settings WHERE id='main'").first();const settings=JSON.parse(settingsRow?.data||'{}');
 const hidden=await moderationHiddenKeys(db);
 const records=[...news,...social].filter(e=>!moderationIsHiddenRecord(e,hidden));
 const grouped=await groupEventRecordsAsync(records,{groupSimilar:settings.groupSimilar!==false,splitEventIds:settings.splitEventIds||[]});
 const report={result:'historical_institution_distribution_completed',examined:grouped.length,created:0,alreadyPresent:0,notRouted:0,nonlocal:0,byInstitution:{},emailsQueuedByThisJob:0,telegramMessagesSent:0};
 const at=new Date().toISOString(),ref='Kullanıcının geçmiş olayları kurumlara dağıtma talebi; 13 Kasım 2026';
 for(const e of grouped){
  const scope=localScopeAssessment(e);if(!scope.local||['institutional_relationship_unverified_location','cross_district_relation_unverified_location'].includes(scope.reason)){report.nonlocal++;continue}
  const routes=historicalRoutes(e);if(!routes.length){report.notRouted++;continue}
  for(const route of routes){
   const i=await db.prepare('SELECT id FROM coord_institutions WHERE code=?').bind(route.institution).first(),t=await db.prepare('SELECT id FROM coord_topics WHERE code=?').bind(route.topic).first();if(!i||!t){report.notRouted++;continue}
   const aliases=[...new Set([e.id,...(e.relatedIds||[])].filter(x=>typeof x==='string'))];if(!aliases.length){report.notRouted++;continue}
   const previous=await db.prepare('SELECT id FROM coord_cases WHERE institution_id=? AND source_event_id IN ('+aliases.map(()=>'?').join(',')+') LIMIT 1').bind(i.id,...aliases).first();
   if(previous){report.alreadyPresent++;continue}
   const id=randomUUID(),published=e.firstPublishedAt||e.publishedAt||null,seen=e.firstSeenAt||e.collectedAt||at;
   const summary='Geçmiş kayıtların test amaçlı dağıtımı. '+route.reason+' Kaynak içeriği hassas ayrıntılar nedeniyle bu görünümde paylaşılmamıştır. Konum: ilçe bağlamı; kesin adres teyidi değildir.';
   await db.batch([
    db.prepare("UPDATE coord_institutions SET enabled=1,approval_status='approved',approval_reference=?,updated_at=? WHERE id=?").bind(ref,at,i.id),
    db.prepare("UPDATE coord_topics SET enabled=1,approval_status='approved',approval_reference=?,updated_at=? WHERE id=?").bind(ref,at,t.id),
    db.prepare('INSERT INTO coord_institution_topic_grants VALUES(?,?,1,?,?,?) ON CONFLICT(institution_id,topic_id) DO UPDATE SET granted=1,approval_reference=excluded.approval_reference,updated_at=excluded.updated_at').bind(i.id,t.id,ref,'historical-distribution',at),
    db.prepare(`INSERT INTO coord_cases(id,institution_id,topic_id,source_event_id,source_revision,idempotency_key,title,summary_redacted,neighborhood,location_precision,first_published_at,first_seen_at,confidence,status,priority,sensitivity,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,NULL,'approximate',?,?,0.7,'new','normal','ordinary',?,?) ON CONFLICT(institution_id,source_event_id,topic_id) DO NOTHING`)
     .bind(id,i.id,t.id,e.id,'historical-v1',JSON.stringify([i.id,e.id,t.id]),route.label+' — geçmiş olay',summary,published,seen,at,at),
    db.prepare(`INSERT INTO coord_audit(id,actor_kind,institution_id,action,target_type,target_id,created_at) VALUES(?,'system',?,'historical_assignment','case',?,?)`).bind(randomUUID(),i.id,id,at)
   ]);
   const sources=e.sources?.length?e.sources:[e];
   for(const source of sources.slice(0,30)){
    let url;try{url=new URL(source.url||source.permalink||'');if(url.protocol!=='https:'||url.username||url.password)continue;url.hash='';for(const key of [...url.searchParams.keys()])if(!['id','story_fbid','v'].includes(key))url.searchParams.delete(key)}catch{continue}
    await db.prepare(`INSERT INTO coord_case_sources(id,coord_case_id,source_url,source_name,platform,published_at,added_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(coord_case_id,source_url) DO NOTHING`)
     .bind(randomUUID(),id,url.href,String(source.sourceName||e.sourceName||'Kaynak').slice(0,120),String(source.platform||e.platform||'news').slice(0,32),source.publishedAt||published,at).run();
   }
   report.created++;report.byInstitution[route.institution]=(report.byInstitution[route.institution]||0)+1;
  }
 }
 await writeFile('/var/lib/umraniye-osint-deneme/institution-historical-report.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report,null,2));
}finally{db.close()}
