import{DatabaseSync}from'node:sqlite';import{readFile,writeFile,rename,mkdir}from'node:fs/promises';import{preview,persistPlan}from'./live-adapter.mjs';
const dir=process.env.CIT_STATE_DIR||'/var/lib/umraniye-osint-deneme/citizen-routing';
await mkdir(dir,{recursive:true,mode:0o700});
let state={cursor:'',rounds:0};try{state={...state,...JSON.parse(await readFile(dir+'/status.json','utf8'))};}catch(e){if(e.code!=='ENOENT')throw e;}
const db=new DatabaseSync('/var/lib/umraniye-osint-deneme/osint.sqlite',{timeout:5000});
try{
 db.exec('PRAGMA foreign_keys=ON');
 const latest=db.prepare('SELECT id,data FROM lab_items ORDER BY published_at DESC LIMIT 25').all();
 const historical=db.prepare('SELECT id,data FROM lab_items WHERE id>? ORDER BY id LIMIT 25').all(state.cursor||'');
 const rows=[...new Map([...latest,...historical].map(r=>[r.id,r])).values()];
 const events=[];for(const row of rows){try{events.push(JSON.parse(row.data));}catch{}}
 const plan=preview(db,events),projection=persistPlan(db,plan,{allowWrites:true});
 const reasons={};for(const r of plan.results)if(!r.tasks.length)reasons[r.reason]=(reasons[r.reason]||0)+1;
 const next={cursor:historical.at(-1)?.id||'',rounds:state.rounds+1,at:new Date().toISOString(),examined:events.length,latest:latest.length,backlog:historical.length,taskCandidates:plan.results.reduce((n,r)=>n+r.tasks.length,0),projection,reasons,messagesSent:0};
 const tmp=dir+'/status.json.tmp';await writeFile(tmp,JSON.stringify(next),{mode:0o600});await rename(tmp,dir+'/status.json');
 console.log(JSON.stringify(next));
}finally{db.close();}
