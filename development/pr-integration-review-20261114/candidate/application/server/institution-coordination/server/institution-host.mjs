import {createInstitutionRecipients} from './institution-recipients.mjs';
import {createInstitutionCredentials} from './institution-credentials.mjs';
import {join,resolve} from 'node:path';
import {readFile} from 'node:fs/promises';

import {createInstitutionCoordination} from './institution-coordination.mjs';



/** Mount around the outermost portal worker. Never trust client-supplied identity headers. */

export function createInstitutionHost({base,db,origin,actor,serviceRequestAllowed}) {

  if(typeof actor!=='function'||typeof serviceRequestAllowed!=='function')throw Error('host_security_adapters_required');

  const expected=new URL(origin).origin;

  const budgets=new Map();

  // handle() and the HTML wrapper below both authenticate the same Request; each call is an
  // internal /api/account round trip, so resolve it once per request object.
  const actors=new WeakMap();
  function authenticate(request){let p=actors.get(request);if(!p){p=Promise.resolve().then(()=>actor(request)).then(a=>a?{...a,accountId:a.id}:null);actors.set(request,p);p.catch(()=>actors.delete(request))}return p}

  function csrf(request){return request.headers.get('origin')===expected && request.headers.get('x-osint-action')==='institution' && request.headers.get('content-type')?.startsWith('application/json')}

  let vaultPromise,recipientPromise;
  // Same default as server/start.mjs. A failed key load is not cached forever: the next request retries.
  const dataDir=resolve(process.env.DATA_DIR||'./data');
  const credentials=()=>vaultPromise??=(async()=>createInstitutionCredentials({db,key:await (await import('../../accounts.mjs')).accountKey(join(dataDir,'institution-credentials.key'))}))().catch(e=>{vaultPromise=null;throw e});
  const recipients=()=>recipientPromise??=(async()=>createInstitutionRecipients({db,key:await (await import('../../accounts.mjs')).accountKey(join(dataDir,'institution-recipients.key'))}))().catch(e=>{recipientPromise=null;throw e});
  const api=createInstitutionCoordination({db,authenticate,credentials,recipients,isCentralAdmin:a=>a.admin===true,verifyCsrf:csrf,

    accountExists:async id=>!!await db.prepare('SELECT id FROM team_accounts WHERE id=?').bind(id).first(),

    isAccountVerified:async id=>!!await db.prepare('SELECT id FROM team_accounts WHERE id=? AND active=1').bind(id).first(),

    rateLimit(a){const key=a.accountId,now=Date.now(),old=budgets.get(key);if(!old||now-old.at>60000){if(budgets.size>10000)budgets.clear();budgets.set(key,{at:now,n:1});return true}return ++old.n<=120;}

  });

  const loginPaths=new Set(['/giris','/yonetici-giris','/yonetim']);

  // The login screens need their logo, font and stylesheet before a session exists. Only these fixed public files are exempt.
  const publicAssets=new Set(['/favicon.png','/assets/umraniye-kaymakamligi-logo.png','/assets/admin-portal.css','/assets/InterVariable.woff2']);

  const loginAPIs=new Set(['/api/team/login','/api/team/logout','/api/admin/login','/api/admin/logout','/api/session','/api/login','/api/logout']);

  async function handle(request,...args){

    const u=new URL(request.url);

    if(u.origin!==expected)return new Response('Geçersiz istek kaynağı',{status:400});

    if(u.pathname==='/api/institution'||u.pathname.startsWith('/api/institution/'))return api.handle(request);

    // The trusted service adapter must authenticate an existing internal credential

    // and allow a fixed endpoint+method pair; loopback address alone is insufficient.

    if(await serviceRequestAllowed(request))return base.fetch(request,...args);

    if(loginPaths.has(u.pathname)||loginAPIs.has(u.pathname)||(publicAssets.has(u.pathname)&&['GET','HEAD'].includes(request.method)))return base.fetch(request,...args);

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

  return {async fetch(request,...args){
    const response=await handle(request,...args);
    if(!response.headers.get('content-type')?.includes('text/html'))return response;
    const a=await authenticate(request);
    if(a?.admin!==true)return response;
    const html=await response.text();
    const nav='<nav aria-label="Kurum işlemleri" style="padding:12px 24px;background:#fff;border-bottom:1px solid #e6e8ec;display:flex;gap:20px"><a href="/" style="color:#344054">Gündem</a><a href="/kurum/yonetim" style="color:#b91c24;font-weight:600">Kurum Yönetimi</a><a href="/kurum" style="color:#344054">Kurum Olayları</a></nav>';
    return new Response(html.replace(/(<body\b[^>]*>)/i,'$1'+nav),{status:response.status,headers:response.headers});
  }};

}

