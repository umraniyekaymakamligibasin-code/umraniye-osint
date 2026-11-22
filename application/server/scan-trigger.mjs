// Bound configuration-driven scan requests without removing their only trigger.
export function createCadencedTrigger(work,{intervalMs=300000,errorIntervalMs=60000,now=()=>performance.now()}={}){
 let task=null,available=-Infinity;
 return{request(){
  if(task)return task;
  if(now()<available)return Promise.resolve({deferred:true});
  available=now()+intervalMs;
  task=Promise.resolve().then(work).catch(error=>{available=now()+errorIntervalMs;throw error;}).finally(()=>{task=null;});
  return task;
 },get running(){return !!task;}};
}
