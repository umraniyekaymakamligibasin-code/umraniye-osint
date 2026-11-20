import{fold}from'./language.mjs';
// Location claim evidence is not independently verified ground truth.
export function deriveLocality(event){
 if(event.locality?.verified===true&&event.locality.district==='Ümraniye')return event.locality;
 if(event.locationVerified===true&&event.districtScope==='local'&&!['review_required','local_indicated'].includes(event.locationStatus))return{district:'Ümraniye',precision:'district',verified:true,evidence:'legacy_verified'};
 const text=fold(event.fullText||event.description||event.title||'');
 if(/\b(ankara|izmir|kadikoy|uskudar|atasehir|beykoz|sancaktepe|cekmekoy|pendik|kartal)(?:da|de|dan|den|daki|deki)?\b/.test(text))return null;
 if(/\b(guzergah|sefer|umraniye beykoz|beykoz umraniye|umraniye kavacik|kavacik umraniye)\b/.test(text))return null;
 const located=/\bumraniye (?:de|ilcesinde|ilcesi sinirlarinda)\b|\bumraniyede\b/.exec(text);
 if(!located)return null;
 return{district:'Ümraniye',precision:'district',verified:false,routingEligible:true,evidence:'explicit_district_statement',evidenceRange:[located.index,located.index+located[0].length]};
}
