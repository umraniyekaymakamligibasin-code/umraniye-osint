import {readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
const providers=['x','facebook','instagram'],intervals={x:300,facebook:300,instagram:600};
async function jsonFile(path,max){try{const info=await lstat(path);if(info.isSymbolicLink()||info.size>max)throw Error('unsafe_state');return JSON.parse(await readFile(path,'utf8'));}catch(error){return error.code==='ENOENT'?null:{unavailable:true};}}
export async function scanPacingState(directory){
 const [checkpoints,...states]=await Promise.all([jsonFile(join(directory,'source-read-checkpoints.json'),4000000),...providers.map(p=>jsonFile(join(directory,'scan-pacing',p+'.json'),64000))]);
 const rows=checkpoints?.version===1&&checkpoints.sources&&typeof checkpoints.sources==='object'?Object.values(checkpoints.sources):[];
 return Object.fromEntries(providers.map((provider,i)=>{
  const state=states[i],valid=state?.version===1&&state.provider===provider,sourceRows=rows.filter(r=>r?.provider===provider),date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:null;
  const nextDate=valid&&Number.isFinite(state.nextDue)&&state.nextDue>0?new Date(state.nextDue*1000):null;const next=nextDate&&Number.isFinite(+nextDate)?nextDate.toISOString():null;
  return [provider,{intervalSeconds:intervals[provider],nextScanAt:next,lastAttemptAt:date(state?.lastAttemptAt),lastCompletedAt:date(state?.lastCompletedAt),lastContentReadAt:date(state?.lastContentReadAt),lastStatus:typeof state?.lastStatus==='string'?state.lastStatus:null,stateUnavailable:state?.unavailable===true||!!state&&!valid,sourceCheckpoints:{count:sourceRows.length,lastReadAt:sourceRows.map(r=>date(r.lastReadAt)).filter(Boolean).sort().at(-1)||null,unreachedBoundaries:sourceRows.filter(r=>r.unreachedPreviousBoundary===true).length,gapsBeyond48Hours:sourceRows.filter(r=>r.gapBeyondRecoveryWindow===true).length,boundedRead:true}}];
 }));
}
