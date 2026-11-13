import {readFile,lstat} from 'node:fs/promises';
import {createDecipheriv} from 'node:crypto';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
export function createGmailSender({directory,python='python3',transport}){
 async function configuration(){
  for(const name of ['smtp.key','smtp.json']){const s=await lstat(join(directory,name));if(!s.isFile()||s.isSymbolicLink()||(process.platform!=='win32'&&(s.mode&0o077)))throw Error('smtp_file_permissions_invalid')}
  const config=JSON.parse(await readFile(join(directory,'smtp.json'),'utf8'));
  if(config.sender!=='umraniyekaymakamligibasin@gmail.com'||config.host!=='smtp.gmail.com'||config.port!==587||config.tls!=='STARTTLS')throw Error('smtp_configuration_invalid');
  return config;
 }
 async function status(){try{const c=await configuration();return {configured:true,enabled:c.enabled===true,sender:c.sender}}catch{return {configured:false,enabled:false}}}
 async function send(input){
  const c=await configuration();if(c.enabled!==true)throw Object.assign(Error('smtp_disabled'),{definitelyNotSent:true});
  const key=await readFile(join(directory,'smtp.key')),b=Buffer.from(c.sealed,'base64');
  const d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAAD(Buffer.from(c.sender));d.setAuthTag(b.subarray(12,28));
  const password=Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8');
  const payload={to:input.to,text:input.text,idempotencyKey:input.idempotencyKey,password};
  const r=transport?await transport(payload):await new Promise((resolve,reject)=>{
   const child=spawn(python,[new URL('./gmail-smtp.py',import.meta.url).pathname],{stdio:['pipe','pipe','ignore'],windowsHide:true});let output='';
   const timer=setTimeout(()=>{child.kill();reject(Error('smtp_transport_timeout'))},90000);
   child.stdout.on('data',b=>{output+=b;if(output.length>4096)child.kill()});
   child.on('error',()=>{clearTimeout(timer);reject(Object.assign(Error('smtp_transport_unavailable'),{definitelyNotSent:true}))});
   child.on('close',()=>{clearTimeout(timer);try{resolve(JSON.parse(output))}catch{reject(Error('smtp_transport_result_unknown'))}});
   child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(payload));
  });
  if(r?.ok!==true)throw Object.assign(Error(r?.code||'smtp_failed'),{definitelyNotSent:r?.definitelyNotSent===true});
 }
 send.supportsIdempotency=false;send.durableClaimOnly=true;
 return {send,status};
}
