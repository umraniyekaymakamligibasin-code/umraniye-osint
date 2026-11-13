import{prioritize,publicationTime,turkeyTime,districtPriorityEligible}from './intelligence.mjs';
import {isUmraniyesporContent} from './filters/umraniyespor.mjs';
import{criticalNotification}from './critical-alerts.mjs';
import{createHash}from 'node:crypto';
const fold=s=>String(s||'').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
export function policeRelevant(e,eligible=districtPriorityEligible(e)){if(!eligible)return false;const t=fold(e.title+' '+(e.fullText||e.description||''));return /\b(?:emniyet mudurl\w*|polis(?:in|ler|leri|imiz|imizden|e|i)?|asayis|cinayet\w*|hirsiz\w*|soygun\w*|dolandir\w*|uyusturucu\w*|kacakcilik\w*|silahli|bicakli|bicaklama\w*|kavga\w*|darp\w*|gozalti\w*|tutukla\w*|supheli\w*|kayip cocuk|rehin\w*|trafik kazasi|trafik denetim\w*|cinsel saldiri|kadina siddet|teror\w*)\b/.test(t);}
export function deliveryDecision(e,now=Date.now(),{includeP2=true}={}){
 const p=prioritize(e,now),local=p.districtPriorityEligible===true,critical=criticalNotification(e,now),time=publicationTime(e.publishedAt,now),age=time.precision==='instant'?now-Date.parse(time.publishedAt):Infinity;
 const fresh=age>=-60000&&age<=3600000,review=e.locationStatus==='review_required'||p.locationStatus==='review_required'||e.verificationStatus==='review_required',blocked=e.notificationEligible===false||e.baseline===true||!!e.duplicateOf||!!e.institutionalReference||e.historicalEvent===true;
 const level=p.priorityLevel||e.priorityLevel||'P3',alert=local&&fresh&&!review&&!blocked&&!critical.suppressed&&(critical.eligible||((level==='P1'||level==='P2'&&includeP2)&&p.notificationEligible!==false));
 return{...p,priorityLevel:level,criticalAlert:alert&&critical.eligible,criticalCategory:critical.category||null,notificationEligible:alert,disableNotification:!alert,policePriority:policeRelevant(e,local),locationStatus:e.locationStatus||p.locationStatus||null,policyVersion:2};
}
export function enforceDistrictPriority(item){
 const local=districtPriorityEligible(item);
 return {...item,priorityLevel:!local&&item.priorityLevel==='P1'?'P3':item.priorityLevel,policePriority:policeRelevant(item,local),disableNotification:!local||item.disableNotification!==false,notificationEligible:local&&item.notificationEligible===true,criticalAlert:local&&item.criticalAlert===true,districtPriorityScope:local?'umraniye':'outside_or_unconfirmed'};
}
export function deliveryText(e){e=enforceDistrictPriority(e);const publication=/^\d{4}-\d{2}-\d{2}$/.test(e.publishedAt||'')?e.publishedAt+' · saat belirtilmemiş':e.publishedAt?turkeyTime(e.publishedAt)+' TSİ':'Tarih belirtilmemiş';return ['ÜMRANİYE OSINT · '+(e.priorityLevel||'P3')+' · '+(e.disableNotification?'Sessiz haber':'Öncelikli haber'),e.policePriority?'EMNİYET MÜDÜRLÜĞÜ ÖNCELİKLİ':null,String(e.title||'').slice(0,400),e.description?String(e.description).slice(0,1600):null,'Kaynak: '+String(e.sourceName||'Kaynak').slice(0,100),'Yayın: '+publication,e.locationStatus==='review_required'?'Konum doğrulaması gerekli':null,e.url].filter(Boolean).join('\n').slice(0,3800);}
export function deliveryReference(e){const stream=e.social||e.sourceId==='browser-research'||e.reviewOrigin?.startsWith('browser-')?'social':'news';return stream==='social'&&e.sourceId==='browser-research'?e.id:(e.url||e.sources?.[0]?.url||e.id);}
export function deliveryEvents(events){return events.filter(e=>!isUmraniyesporContent(e)).flatMap(e=>e.platform==='facebook'?[e]:e.sources?.length>1?e.sources.map(s=>({...e,...s,id:e.id+'-'+createHash('sha256').update(s.url||e.id).digest('hex').slice(0,12),sources:[s]})):[e]);}
