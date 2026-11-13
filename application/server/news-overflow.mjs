// Durable overflow for pending article candidates; no application database migrations.
import {DatabaseSync} from 'node:sqlite';
import {existsSync,mkdirSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
export function openNewsOverflow(stateDir,source,{create=false}={}){
 if(!stateDir)return null;
 const path=join(stateDir,'pending-overflow.sqlite');
 if(!create&&!existsSync(path))return null;
 mkdirSync(stateDir,{recursive:true,mode:0o700});
 const db=new DatabaseSync(path);
 try{
  chmodSync(path,0o600);db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS pending(source TEXT NOT NULL,url TEXT NOT NULL,seen INTEGER NOT NULL,score REAL NOT NULL,data TEXT NOT NULL,PRIMARY KEY(source,url))');
 }catch(error){db.close();throw error;}
 return {
  recover(active,capacity){
   const rows=[],ack=[];
   for(const row of db.prepare('SELECT url,data FROM pending WHERE source=? ORDER BY score DESC,seen ASC,url').iterate(source)){
    if(Object.hasOwn(active,row.url)){ack.push(row.url);continue;}
    if(rows.length>=capacity)break;
    rows.push([row.url,JSON.parse(row.data)]);ack.push(row.url);
   }
   return {rows,ack};
  },
  spill(rows,score){
   db.exec('BEGIN IMMEDIATE');
   try{
    const insert=db.prepare('INSERT INTO pending(source,url,seen,score,data) VALUES(?,?,?,?,?) ON CONFLICT(source,url) DO UPDATE SET seen=excluded.seen,score=excluded.score,data=excluded.data');
    for(const [url,row] of rows)insert.run(source,url,row.seen,score(row.item),JSON.stringify(row));
    db.exec('COMMIT');
   }catch(error){db.exec('ROLLBACK');throw error;}
  },
  acknowledge(urls){
   db.exec('BEGIN IMMEDIATE');
   try{const remove=db.prepare('DELETE FROM pending WHERE source=? AND url=?');for(const url of urls)remove.run(source,url);db.exec('COMMIT');}
   catch(error){db.exec('ROLLBACK');throw error;}
  },
  get count(){return Number(db.prepare('SELECT count(*) AS n FROM pending WHERE source=?').get(source).n);},
  close(){db.close();}
 };
}
