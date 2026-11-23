import {createHash} from 'node:crypto';
import {catalog} from './catalog.mjs';
import {fold,clauseState,phrasesMatch as phraseMatch} from './language.mjs';
import{deriveLocality}from'./locality.mjs';
export {fold} from './language.mjs';
const digest=s=>createHash('sha256').update(s).digest('hex');
// Bounded Turkish suffix recognition; does not invent arbitrary stems.
export function analyze(event,{rules=catalog,approvedInstitutions=[],approvedTopics=[],grants=[],seenKeys=[],neighborhoodNames=[]}={}){
 const neighborhoods=new Map(neighborhoodNames.filter(n=>typeof n==='string').map(n=>[fold(n),n]));
 if(!event||typeof event!=='object')return {mode:'shadow',status:'skipped',reason:'invalid_event',tasks:[]};
 const raw=String(event.fullText||event.description||event.title||'').slice(0,64000);
 const text=fold(raw),base={mode:'shadow',eventId:event.id||null,tasks:[],issues:[],writeCount:0,notifications:[]};
 if(/umraniyespor/.test(text))return {...base,status:'excluded',reason:'football'};
 const incident=/yangin cikti|yaralandi|kavga cikti|silahli saldiri/.test(text);
 if(/senetli satis|vade farki|uygun fiyat|siparis|indirim kampanyasi/.test(text)&&!incident)return {...base,status:'excluded',reason:'advertisement'};
 const place=event.locality;
 const textEvidence=place?.routingEligible===true&&['explicit_district_statement','dictionary_address_statement'].includes(place?.evidence);
 if(place?.district!=='Ümraniye'||!(place.verified===true||textEvidence)||!['district','neighborhood'].includes(place.precision))return {...base,status:'skipped',reason:'locality_unverified'};
 if(/\b(?:ankara|kadikoy|uskudar|izmir|atasehir)(?:da|de|daki|deki)?\b/.test(text))return {...base,status:'skipped',reason:'conflicting_location'};
 const privacyText=text.replace(/hasta cagri|hasta haklari|hasta hayvan/g,'tesis hizmeti');
 const sensitive=Object.values(event.sensitivityFlags||{}).some(Boolean)||['restricted','high','special'].includes(event.sensitivity)||/\b\d{11}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:cocuk kimligi|cocugun adi|hasta|tani|tc kimlik|aile ici siddet|telefon numarasi|daire no|kapi no)\b|(?:\+90|0)[\s()-]*5\d{2}[\s()-]*\d{3}[\s()-]*\d{2}[\s()-]*\d{2}/.test(privacyText);
 const signatures=new Map(),codes=new Set();
 for(const rule of rules){if(codes.has(rule.code))return {...base,status:'skipped',reason:'rule_code_conflict'};codes.add(rule.code);for(const pattern of rule.patterns){const signature=fold(pattern),route=JSON.stringify([...rule.panelCandidates].sort());if(signatures.has(signature)&&signatures.get(signature)!==route)return {...base,status:'skipped',reason:'rule_authority_conflict'};signatures.set(signature,route);}}
 const clauses=raw.replace(/(?<=\d)[.,](?=\d)/g,':').replace(/\b(mah|mh|cad|cd|sk|sok)\./giu,'$1').split(/[.!?;\n]+|\s+ama\s+|\s+ancak\s+/iu).filter(Boolean);
 for(const rule of rules){if(rule.requireAll?.some(p=>!phraseMatch(raw,p)))continue;const matched=clauses.filter(c=>rule.patterns.some(p=>phraseMatch(c,p))||(rule.contextPatterns||[]).some(group=>group.every(pattern=>new RegExp(pattern).test(fold(c)))));if(!matched.length)continue;
  const active=matched.filter(c=>(!rule.requireProblem||/\b(?:ariza|kesinti|kesil|sizinti|patla|tasma|tasti|bozul|kirildi|tehlike|kacak|kaza|carpti|carpis|sorun|calismiyor|verilmiyor|yok|aksadi|magdur|sikayet|coktu|cop|atik|saldiri|dokuldu|toplanmama|temizlenmiyor)[a-z]*\b/.test(fold(c)))&&clauseState(c)==='active');
  if(!active.length){base.issues.push({code:rule.code,status:'skipped',reason:'negated_or_historical'});continue;}
 const key=digest(JSON.stringify([event.eventIdentity||event.canonicalEventId||event.id||event.url||digest(text),rule.code]));
  if(seenKeys.includes(key)){base.issues.push({code:rule.code,status:'duplicate',key});continue;}
  const minimized=rule.sensitiveHandling==='category_only'&&['CIT-FIRE-MINIMIZED-INCIDENT','CIT-POLICE-MINIMIZED-INCIDENT'].includes(rule.code);
  if((sensitive&&!minimized)||rule.sensitivity!=='ordinary'){base.issues.push({code:rule.code,status:'skipped',reason:'sensitive',key});continue;}
  if(!rule.panelCandidates.length){base.issues.push({code:rule.code,status:'skipped',reason:'authority_unknown',key});continue;}
  for(const institution of rule.panelCandidates){const taskKey=digest(key+'|'+institution);if(seenKeys.includes(taskKey)){base.issues.push({code:rule.code,institution,status:'duplicate',key:taskKey});continue;}const grant=grants.find(g=>g.institution===institution&&g.topic===rule.code&&g.granted===true&&g.approvalReference);
   if(!approvedInstitutions.includes(institution)||!approvedTopics.includes(rule.code)||!grant){base.issues.push({code:rule.code,institution,status:'skipped',reason:'scope_not_approved',key});continue;}
   const neighborhood=neighborhoods.get(fold(place.neighborhood))||null;
   base.tasks.push({key:digest(key+'|'+institution),issueKey:key,topic:rule.code,institution,panelRole:institution==='UMR_BELEDIYE'?'coordination':'review',serviceAuthority:rule.serviceAuthority,mandateVerified:rule.mandateVerified,title:rule.title,summary:minimized?'Kaynakta Ümraniye ile ilgili olay bildiriliyor. Bilgi bağımsız doğrulanmamıştır. Özgün paylaşım kaynaklar bölümünden incelenebilir.':(rule.taskSummary||`Ümraniye için ${rule.subcategory} kapsamında inceleme adayı.`),locality:{district:'Ümraniye',precision:!minimized&&neighborhood?'neighborhood':'district',neighborhood:minimized?null:neighborhood},limitedDisclosure:minimized,legacyTopic:rule.legacyTopic||null,risk:rule.risk,sourceEventId:event.id||null});
  }
 }
 base.tasks=[...new Map(base.tasks.map(t=>[t.key,t])).values()];
 return {...base,status:base.tasks.length?'shadow_candidates':'skipped',reason:base.tasks.length?'approved_panel_candidates':'no_eligible_task'};
}
