import{canonicalSource,validPublication}from'../citizen-shadow/source-url.mjs';
// The caller must first resolve the existing tenant membership and case grant.
export function publicEventProjection(c,e){
 if(!e||typeof e!=='object'||e.id!==c.source_event_id)return null;
 if(c.sensitivity!=='ordinary'||['CIT-POLICE-MINIMIZED-INCIDENT','CIT-FIRE-MINIMIZED-INCIDENT'].includes(c.code)||['restricted','high','special'].includes(e.sensitivity)||Object.values(e.sensitivityFlags||{}).some(Boolean))return null;
 const body=String(e.fullText||e.description||e.text||'').slice(0,64000),title=String(e.title||c.title||'').slice(0,240),text=title+' '+body;
 if(/\b\d{11}\b|(?:\+90|0)[\s()-]*5\d{2}[\s()-]*\d{3}[\s()-]*\d{2}[\s()-]*\d{2}|[\w.+-]+@[\w.-]+\.[a-z]{2,}|çocuğun adı|çocuk kimliği|tc kimlik|hasta tanısı|sağlık raporu|aile içi şiddet/iu.test(text))return null;
 return{available:true,title,text:body,publishedAt:validPublication(e.publishedAt)||null,url:canonicalSource(e.url),sourceEventId:e.id};
}
