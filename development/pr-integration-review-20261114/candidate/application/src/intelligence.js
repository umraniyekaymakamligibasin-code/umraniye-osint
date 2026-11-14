import {analyzeGeoText,geoLocationFields,outsideLocalScope} from '../server/geo-dictionary.mjs';
// Deterministic screening, not factual verification or an AI decision.
const priorityFold=s=>String(s||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll('ı','i');
export function publicationTime(value,now=Date.now()){
 const raw=typeof value==='string'?value.trim():'';
 if(!raw)return {publishedAt:null,precision:'unknown',reason:'Yayın tarihi bulunamadı'};
 if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
  const d=new Date(raw+'T00:00:00Z');
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'}).format(new Date(now));
  if(raw>today)return {publishedAt:null,precision:'unknown',reason:'Gelecek tarihli yayın'};
  return Number.isFinite(+d)&&d.toISOString().slice(0,10)===raw?{publishedAt:raw,precision:'day',reason:'Kaynak saat belirtmemiş'}:{publishedAt:null,precision:'unknown',reason:'Geçersiz takvim tarihi'};
 }
 // Never infer a zone from the execution host. Explicit ISO zone or RFC feed zone is required.
 const iso=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/i.test(raw);
 const rfc=/(?:\b(?:GMT|UTC)|[+-]\d{4})\s*$/i.test(raw);
 const ms=(iso||rfc)?Date.parse(raw):NaN;
 if(!Number.isFinite(ms))return {publishedAt:null,precision:'unknown',reason:'Geçersiz tarih veya saat dilimi eksik'};
 if(iso){const day=raw.slice(0,10),d=new Date(day+'T00:00:00Z'),parts=raw.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/i),offset=raw.match(/([+-])(\d{2}):(\d{2})$/);if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==day||Number(parts[1])>23||Number(parts[2])>59||Number(parts[3]||0)>59||offset&&(Number(offset[2])>14||Number(offset[3])>59||Number(offset[2])===14&&Number(offset[3])!==0))return {publishedAt:null,precision:'unknown',reason:'Geçersiz takvim tarihi veya saat'};}
 if(rfc){const m=raw.match(/(?:^|\s)(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/i);if(!m)return {publishedAt:null,precision:'unknown',reason:'Belirsiz RSS tarih biçimi'};const month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[2].toLowerCase()),check=new Date(Date.UTC(Number(m[3]),month,Number(m[1])));if(check.getUTCMonth()!==month||Number(m[4])>23||Number(m[5])>59||Number(m[6]||0)>59)return {publishedAt:null,precision:'unknown',reason:'Geçersiz RSS takvim tarihi'};}
 if(ms>now+300000)return {publishedAt:null,precision:'unknown',reason:'Gelecek zamanlı yayın; inceleme gerekli'};
 return {publishedAt:new Date(ms).toISOString(),precision:'instant',reason:'Kaynağın saat dilimi korundu'};
}
export function districtPriorityEligible(event,knownGeo){
 if(['national','unrelated'].includes(event.scope))return false;
 const text=priorityFold(event.title+' '+(event.fullText||event.description||'')),geo=knownGeo||analyzeGeoText(event.title+' '+(event.fullText||event.description||''));
 if(geo.outsideDistrict||outsideLocalScope(event)||event.locationStatus==='review_required'||event.verificationStatus==='review_required'||geo.matches.length&&!geo.localContextEstablished)return false;
 return event.scope==='local'||geo.localContextEstablished||/\b(?:umraniye|dudullu|ihlamurkuyu|elmalikent|armaganevler|yamanevler)(?:deki|daki|den|dan|nin|nun|de|da|ye|ya|li)?\b/.test(text);
}
export function prioritize(event,now=Date.now()){
 const geo=analyzeGeoText(event.title+' '+(event.fullText||event.description||'')),geoFields=geoLocationFields(geo);

 const text=priorityFold(event.title+' '+(event.description||'')),time=publicationTime(event.publishedAt,now);
 const routine=/tatbikat|deprem tahmini|anma toreni|yil donumu|belgesel|film cekimi|gecmis olsun ziyareti/.test(text);
 const followup=/cenaze|topraga verildi|anma|dava|iddianame|yargilama|gecen yil|yillar once/.test(text)||event.nationalUrgent===false;
 const negated=/patlama (olmadi|yok)|yangin (yok|cikmadi)|ihbar\w* asilsiz|saldiri (olmadi|yok)/.test(text);
 const incident=/patlama|silahli saldiri|teror saldirisi|helikopter.{0,35}(kaza|dust|kayip)|ucak.{0,35}(kaza|dust)|sehit|gocuk|(?:bina|balkon).{0,20}cok|cok(?:en|tu|mus|me|uyor|mesi).{0,24}(?:bina|balkon)|can kaybi|hayatini kaybet|deprem/.test(text);
 const local=districtPriorityEligible(event,geo);
 const impact=event.nationalCritical===true||/sehit|cok sayida|kitlesel|tahliye|can kaybi|hayatini kaybet|[3-9]\s*(kisi|isci|vatandas).{0,15}(oldu|yaralandi)|(?:[3-9]|[1-9]\d+)\s*(?:emekci|kardes|calisan|isci|kisi|vatandas)[a-z]*.{0,45}yaralan[a-z]*/.test(text);
 let level='P4',reason='Rutin bilgilendirme; olağan takip';
 if(!routine&&!negated&&!followup&&incident&&impact&&local){level='P1';reason='Yüksek etki işareti ve olay bağlamı; acil insan incelemesi';}
 else if(!routine&&!negated&&(incident||/yangin|\bkaza(?:si|sinda|sini|sinin|siyla|ya|yi|lar|lari|larda|larinda)?\b|kayip|su baskini|elektrik kesintisi|dogalgaz|siddet|el bombasi|yumruk|silahli|(?:minibus|kamyon).{0,25}carp|trafo.{0,20}patla/.test(text))&&(local||event.nationalCritical)){level='P2';reason=followup?'Kritik olayın devam haberi; yeni acil olay sayılmaz':'Yerel güvenlik veya hizmet riski; kısa sürede inceleme';}
 else if(local&&/kaymakam|belediye|baskan|ulasim|egitim|saglik|duyuru|ihale|toplanti/.test(text)){level='P3';reason='Kurum veya ilçe gündemi; planlı takip';}
 const age=time.precision==='instant'?now-Date.parse(time.publishedAt):Infinity;
 if((level==='P1'||level==='P2')&&(time.precision!=='instant'||age>6*3600000)){level='P3';reason='Olay işareti var; yayin 6 saatten eski veya saat kesin degil, acil bildirim disi';}
 if(geo.matches.length&&!geo.localContextEstablished&&['P1','P2'].includes(level)){level='P3';reason='Konum sözlüğü eşleşti; ilçe/mahalle bağlamı için inceleme gerekli';}
 return {...geoFields,priorityLevel:level,priorityExplanation:reason,priorityVersion:'rules-3-district-p1',districtPriorityEligible:local,incidentSeverity:!routine&&!negated&&incident&&impact&&local?'high_signal':!routine&&!negated&&incident&&local?'incident_signal':'not_classified',historicalPost:time.precision==='instant'&&age>6*3600000,verification:'Kaynak bildirimi; insan teyidi gerekli',datePrecision:time.precision,dateWarning:time.reason,notificationEligible:local&&(!geo.matches.length||geo.localContextEstablished)&&event.notificationEligible!==false&&!routine&&!negated&&!followup&&time.precision==='instant'&&age>=-300000&&age<=3600000&&['P1','P2'].includes(level)};
}
export function turkeyTime(value){if(!value)return 'Tarih bilinmiyor';if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value+' · Saat belirtilmemiş';return new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));}
