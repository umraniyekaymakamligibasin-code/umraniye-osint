import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const name of ['build.mjs','test-server.mjs']){const r=spawnSync(process.execPath,[fileURLToPath(new URL('./'+name,import.meta.url))],{cwd:root,stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
