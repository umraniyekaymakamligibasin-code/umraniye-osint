import{canonicalSource,validPublication}from'../citizen-shadow/source-url.mjs';
// The caller must first resolve the existing tenant membership and case grant.
export function publicEventProjection(c,e){
 if(!e||typeof e!=='object'||e.id!==c.source_event_id)return null;
 const body=String(e.fullText||e.description||e.text||''),title=String(e.title||body.split(/\r?\n/)[0]||c.title||'').slice(0,240);
 return{available:true,title,text:body,publishedAt:validPublication(e.publishedAt)||null,url:canonicalSource(e.url),sourceEventId:e.id};
}
