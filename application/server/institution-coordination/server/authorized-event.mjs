import{canonicalSource,validPublication}from'../citizen-shadow/source-url.mjs';
// The caller must first resolve the existing tenant membership and case grant.
export function publicEventProjection(c,e){
 if(!e||typeof e!=='object'||e.id!==c.source_event_id)return null;
 const body=String(e.fullText||e.description||e.text||''),title=String(e.title||body.split(/\r?\n/)[0]||c.title||'').slice(0,240);
 return{available:true,title,text:body,publishedAt:validPublication(e.publishedAt)||null,url:canonicalSource(e.url),sourceEventId:e.id};
}

// Use only after tenant membership and the case grant have been checked.
// Return requested event IDs only; snapshots never escape this boundary.
export async function loadAuthorizedSourceData(db,ids){
 const requested=new Set(ids.filter(id=>typeof id==='string'&&id));
 const found=new Map();if(!requested.size)return found;
 const rows=await db.prepare(`SELECT id,data FROM lab_items WHERE id IN (${[...requested].map(()=>'?').join(',')})`).bind(...requested).all();
 for(const row of rows?.results||[]){try{const e=JSON.parse(row.data);if(e&&e.id===row.id)found.set(row.id,row.data);}catch{}}
 if(found.size===requested.size)return found;
 const cache=await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='coord_source_content'").bind().first();
 if(cache){
  const missing=[...requested].filter(id=>!found.has(id));
  const retained=await db.prepare(`SELECT event_id,data FROM coord_source_content WHERE event_id IN (${missing.map(()=>'?').join(',')})`).bind(...missing).all();
  for(const row of retained?.results||[]){try{const e=JSON.parse(row.data);if(e&&e.id===row.event_id)found.set(row.event_id,row.data);}catch{}}
  if(found.size===requested.size)return found;
 }
 const hasSnapshots=await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='snapshots'").bind().first();
 if(!hasSnapshots)return found;
 const snapshots=await db.prepare('SELECT data FROM snapshots ORDER BY updated_at DESC').bind().all();
 for(const row of snapshots?.results||[]){
  let value;try{value=JSON.parse(row.data);}catch{continue;}
  if(!Array.isArray(value?.events))continue;
  for(const e of value.events){if(e&&requested.has(e.id)&&!found.has(e.id))found.set(e.id,JSON.stringify(e));}
  if(found.size===requested.size)break;
 }
 return found;
}
