import {readdir,lstat,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

// Only automatic daily snapshots; named installation/rollback archives are excluded.
export function retainedSnapshots(names,now=Date.now()){
 const valid=names.filter(n=>/^osint-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.sqlite$/.test(n)).sort().reverse();
 const keep=new Set(valid.slice(0,10)),days=new Set();
 for(const n of valid){const day=n.slice(6,16),age=now-Date.parse(day+'T00:00:00Z');if(age<=7*86400000||age<=30*86400000&&!days.has(day))keep.add(n);days.add(day);}
 return {keep:[...keep],remove:valid.filter(n=>!keep.has(n))};
}
export async function maintainBackups(folder,{now=Date.now()}={}){
 const names=await readdir(folder),plan=retainedSnapshots(names,now);
 if(!plan.remove.length)return {removed:0};
 const newest=plan.keep.slice().sort().at(-1);if(!newest)return {removed:0};
 const path=join(folder,newest),info=await lstat(path);if(!info.isFile()||info.isSymbolicLink())throw Error('backup_not_regular');
 const db=new DatabaseSync(path,{readOnly:true});try{if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('backup_integrity_failed');}finally{db.close();}
 let removed=0;for(const name of plan.remove){const target=join(folder,name),s=await lstat(target);if(s.isFile()&&!s.isSymbolicLink()){await unlink(target);removed++;}}
 return {removed,retained:plan.keep.length};
}
