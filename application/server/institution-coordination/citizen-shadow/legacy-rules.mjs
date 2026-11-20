import{readFileSync}from'node:fs';import{analyze}from'./engine.mjs';import{approvalSnapshot}from'./integration.mjs';
// Existing approved topics use the SAME language, location and privacy engine.
// Broad legacy phrases are a fallback only; never a second parallel decision.
const terms=JSON.parse(readFileSync(new URL('../kurum/topic-terms.json',import.meta.url),'utf8')).konular||{};
export const legacyCodes=new Set(Object.keys(terms));
const fixed={bus_service_disruption:['UMR_BELEDIYE'],bus_stop_infrastructure:['UMR_BELEDIYE'],metro_service_disruption:['UMR_BELEDIYE'],metro_station_infrastructure:['UMR_BELEDIYE'],ibb_road_maintenance:['UMR_BELEDIYE'],animal_health_public_agriculture:['UMR_BELEDIYE','UMR_ILCE_TARIM'],urban_animal_welfare:['UMR_BELEDIYE','UMR_ILCE_TARIM'],traffic_safety:['UMR_BELEDIYE','UMR_EMNIYET']};
export function fallbackDecision(event,snapshot){
 const approvals=approvalSnapshot(snapshot),rules=[];
 for(const topic of snapshot.topics){
  if(topic.sensitivity!=='ordinary'||!approvals.approvedTopics.includes(topic.code)||!terms[topic.code]?.length)continue;
  const granted=approvals.grants.filter(g=>g.topic===topic.code&&approvals.approvedInstitutions.includes(g.institution)).map(g=>g.institution);
  const candidates=fixed[topic.code]||[...new Set(granted)];
  // Multiple owners without an explicit joint mapping remain unassigned.
  if(!fixed[topic.code]&&candidates.length!==1)continue;
  const patterns=terms[topic.code].filter(p=>!['iski','ayedas','igdas','iett','metro istanbul','emniyet','belediye'].includes(p));
  rules.push({code:topic.code,title:topic.display_name,family:'existing_approved',subcategory:topic.display_name,patterns,requireProblem:true,panelCandidates:candidates,serviceAuthority:candidates,mandateVerified:false,risk:'normal',sensitivity:'ordinary'});
 }
 return analyze(event,{rules,...approvals});
}
