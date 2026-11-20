import{DatabaseSync}from'node:sqlite';import{catalog}from'./catalog.mjs';import{phrasesMatch,clauseState}from'./language.mjs';import{adaptEvent}from'./live-adapter.mjs';
const db=new DatabaseSync('/var/lib/umraniye-osint-deneme/osint.sqlite',{readOnly:true,timeout:5000});
try{db.exec('PRAGMA query_only=ON');const counts=new Map(),summary={mode:'read-only',events:0,unverifiedLocation:0,matchedEvents:0,topics:[],rawTextIncluded:false};
 for(const row of db.prepare('SELECT id,data FROM lab_items ORDER BY published_at DESC LIMIT 2000').all()){
  let e;try{e=adaptEvent(JSON.parse(row.data));}catch{continue;}
  summary.events++;if(!e.locality)summary.unverifiedLocation++;
  const text=String(e.fullText||e.description||e.title||'').slice(0,64000);const clauses=text.split(/[.!?;\n]+|\s+ama\s+|\s+ancak\s+/iu).filter(c=>clauseState(c)==='active');let found=false;
  for(const r of catalog)if(clauses.some(c=>r.patterns.some(p=>phrasesMatch(c,p)))){found=true;counts.set(r.code,(counts.get(r.code)||0)+1);}
  if(found)summary.matchedEvents++;
 }
 summary.topics=[...counts].map(([code,count])=>{const r=catalog.find(r=>r.code===code);return {code,title:r.title,count,panelCandidates:r.panelCandidates,sensitivity:r.sensitivity,approval:'pending',serviceAuthority:r.serviceAuthority};}).sort((a,b)=>b.count-a.count);
 console.log(JSON.stringify(summary));
}finally{db.close();}
