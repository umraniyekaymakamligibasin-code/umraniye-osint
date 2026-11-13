import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {open,readFile,lstat,chmod} from 'node:fs/promises';
export const providers=['telegram'];
export async function accountKey(path){
 try{const file=await open(path,'wx',0o600);try{await file.writeFile(randomBytes(32));await file.sync()}finally{await file.close()}}catch(e){if(e.code!=='EEXIST')throw e}
 const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink())throw Error('credential_key_invalid');
 if(process.platform!=='win32')await chmod(path,0o600);
 const key=await readFile(path);if(key.length!==32)throw Error('credential_key_invalid');return key;
}
export function createAccountStore(DB,key){
 if(!Buffer.isBuffer(key)||key.length!==32)throw Error('credential_key_invalid');
 function seal(value,id){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(id));const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),data].map(v=>v.toString('base64')).join('.');}
 function unseal(value,id){try{const [iv,tag,data]=value.split('.').map(v=>Buffer.from(v,'base64')),decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(Buffer.from(id));decipher.setAuthTag(tag);return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8')}catch{throw Error('credential_key_mismatch')}}
 const valid=id=>{if(!providers.includes(id))throw Error('provider_invalid');return 'account:'+id};
 async function row(id){return DB.prepare('SELECT * FROM lab_config WHERE id=?').bind(valid(id)).first()}
 async function read(id){const r=await row(id);if(!r)return null;const data=JSON.parse(r.data);return {...data,secret:unseal(data.sealed,id),revision:r.revision};}
 async function list(){return Promise.all(providers.map(async id=>{const r=await row(id);if(!r)return {provider:id,revision:0,configured:false,enabled:false};const {sealed,...data}=JSON.parse(r.data);return {...data,provider:id,revision:r.revision,configured:!!sealed}}))}
 async function save(input){
  const id=input.provider,k=valid(id),old=await row(id);if(!Number.isInteger(input.revision)||input.revision!==(old?.revision||0))throw Error('revision_conflict');
  if(input.action==='delete'){if(old)await DB.prepare('DELETE FROM lab_config WHERE id=? AND revision=?').bind(k,input.revision).run();return;}
  if(typeof input.enabled!=='boolean'||typeof input.label!=='string'||input.label.trim().length<2||input.label.length>100||typeof input.secret!=='string'||input.secret.length>4096||/[\r\n\x00]/.test(input.secret))throw Error('account_invalid');
  const previous=old?JSON.parse(old.data):null,secret=input.secret|| (previous?unseal(previous.sealed,id):'');if(secret.length<10)throw Error('credential_missing');
  const accountId=String(input.accountId||'').trim(),keywords=String(input.keywords||'').trim(),permissionBasis=String(input.permissionBasis||'').trim();
  if(accountId.length>100||keywords.length>350||permissionBasis.length<8||permissionBasis.length>300)throw Error('account_invalid');
  if(['facebook','instagram'].includes(id)&&!/^\d{4,30}$/.test(accountId))throw Error('numeric_account_id_required');
  if(id==='x'&&(!keywords||keywords.split(/\n/).some(s=>!s.trim()||s.length>80||/["\\()]/.test(s))))throw Error('keywords_invalid');
  if(id==='telegram'&&(!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(secret)||!/^(-?\d+|@[A-Za-z][A-Za-z0-9_]{4,})$/.test(accountId)))throw Error('telegram_invalid');
  const mode=id==='telegram'&&input.mode==='live'?'live':'dry-run';
  if(mode==='live'&&input.confirmLive!==true)throw Error('live_confirmation_required');
  const data={provider:id,label:input.label.trim(),accountId,keywords,permissionBasis,enabled:input.enabled,mode,sealed:seal(secret,id),updatedAt:new Date().toISOString()};
  const result=await DB.prepare('INSERT INTO lab_config(id,data,revision,updated_at) VALUES(?,?,1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=lab_config.revision+1,updated_at=excluded.updated_at WHERE lab_config.revision=?').bind(k,JSON.stringify(data),data.updatedAt,input.revision).run();if(!result.meta.changes)throw Error('revision_conflict');
 }
 async function health(id,status,info=null){const r=await row(id);if(!r)return;const data=JSON.parse(r.data);data.check={status,at:new Date().toISOString(),...(info?{info}: {})};await DB.prepare('UPDATE lab_config SET data=? WHERE id=? AND revision=?').bind(JSON.stringify(data),valid(id),r.revision).run()}
 return {read,list,save,health};
}
