import test from'node:test';import assert from'node:assert/strict';import{DatabaseSync}from'node:sqlite';import{loadAuthorizedSourceData}from'./authorized-event.mjs';
test('source recovery uses exact event IDs, retained cache, latest snapshot, and keeps unrelated source private',async()=>{const d=new DatabaseSync(':memory:');try{
 d.exec('CREATE TABLE lab_items(id TEXT,data TEXT);CREATE TABLE snapshots(data TEXT,updated_at TEXT);CREATE TABLE coord_source_content(event_id TEXT,data TEXT)');
 d.prepare('INSERT INTO coord_source_content VALUES(?,?)').run('cached',JSON.stringify({id:'cached',fullText:'Retained full text'}));
 for(const [stamp,body]of [['2026-01-01','Old'],['2026-02-01','Latest']])d.prepare('INSERT INTO snapshots VALUES(?,?)').run(JSON.stringify({events:[{id:'snap',fullText:body},{id:'unrelated',fullText:'Other institution source'}]}),stamp);
 const db={prepare(sql){return{bind(...a){return{first:()=>d.prepare(sql).get(...a),all:()=>({results:d.prepare(sql).all(...a)})}}}}};
 const result=await loadAuthorizedSourceData(db,['cached','snap','absent']);assert.equal(JSON.parse(result.get('cached')).fullText,'Retained full text');assert.equal(JSON.parse(result.get('snap')).fullText,'Latest');assert.equal(result.has('absent'),false);assert.equal(result.has('unrelated'),false);
 }finally{d.close();}});
