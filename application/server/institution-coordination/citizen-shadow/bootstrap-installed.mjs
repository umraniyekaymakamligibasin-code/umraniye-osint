import{DatabaseSync}from'node:sqlite';import{runBatch,initDelivery}from'/opt/umraniye-osint-deneme/server/institution-coordination/citizen-shadow/pipeline.mjs';
const db=new DatabaseSync(process.argv[2],{timeout:5000});try{
 db.exec('PRAGMA foreign_keys=ON');initDelivery(db);const before=db.prepare('SELECT count(*) n FROM coord_mail_outbox').get().n;
 const totals={examined:0,inserted:0,updated:0,withdrawn:0,failed:0,verified:0};
 for(let i=0;i<100;i++){
  const r=runBatch(db,{limit:50});for(const k of Object.keys(totals))totals[k]+=r[k]||0;
  if(r.failed)throw Error('Bootstrap failed: '+JSON.stringify(r));
  if(!db.prepare("SELECT 1 FROM cit_delivery_jobs WHERE state='pending' LIMIT 1").get())break;
  if(i===99)throw Error('Bootstrap batch limit exceeded');
 }
 if(db.prepare('SELECT count(*) n FROM coord_mail_outbox').get().n!==before)throw Error('Unexpected mail queue writes');
 console.log(JSON.stringify({bootstrap:totals,queue:db.prepare('SELECT state,count(*) count FROM cit_delivery_jobs GROUP BY state').all(),news:db.prepare('SELECT count(*) n FROM lab_items').get().n,cases:db.prepare('SELECT count(*) n FROM coord_cases').get().n,integrity:db.prepare('PRAGMA quick_check').get(),messagesSent:0}));
}finally{db.close();}
