import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,readdir,stat,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {publicAddress} from './safe-feed.mjs';
import {robotsAllows} from '../worker/index.js';
const LIMIT=24576;
function target(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||isIP(u.hostname)||/(?:^|\.)(?:local|internal|localhost)$/.test(u.hostname))throw Error('invalid_image_source');return u;}
async function download(value,maxBytes,timeout=6500,hops=0,prefix=false){
 const u=target(value);let dnsTimer;
 const addresses=await Promise.race([lookup(u.hostname,{all:true}),new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(Error('dns_timeout')),2500);})]).finally(()=>clearTimeout(dnsTimer));
 if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('private_image_source');
 const address=addresses[0];
 const result=await new Promise((resolve,reject)=>{
  const req=https.get(u,{headers:{'User-Agent':'UmraniyeOSINT/2.0 (+public RSS reader)','Accept':'text/html,image/webp,image/*;q=0.9,*/*;q=0.5','Accept-Encoding':'identity'},lookup:(_host,options,cb)=>options?.all?cb(null,[address]):cb(null,address.address,address.family)},res=>{
   if([301,302,303,307,308].includes(res.statusCode)){res.resume();resolve({redirect:res.headers.location});return;}
   if(!prefix&&Number(res.headers['content-length']||0)>maxBytes){res.destroy();reject(Error('image_too_large'));return;}
   const chunks=[];let length=0;res.on('data',chunk=>{length+=chunk.length;chunks.push(chunk);if(length>maxBytes){if(prefix){resolve({status:res.statusCode,type:String(res.headers['content-type']||''),data:Buffer.concat(chunks).subarray(0,maxBytes)});res.destroy();}else res.destroy(Error('image_too_large'));}});res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,type:String(res.headers['content-type']||''),data:Buffer.concat(chunks)}));
  });
  const timer=setTimeout(()=>req.destroy(Error('image_timeout')),timeout);req.once('close',()=>clearTimeout(timer));req.on('error',reject);
 });
 if(result.redirect){if(hops>=2)throw Error('image_redirect_limit');return download(new URL(result.redirect,u).href,maxBytes,timeout,hops+1,prefix);}return result;
}
function decode(s){return String(s||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(?:x([a-f\d]+)|(\d+));/gi,(_a,h,d)=>{const c=parseInt(h||d,h?16:10);return c>0&&c<=0x10ffff?String.fromCodePoint(c):'';});}
export function imageMetadata(html,pageURL){
 const candidates=[];
 for(const tag of html.matchAll(/<meta\b[^>]{0,6000}>/gi)){
  const attrs={};for(const attr of tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))attrs[attr[1].toLowerCase()]=attr[2]??attr[3];
  const key=(attrs.property||attrs.name||'').toLowerCase();if(['og:image','og:image:url','twitter:image','twitter:image:src'].includes(key)&&attrs.content)candidates.push(decode(attrs.content));
 }
 for(const candidate of candidates){try{const u=target(new URL(candidate,pageURL).href);if(!/logo|favicon|sprite|placeholder|default[-_]?image/i.test(u.pathname))return u.href;}catch{}}
 return null;
}
function encode(python,script,data){return new Promise((resolve,reject)=>{
 const child=spawn(python,[script],{stdio:['pipe','pipe','ignore']}),chunks=[];let bytes=0;
 const timer=setTimeout(()=>{child.kill();reject(Error('thumbnail_timeout'));},6000);
 child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>LIMIT){child.kill();reject(Error('thumbnail_too_large'));}else chunks.push(chunk);});
 child.on('error',reject);child.on('close',code=>{clearTimeout(timer);if(code!==0||!bytes)return reject(Error('thumbnail_decode_failed'));resolve(Buffer.concat(chunks));});child.stdin.on('error',()=>{});child.stdin.end(data);
 });}
export function createNewsThumbnails({directory,python,script,responseWaitMs=1500}){
 const tasks=new Map(),queue=[],robotsCache=new Map();let active=0,writes=0;
 async function permitted(page){const u=target(page),old=robotsCache.get(u.origin);if(old&&old.expires>Date.now())return old.allowed(u.pathname+u.search);try{const r=await download(u.origin+'/robots.txt',131072,4000);if(![200,404,410].includes(r.status))return false;const text=r.data.toString('utf8'),allowed=p=>r.status!==200||!/<html|<!doctype/i.test(text)&&robotsAllows(text,p);robotsCache.set(u.origin,{expires:Date.now()+3600000,allowed});return allowed(u.pathname+u.search);}catch{return false;}}
 async function prune(){const files=await readdir(directory),list=[];for(const name of files){if(!/^[a-f\d]{40}\.(?:webp|json)$/.test(name))continue;const s=await stat(join(directory,name));list.push({name,bytes:s.size,at:s.mtimeMs});}let size=list.reduce((n,f)=>n+f.bytes,0);for(const f of list.sort((a,b)=>a.at-b.at)){if(size<=20*1024*1024&&Date.now()-f.at<30*86400000)break;await unlink(join(directory,f.name));size-=f.bytes;}}
 async function generate(pageURL,imageURL,key){
  await mkdir(directory,{recursive:true,mode:0o700});
  try{
   let image=imageURL;
   if(!image){if(!await permitted(pageURL))throw Error('source_unavailable');const html=await download(pageURL,786432,6500,0,true);if(html.status!==200||!/html/i.test(html.type))throw Error('article_unavailable');image=imageMetadata(html.data.toString('utf8'),pageURL);}
   if(!image)throw Error('no_article_image');
   const raw=await download(image,2097152);if(raw.status!==200||!/^image\/(?:jpeg|png|webp|gif|avif)/i.test(raw.type))throw Error('image_unavailable');
   const thumbnail=await encode(python,script,raw.data),file=join(directory,key+'.webp'),temp=file+'.'+process.pid+'.tmp';await writeFile(temp,thumbnail,{mode:0o600});await rename(temp,file);
   await writeFile(join(directory,key+'.json'),JSON.stringify({status:'ready',createdAt:Date.now(),bytes:thumbnail.length,originalBytes:raw.data.length}),{mode:0o600});if(++writes%20===0)await prune().catch(()=>{});return thumbnail;
  }catch{await writeFile(join(directory,key+'.json'),JSON.stringify({status:'missing',createdAt:Date.now()}),{mode:0o600});return null;}
 }
 function pump(){while(active<2&&queue.length){const task=queue.shift();active++;generate(...task.args).then(task.resolve,task.reject).finally(()=>{active--;tasks.delete(task.key);pump();});}}
 async function get(pageURL,imageURL=null){
  const u=target(pageURL),key=createHash('sha256').update(u.href).digest('hex').slice(0,40);
  try{const image=await readFile(join(directory,key+'.webp'));if(image.length<=LIMIT)return image;}catch{}
  try{const meta=JSON.parse(await readFile(join(directory,key+'.json'),'utf8'));if(meta.status==='missing'&&Date.now()-meta.createdAt<21600000)return null;}catch{}
  const wait=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('thumbnail_pending'),{code:'thumbnail_pending'})),Math.max(10,Math.min(2000,responseWaitMs)));})]);}finally{clearTimeout(timer);}};
  if(tasks.has(key))return wait(tasks.get(key));if(queue.length>=6)throw Object.assign(Error('thumbnail_pending'),{code:'thumbnail_pending'});
  let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});tasks.set(key,promise);queue.push({args:[u.href,imageURL,key],key,resolve,reject});pump();
  return wait(promise);
 }
 return {get};
}
