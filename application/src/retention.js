export function retentionCutoff(now=Date.now()){
 const months=Math.max(1,Math.min(24,Number(process.env.OSINT_RETENTION_MONTHS||2)||2));
 const [year,month,date]=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'}).format(new Date(now)).split('-').map(Number),target=new Date(Date.UTC(year,month-1-months,1));
 const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();target.setUTCDate(Math.min(date,last));return target.toISOString().slice(0,10);
}
export function retainedEvent(event,cutoff=retentionCutoff()){
 const value=event.publishedAt;if(!value||!Number.isFinite(Date.parse(value)))return false;
 const day=/^\d{4}-\d{2}-\d{2}$/.test(value)?value:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'}).format(new Date(value));return day>=cutoff;
}
export function retainedEvents(events,cutoff=retentionCutoff()){
 return (events||[]).flatMap(e=>{if(!e.sources?.length)return retainedEvent(e,cutoff)?[e]:[];
  const sources=e.sources.map((s,i)=>({...s,publishedAt:s.publishedAt||((e.sources.length===1||i===0)?e.publishedAt:null)})).filter(s=>retainedEvent(s,cutoff));if(!sources.length)return [];
  const lead=retainedEvent(e,cutoff)?e:sources[0];return [{...e,...lead,id:e.id,sources}];
 });
}
function compactCaseEvent(e){return {scope:e.scope,nationalCritical:e.nationalCritical,nationalUrgent:e.nationalUrgent,nationalPhase:e.nationalPhase,nationalCategory:e.nationalCategory,nationalReason:e.nationalReason,nationalLocation:e.nationalLocation,id:e.id,relatedIds:e.relatedIds||[e.id],title:e.title,description:'Dosya arşivinde yalnız başlık ve kaynak bağlantıları saklanır.',topic:e.topic,neighborhood:e.neighborhood,publishedAt:e.publishedAt,collectedAt:e.collectedAt,evidence:e.evidence,caseArchive:true,sources:(e.sources||[]).map(s=>({sourceId:s.sourceId,sourceName:s.sourceName,sourceType:s.sourceType,title:s.title,url:s.url,publishedAt:s.publishedAt,collectedAt:s.collectedAt}))}}
function parseCaseEvent(value){try{const e=JSON.parse(value||'{}');return e.id?e:null}catch{return null}}
async function caseEvent(env,id){const row=await env.DB.prepare('SELECT event_data FROM case_records WHERE event_id=?').bind(id).first();return parseCaseEvent(row?.event_data)}
async function maintainRetention(env,now=Date.now()){
 if(!env?.DB)return;const cutoff=retentionCutoff(now),stamp='retention-v2-published-only:'+cutoff;
 const previous=await env.DB.prepare('SELECT data FROM workspace_settings WHERE id=?').bind('retention-state').first();if(previous?.data===stamp)return;
 const token=crypto.randomUUID(),lock=await env.DB.prepare('INSERT INTO refresh_locks(id,token,expires_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE refresh_locks.expires_at<=? RETURNING token').bind('retention',token,now+60000,now).first();if(!lock)return;
 try{
  const rows=(await env.DB.prepare('SELECT id,data FROM snapshots').all()).results,all=[...(INITIAL_DATA?.events||[])];for(const row of rows){try{all.push(...(JSON.parse(row.data).events||[]))}catch{}}
  const known=new Map(publicationRecords(all).flatMap(e=>(e.sources||[]).map(s=>[publicationKey(s),e])));
  const cases=(await env.DB.prepare("SELECT id,event_id FROM case_records WHERE event_data='{}'").all()).results;
  for(const c of cases){const e=all.find(e=>e.id===c.event_id||(e.relatedIds||[]).includes(c.event_id));if(e)await env.DB.prepare("UPDATE case_records SET event_data=? WHERE id=? AND event_data='{}'").bind(JSON.stringify(compactCaseEvent(e)),c.id).run()}
  let complete=true;
  for(const row of rows){let data;try{data=JSON.parse(row.data)}catch{continue}
   const publications=publicationRecords(data.events||[]).map(e=>{const match=e.sources?.[0]&&known.get(publicationKey(e.sources[0]));if(!match)return e;const publishedAt=e.publishedAt||match.publishedAt;return {...e,publishedAt,relatedIds:[...new Set([e.id,...(e.relatedIds||[]),match.id,...(match.relatedIds||[])])],sources:e.sources.map(s=>({...s,publishedAt:s.publishedAt||publishedAt}))}});
   const kept=retainedEvents(publications,cutoff);if(JSON.stringify(kept)===JSON.stringify(data.events||[]))continue;
   const result=await env.DB.prepare('UPDATE snapshots SET data=? WHERE id=? AND data=?').bind(JSON.stringify({...data,events:kept}),row.id,row.data).run();if(!result.meta?.changes)complete=false;
  }
  await env.DB.batch([
   env.DB.prepare('DELETE FROM alert_reads WHERE alert_id IN (SELECT id FROM alert_log WHERE substr(created_at,1,10)<?)').bind(cutoff),
   env.DB.prepare('DELETE FROM alert_log WHERE substr(created_at,1,10)<?').bind(cutoff),
   env.DB.prepare('DELETE FROM briefings WHERE date<?').bind(cutoff)
  ]);
  const briefs=(await env.DB.prepare('SELECT id,data FROM briefings').all()).results;
  for(const row of briefs){let data;try{data=JSON.parse(row.data)}catch{continue}const events=retainedEvents(data.events,cutoff);if(JSON.stringify(events)===JSON.stringify(data.events||[]))continue;
   const next={...data,events,summary:events.length+' gündem kaydı · '+Number(data.openTasks||0)+' açık dosya'};
   const result=await env.DB.prepare('UPDATE briefings SET data=? WHERE id=? AND data=?').bind(JSON.stringify(next),row.id,row.data).run();if(!result.meta?.changes)complete=false;
  }
  if(complete)await env.DB.prepare('INSERT INTO workspace_settings(id,data,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind('retention-state',stamp,new Date(now).toISOString()).run();
 }finally{await env.DB.prepare('DELETE FROM refresh_locks WHERE id=? AND token=?').bind('retention',token).run()}
}

export function compareRecordsNewest(a,b){
 const stamp=value=>{if(!value)return NaN;return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T00:00:00+03:00':value);};
 const at=stamp(a.publishedAt||a.published_at),bt=stamp(b.publishedAt||b.published_at),av=Number.isFinite(at),bv=Number.isFinite(bt);
 if(av!==bv)return av?-1:1;if(av&&at!==bt)return bt-at;
 const fallback=e=>stamp(e.updatedAt||e.updated_at||e.createdAt||e.created_at||e.approvedAt||e.approved_at||e.firstSeenAt||e.collectedAt||e.lastSeenAt);
 const af=fallback(a),bf=fallback(b);if(Number.isFinite(af)&&Number.isFinite(bf)&&af!==bf)return bf-af;
 return String(a.id||a.item_key||a.url||'').localeCompare(String(b.id||b.item_key||b.url||''));
}
