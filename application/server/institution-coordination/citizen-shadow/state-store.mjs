import{readFile,writeFile,rename,copyFile}from'node:fs/promises';
export async function loadState(path,fallback,validate){
 for(const name of [path,path+'.bak']){try{const value=JSON.parse(await readFile(name,'utf8'));if(!validate(value))continue;return{value,recovered:name.endsWith('.bak')};}catch(e){if(!['ENOENT'].includes(e.code)&&!(e instanceof SyntaxError))throw e;}}
 return{value:fallback,recovered:true};
}
export async function saveState(path,value){
 try{const old=JSON.parse(await readFile(path,'utf8'));if(old&&typeof old==='object')await copyFile(path,path+'.bak');}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
 const tmp=path+'.tmp';await writeFile(tmp,JSON.stringify(value),{mode:0o600,flush:true});await rename(tmp,path);
}
export const validStatus=s=>s&&typeof s.cursor==='string'&&Number.isSafeInteger(s.rounds)&&s.rounds>=0;
export const validLedger=s=>s&&typeof s==='object'&&!Array.isArray(s);
