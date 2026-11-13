import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import worker from '../worker/index.js';
import {openDatabase} from './database.mjs';
import {createHttpServer} from './http.mjs';
import {createCollector} from './collector.mjs';
import {validateOwner} from './owner-policy.mjs';
if(Number(process.versions.node.split('.')[0])<24)throw Error('Node.js 24 LTS veya üzeri gerekli.');
const origin=process.env.PUBLIC_ORIGIN,parsed=new URL(origin||'http://invalid');
if(parsed.protocol!=='https:'||parsed.pathname!=='/'||parsed.search||parsed.hash||parsed.username||parsed.password)throw Error('PUBLIC_ORIGIN yalnız HTTPS site kökü olmalı.');
const password=process.env.OSINT_ADMIN_PASSWORD||'';
validateOwner(process.env.OSINT_ADMIN_USERNAME,password,process.env.OSINT_ALLOW_SHORT_OWNER_PASSWORD==='true');
const dir=resolve(process.env.DATA_DIR||'./data');await mkdir(dir,{recursive:true,mode:0o700});
const DB=openDatabase(join(dir,'osint.sqlite')),enabled=process.env.COLLECTOR_ENABLED==='true';
const env={DB,OSINT_ADMIN_USERNAME:process.env.OSINT_ADMIN_USERNAME,OSINT_ADMIN_PASSWORD:password,OSINT_ADMIN_EMAIL:process.env.OSINT_ADMIN_EMAIL||'',OSINT_ADMIN_SESSION_VERSION:process.env.OSINT_ADMIN_SESSION_VERSION||'1',OSINT_AUTO_UPDATE_ENABLED:String(enabled)};
const port=Number(process.env.PORT||3000);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('PORT 1024–65535 arasında olmalı.');
const server=createHttpServer(worker,env,{origin:parsed.origin,port,trustCloudflare:process.env.TRUST_CLOUDFLARE==='true'});
const collector=createCollector(worker,env,parsed.origin);let timer,initial,backupTimer,backingUp=false,closing=false;
async function backup(){if(backingUp)return;backingUp=true;try{const path=join(dir,'backups');await mkdir(path,{recursive:true,mode:0o700});const file=join(path,'osint-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');await DB.backupTo(file);console.log(JSON.stringify({event:'backup_completed',at:new Date().toISOString()}))}catch{console.error(JSON.stringify({event:'backup_failed'}))}finally{backingUp=false}}
server.listen(port,'127.0.0.1',()=>{console.log(JSON.stringify({event:'server_started',address:'127.0.0.1:'+port,collector:enabled}));if(enabled){initial=setTimeout(()=>collector.run().catch(()=>console.error('{"event":"collection_failed"}')),5000);timer=setInterval(()=>collector.run().catch(()=>console.error('{"event":"collection_failed"}')),600000)}backup();backupTimer=setInterval(backup,86400000)});
server.on('error',()=>{console.error('{"event":"server_start_failed"}');process.exit(1)});
async function stop(){if(closing)return;closing=true;clearTimeout(initial);clearInterval(timer);clearInterval(backupTimer);const watchdog=setTimeout(()=>process.exit(1),90000);watchdog.unref();const closed=new Promise(r=>server.close(r));await collector.stop();await closed;while(backingUp)await new Promise(r=>setTimeout(r,50));await backup();DB.close();clearTimeout(watchdog)}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
