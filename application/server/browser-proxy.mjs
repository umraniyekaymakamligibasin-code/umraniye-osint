import http from 'node:http';import net from 'node:net';import {createHash} from 'node:crypto';
import {readFile,realpath,access} from 'node:fs/promises';import {resolve,sep,extname} from 'node:path';
export function createBrowserProxy(worker,env,{origin,targetPort=6080,enabled=true,recheckMs=10000,staticRoot='/usr/share/novnc'}={}){
 const prefix='/yonetim/browser/';
 const websocketOrigin=new URL(origin);websocketOrigin.protocol=websocketOrigin.protocol==='https:'?'wss:':'ws:';
 async function authorized(req){if(!enabled||!['GET','HEAD'].includes(req.method)||req.headers['sec-fetch-site']==='cross-site')return false;const r=await worker.fetch(new Request(origin+'/api/session',{headers:{Cookie:req.headers.cookie||''}}),env);try{return (await r.json()).adminUnlocked===true}catch{return false}}
 function path(req){const u=new URL(req.url,origin),p=u.pathname.slice(prefix.length);if(!u.pathname.startsWith(prefix)||!p||!/^[A-Za-z0-9_./-]+$/.test(p)||p.includes('..'))throw Error();return '/'+p+u.search;}
 async function handle(req,res){
  if(!await authorized(req)){res.writeHead(401,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('Yönetici girişi gerekli');return}
  let target;try{target=path(req)}catch{res.writeHead(400);res.end();return}
  // Packaged noVNC assets do not depend on the short-lived Python login process.
  if(staticRoot&&await access(staticRoot).then(()=>true,()=>false)){
   try{
    const root=await realpath(staticRoot),file=await realpath(resolve(root,'.'+target.split('?')[0]));
    const shared=resolve('/usr/share/javascript');
    if(!file.startsWith(root+sep)&&!file.startsWith(shared+sep)){res.writeHead(403);res.end();return}
    const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.oga':'audio/ogg','.ogg':'audio/ogg','.mp3':'audio/mpeg','.wasm':'application/wasm','.map':'application/json'}[extname(file)];
    if(!mime){res.writeHead(404);res.end();return}
    const data=await readFile(file);if(data.length>6000000){res.writeHead(413);res.end();return}
    const hashes=mime.startsWith('text/html')?[...data.toString().matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>"'sha256-"+createHash('sha256').update(m[1].replace(/\r\n?/g,'\n')).digest('base64')+"'"):[];
    res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'SAMEORIGIN','Content-Security-Policy':"default-src 'self'; script-src 'self' "+hashes.join(' ')+"; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' "+websocketOrigin.origin+"; frame-ancestors 'self'; object-src 'none'; base-uri 'self'"});res.end(req.method==='HEAD'?undefined:data);return;
   }catch{res.writeHead(404,{'Cache-Control':'no-store'});res.end('Giriş ekranı dosyası bulunamadı');return}
  }
  const request=http.request({hostname:'127.0.0.1',port:targetPort,path:target,method:req.method,timeout:10000},up=>{
   const chunks=[];let size=0;up.on('data',c=>{size+=c.length;if(size>6000000){up.destroy();res.destroy()}else chunks.push(c)});up.on('end',()=>{if(res.destroyed)return;const data=Buffer.concat(chunks),html=up.headers['content-type']?.includes('text/html'),hashes=html?[...data.toString().matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>"'sha256-"+createHash('sha256').update(m[1].replace(/\r\n?/g,'\n')).digest('base64')+"'"):[];res.writeHead(up.statusCode,{'Content-Type':up.headers['content-type']||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'SAMEORIGIN','Content-Security-Policy':"default-src 'self'; script-src 'self' "+hashes.join(' ')+"; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' "+websocketOrigin.origin+"; frame-ancestors 'self'; object-src 'none'; base-uri 'self'"});res.end(req.method==='HEAD'?undefined:data)});
  });request.on('timeout',()=>request.destroy());request.on('error',()=>{if(!res.headersSent){res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('Giriş tarayıcısı hazırlanıyor. Birkaç saniye sonra ekranı yenileyin.')}else res.destroy()});request.end();
 }
 async function upgrade(req,socket,head){
  socket.on('error',()=>{});
  let target;try{target=path(req)}catch{socket.destroy();return}
  if(target!=='/websockify'||req.headers.origin!==origin||!await authorized(req)){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return}
  const upstream=net.connect(targetPort,'127.0.0.1');let lifetime=setTimeout(()=>{socket.destroy();upstream.destroy()},20*60000);const recheck=setInterval(async()=>{try{if(!await authorized(req)){socket.destroy();upstream.destroy()}}catch{socket.destroy();upstream.destroy()}},recheckMs);
  upstream.on('connect',()=>{const headers={host:'127.0.0.1:'+targetPort,upgrade:'websocket',connection:'Upgrade','sec-websocket-key':req.headers['sec-websocket-key'],'sec-websocket-version':'13',...(req.headers['sec-websocket-protocol']?{'sec-websocket-protocol':req.headers['sec-websocket-protocol']}: {})};upstream.write('GET /websockify HTTP/1.1\r\n'+Object.entries(headers).map(([k,v])=>k+': '+v).join('\r\n')+'\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket)});
  const close=()=>{clearTimeout(lifetime);clearInterval(recheck);socket.destroy();upstream.destroy()};socket.on('close',close);upstream.on('close',close);socket.on('error',close);upstream.on('error',close);
 }
 return {prefix,handle,upgrade};
}
