// Coalesce ingestion-triggered delivery work without keeping the ingestion HTTP request open.
export function createDeliveryScheduler(work,{onError=()=>{}}={}){
 let task=null,requested=false,closed=false;
 function request(){
  if(closed)return Promise.resolve();requested=true;
  if(!task){
   task=Promise.resolve().then(async()=>{
    while(requested&&!closed){requested=false;try{await work();}catch(error){onError(error);}}
   }).finally(()=>{task=null;});
  }
  return task;
 }
 return {request,async stop(){closed=true;requested=false;await task;},get running(){return !!task;}};
}
