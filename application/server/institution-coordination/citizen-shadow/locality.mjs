import{fold}from'./language.mjs';
import{analyzeGeoText}from'../../geo-dictionary.mjs';
import seed from'../../geo-dictionary-data.mjs';
const names=[...new Set(seed.records.flatMap(r=>r.mahalle).map(fold))].sort((a,b)=>b.length-a.length);
const neighborhoodAddress=new RegExp('\\bumraniye (?:'+names.join('|')+')(?: meydan avm| avm)?(?: (?:ta|te|da|de|bolgesinde|bolgesindeki)|(?:da|de))\\b');
// Location claim evidence is not independently verified ground truth.
export function deriveLocality(event){
 if(event.locality?.verified===true&&event.locality.district==='Ümraniye')return event.locality;
 if(event.locationVerified===true&&event.districtScope==='local'&&!['review_required','local_indicated'].includes(event.locationStatus))return{district:'Ümraniye',precision:'district',verified:true,evidence:'legacy_verified'};
 const raw=[event.title,event.fullText||event.description].filter(Boolean).join('\n');const text=fold(raw);
 if(/\b(ankara|izmir|kadikoy|uskudar|atasehir|beykoz|sancaktepe|cekmekoy|pendik|kartal)(?:da|de|dan|den|daki|deki)?\b/.test(text))return null;
 if(/\b(umraniye beykoz|beykoz umraniye|umraniye kavacik|kavacik umraniye)\b/.test(text))return null;
 const located=/\bumraniye (?:de|ilcesinde|ilcesi sinirlarinda)\b|\bumraniyede\b|\bumraniye (?:[a-z]+ ){1,4}(?:mahallesi(?:nde| nde| sinirlarinda)?|mah|mh)\b|\bistanbul umraniye (?:[a-z]+ ){1,4}(?:caddesi|sokagi)\b|\bumraniye istanbul\b/.exec(text);
 const neighborhood=neighborhoodAddress.exec(text);
 const header=/(?:^|\n)\s*Ümraniye\s*:/iu.test(raw);
 if(located||neighborhood||header){const hit=located||neighborhood;return{district:'Ümraniye',precision:'district',verified:false,routingEligible:true,evidence:'explicit_district_statement',...(hit?{evidenceRange:[hit.index,hit.index+hit[0].length]}:{})};}
 // A street name alone is insufficient: require its independent neighborhood
 // in the same bounded address context from the existing sourced dictionary.
 const geo=analyzeGeoText(raw);
 if(!geo.explicitOutsideDistrict&&geo.matches.some(m=>!m.otherDistrict&&!m.neighborhoodConflict&&m.matchedNeighborhoods.length))return{district:'Ümraniye',precision:'district',verified:false,routingEligible:true,evidence:'dictionary_address_statement'};
 return null;
}
