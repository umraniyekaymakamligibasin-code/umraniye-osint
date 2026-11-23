import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';

export function dueWork(db,now=Date.now()){
 return !!db.prepare(`SELECT 1 FROM cit_delivery_jobs WHERE (state IN('pending','retry') AND available_at<=?) OR (state='processing' AND lease_until<=?) LIMIT 1`).get(now,now);
}
export function wakePolicy({now,due,lastPass=0,nextAllowed=0}){
 return now>=nextAllowed&&(due||now-lastPass>=5000);
}
export async function watch({dbPath=process.env.OSINT_DB_PATH||'/var/lib/umraniye-osint-deneme/osint.sqlite',lock=process.env.CIT_ROUTING_LOCK||'/var/lib/umraniye-osint-deneme/institution-routing.lock'}={}){
 const db=new DatabaseSync(dbPath,{readOnly:true,timeout:1000});db.exec('PRAGMA query_only=ON');
 let stopped=false,lastPass=0,nextAllowed=0;
 const stop=()=>{stopped=true;};process.on('SIGTERM',stop);process.on('SIGINT',stop);
 console.log(JSON.stringify({event:'institution_realtime_started',pollMs:1000,maintenanceMs:60000}));
 try{while(!stopped){
  try{
   const now=Date.now();if(now>=nextAllowed&&wakePolicy({now,due:dueWork(db,now),lastPass,nextAllowed})){
    try{
     // The same lock protects legacy/manual/timer entry points. The observer
     // never holds it, so a live sender or router cannot deadlock this worker.
     execFileSync('/usr/bin/flock',['--nonblock','--conflict-exit-code','75',lock,process.execPath,fileURLToPath(new URL('../kurum/kurum-zamanlayici.mjs',import.meta.url)),'--tek-sefer','--sunucu','/opt/umraniye-osint-deneme','--gonder','--portal-url','https://umraniyeosint.com'],{stdio:'inherit',timeout:45000});
     lastPass=Date.now();nextAllowed=lastPass+1000;
    }catch(error){nextAllowed=Date.now()+(error.status===75?1000:5000);if(error.status!==75)console.error(JSON.stringify({event:'institution_realtime_pass_failed',exitCode:error.status||null}));}
   }
  }catch{nextAllowed=Date.now()+5000;console.error(JSON.stringify({event:'institution_realtime_queue_unavailable'}));}
  await sleep(1000);
 }}finally{db.close();process.off('SIGTERM',stop);process.off('SIGINT',stop);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await watch();
