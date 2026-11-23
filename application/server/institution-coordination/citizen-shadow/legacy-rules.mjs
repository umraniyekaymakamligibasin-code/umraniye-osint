import{createHash}from'node:crypto';
import{readFileSync}from'node:fs';import{analyze}from'./engine.mjs';import{fold}from'./language.mjs';import{approvalSnapshot}from'./integration.mjs';
import{RESMI_HESAPLAR}from'./locality.mjs';
// Existing approved topics use the SAME language, location and privacy engine.
// Broad legacy phrases are a fallback only; never a second parallel decision.
const terms=JSON.parse(readFileSync(new URL('../kurum/topic-terms.json',import.meta.url),'utf8')).konular||{};
export const legacyCodes=new Set(Object.keys(terms));
const fixed={street_cleanliness:['UMR_BELEDIYE'],illegal_dumping_public_space:['UMR_BELEDIYE'],waste_container:['UMR_BELEDIYE'],parks_public_space:['UMR_BELEDIYE'],bus_service_disruption:['IETT','UMR_BELEDIYE'],bus_stop_infrastructure:['IETT','UMR_BELEDIYE'],metro_service_disruption:['METRO_ISTANBUL'],metro_station_infrastructure:['METRO_ISTANBUL'],ibb_road_maintenance:['UMR_BELEDIYE'],animal_health_public_agriculture:['UMR_BELEDIYE','UMR_ILCE_TARIM'],urban_animal_welfare:['UMR_BELEDIYE','UMR_ILCE_TARIM'],traffic_safety:['UMR_BELEDIYE','UMR_EMNIYET']};

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
 if(!baslikFold)return null;
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
 const approvals=approvalSnapshot(state),text=fold([event.title,event.fullText||event.description].filter(Boolean).join(' '));
 if(event.locality?.district!=='Ümraniye'||!(event.locality.verified||event.locality.routingEligible))return null;
 const candidates=[];
 if(/(?:bayragin golgesinde|egitime destek platformu|ogrenci meclisi|ogretmenler gunu|okul ziyareti|egitim ogretim)/.test(text))candidates.push(['education_service_access','UMR_ILCE_MEM']);
 if(/(?:ilce emniyet mudurlugunce|emniyet mudurlugu ekip|huzur ve guven icin|asayis uygulamasi|gozaltina alindi|tutuklandi)/.test(text))candidates.push(['public_safety','UMR_EMNIYET']);
 if(/(?:siddetli ruzgar uyarisi|firtina uyarisi|firtinali ruzgar)/.test(text))candidates.push(['storm_damage','UMR_AFET']);
 if(/(?:istihdam merkezi|is basvurusu|kariyer gunleri)/.test(text)&&/belediye/.test(text))candidates.push(['employment_service_access','UMR_BELEDIYE'],['employment_service_access','UMR_ISKUR']);
 if(/(?:kitap fuari|kutuphane acilisi)/.test(text))candidates.push(['municipal_service_access','UMR_BELEDIYE']);
 if(/(?:durak|merdiven)/.test(text)&&/(?:merdiven yapan|durak yapimi|durak yenilendi)/.test(text))candidates.push(['bus_stop_infrastructure','IETT'],['bus_stop_infrastructure','UMR_BELEDIYE']);
 if(!candidates.length)return null;
 const tasks=[];
 for(const[topic,institution]of candidates){
  if(!approvals.approvedInstitutions.includes(institution)||!approvals.approvedTopics.includes(topic)||!approvals.grants.some(g=>g.institution===institution&&g.topic===topic&&g.granted))continue;
  const key=createHash('sha256').update(JSON.stringify([event.eventIdentity||event.id,topic,institution])).digest('hex');
  tasks.push({key,issueKey:key,topic,institution,title:event.title||'Kurum bilgilendirmesi',summary:String(event.fullText||event.description||event.title).slice(0,6000),locality:{district:'Ümraniye',precision:'district',neighborhood:null},risk:'normal',sourceEventId:event.id});
 }
 return tasks.length?{mode:'shadow',eventId:event.id,tasks,issues:[],status:'shadow_candidates',reason:'approved_panel_candidates'}:null;
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
  const patterns=[...(terms[topic.code]||[]),...(extra[topic.code]||[])].filter(p=>!['iski','ayedas','igdas','iett','metro istanbul','emniyet','belediye'].includes(p));
  rules.push({code:topic.code,title:topic.display_name,family:'existing_approved',subcategory:topic.display_name,patterns,requireProblem:true,panelCandidates:candidates,serviceAuthority:candidates,mandateVerified:false,risk:'normal',sensitivity:'ordinary'});
 }
 const normal=analyze(event,{rules,...approvals});
 if(normal.tasks.length)return normal;
 const kb=kurumsalBilgiKurali(event);
 if(!kb)return socialInformation(event,snapshot)||normal;
 const bilgi=analyze(event,{rules:[kb],...approvals});
 return bilgi.tasks.length?bilgi:socialInformation(event,snapshot)||normal;
}
