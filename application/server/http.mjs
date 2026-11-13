export function requestBodyLimit(path){return path==='/api/admin/integrations/browser-facebook'?180000:65536;}
import http from 'node:http';
import {isIP} from 'node:net';
import {createRequestBudget} from './request-budget.mjs';
import {randomUUID} from 'node:crypto';
const security={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()','X-Frame-Options':'DENY','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store'};
export function createHttpServer(worker,env,{origin,port=3000,host='127.0.0.1',trustCloudflare=false,log=console.log,now=Date.now,browserProxy=null}={}){
 const base=new URL(origin),budget=createRequestBudget({now});let active=0,authActive=0;
 const limit=(ip,isLogin)=>budget.limited(ip,isLogin);
 const server=http.createServer({maxHeaderSize:16384},async(req,res)=>{
  const started=Date.now();let reported=false;
  const latency=aborted=>{if(reported)return;reported=true;const durationMs=Date.now()-started;if(durationMs>=1500){let path='/';try{path=new URL(req.url,origin).pathname.slice(0,180);}catch{}log(JSON.stringify({event:'slow_http_request',path,durationMs,status:res.statusCode,aborted}));}};
  res.once('finish',()=>latency(false));res.once('close',()=>latency(!res.writableFinished));
  const id=randomUUID(),headers=Object.fromEntries(Object.entries({...security,'X-Request-ID':id,...(base.protocol==='https:'?{'Strict-Transport-Security':'max-age=31536000'}:{})}).map(([k,v])=>[k.toLowerCase(),v]));
  const reject=(status,error,extra={})=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify({error,requestId:id}))};
  if(active>=80)return reject(503,'Sunucu meşgul. Yeniden deneyin.',{'Retry-After':'5'});active++;let authSlot=false;
  try{
   const legacyHost=process.env.OSINT_REDIRECT_HOST;
   if(legacyHost&&req.headers.host===legacyHost&&['GET','HEAD'].includes(req.method)&&req.url?.startsWith('/')&&!req.url.startsWith('//')){res.writeHead(302,{...headers,Location:origin+req.url});res.end();return;}
   const hostHeader=req.headers.host,allowed=new Set([base.host,'127.0.0.1:'+port,'localhost:'+port]);if(!allowed.has(hostHeader))return reject(421,'Geçersiz sunucu adresi');
   if(!req.url?.startsWith('/')||req.url.startsWith('//'))return reject(400,'Geçersiz istek adresi');
   const path=new URL(req.url,origin).pathname;
   if(path==='/mcp'||path.startsWith('/api/automation/'))return reject(404,'Bulunamadı');
   if(['/api/login','/api/admin/login','/api/team/login'].includes(path)){if(authActive>=4)return reject(429,'Giriş işlemleri yoğun. Yeniden deneyin.',{'Retry-After':'5'});authActive++;authSlot=true;}
   if(!['GET','HEAD','POST'].includes(req.method))return reject(405,'Yöntem desteklenmiyor',{'Allow':'GET, HEAD, POST'});
   const peer=req.socket.remoteAddress||'unknown',forwardedIP=req.headers['cf-connecting-ip'];
   const ip=trustCloudflare&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer)&&typeof forwardedIP==='string'&&isIP(forwardedIP)?forwardedIP:peer;
   if(limit(ip,false)||(['/api/login','/api/admin/login','/api/team/login'].includes(path)&&limit(ip,true)))return reject(429,'Çok fazla istek. Daha sonra yeniden deneyin.',{'Retry-After':'60'});
   if(browserProxy&&path.startsWith(browserProxy.prefix)){await browserProxy.handle(req,res);return;}
   if(req.method==='POST'&&req.headers['sec-fetch-site']==='cross-site')return reject(403,'İstek kaynağı reddedildi');
   const bodyLimit=requestBodyLimit(path);
   if(Number(req.headers['content-length']||0)>bodyLimit)return reject(413,'İstek çok büyük');
   const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>bodyLimit)return reject(413,'İstek çok büyük');chunks.push(chunk)}
   const forwarded=new Headers();for(const [k,v]of Object.entries(req.headers)){if(/^(oai-|cf-|x-forwarded-|forwarded$|host$|connection$|content-length$|transfer-encoding$)/i.test(k))continue;if(v)forwarded.set(k,Array.isArray(v)?v.join(','):v)}forwarded.set('CF-Connecting-IP',ip);
   const request=new Request(new URL(req.url,origin),{method:req.method,headers:forwarded,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
   const response=await worker.fetch(request,env,{waitUntil(p){p.catch(()=>log(JSON.stringify({event:'background_failed',requestId:id})))}});
   for(const [k,v]of response.headers)if(k!=='set-cookie')headers[k]=v;
   const cookies=response.headers.getSetCookie();if(cookies.length)headers['set-cookie']=cookies;
   headers['x-frame-options']='DENY';
   if(response.headers.get('content-type')?.includes('text/html')){
    const html=(await response.text()).replace(/\r\n?/g,'\n');const {createHash}=await import('node:crypto');const hashes=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>"'sha256-"+createHash('sha256').update(m[1]).digest('base64')+"'");
    headers['content-security-policy']="default-src 'self'; script-src 'self' "+hashes.join(' ')+"; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'";
    res.writeHead(response.status,headers);res.end(req.method==='HEAD'?undefined:html);
   }else{res.writeHead(response.status,headers);res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()))}
  }catch{if(!res.headersSent)reject(500,'İşlem tamamlanamadı.');else res.destroy();log(JSON.stringify({event:'request_failed',requestId:id}))}finally{active--;if(authSlot)authActive--}
 });
 server.headersTimeout=15000;server.requestTimeout=30000;server.keepAliveTimeout=5000;server.maxRequestsPerSocket=100;server.maxConnections=200;
 if(browserProxy)server.on('upgrade',(req,socket,head)=>{const allowed=new Set([base.host,'127.0.0.1:'+port,'localhost:'+port]);if(!allowed.has(req.headers.host)||!req.url?.startsWith(browserProxy.prefix)){socket.destroy();return}browserProxy.upgrade(req,socket,head).catch(()=>socket.destroy())});
 return server;
}
