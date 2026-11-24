import test from'node:test';import assert from'node:assert/strict';import{DatabaseSync}from'node:sqlite';import{readFileSync}from'node:fs';import{initDelivery,runBatch}from'./pipeline.mjs';import{catalog}from'./catalog.mjs';
import{createInstitutionCoordination}from'../server/institution-coordination.mjs';
import{fallbackDecision}from'./legacy-rules.mjs';import{snapshot,adaptEvent}from'./live-adapter.mjs';
import{mkdtempSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
function fixture(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;CREATE TABLE team_accounts(id TEXT PRIMARY KEY,active INTEGER);CREATE TABLE lab_items(id TEXT PRIMARY KEY,data TEXT)');db.exec(readFileSync(new URL('../../../drizzle/0009_institution_coordination.sql',import.meta.url),'utf8'));const rule=catalog.find(r=>r.title==='su kesintisi var');db.exec("UPDATE coord_institutions SET enabled=1,approval_status='approved',approval_reference='test' WHERE code='ISKI_UMR'");db.prepare("INSERT INTO coord_topics VALUES('water',?,?,'ordinary','approved','test',1,'2026','2026')").run(rule.code,rule.title);db.exec("INSERT INTO coord_institution_topic_grants VALUES('catalog-ISKI_UMR','water',1,'test','test','2026')");initDelivery(db);return db;}
const event=(id='one',description="Ümraniye'de su kesintisi var")=>({id,description,url:'https://example.invalid/news/'+id,publishedAt:'2026-11-20T10:00:00Z'});
function put(db,e){db.prepare('INSERT INTO lab_items VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(e.id,JSON.stringify(e));}
const run=(db,options={})=>runBatch(db,{now:1000000,policyVersion:'test',...options});

test('publication order, equal instant cursor and per-user read history remain tenant isolated',async()=>{
 const db=fixture();try{
  db.exec(readFileSync(new URL('../../../drizzle/0012_institution_referrals.sql',import.meta.url),'utf8'));
  db.exec("INSERT INTO team_accounts VALUES('viewer',1);INSERT INTO team_accounts VALUES('second',1);INSERT INTO coord_memberships VALUES('member','catalog-ISKI_UMR','viewer','viewer',1,'test','test','2026','2026','2026');INSERT INTO coord_memberships VALUES('member2','catalog-ISKI_UMR','second','viewer',1,'test','test','2026','2026','2026')");
  for(const [id,date]of [['newer','2026-11-23T12:00:00Z'],['late-old','2026-11-20T10:00:00Z'],['same-instant','2026-11-23T15:00:00+03:00']]){put(db,{...event(id),publishedAt:date});run(db);}
  db.prepare("UPDATE coord_cases SET created_at='2030-01-01T00:00:00Z' WHERE source_event_id='late-old'").run();
  const adapter={prepare(sql){return{bind(...args){return{first:()=>db.prepare(sql).get(...args),all:()=>({results:db.prepare(sql).all(...args)}),run:()=>({meta:db.prepare(sql).run(...args)})}}}}};
  let actor='viewer';const api=createInstitutionCoordination({db:adapter,authenticate:async()=>({accountId:actor}),isCentralAdmin:async()=>false,verifyCsrf:async()=>false,rateLimit:async()=>true});
  const get=async path=>{const response=await api.handle(new Request('https://fixture.invalid/api/institution/'+path));assert.equal(response.status,200);return response.json();};
  const pages=[];let cursor=null;do{const p=await get('cases?institution=ISKI_UMR&limit=1'+(cursor?'&before='+cursor:''));assert.equal(p.cases.length,1);pages.push(p.cases[0]);cursor=p.nextBefore;}while(cursor);
  assert.equal(new Set(pages.map(c=>c.id)).size,3);assert.equal(pages.at(-1).source_event_id,'late-old');assert.equal(pages[0].sort_at,pages[1].sort_at);assert.equal(pages[0].is_read,false);
  await get('cases/'+pages[0].id+'?institution=ISKI_UMR');assert.equal((await get('cases?institution=ISKI_UMR')).cases.find(c=>c.id===pages[0].id).is_read,true);
  actor='second';assert.equal((await get('cases?institution=ISKI_UMR')).cases.find(c=>c.id===pages[0].id).is_read,false);
  assert.equal((await api.handle(new Request('https://fixture.invalid/api/institution/cases/'+pages[0].id+'?institution=UMR_EMNIYET'))).status,404);
 }finally{db.close();}
});
