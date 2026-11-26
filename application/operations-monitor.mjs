import {readFile,writeFile,rename} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createGmailSender} from './server/institution-coordination/server/gmail-sender.mjs';
const directory='/var/lib/umraniye-osint-deneme',file=directory+'/operations-monitor-state.json';
let state={};try{state=JSON.parse(await readFile(file,'utf8'))}catch{}
const errors=[];
for(const unit of ['umraniye-osint-deneme.service','umraniye-osint.service','umraniye-kurum-zamanlayici.timer','umraniye-osint-instagram-api.timer']){
 try{if(execFileSync('systemctl',['is-active',unit],{encoding:'utf8',timeout:5000}).trim()!=='active')errors.push(unit+' etkin değil')}catch{errors.push(unit+' etkin değil')}
}
try{const r=await fetch('http://127.0.0.1:3001/giris',{signal:AbortSignal.timeout(10000)});if(!r.ok)errors.push('Uygulama HTTP kontrolü başarısız')}catch{errors.push('Uygulamaya HTTP erişimi yok')}
try{const r=JSON.parse(await readFile('/var/lib/umraniye-osint-instagram-api-public/status.json','utf8'));if(['token_renewal_required','token_expired','api_access_blocked'].includes(r.status))errors.push('Instagram: '+r.status);if(Date.now()-Date.parse(r.completedAt||r.at)>30*60000)errors.push('Instagram durum raporu 30 dakikadan eski')}catch{errors.push('Instagram durum raporu okunamadı')}
const key=errors.sort().join('\n'),at=Date.now();
const due=key&&(key!==state.key||at-(state.sentAt||0)>24*3600000);
if(due){
 await createGmailSender({directory}).send({to:'umraniyekaymakamligibasin@gmail.com',subject:'Ümraniye OSINT — Sistem arızası',text:'Kontrol zamanı: '+new Date().toISOString()+'\n\n'+key+'\n\nYönetim: https://umraniyeosint.com/yonetim',idempotencyKey:'operations-'+at});
 state={key,sentAt:at};
}else if(!key)state={key:'',sentAt:0};
await writeFile(file+'.tmp',JSON.stringify(state),{mode:0o600});await rename(file+'.tmp',file);
console.log(JSON.stringify({checksCompleted:true,issues:errors.length,emailSent:!!due}));
