import {readFile} from 'node:fs/promises';
import {createInstitutionCoordination} from './institution-coordination.mjs';

/** Mount around the outermost portal worker. Never trust client-supplied identity headers. */
export function createInstitutionHost({base,db,origin,actor,serviceRequestAllowed}) {
  if(typeof actor!=='function'||typeof serviceRequestAllowed!=='function')throw Error('host_security_adapters_required');
  const expected=new URL(origin).origin;
  const budgets=new Map();
  async function authenticate(request){const a=await actor(request);return a?{...a,accountId:a.id}:null}
  function csrf(request){return request.headers.get('origin')===expected && request.headers.get('x-osint-action')==='institution' && request.headers.get('content-type')?.startsWith('application/json')}
  const api=createInstitutionCoordination({db,authenticate,isCentralAdmin:a=>a.admin===true,verifyCsrf:csrf,
    accountExists:async id=>!!await db.prepare('SELECT id FROM team_accounts WHERE id=?').bind(id).first(),
    isAccountVerified:async id=>!!await db.prepare('SELECT id FROM team_accounts WHERE id=? AND active=1').bind(id).first(),
    rateLimit(a){const key=a.accountId,now=Date.now(),old=budgets.get(key);if(!old||now-old.at>60000){if(budgets.size>10000)budgets.clear();budgets.set(key,{at:now,n:1});return true}return ++old.n<=120;}
  });
  const loginPaths=new Set(['/giris','/yonetici-giris','/yonetim']);
  const loginAPIs=new Set(['/api/team/login','/api/team/logout','/api/admin/login','/api/admin/logout','/api/session','/api/login','/api/logout']);
  async function handle(request,...args){
    const u=new URL(request.url);
    if(u.origin!==expected)return new Response('Geçersiz istek kaynağı',{status:400});
    if(u.pathname==='/api/institution'||u.pathname.startsWith('/api/institution/'))return api.handle(request);
    // The trusted service adapter must authenticate an existing internal credential
    // and allow a fixed endpoint+method pair; loopback address alone is insufficient.
    if(await serviceRequestAllowed(request))return base.fetch(request,...args);
    if(loginPaths.has(u.pathname)||loginAPIs.has(u.pathname))return base.fetch(request,...args);
    const a=await authenticate(request);
    if(!a)return u.pathname.startsWith('/api/')?Response.json({error:'authentication_required'},{status:401}):Response.redirect(expected+'/giris',302);
    if(u.pathname==='/kurum/yonetim'||u.pathname==='/kurum/admin.js'){if(a.admin!==true)return new Response('Yetki gerekli',{status:403});const js=u.pathname.endsWith('.js');return new Response(await readFile(new URL(js?'../web/admin.js':'../web/admin.html',import.meta.url)),{headers:{'content-type':js?'text/javascript; charset=utf-8':'text/html; charset=utf-8','cache-control':'no-store'}})}
    if(u.pathname==='/kurum')return new Response(await readFile(new URL('../web/institution.html',import.meta.url)),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
    if(u.pathname==='/kurum/institution.js')return new Response(await readFile(new URL('../web/institution.js',import.meta.url)),{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'}});
    if(a.admin===true)return base.fetch(request,...args);
    const approved=await db.prepare(`SELECT account_id FROM coord_portal_viewers WHERE account_id=? AND active=1`).bind(a.accountId).first();
    if(approved)return base.fetch(request,...args);
    if(u.pathname.startsWith('/api/')||u.pathname.startsWith('/assets/'))return Response.json({error:'approved_portal_access_required'},{status:403,headers:{'cache-control':'no-store'}});
    return Response.redirect(expected+'/kurum',302);
  }
  return {fetch:handle};
}
