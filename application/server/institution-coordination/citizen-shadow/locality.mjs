import{fold}from'./language.mjs';
import{analyzeGeoText}from'../../geo-dictionary.mjs';
import seed from'../../geo-dictionary-data.mjs';
import{localityCikar as klasikLocality}from'../kurum/locality.mjs';
const names=[...new Set(seed.records.flatMap(r=>r.mahalle).map(fold))].sort((a,b)=>b.length-a.length);
const neighborhoodAddress=new RegExp('\\bumraniye (?:'+names.join('|')+')(?: meydan avm| avm)?(?: (?:ta|te|da|de|bolgesinde|bolgesindeki)|(?:da|de))\\b');
// Ilce gorevlilerinin resmi hesaplari: kaynak adinda "Umraniye" gecmese de
// ilce kaniti sayilir. Liste dar tutulur; yalniz dogrulanmis ilce hesaplari.
export const RESMI_HESAPLAR=new Set(['yukselcelikmia','tc_umraniye','umraniyeilcemem']);
// Location claim evidence is not independently verified ground truth.
// A transit line's proper name spans districts; it is not an incident location
// in those other districts. Separate explicit outside locations still win.
export function localityConflictText(value){return fold(value).replace(/\bumraniye (?:atasehir )?goztepe\b/g,'umraniye metro hatti');}
export function explicitLocalIncidentClauses(value){
 return String(value||'').split(/[.!?;\n]+/u).filter(c=>{const t=localityConflictText(c);return /\bumraniye(?:de| de| deki| ilcesinde)\b/.test(t)&&/\b(?:oldurul[a-z]*|cinayet[a-z]*|silahli saldiri[a-z]*|hirsiz[a-z]*|kaza[a-z]*|yangin[a-z]*)\b/.test(t)&&!/\b(?:ankara|izmir|kadikoy|uskudar|atasehir|beykoz|sancaktepe|cekmekoy|pendik|kartal)(?:da|de|dan|den|daki|deki)?\b/.test(t);});
}
export function deriveLocality(event){
 if(event.locality?.verified===true&&event.locality.district==='Ümraniye')return event.locality;
 if(event.locationVerified===true&&event.districtScope==='local'&&!['review_required','local_indicated'].includes(event.locationStatus))return{district:'Ümraniye',precision:'district',verified:true,evidence:'legacy_verified'};
 // Kaynak adi / yapisal alan kaniti: eski, olculmus yerellik motoru.
 // Boylece "Umraniye Kaymakamligi" gibi kaynaklarda metinde ilce adi
 // gecmeyen yerel haberler locality_unverified diye kaybolmaz.
 let sourceAuthor='';try{const u=new URL(event.url);if(['x.com','www.x.com','twitter.com','www.twitter.com'].includes(u.hostname))sourceAuthor=u.pathname.split('/')[1].toLowerCase();}catch{}
 const resmiHesap=RESMI_HESAPLAR.has(sourceAuthor);
 const sourceFold=fold(event.sourceName||'');
 const resmiKaynak=/\bumraniye (?:kaymakamligi|ilce milli egitim)\b/.test(sourceFold);
 const klasik=(resmiHesap||resmiKaynak)?klasikLocality(resmiHesap?{...event,sourceName:[event.sourceName,'Ümraniye'].filter(Boolean).join(' ')}:event):null;
 const raw=[event.title,event.fullText||event.description].filter(Boolean).join('\n');const originalText=fold(raw),text=localityConflictText(raw);
 const localLine=/\bumraniye (?:atasehir )?goztepe\b/.test(originalText)&&/\b(?:metro|metrosu|metrosunun|hatti|hattinin|istasyonu)\b/.test(originalText);
 if(/\b(ankara|izmir|kadikoy|uskudar|atasehir|beykoz|sancaktepe|cekmekoy|pendik|kartal)(?:da|de|dan|den|daki|deki)?\b/.test(text)){
  if(explicitLocalIncidentClauses(raw).length)return{district:'Ümraniye',precision:'district',verified:false,routingEligible:true,evidence:'explicit_local_incident_clauses'};
  return null;
 }
 if(/\b(umraniye beykoz|beykoz umraniye|umraniye kavacik|kavacik umraniye)\b/.test(text))return null;
 if(klasik?.district==='Ümraniye'&&klasik.verified===true&&['district','neighborhood'].includes(klasik.precision))return{district:'Ümraniye',precision:klasik.precision,neighborhood:klasik.neighborhood??null,verified:true,routingEligible:true,evidence:'official_source_scope'};
 if(/\bumraniye belediyesi istihdam merkezi\b/.test(originalText)||/\bumraniye belediyesine tesekkur\b/.test(originalText))return{district:'Ümraniye',precision:'district',verified:false,routingEligible:true,evidence:'institution_service_scope'};
 if(/\bumraniye (?:[0-9]+ )?kitap fuari[a-z]*\b/.test(originalText))return{district:'Ümraniye',precision:'district',verified:false,routingEligible:true,evidence:'named_district_event'};
 if(/\bumraniye (?:devlet|egitim ve arastirma) hastanesi[a-z]*\b/.test(originalText))return{district:'Ümraniye',precision:'district',verified:false,routingEligible:true,evidence:'named_district_health_facility'};
 if(/\b(?:asagi ?dudullu|yukari ?dudullu) mahallesi[a-z]*\b.{0,100}\b(?:sokak|sokagi|caddesi)\b/.test(originalText))return{district:'Ümraniye',precision:'district',verified:false,routingEligible:true,evidence:'dictionary_address_statement'};
 if(localLine)return{district:'Ümraniye',precision:'district',verified:false,routingEligible:true,evidence:'metropolitan_line_scope'};
 const located=/\bumraniye (?:de|deki|ilcesinde|ilcesi sinirlarinda)\b|\bumraniyede\b|\bumraniye (?:[a-z]+ ){1,4}(?:mahallesi(?:nde| nde| sinirlarinda)?|mah|mh)\b|\bistanbul umraniye (?:[a-z]+ ){1,4}(?:caddesi|sokagi)\b|\bumraniye istanbul\b/.exec(text);
 const neighborhood=neighborhoodAddress.exec(text);
 const namedLocalPlace=/\bumraniye (?:metro istasyonunda|metro istasyonundaki|oto sanayi de|oto sanayide|sanayi sitesinde)\b/.exec(text);
 const header=/(?:^|\n)\s*Ümraniye\s*:/iu.test(raw);
 if(located||neighborhood||header||namedLocalPlace){const hit=located||neighborhood||namedLocalPlace;return{district:'Ümraniye',precision:'district',verified:false,routingEligible:true,evidence:'explicit_district_statement',...(hit?{evidenceRange:[hit.index,hit.index+hit[0].length]}:{})};}
 // A street name alone is insufficient: require its independent neighborhood
 // in the same bounded address context from the existing sourced dictionary.
 const geo=analyzeGeoText(raw);
 if(!geo.explicitOutsideDistrict&&geo.matches.some(m=>!m.otherDistrict&&!m.neighborhoodConflict&&m.matchedNeighborhoods.length))return{district:'Ümraniye',precision:'district',verified:false,routingEligible:true,evidence:'dictionary_address_statement'};
 return null;
}
