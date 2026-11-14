// This application serves source assets directly; validate rather than invent a bundler.
import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));let count=0,inlineScripts=0;
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory()&&!['node_modules','image-tools','data','backups','vendor'].includes(e.name))await walk(p);else if(e.isFile()&&/\.(mjs|js)$/.test(e.name)){const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});if(r.status!==0)throw Error('Syntax validation failed: '+p+'\n'+r.stderr);count++;}else if(e.isFile()&&e.name.endsWith('.html')){const html=await readFile(p,'utf8');for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc\s*=|application\/ld\+json|application\/json/i.test(m[1])||!m[2].trim())continue;const r=spawnSync(process.execPath,['--input-type=module','--check'],{input:m[2],encoding:'utf8'});if(r.status!==0)throw Error('Inline script syntax failed: '+p+'\n'+r.stderr);inlineScripts++;}}}}
for(const dir of ['server','src','worker','scripts'])await walk(join(root,dir));
JSON.parse(await readFile(join(root,'package.json'),'utf8'));
console.log(JSON.stringify({result:'source_validated',javascriptFiles:count,inlineScripts,bundlerRequired:false}));
