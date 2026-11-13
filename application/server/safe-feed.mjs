import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
// Feed connectors only use explicit administrator-approved domains; each request is DNS pinned.
export function publicAddress(ip){
 if(isIP(ip)===4){const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51)||a===203&&b===0);}
 // Conservative IPv6: only global 2000::/3, excluding documentation and transition mechanisms.
 if(isIP(ip)===6)return /^[23]/i.test(ip)&&!/^2001:(?:db8|0:|0000:)/i.test(ip)&&!/^2002:/i.test(ip);
 return false;
}
export function feedURL(value,allowedHosts){
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port&&u.port!=='443'||isIP(u.hostname)||!allowedHosts.has(u.hostname.toLowerCase())||/(?:^|\.)(local|internal|localhost)$/.test(u.hostname))throw Error('Kaynak adresi izinli HTTPS alan adında olmalı');
 if(u.searchParams.has('token')||u.searchParams.has('key')||u.searchParams.has('access_token'))throw Error('Gizli anahtar içeren akış adresi kaydedilemez');
 return u;
}
export async function feedRequest(value,{allowedHosts,resolve=lookup,maxBytes=2000000,timeout=12000}={}){
 const u=feedURL(value,allowedHosts);let timer,addresses;
 try{addresses=await Promise.race([resolve(u.hostname,{all:true}),new Promise((_accept,reject)=>{timer=setTimeout(()=>reject(Error('DNS zaman aşımı')),Math.min(timeout,8000));})]);}finally{clearTimeout(timer);}
 if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('Kaynak adresi özel ağa çözümleniyor');
 const address=addresses[0];
 return new Promise((accept,reject)=>{
  const q=https.get(u,{headers:{'User-Agent':'UmraniyeOSINT/2.0 (+public RSS reader)','Accept':'application/rss+xml, application/atom+xml, text/plain;q=0.8','Accept-Encoding':'identity'},lookup:(_host,options,callback)=>options?.all?callback(null,[address]):callback(null,address.address,address.family)},r=>{
   const chunks=[];let bytes=0;
   r.on('data',c=>{bytes+=c.length;if(bytes>maxBytes){r.destroy(Error('Akış boyutu sınırı aşıldı'));return}chunks.push(c)});
   r.on('error',reject);r.on('end',()=>accept({status:r.statusCode,text:Buffer.concat(chunks).toString('utf8'),contentType:r.headers['content-type']||''}));
  });
  const timer=setTimeout(()=>q.destroy(Error('Akış zaman aşımı')),timeout);
  q.once('close',()=>clearTimeout(timer));q.on('error',reject);
 });
}
