import {analyzeGeoText} from './geo-dictionary.mjs';
export const institutionalTerms=new Set(['kaymakam','kaymakamlık','kaymakamımız','yüksel çelik','ilçe idare şube başkanları','ilçe güvenlik','koordinasyon toplantısı','okul ziyareti','kurum ziyareti','muhtarlar toplantısı','halk günü','vatandaş buluşması','denetim','toplantı','ziyaret','açıklama','duyuru','tedbir','kamu düzeni'].map(v=>v.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i')));
export const fold=s=>String(s||'').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
const escaped=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const has=(t,s)=>new RegExp('(^|[^a-z0-9])'+escaped(fold(s))+"(?:['’]?(?:i|a|e|in|un|ini|ina|inde|inda|dan|den|lar|ler|lari|leri|da|de|ta|te|nin|nun|ye|ya|si|sinin|daki|deki))?(?=$|[^a-z0-9])").test(t);
export function analyzeFacebook(text,keywords,source,at,now=Date.now()){
 const geo=analyzeGeoText(text);
 const t=fold(text),matches=keywords.filter(k=>k.enabled&&has(t,k.term)),places=matches.filter(k=>k.group_name==='konum'),incidents=matches.filter(k=>k.group_name==='olay'&&!institutionalTerms.has(fold(k.term))),official=/^https:\/\/www\.facebook\.com\/umraniyekaymakamligi\/?$/.test(source.page_url||source.url||''),institutional=official&&matches.some(k=>k.group_name==='olay'&&institutionalTerms.has(fold(k.term)));
 const hasTopic=incidents.length>0||institutional;
 const neighborhood=places.filter(k=>fold(k.term)!=='umraniye').sort((a,b)=>b.term.length-a.term.length)[0]?.term||null;
 const explicit=/\bumraniye(?:['’]?(?:de|da|den|dan|nin|nun|ye|ya|deki|daki))?\b/.test(t),cross=/\b(kadikoy|uskudar|atasehir|beykoz|pendik|sancaktepe|cekmekoy|sultanbeyli|ankara|izmir|kavacik|gebze)\w*/.test(t);
 const historical=/\b(dun|gecen|arsiv|nostalji|evvel|haftanin ozeti|yillar once)\b|\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{1,2}\s+(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)\b/.test(t);
 const age=at&&Number.isFinite(Date.parse(at))?now-Date.parse(at):null,related=explicit||places.length>0||institutional||geo.localCandidate;
 const uncertain=(geo.matches.length>0&&!geo.localContextEstablished)||cross||historical||age===null||age< -60000||(!institutional&&!explicit&&(!neighborhood||!source.local_context));
 let classification=!hasTopic||!related||age!==null&&age>3600000?'ESKİ / İLGİSİZ / TEKRAR':uncertain?'İNCELEME GEREKLİ':'YENİ VE İLGİLİ';
 const kind=[['yangin',/\byangin\w*/],['trafik_kazasi',/trafik kazasi|\bkaza\w*/],['patlama',/\bpatlama\w*/],['silah',/silah sesi|silahli kavga/],['bicaklama',/\bbicaklama\w*/],['sel',/su baskini|\bsel\b/],['gocuk',/\bgocuk\w*/],['dogalgaz',/dogalgaz kacagi/],['deprem',/\bdeprem\w*/]].find(x=>x[1].test(t))?.[0]||null;
 const reasons=[];
 if(age!==null&&age>3600000)reasons.push('older_than_60_minutes');if(age===null)reasons.push('publication_time_unknown');if(age!==null&&age< -60000)reasons.push('future_publication');if(!hasTopic)reasons.push('no_incident_keyword');if(!related)reasons.push('no_locality');if(cross)reasons.push('other_district_reference');if(historical)reasons.push('historical_event_reference');if(!institutional&&!explicit&&(!neighborhood||!source.local_context)&&related)reasons.push('ambiguous_neighborhood');
 return {geo_dictionary:geo,institutional_context:institutional&&!incidents.length,reasons,matches,classification,locality:neighborhood|| (explicit?'Ümraniye':'Belirsiz'),neighborhood,incident_kind:kind||(institutional?'kurumsal':null),priority:classification==='YENİ VE İLGİLİ'&&!institutional?'P2':'P3',verification_status:uncertain?'review_required':'source_reported',event_at:null,event_time_status:historical?'historical_reference_review':'not_independently_verified',location_reason:cross?'other_district_reference':!explicit&&!source.local_context?'ambiguous_neighborhood':'source_text'};
}
const tokens=t=>new Set(fold(t).replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(s=>s.length>3&&!['umraniye','mahallesi','haber','sondakika','cikti','oldu','olay','ekipleri'].includes(s)));
export function relatedFacebook(a,b){
 if(!a.neighborhood||!b.neighborhood||fold(a.neighborhood)!==fold(b.neighborhood)||!a.incident_kind||a.incident_kind!==b.incident_kind)return false;
 if(!a.published_at||!b.published_at||Math.abs(Date.parse(a.published_at)-Date.parse(b.published_at))>5400000)return false;
 const x=tokens(a.text),y=tokens(b.text),shared=[...x].filter(t=>y.has(t)).length;
 const numbers=t=>fold(t).match(/\b\d{1,4}\b/g)||[];const an=numbers(a.text),bn=numbers(b.text);if(an.length&&bn.length&&!an.some(n=>bn.includes(n)))return false;
 return shared>=4&&shared/Math.max(1,Math.min(x.size,y.size))>=0.65;
}
