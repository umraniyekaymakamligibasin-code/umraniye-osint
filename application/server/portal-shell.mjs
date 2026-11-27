import {createInstitutionHost} from './institution-coordination/server/institution-host.mjs';
import {createContentModeration} from './content-moderation.mjs';
import {readFile} from 'node:fs/promises';
import {createPortalAPI} from './portal-api.mjs';
import {createAssetResponder} from './portal-assets.mjs';
const assets=new Map([['/assets/content-moderation-ui.js',['content-moderation-ui.js','application/javascript']],['/assets/content-moderation-ui.css',['content-moderation-ui.css','text/css']],['/assets/portal.css',['portal.css','text/css']],['/assets/portal.js',['portal.js','application/javascript']],['/assets/admin-portal.css',['admin-portal.css','text/css']],['/assets/InterVariable.woff2',['InterVariable.woff2','font/woff2']]]);
export function createPortalShell(base,env,{origin,socialItems}){
 assets.set('/assets/workspace-refresh.css',['workspace-refresh.css','text/css']);
 assets.set('/assets/vendor/tabler/tabler.min.css',['vendor/tabler/tabler.min.css','text/css']);
 const assetResponse=createAssetResponder(assets,new URL('../src/assets/',import.meta.url));
 const portal=createPortalAPI(base,env,{origin,live:true,socialItems});
 const moderation=createContentModeration({base,env,origin,socialItems,actor:portal.actor,invalidate:portal.invalidate});
 function styled(html){const page=html.replace("</head>","<link rel=\"stylesheet\" href=\"/assets/admin-portal.css\"></head>");const withToggle=page.includes("PORTAL_THEME_TOGGLE")?page:page.replace("</body>","<script>/*PORTAL_THEME_TOGGLE*/(function(){var k='umraniye-ui-theme';function sync(){var d=document.documentElement.dataset.theme==='dark';var b=document.getElementById('ui-theme-toggle');if(b){b.setAttribute('aria-pressed',String(d));b.title=d?'Ayd\u0131nl\u0131k temaya ge\u00e7':'Gece temas\u0131na ge\u00e7';b.setAttribute('aria-label',b.title);var t=b.querySelector('span');if(t)t.textContent=d?'Ayd\u0131nl\u0131k':'Gece';}}if(!document.getElementById('ui-theme-toggle')){var btn=document.createElement('button');btn.type='button';btn.id='ui-theme-toggle';btn.className='ui-theme-toggle';btn.setAttribute('aria-pressed','false');btn.setAttribute('aria-label','Gece temas\u0131na ge\u00e7');btn.title='Gece temas\u0131na ge\u00e7';btn.innerHTML='<svg viewBox=\"0 0 24 24\"><path d=\"M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z\"/></svg><span>Gece</span>';document.body.appendChild(btn);}document.addEventListener('click',function(e){var b=e.target.closest('#ui-theme-toggle');if(!b)return;var d=document.documentElement.dataset.theme==='dark';if(d)delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme='dark';try{localStorage.setItem(k,d?'light':'dark')}catch(e){}sync();});sync();})();</script></body>");return withToggle.includes("Hakan Bilgin")?withToggle:withToggle.replace("</body>","<div style=\"padding:18px;text-align:center;font-size:12px;color:#667085\">\u00a9 2026 Hakan Bilgin. T\u00fcm haklar\u0131 sakl\u0131d\u0131r.</div></body>");}
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
  if(request.method==='POST'&&r.ok&&u.pathname.startsWith('/api/admin/'))portal.invalidate(true);
  if(r.headers.get('content-type')?.includes('text/html'))return new Response(styled(await r.text()),{status:r.status,headers:r.headers});return r;
 }};
 const institutional=createInstitutionHost({base:worker,db:env.DB,origin,actor:portal.actor,
 serviceRequestAllowed:async request=>{
 const p=new URL(request.url).pathname;
 // These fixed routes retain their existing constant-time secret validation inside lab.worker.
 return ['GET','POST'].includes(request.method)&&['/api/admin/integrations/browser-facebook','/api/admin/integrations/browser-worker'].includes(p);
 }});
 return {worker:institutional,invalidate:portal.invalidate,warm:portal.warm};
}
