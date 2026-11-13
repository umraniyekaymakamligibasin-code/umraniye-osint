import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {timingSafeEqual} from 'node:crypto';
const {createPortalShell}=await import(pathToFileURL(process.argv[2]));
const origin='https://unit.invalid',key='fixture-service-key';let validated=0;
const routes=['/api/admin/integrations/browser-worker','/api/admin/integrations/browser-facebook'];
const base={async fetch(request){
 const p=new URL(request.url).pathname;
 if(routes.includes(p)){
  validated++;const supplied=Buffer.from(request.headers.get('X-OSINT-Browser-Key')||''),expected=Buffer.from(key);
  return Response.json({ok:supplied.length===expected.length&&timingSafeEqual(supplied,expected)},{status:supplied.length===expected.length&&timingSafeEqual(supplied,expected)?200:404});
 }
 if(p==='/api/account')return Response.json({error:'login_required'},{status:401});
 return new Response(null,{status:404});
}};
const DB={prepare(){throw Error('unexpected_database_access')}};
const {worker}=createPortalShell(base,{DB},{origin,socialItems:async()=>[]});
for(const p of routes)for(const method of ['GET','POST']){
 let r=await worker.fetch(new Request(origin+p,{method,headers:{'X-OSINT-Browser-Key':key}}));assert.equal(r.status,200);
 r=await worker.fetch(new Request(origin+p,{method}));assert.equal(r.status,404);
 r=await worker.fetch(new Request(origin+p,{method,headers:{'X-OSINT-Browser-Key':'wrong'}}));assert.equal(r.status,404);
}
for(const p of ['/api/admin/other','/api/admin/integrations/browser-worker-extra']){
 const r=await worker.fetch(new Request(origin+p,{headers:{'X-OSINT-Browser-Key':key}}));assert.equal(r.status,401);
}
assert.equal(validated,12);
console.log('PASS: both fixed service routes GET/POST reach key validation; missing/wrong key denied; unrelated admin paths denied');
