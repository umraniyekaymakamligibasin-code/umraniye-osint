import {randomBytes,createHash} from 'node:crypto';
export function createCollector(worker,env,origin,{log=console.log}={}){
 const secret=randomBytes(32).toString('hex');env.OSINT_AUTOMATION_KEY_SHA256=createHash('sha256').update(secret).digest('hex');
 let running=null,stopped=false;
 async function collect(){
  const response=await worker.fetch(new Request(origin+'/api/config',{headers:{'X-OSINT-Service-Key':secret}}),env);
  if(!response.ok)throw Error('Kaynak yapılandırması alınamadı.');
  const config=await response.json();if(!Number.isInteger(config.totalBatches)||config.totalBatches<0||config.totalBatches>100)throw Error('Geçersiz kaynak grubu sayısı.');let successful=0,failed=0;
  log(JSON.stringify({event:'collection_started',batches:config.totalBatches,at:new Date().toISOString()}));
  for(let batch=0;batch<config.totalBatches&&!stopped;batch++){
   try{const r=await worker.fetch(new Request(origin+'/api/automation/refresh?batch='+batch,{method:'POST',headers:{'X-OSINT-Service-Key':secret}}),env);if(!r.ok)throw Error();const d=await r.json();if(d.busy){failed++;continue}if(d.results?.some(s=>['healthy','no_match','empty'].includes(s.status)))successful++;else failed++}catch{failed++}
  }
  const result={event:'collection_completed',successful,failed,stopped,at:new Date().toISOString()};log(JSON.stringify(result));return result;
 }
 return {run(){if(stopped)return Promise.resolve({stopped:true});if(running)return running;running=collect().finally(()=>{running=null});return running},async stop(){stopped=true;await running},get running(){return !!running}};
}
