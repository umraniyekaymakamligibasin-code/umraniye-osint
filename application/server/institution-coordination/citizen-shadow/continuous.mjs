import{DatabaseSync}from'node:sqlite';import{readFile,writeFile,rename,mkdir}from'node:fs/promises';import{preview,persistPlan}from'./live-adapter.mjs';
import{loadState,saveState,validStatus,validLedger}from'./state-store.mjs';
const dir=process.env.CIT_STATE_DIR||'/var/lib/umraniye-osint-deneme/citizen-routing';
await mkdir(dir,{recursive:true,mode:0o700});
const statusState=await loadState(dir+'/status.json',{cursor:'',rounds:0},validStatus),ledgerState=await loadState(dir+'/ledger.json',{},validLedger);
const state=statusState.value,ledger=ledgerState.value;
const db=new DatabaseSync('/var/lib/umraniye-osint-deneme/osint.sqlite',{timeout:5000});
try{
 db.exec('PRAGMA foreign_keys=ON');
 const latest=db.prepare('SELECT id,data FROM lab_items ORDER BY published_at DESC LIMIT 25').all();
 const historical=db.prepare('SELECT id,data FROM lab_items WHERE id>? ORDER BY id LIMIT 25').all(state.cursor||'');
 const rows=[...new Map([...latest,...historical].map(r=>[r.id,r])).values()];
 const events=[];for(const row of rows){try{events.push(JSON.parse(row.data));}catch{}}
 const plan=preview(db,events),projection=persistPlan(db,plan,{allowWrites:true});
 const reasons={};for(const r of plan.results)if(!r.tasks.length)reasons[r.reason]=(reasons[r.reason]||0)+1;
 const next={cursor:historical.at(-1)?.id||'',rounds:state.rounds+1,at:new Date().toISOString(),examined:events.length,latest:latest.length,backlog:historical.length,taskCandidates:plan.results.reduce((n,r)=>n+r.tasks.length,0),projection,reasons,stateRecovered:statusState.recovered||ledgerState.recovered,messagesSent:0};
 for(const r of plan.results)if(r.eventId)ledger[r.eventId]={at:next.at,status:r.status,reason:r.reason,taskTopics:[...new Set(r.tasks.map(t=>t.topic))],evaluations:(ledger[r.eventId]?.evaluations||0)+1};
 await saveState(dir+'/ledger.json',ledger);
 await saveState(dir+'/status.json',next);
 console.log(JSON.stringify(next));
}finally{db.close();}
