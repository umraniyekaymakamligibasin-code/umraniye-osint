import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createServer} from 'node:net';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
if(!process.env.OSINT_ADMIN_USERNAME||!process.env.OSINT_ADMIN_PASSWORD)throw Error('Provide separate preview administrator credentials. Never reuse live credentials.');
if(process.env.DATA_DIR)throw Error('Preview creates an isolated directory automatically; do not pass a live DATA_DIR.');
const dir=await mkdtemp(join(tmpdir(),'osint-preview-'));let port=Number(process.env.PORT||0);
if(!port){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));port=s.address().port;await new Promise(r=>s.close(r));}
const env={PATH:process.env.PATH||'/usr/bin:/bin',HOME:dir,LANG:'C.UTF-8',DATA_DIR:dir,PORT:String(port),PUBLIC_ORIGIN:process.env.PUBLIC_ORIGIN||'https://preview.example.invalid',OSINT_ADMIN_USERNAME:process.env.OSINT_ADMIN_USERNAME,OSINT_ADMIN_PASSWORD:process.env.OSINT_ADMIN_PASSWORD,COLLECTOR_ENABLED:'false',OSINT_NEWS_COVERAGE_ENABLED:'false',OSINT_LAB_ENABLED:'false',OSINT_BROWSER_ENABLED:'false'};
console.log('Isolated preview data: '+dir+'; loopback port: '+port+'; canonical origin: '+env.PUBLIC_ORIGIN);
const child=spawn(process.execPath,[fileURLToPath(new URL('../server/start.mjs',import.meta.url))],{env,stdio:'inherit'});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>child.kill(sig));child.on('exit',code=>{process.exitCode=code||0});
