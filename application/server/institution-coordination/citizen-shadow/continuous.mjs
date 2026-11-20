import{mkdir}from'node:fs/promises';
import{runPipeline}from'./pipeline.mjs';
import{loadState,saveState,validStatus}from'./state-store.mjs';
const dir=process.env.CIT_STATE_DIR||'/var/lib/umraniye-osint-deneme/citizen-routing';
await mkdir(dir,{recursive:true,mode:0o700});
const prior=await loadState(dir+'/status.json',{cursor:'',rounds:0},validStatus);
const result=runPipeline({dbPath:process.env.OSINT_DB_PATH||'/var/lib/umraniye-osint-deneme/osint.sqlite',limit:25});
const next={...result,cursor:'',rounds:prior.value.rounds+1,stateRecovered:prior.recovered,storage:'sqlite_durable_queue'};
await saveState(dir+'/status.json',next);console.log(JSON.stringify(next));
