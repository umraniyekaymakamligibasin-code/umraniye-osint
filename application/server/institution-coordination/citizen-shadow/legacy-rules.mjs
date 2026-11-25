import{createHash}from'node:crypto';
import{readFileSync}from'node:fs';import{analyze}from'./engine.mjs';import{fold,clauseState}from'./language.mjs';import{approvalSnapshot}from'./integration.mjs';
import{RESMI_HESAPLAR,explicitLocalIncidentClauses}from'./locality.mjs';
// Existing approved topics use the SAME language, location and privacy engine.
// Broad legacy phrases are a fallback only; never a second parallel decision.
const terms=JSON.parse(readFileSync(new URL('../kurum/topic-terms.json',import.meta.url),'utf8')).konular||{};
export const legacyCodes=new Set(Object.keys(terms));
const fixed={street_cleanliness:['UMR_BELEDIYE'],illegal_dumping_public_space:['UMR_BELEDIYE'],waste_container:['UMR_BELEDIYE'],parks_public_space:['UMR_BELEDIYE'],bus_service_disruption:['IETT'],bus_stop_infrastructure:['IETT','UMR_BELEDIYE'],metro_service_disruption:['METRO_ISTANBUL'],metro_station_infrastructure:['METRO_ISTANBUL'],ibb_road_maintenance:['UMR_BELEDIYE'],animal_health_public_agriculture:['UMR_BELEDIYE','UMR_ILCE_TARIM'],urban_animal_welfare:['UMR_BELEDIYE','UMR_ILCE_TARIM'],traffic_safety:['UMR_BELEDIYE','UMR_EMNIYET']};

/* ------------------------------------------------------------------ *
 * KURUMSAL BILGI ISTISNASI
 * Resmi kurumun (Kaymakamlik / Ilce MEM / Belediye / Valilik / Mudurluk)
 * egitim duyurusu bir "olay" degildir; ama kurumun kendi gorev alanina
 * girdigi icin paneline BILGI olarak duser. Baslikta egitim terimi sart.
 * Aksi halde duyuru/toren/ziyaret icerikleri sessizce kaybolur.
 * ------------------------------------------------------------------ */
const KURUMSAL_KAYNAK=/(kaymakamligi|ilce mem|ilce milli egitim|milli egitim|belediyesi|valiligi|bakanligi|mudurlugu)/;
const KURUMSAL_KONULAR=new Set(['education_service_access']);
const KURUM_HESAPLARI=new Set(RESMI_HESAPLAR);
// Baslikta gorulen, konu sozlugunde tek basina olmayan okul/ziyaret kaliplari.
const EK_TERIMLER=[
 'egitim ogretim','egitim yili','anadolu lisesi','lisesi','lisemiz','lisemizde','lisesinde',
 'okulumuz','okulumuzda','okulumuzu','okullarimiz','okul ziyareti','okul ziyaret',
 'bayrak toreni','okul idaresi','ogretmenlerimiz','ogrencilerimiz','okul acilisi',
];

const PII=[
 [/\b\d{11}\b/gu,'[kimlik no gizlendi]'],
 [/\bTR\d{2}\s?(?:\d{4}\s?){5}\d{2}\b/giu,'[IBAN gizlendi]'],
 [/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gu,'[e-posta gizlendi]'],
 [/\b(?:plaka|ara[çc] plakas[ıi])\s*[:#-]?\s*[0-9]{2}\s*[A-ZÇĞİÖŞÜ]{1,3}\s*\d{2,4}\b/giu,'[plaka gizlendi]'],
 [/\b(?:daire|kap[ıi]|bina)\s*(?:no|numaras[ıi])?\s*[:#-]?\s*\d+[A-Za-z]?\b/giu,'[adres no gizlendi]'],
];
function maskele(value){let t=String(value??'');for(const[r,y]of PII)t=t.replace(r,y);return t;}
function temizMetin(value){return String(value??'').replace(/<[^>]*>/g,' ').replace(/&(?:[a-z]+|#\d+);/giu,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();}
function kelimeyleKisalt(t,sinir){const s=String(t??'').trim();if(s.length<=sinir)return s;const kes=s.slice(0,sinir);const son=kes.search(/\s+\S*$/u);return (son>sinir*0.6?kes.slice(0,son):kes).trimEnd()+'…';}
function duyuruBasligi(event){
 let t=temizMetin(event?.title);
 if(!t)return '';
 // Baslik 200 karakterde kirpilmis olabilir; kaynak metnin ilk (kisa) satiri
 // gercek basliksa onu kullan.
 const ft=temizMetin(event?.fullText);
 const ilkP=(ft.split(/\n{2,}/)[0]||'').trim();
 if(t.length>150&&ilkP.length>=15&&ilkP.length<=160)t=ilkP;
 const ilk=t.split(/(?<=[.!?…])\s+/u)[0]||t;
 const sec=ilk.length>=25?ilk:t;
 return kelimeyleKisalt(maskele(sec),180);
}
function duyuruOzeti(event,baslik){
 let t=temizMetin(event?.fullText||'');
 if(t){
  const parcalar=t.split(/\n{2,}/).map(p=>p.trim()).filter(Boolean);
  // Ilk paragraf baslik tekrariysa at.
  if(parcalar.length>1&&parcalar[0].length<=160)parcalar.shift();
  t=parcalar.join('\n\n');
 }
 if(!t||t.length<40)t=temizMetin(event?.description||'');
 if(!t)return '';
 const norm=(s)=>String(s??'').toLocaleLowerCase('tr-TR').replace(/\s+/g,' ').trim();
 if(baslik&&norm(t).startsWith(norm(baslik))){
  let kalan=t.slice(baslik.length).replace(/^\S*\s+/u,' ').replace(/^[\s:;,.·|\-–—]+/u,'');
  if(kalan.length>=40)t=kalan;
 }
 return kelimeyleKisalt(maskele(t),700);
}
function kurumsalBilgiKurali(event){
 if(!event)return null;
 const kaynak=fold(event.sourceName??'');
 const hedefler=Array.isArray(event.institutionalReference?.targets)?event.institutionalReference.targets.map(x=>String(x).replace(/^@/,'').toLowerCase()):[];
 const resmi=KURUMSAL_KAYNAK.test(kaynak)||hedefler.some(h=>KURUM_HESAPLARI.has(h));
 if(!resmi)return null;
 if(!(event.locality?.district==='Ümraniye'&&event.locality?.verified===true))return null;
 const baslikFold=fold(event.title??'');
 if(!baslikFold||clauseState(event.title)!=='active'||/\b(?:iptal edildi|yalanlandi|yapilmadi|gerceklesmedi)\b/.test(baslikFold))return null;
 const baslik=duyuruBasligi(event);
 if(!baslik)return null;
 const ozet=duyuruOzeti(event,baslik);
 for(const topic of KURUMSAL_KONULAR){
  const adaylar=[...(terms[topic]||[]),...EK_TERIMLER];
  const eslesen=[...new Set(adaylar.filter(p=>{const f=fold(p);return f&&baslikFold.includes(f);}))];
  if(!eslesen.length)continue;
  return{
   code:topic,title:baslik,taskSummary:ozet,family:'kurumsal_bilgi',subcategory:'Kurumsal eğitim bilgisi',
   patterns:eslesen,requireProblem:false,sensitivity:'ordinary',risk:'normal',
   panelCandidates:['UMR_ILCE_MEM'],serviceAuthority:'İlçe MEM',mandateVerified:false,legacyTopic:topic,
  };
 }
 return null;
}

export function socialInformation(event,state){
 const approvals=approvalSnapshot(state),fullRaw=[event.title,event.fullText||event.description].filter(Boolean).join('\n');
 const raw=event.locality?.evidence==='explicit_local_incident_clauses'?explicitLocalIncidentClauses(fullRaw).join('\n'):fullRaw;
 const active=raw.split(/[.!?;\n]+|\s+ama\s+|\s+ancak\s+/iu).filter(c=>clauseState(c)==='active'&&!/\b(?:iptal edildi|yalanlandi|yapilmadi|gerceklesmedi)\b/.test(fold(c))).map(fold);
 const text=active.join(' ');
 if(!text)return null;
 if(event.locality?.district!=='Ümraniye'||!(event.locality.verified||event.locality.routingEligible))return null;
 const candidates=[];
 // Public news remains institutionally relevant after the fire was extinguished
 // or rescue completed. Do not confuse a resolved incident report with a false
 // incident claim. Simulation, negation and explicit archive clauses were removed.
 const incidentText=active.join(' ');
 if(active.some(c=>/\b(?:cinayet[a-z]*|oldurul[a-z]*|silahli saldiri[a-z]*)\b/.test(c)&&/\b(?:dava[a-z]*|istinaf[a-z]*|beraat[a-z]*|itiraz[a-z]*|mahkeme[a-z]*)\b/.test(c)))candidates.push(['public_safety','UMR_EMNIYET']);
 const fire=active.some(c=>/\b(?:yangin cikti|cikan yangin|yangin cikan|cati yangini|bina yangini|isyeri yangini|yangin sonduruldu|alevlere teslim|alev aldi|alev alev yandi)\b/.test(c)||(/\byangin[a-z]*\b/.test(c)&&/\b(?:itfaiye|sonduruldu|kontrol altina alindi)\b/.test(c)));
 const collapse=active.some(c=>/\b(?:balkon|bina|cati|iskele|vinc)[a-z]*\b/.test(c)&&/\b(?:coktu|cokmesi|cokme|devrildi|devrilmesi|enkaz|mahsur)\b/.test(c));
 if(fire||collapse)candidates.push(['fire_rescue','ISTANBUL_ITFAIYE']);
 if(collapse&&/\b(?:enkaz|mahsur|yaralandi|yarali)\b/.test(incidentText))candidates.push(['district_emergency_coordination','UMR_AFET']);
 if(active.some(c=>(/\b(?:tabanca|silah|namlu)[a-z]*\b/.test(c)&&/\bele geciril[a-z]*\b/.test(c))||/\b(?:gozaltina alindi|gozaltina alinirken|gozaltina aldi|supheli yakalandi|supheliler yakalandi)\b/.test(c)))candidates.push(['public_safety','UMR_EMNIYET']);
 if(active.some(c=>/\b(?:tokat atti|tokat|darbetti|darp edildi|silahli saldiri|bicakli saldiri|kavga cikti|kursunlandi|aracina zarar veren|hirsizlik yapti|soygun)\b/.test(c)))candidates.push(['public_safety','UMR_EMNIYET']);
 if(active.some(c=>/\b(?:carpip kacan|carpip kacti|carparak kacan|carparak kacti|carpmanin etkisiyle|kazaya karisarak olay yerinden ayrilan)\b/.test(c)||(/\bkirmizi isik[a-z]*\b/.test(c)&&/\b(?:kaza|carpisti|carpti)\b/.test(c))))candidates.push(['traffic_safety','UMR_EMNIYET']);
 if(active.some(c=>/\bhirsiz[a-z]*\b/.test(c)&&/\b(?:caldi|calindi|calindigi|calinmasi|calarken)\b/.test(c)))candidates.push(['public_safety','UMR_EMNIYET']);
 if(event.locality?.evidence==='named_district_health_facility'&&/\b(?:kedi kayniyor|hijyen|temizlenmiyor|bocek|fare)\b/.test(text))candidates.push(['public_health_facility','UMR_ILCE_SAGLIK']);
 if(active.some(c=>/\btrafik guvenligi[a-z]*\b/.test(c)&&/\b(?:tehlike[a-z]*|yasal islem|idari para cezasi|adli islem|trafikten men)\b/.test(text)))candidates.push(['traffic_safety','UMR_EMNIYET']);
 if(active.some(c=>/\b(?:trafik kazasi|carpisti|zincirleme kaza|arac devrildi|motosiklet kazasi|makas atti|drift yapti)\b/.test(c)))candidates.push(['traffic_safety','UMR_EMNIYET']);
 if((fire||collapse)&&/\b(?:polis|emniyet) ekip[a-z]*\b/.test(incidentText))candidates.push(['public_safety','UMR_EMNIYET']);

 if(/(?:bayragin golgesinde|egitime destek platformu|ogrenci meclisi|ogretmenler gunu|okul ziyareti|egitim ogretim)/.test(text))candidates.push(['education_service_access','UMR_ILCE_MEM']);
 if(/(?:ilce emniyet mudurlugunce|emniyet mudurlugu ekip|huzur ve guven icin|asayis uygulamasi|gozaltina alindi|tutuklandi)/.test(text))candidates.push(['public_safety','UMR_EMNIYET']);
 if(/(?:siddetli ruzgar uyarisi|firtina uyarisi|firtinali ruzgar)/.test(text))candidates.push(['storm_damage','UMR_AFET']);
 if(/(?:istihdam merkezi|is basvurusu|kariyer gunleri)/.test(text)&&/belediye/.test(text))candidates.push(['employment_service_access','UMR_BELEDIYE'],['employment_service_access','UMR_ISKUR']);
 if(/(?:kitap fuari|kutuphane acilisi)/.test(text))candidates.push(['municipal_service_access','UMR_BELEDIYE']);
 if(/(?:durak|merdiven)/.test(text)&&/(?:merdiven yapan|durak yapimi|durak yenilendi)/.test(text))candidates.push(['bus_stop_infrastructure','IETT'],['bus_stop_infrastructure','UMR_BELEDIYE']);
 if(/\bmetro[a-z]*\b/.test(text)&&/\b(?:seferler durdu|seferleri durdu|seferler aksadi|seferleri aksadi|seferler durduruldu|seferler iptal edildi)\b/.test(text))candidates.push(['metro_service_disruption','METRO_ISTANBUL']);
 if(/\bmetro[a-z]*\b/.test(text)&&/\b(?:patlama|patladi|tahliye|dumandan etkilenen)\b/.test(text))candidates.push(['public_transport_safety','METRO_ISTANBUL']);
 if(event.locality?.evidence==='metropolitan_line_scope'&&/(?:acilis|istasyon|sefer|metro hatt)/.test(text))candidates.push(['metro_station_infrastructure','METRO_ISTANBUL']);
 if(!candidates.length)return null;
 const tasks=[];
 for(const[topic,institution]of candidates){
  if(!approvals.approvedInstitutions.includes(institution)||!approvals.approvedTopics.includes(topic)||!approvals.grants.some(g=>g.institution===institution&&g.topic===topic&&g.granted))continue;
  const key=createHash('sha256').update(JSON.stringify([event.eventIdentity||event.id,topic,institution])).digest('hex');
  tasks.push({key,issueKey:key,topic,institution,title:event.title||'Kurum bilgilendirmesi',summary:String(event.fullText||event.description||event.title).slice(0,6000),locality:{district:'Ümraniye',precision:'district',neighborhood:null},risk:'normal',sourceEventId:event.id});
 }
 return tasks.length?{mode:'shadow',eventId:event.id,tasks,issues:[],status:'shadow_candidates',reason:'approved_panel_candidates'}:null;
}
/* ------------------------------------------------------------------ *
 * YEREL GUNDEM KURALI (son basamak)
 * Yerel haber niteligi tasiyan ama konu sozlugunde karsiligi olmayan
 * icerikler (tesis acilisi, kultur-sanat etkinligi, ziyaret, program,
 * meteoroloji uyarisi) sessizce kaybolmasin. Yalnizca ciddi gurultu
 * kaynaklari (yanit/mention, reklam, parti propagandasi, vefat-cenaze)
 * disarida tutulur; ilce kaniti yoksa hic yazilmaz.
 * ------------------------------------------------------------------ */
const GUNDEM_OLAY=/\b(?:acildi|acilis|aciliyor|acilacak|duzenlendi|duzenleniyor|gerceklestirildi|gerceklestirilecek|bulustu|bulusuyor|bulusmasi|ziyaret|ziyaret etti|program|toren|etkinlik|festival|kurs|seminer|soylesi|soyleyi|imza|protokol|tesis|salon|kutuphane|park|pazar|fuar|sergi|konser|yarisma|turnuva|basvuru)\b/;
const GUNDEM_HAVA=/\b(?:hava sicakligi|sicaklik|firtina|saganak|kar yagisi|buzlanma|ruzgar|meteoroloji|don olayi|sel|su baskini)\b/;
const GUNDEM_REKLAM=/\b(?:satilik|kiralik|fiyat|kampanya fiyati|indirim|siparis|whatsapp|wa\.me|iletisim icin|siparis icin|stoklar|montaj|imalat|uretici|toptan)\b/;
const GUNDEM_SIYASI=/\b(?:oy |sandik|secim|miting|propaganda|aday|ittifak|parti (?:ilce|il) baskan|genel baskan|milletvekili|divan toplant|nobetteyiz|sahada)\b/;
const GUNDEM_HASSAS=/\b(?:vefat|bassagligi|cenaze|taziye|rahmet)\b/;
const GUNDEM_YANIT=/^\s*@|(?:^|\s)@[a-z0-9_]+/i;
const GUNDEM_RESMI=/\b(?:umraniye (?:belediyesi|kaymakamligi)|umraniye kultur sanat|umraniye ilce milli egitim|umraniye ilce emniyet)\b/;
const GUNDEM_EGITIM=/\b(?:okul|egitim|ogrenci|ogretmen|sinif|universite|burs)\b/;
function yerelGundemKurali(event,approvals){
 if(!event)return null;
 const loc=event.locality||{};
 if(loc.district!=='Ümraniye'||!(loc.verified===true||loc.routingEligible===true))return null;
 const baslik=duyuruBasligi(event);
 if(!baslik||baslik.length<25)return null;
 if(GUNDEM_YANIT.test(String(event.title||'')))return null;
 const f=fold(String(event.title||''));
 if(!f)return null;
 if(GUNDEM_REKLAM.test(f)||GUNDEM_SIYASI.test(f)||GUNDEM_HASSAS.test(f))return null;
 if(/\b(?:iptal edildi|yalanlandi|yapilmadi|gerceklesmedi)\b/.test(f))return null;
 const resmi=GUNDEM_RESMI.test(fold(event.sourceName||''));
 if(!(GUNDEM_OLAY.test(f)||GUNDEM_HAVA.test(f)||resmi))return null;
 const ozet=duyuruOzeti(event,baslik);
 const hedefler=[];
 if(GUNDEM_HAVA.test(f))hedefler.push(['district_emergency_coordination','UMR_AFET']);
 if(GUNDEM_EGITIM.test(f))hedefler.push(['education_service_access','UMR_ILCE_MEM']);
 hedefler.push(['district_coordination','UMR_BELEDIYE']);
 const tasks=[];
 for(const[topic,institution]of hedefler){
  if(!approvals.approvedInstitutions.includes(institution)||!approvals.approvedTopics.includes(topic))continue;
  if(!approvals.grants.some(g=>g.institution===institution&&g.topic===topic&&g.granted))continue;

  const key=createHash('sha256').update(JSON.stringify([event.eventIdentity||event.id,topic,institution])).digest('hex');
  tasks.push({key,issueKey:key,topic,institution,title:baslik,summary:ozet||baslik,locality:{district:'Ümraniye',precision:'district',neighborhood:null},risk:'normal',sourceEventId:event.id,legacyTopic:topic});
 }
 return tasks.length?tasks:null;
}
export function fallbackDecision(event,snapshot){
 const approvals=approvalSnapshot(snapshot),rules=[];
 for(const topic of snapshot.topics){
  if(topic.sensitivity!=='ordinary'||!approvals.approvedTopics.includes(topic.code)||!terms[topic.code]?.length)continue;
  const granted=approvals.grants.filter(g=>g.topic===topic.code&&approvals.approvedInstitutions.includes(g.institution)).map(g=>g.institution);
  const candidates=fixed[topic.code]||[...new Set(granted)];
  // Multiple owners without an explicit joint mapping remain unassigned.
  if(!fixed[topic.code]&&candidates.length!==1)continue;
  const extra={street_cleanliness:['yaprakların toplanmaması','yaprakların toplanmamasından','sokak temizlenmiyor'],illegal_dumping_public_space:['moloz ve çöp döküldü','moloz döküldü','çöp döküldü']};
  const patterns=[...(terms[topic.code]||[]),...(extra[topic.code]||[])].filter(p=>!['iski','ayedas','igdas','iett','metro istanbul','emniyet','belediye'].includes(p)&&!(topic.code==='municipal_roadside_asset'&&['yikim','insaat'].includes(p)));
  const problemPatterns=topic.code==='municipal_roadside_asset'?['\\b(?:kirik|bozuk|cukur|coktu|isgal|engel|onarim|bakim|yapilmiyor|kapandi|kapanmis|kilitlen)[a-z]*\\b']:undefined;
  rules.push({problemPatterns,code:topic.code,title:topic.display_name,family:'existing_approved',subcategory:topic.display_name,patterns,requireProblem:true,panelCandidates:candidates,serviceAuthority:candidates,mandateVerified:false,risk:'normal',sensitivity:'ordinary'});
 }
 const normal=analyze(event,{rules,...approvals});
 if(['football','advertisement'].includes(normal.reason))return normal;
 const kb=kurumsalBilgiKurali(event);
 const bilgi=kb?analyze(event,{rules:[kb],...approvals}):null;
 const social=socialInformation(event,snapshot);
 const tasks=[...new Map([...(normal.tasks||[]),...(bilgi?.tasks||[]),...(social?.tasks||[])].map(t=>[t.institution+'|'+t.topic,t])).values()];
 if(!tasks.length)tasks.push(...(yerelGundemKurali(event,approvals)||[]));
 return tasks.length?{...normal,tasks,status:'shadow_candidates',reason:'approved_panel_candidates'}:normal;
}
