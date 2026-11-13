const tasks=new Map();
export async function withNewsStateLock(key,work){
 const before=tasks.get(key)||Promise.resolve(),task=before.catch(()=>{}).then(work);tasks.set(key,task);
 try{return await task;}finally{if(tasks.get(key)===task)tasks.delete(key);}
}
