import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {createPortalShell}=await import(pathToFileURL(process.argv[2]));
const DB={prepare(){throw Error('unexpected_database_access')}};
// Authentication stub is local to this test; production has no x-ui-test handling.
const base={fetch:async r=>new URL(r.url).pathname==='/api/account'
 ?r.headers.get('x-ui-test')==='owner'?Response.json({actor:{id:'fixture',admin:true}}):new Response(null,{status:401})
 :new Response(null,{status:404})};
const p=createPortalShell(base,{DB},{origin:'https://ui.invalid',socialItems:async()=>[]});
assert.equal((await p.worker.fetch(new Request('https://ui.invalid/assets/portal-editorial.css'))).status,302);
const r=await p.worker.fetch(new Request('https://ui.invalid/assets/portal-editorial.css',{headers:{'x-ui-test':'owner'}}));
assert.equal(r.status,200);assert(r.headers.get('content-type').includes('text/css'));
assert((await r.text()).includes('data-ui'));
console.log('PASS: authenticated CSS asset route; anonymous access requires login; no database access');
