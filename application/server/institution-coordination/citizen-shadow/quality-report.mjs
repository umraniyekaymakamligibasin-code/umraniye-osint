import{DatabaseSync}from'node:sqlite';import{writeFile,rename}from'node:fs/promises';import{pathToFileURL}from'node:url';
export function qualitySnapshot(db,{now=Date.now(),hours=48}={}){
 const start=new Date(now-hours*3600000).toISOString(),end=new Date(now).toISOString();
 const rows=db.prepare(`SELECT l.id,l.data,j.state,j.outcome,j.error_code FROM lab_items l LEFT JOIN cit_delivery_jobs j ON j.event_id=l.id WHERE julianday(l.published_at)>=julianday(?) AND julianday(l.published_at)<=julianday(?)`).all(start,end);
 const platforms={},outcomes={},reviewCandidates=[];let errors=0,assigned=0,missingPanel=0;
 for(const row of rows){let e;try{e=JSON.parse(row.data);}catch{errors++;continue;}const platform=e.platform||'web';platforms[platform]=(platforms[platform]||0)+1;const outcome=row.state==='done'||row.state==='retry'?row.outcome||'undecided':'pending';outcomes[outcome]=(outcomes[outcome]||0)+1;if(row.error_code)errors++;
  if(row.state==='done'&&row.outcome==='approved_panel_candidates'){assigned++;const found=db.prepare(`SELECT 1 FROM cit_case_links k JOIN coord_cases c ON c.id=k.case_id WHERE k.event_id=? AND k.active=1 AND c.status<>'dismissed' LIMIT 1`).get(row.id);if(!found)missingPanel++;}
  if(['locality_unverified','no_eligible_task','conflicting_location'].includes(outcome))reviewCandidates.push({eventId:row.id,platform,reason:outcome});
 }
 return{at:end,windowHours:hours,received:rows.length,platforms,outcomes,assignedSources:assigned,missingPanel,processingErrors:errors,reviewCandidates,semanticAccuracy:null,semanticAccuracyNote:'Requires independently reviewed labels; unassigned does not mean incorrect.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const db=new DatabaseSync('/var/lib/umraniye-osint-deneme/osint.sqlite',{readOnly:true,timeout:5000});try{const report=qualitySnapshot(db);const path='/var/lib/umraniye-osint-deneme/citizen-routing/quality-48h.json';await writeFile(path+'.tmp',JSON.stringify(report),{mode:0o600});await rename(path+'.tmp',path);const{reviewCandidates,...summary}=report;console.log(JSON.stringify({...summary,reviewCandidateCount:reviewCandidates.length}));}finally{db.close();}}
