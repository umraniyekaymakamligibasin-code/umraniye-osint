import{DatabaseSync}from'node:sqlite';
import{preview,persistPlan}from'./live-adapter.mjs';
const args=process.argv.slice(2),commit=args.includes('--commit');
const db=new DatabaseSync('/var/lib/umraniye-osint-deneme/osint.sqlite',{readOnly:!commit,timeout:5000});
try{
 db.exec('PRAGMA foreign_keys=ON');if(!commit)db.exec('PRAGMA query_only=ON');
 const n=Math.min(100,Math.max(1,Number(args.find(a=>a.startsWith('--limit='))?.split('=')[1]||25)));
 const after=args.find(a=>a.startsWith('--after='))?.slice(8)||'';
 const rows=db.prepare('SELECT id,data FROM lab_items WHERE id>? ORDER BY id LIMIT ?').all(after,n);
 const events=[];let invalid=0;for(const r of rows){try{events.push(JSON.parse(r.data));}catch{invalid++;}}
 const plan=preview(db,events);
 const summary={mode:commit?'approved-live':'read-only',examined:events.length,invalid,taskCandidates:plan.results.reduce((n,r)=>n+r.tasks.length,0),reviewReasons:{},nextAfter:rows.at(-1)?.id||null,messagesSent:0};
 for(const result of plan.results)if(!result.tasks.length)summary.reviewReasons[result.reason]=(summary.reviewReasons[result.reason]||0)+1;
 if(commit)summary.projection=persistPlan(db,plan,{allowWrites:true});
 console.log(JSON.stringify(summary));
}finally{db.close();}
