import{DatabaseSync}from'node:sqlite';import{preview,persistPlan}from'./live-adapter.mjs';
import{mkdirSync,readFileSync,writeFileSync,renameSync}from'node:fs';
const stateDir='/var/lib/umraniye-osint-deneme/citizen-routing';mkdirSync(stateDir,{recursive:true,mode:0o700});
let ledger={};try{ledger=JSON.parse(readFileSync(stateDir+'/ledger.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const db=new DatabaseSync('/var/lib/umraniye-osint-deneme/osint.sqlite',{timeout:5000});
const out={examined:0,inserted:0,duplicates:0,skipped:0,messagesSent:0};
try{db.exec('PRAGMA foreign_keys=ON');const rows=db.prepare('SELECT data FROM lab_items ORDER BY published_at DESC LIMIT 5000').all();
 for(let i=0;i<rows.length;i+=50){const events=[];for(const row of rows.slice(i,i+50)){try{events.push(JSON.parse(row.data));}catch{}}
  const plan=preview(db,events),r=persistPlan(db,plan,{allowWrites:true});out.examined+=events.length;out.inserted+=r.inserted;out.duplicates+=r.duplicates;out.skipped+=plan.results.filter(r=>!r.tasks.length).length+r.held;
  for(const result of plan.results)if(result.eventId)ledger[result.eventId]={at:new Date().toISOString(),status:result.status,reason:result.reason,taskTopics:[...new Set(result.tasks.map(t=>t.topic))],evaluations:(ledger[result.eventId]?.evaluations||0)+1};
 }writeFileSync(stateDir+'/ledger.json.tmp',JSON.stringify(ledger),{mode:0o600});renameSync(stateDir+'/ledger.json.tmp',stateDir+'/ledger.json');console.log(JSON.stringify(out));
}finally{db.close();}
