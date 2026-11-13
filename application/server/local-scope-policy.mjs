import {sourceNeighborhoodContext} from './social-source-context.mjs';
import {analyzeGeoText,outsideLocalScope,geoNormalize} from './geo-dictionary.mjs';
function assessLocalScope(event){
 if(event.nationalCritical||['national','unrelated'].includes(event.scope))return {local:false,state:'outside',reason:'classified_nonlocal'};
 const title=String(event.title||''),body=String(event.fullText||event.description||'').split(/ilgili haberler|benzer haberler|diğer haberler|diger haberler|related news|ümraniye haberleri|umraniye haberleri|son dakika yerel gelişmeler/i)[0].slice(0,1400),lead={...event,title,fullText:body,description:body};
 if(outsideLocalScope(lead))return {local:false,state:'outside',reason:'explicit_other_location'};
 const normalized=geoNormalize(title+' '+body),geo=analyzeGeoText(title+' '+body);
 if(/\bumraniye\s*(?:de|da)?\s*(?:degil|olmadi|yasanmadi)\b/.test(geoNormalize(title)))return {local:false,state:'outside',reason:'explicit_local_denial'};
 const heading=geoNormalize(title);if(/\b(?:umraniye|dudullu)\b/.test(heading)&&/yangin|kaza|patlama|saldiri|silah|cinayet|gocuk|coktu/.test(heading)&&!geo.localContextEstablished&&analyzeGeoText(heading.replace(/\b(?:umraniye|dudullu)\b/g,' ')).explicitOutsideDistrict)return {local:true,state:'local',reason:'cross_district_relation_unverified_location'};
 if(/\b(?:umraniye|dudullu)(?:de|da|den|dan|nin|nun|ye|ya|li(?:ler(?:in|den|e|de)?|nin|ye)?|lu(?:lar(?:in|dan|a|da)?|nun|ya)?|deki|daki|miz(?:in|de|den|e|i)?)?\b/.test(normalized)||geo.localCandidate)return {local:true,state:'local',reason:'explicit_district_context'};
 if(sourceNeighborhoodContext(event))return {local:true,state:'local',reason:'source_neighborhood_inference_unverified'};
 if(event.locationVerified===true)return {local:true,state:'local',reason:'existing_verified_location'};
 if(event.institutionalContext===true||event.institutionalReference)return {local:true,state:'local',reason:'institutional_relationship_unverified_location'};
 return {local:false,state:'review',reason:'district_context_missing'};
}
const scopeCache=new WeakMap();
export function localScopeAssessment(event){
 if(!event||typeof event!=='object')return {local:false,state:'review',reason:'district_context_missing'};
 const signature=[event.title,event.fullText||event.description,event.scope,!!event.nationalCritical,event.locationVerified===true,event.institutionalContext===true,!!event.institutionalReference],old=scopeCache.get(event);
 if(old&&Date.now()-old.at<5000&&signature.every((value,index)=>value===old.signature[index]))return old.value;
 const value=assessLocalScope(event);scopeCache.set(event,{signature,value,at:Date.now()});return value;
}
export function applyLocalScopeSafety(event){
 if(event.nationalCritical||event.scope==='national')return {...event,policePriority:false};
 const assessment=localScopeAssessment(event);if(assessment.reason==='source_neighborhood_inference_unverified')return {...event,locationStatus:'local_indicated',locationVerified:false,priorityLevel:'P3',notificationEligible:false,criticalAlert:false,policePriority:false};if(assessment.local&&!['institutional_relationship_unverified_location','cross_district_relation_unverified_location'].includes(assessment.reason))return event;
 return {...event,districtScope:assessment.state,scopeAssessment:assessment,locationStatus:'review_required',locationVerified:false,priorityLevel:'P3',notificationEligible:false,criticalAlert:false,policePriority:false,priorityExplanation:'İlçe ilişkisi doğrulanmadı; inceleme gerekli'};
}
