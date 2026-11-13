import {createInstitutionHost} from './institution-coordination/server/institution-host.mjs';
import {createContentModeration} from './content-moderation.mjs';
import {readFile} from 'node:fs/promises';
import {createPortalAPI} from './portal-api.mjs';
import {createAssetResponder} from './portal-assets.mjs';
const assets=new Map([['/assets/content-moderation-ui.js',['content-moderation-ui.js','application/javascript']],['/assets/content-moderation-ui.css',['content-moderation-ui.css','text/css']],['/assets/portal.css',['portal.css','text/css']],['/assets/portal.js',['portal.js','application/javascript']],['/assets/admin-portal.css',['admin-portal.css','text/css']],['/assets/portal-tasarim-c.css',['portal-tasarim-c.css','text/css']],['/assets/InterVariable.woff2',['InterVariable.woff2','font/woff2']]]);
export function createPortalShell(base,env,{origin,socialItems}){
 assets.set('/assets/workspace-refresh.css',['workspace-refresh.css','text/css']);
 assets.set('/assets/vendor/tabler/tabler.min.css',['vendor/tabler/tabler.min.css','text/css']);
 const assetResponse=createAssetResponder(assets,new URL('../src/assets/',import.meta.url));
 const portal=createPortalAPI(base,env,{origin,live:true,socialItems});
 const moderation=createContentModeration({base,env,origin,socialItems,actor:portal.actor,invalidate:portal.invalidate});
 function styled(html){const page=html.replace('</head>','<link rel="stylesheet" href="/assets/admin-portal.css"></head>');return page.includes('Hakan Bilgin')?page:page.replace('</body>','<div style="padding:18px;text-align:center;font-size:12px;color:#667085">© 2026 Hakan Bilgin. Tüm hakları saklıdır.</div></body>');}
 const worker={async fetch(request,...args){
    const u=new URL(request.url);
    if(u.pathname==='/icerik-denetim'){const a=await portal.actor(request);if(!a)return Response.redirect(origin+'/giris',302);if(!a.admin)return new Response('Yonetici yetkisi gerekli',{status:403});return new Response(moderation.html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}}); }
    if(u.pathname.startsWith('/api/moderation/'))return moderation.handle(request);
  if(assets.has(u.pathname))return assetResponse(request);
  const response=await portal.fetch(request);if(response)return response;
  if(u.pathname==='/api/social'){
   if(!await portal.actor(request))return Response.json({error:'Kullanıcı girişi gerekli'},{status:401});
   return Response.json({items:await moderation.filter(await socialItems())},{headers:{'Cache-Control':'no-store'}});
  }
  if(u.pathname==='/sosyal-medya')return Response.redirect(origin+'/?page=social',302);
  if(u.pathname==='/'||u.pathname==='/index.html'){
   if(u.searchParams.has('view'))return Response.redirect(origin+'/calisma'+u.search,302);
   if(!await portal.actor(request))return Response.redirect(origin+'/giris',302);
   return new Response(await readFile(new URL('../src/portal.html',import.meta.url)),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  }
  if(u.pathname==='/calisma'){
   const next=new URL(request.url);next.pathname='/';const r=await base.fetch(new Request(next,{headers:request.headers}),...args);
   if(r.headers.get('content-type')?.includes('text/html'))return new Response(styled(await r.text()),{status:r.status,headers:r.headers});return r;
  }
  const r=await base.fetch(request,...args);
  if(request.method==='POST'&&r.ok&&u.pathname.startsWith('/api/admin/'))portal.invalidate();
  if(r.headers.get('content-type')?.includes('text/html'))return new Response(styled(await r.text()),{status:r.status,headers:r.headers});return r;
 }};
 const institutional=createInstitutionHost({base:worker,db:env.DB,origin,actor:portal.actor,
 serviceRequestAllowed:async request=>{
 const p=new URL(request.url).pathname;
 // These fixed routes retain their existing constant-time secret validation inside lab.worker.
 return ['GET','POST'].includes(request.method)&&['/api/admin/integrations/browser-facebook','/api/admin/integrations/browser-worker'].includes(p);
 }});
 return {worker:institutional,invalidate:portal.invalidate};
}
