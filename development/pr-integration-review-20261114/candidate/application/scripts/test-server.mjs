import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const dir=await mkdtemp(join(tmpdir(),'osint-clean-test-'));
const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const origin='http://127.0.0.1:'+port,password=randomBytes(18).toString('hex');
const child=spawn(process.execPath,[new URL('../server/start.mjs',import.meta.url).pathname],{
 env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:dir,LANG:'C.UTF-8',DATA_DIR:dir,PORT:String(port),PUBLIC_ORIGIN:'https://isolated.example.invalid',
 OSINT_ADMIN_USERNAME:'isolated-owner',OSINT_ADMIN_PASSWORD:password,COLLECTOR_ENABLED:'false',OSINT_NEWS_COVERAGE_ENABLED:'false',OSINT_LAB_ENABLED:'false',OSINT_BROWSER_ENABLED:'false'},
 stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',b=>{log=(log+b).slice(-6000)});child.stderr.on('data',b=>{log=(log+b).slice(-6000)});
try{
 let ready=false;for(let i=0;i<100;i++){try{const r=await fetch(origin+'/giris');if(r.status===200){ready=true;break}}catch{}if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,100));}
 if(!ready)throw Error('Clean server failed to start: '+log.replaceAll(password,'[hidden]'));
 assert.equal((await fetch(origin+'/favicon.png')).status,200);
 const session=await (await fetch(origin+'/api/session')).json();assert.notEqual(session.adminUnlocked,true);
 assert.equal((await fetch(origin+'/api/admin/login',{method:'POST',headers:{Origin:'https://external.invalid','Content-Type':'application/json'},body:'{}'})).status,403);
 const login=await fetch(origin+'/api/admin/login',{method:'POST',headers:{Origin:'https://isolated.example.invalid','Content-Type':'application/json'},body:JSON.stringify({username:'isolated-owner',password})});
 assert.equal(login.status,200);const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');assert(cookie);
 assert.equal((await (await fetch(origin+'/api/session',{headers:{Cookie:cookie}})).json()).adminUnlocked,true);
 assert.equal((await fetch(origin+'/mcp',{headers:{'oai-authenticated-user-email':'fixture@example.invalid'}})).status,404);
 console.log(JSON.stringify({result:'clean_start_and_auth_passed',isolatedDatabase:true,csrfVerified:true,collectorsEnabled:false,messagesSent:0}));
}finally{
 child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('close',r)),new Promise(r=>setTimeout(r,10000))]);if(child.exitCode===null)child.kill('SIGKILL');
 await rm(dir,{recursive:true,force:true});
}
