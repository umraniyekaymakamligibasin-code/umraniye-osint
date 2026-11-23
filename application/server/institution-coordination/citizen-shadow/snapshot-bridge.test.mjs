import test from 'node:test';import assert from 'node:assert/strict';import{DatabaseSync}from'node:sqlite';import{importSnapshotSources}from'./pipeline.mjs';
test('snapshot import updates content, preserves first sight and never overwrites social source',()=>{const db=new DatabaseSync(':memory:');try{
 db.exec('CREATE TABLE snapshots(data TEXT,updated_at TEXT);CREATE TABLE lab_items(id TEXT PRIMARY KEY,source_id TEXT,data TEXT,published_at TEXT,collected_at TEXT)');
 const e={id:'web',scope:'local',url:'https://example.org/news',publishedAt:'2026-11-23T10:00:00Z',description:'First report'};
 const put=x=>{db.exec('DELETE FROM snapshots');db.prepare('INSERT INTO snapshots VALUES(?,?)').run(JSON.stringify({events:[x]}),'2026-11-23T11:00:00Z');};
 put(e);assert.equal(importSnapshotSources(db),1);assert.equal(importSnapshotSources(db),0);
 put({...e,description:'Corrected full report',collectedAt:'2026-11-23T12:00:00Z'});importSnapshotSources(db);
 let row=db.prepare('SELECT * FROM lab_items').get();assert.equal(JSON.parse(row.data).description,'Corrected full report');assert.equal(JSON.parse(row.data).firstSeenAt,'2026-11-23T11:00:00Z');
 db.prepare("UPDATE lab_items SET source_id='browser-research'").run();put({...e,description:'Wrong overwrite'});importSnapshotSources(db);assert.equal(JSON.parse(db.prepare('SELECT data FROM lab_items').get().data).description,'Corrected full report');
 }finally{db.close();}});
