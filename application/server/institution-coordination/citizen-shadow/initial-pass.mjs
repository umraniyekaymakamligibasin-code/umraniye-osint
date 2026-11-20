import{DatabaseSync}from'node:sqlite';import{preview,persistPlan}from'./live-adapter.mjs';
const db=new DatabaseSync('/var/lib/umraniye-osint-deneme/osint.sqlite',{timeout:5000});
const out={examined:0,inserted:0,duplicates:0,skipped:0,messagesSent:0};
try{db.exec('PRAGMA foreign_keys=ON');const rows=db.prepare('SELECT data FROM lab_items ORDER BY published_at DESC LIMIT 5000').all();
 for(let i=0;i<rows.length;i+=50){const events=[];for(const row of rows.slice(i,i+50)){try{events.push(JSON.parse(row.data));}catch{}}
  const plan=preview(db,events),r=persistPlan(db,plan,{allowWrites:true});out.examined+=events.length;out.inserted+=r.inserted;out.duplicates+=r.duplicates;out.skipped+=plan.results.filter(r=>!r.tasks.length).length+r.held;
 }console.log(JSON.stringify(out));
}finally{db.close();}
