import {DatabaseSync,backup} from 'node:sqlite';
import {readFileSync,readdirSync,mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
export function openDatabase(path){
 if(!path||path===':memory:')throw Error('Kalıcı veritabanı dosyası gerekli.');
 mkdirSync(dirname(path),{recursive:true,mode:0o700});
 const db=new DatabaseSync(path,{timeout:5000});
 try{
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY,checksum TEXT NOT NULL)');
  for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()){
   const sql=readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'),checksum=createHash('sha256').update(sql).digest('hex'),old=db.prepare('SELECT checksum FROM local_migrations WHERE name=?').get(name);
   if(old){if(old.checksum!==checksum)throw Error('Uygulanmış veritabanı geçişi değiştirilemez: '+name);continue;}
   db.exec('BEGIN IMMEDIATE');try{db.exec(sql);db.prepare('INSERT INTO local_migrations VALUES(?,?)').run(name,checksum);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
  }
  if(process.platform!=='win32')chmodSync(path,0o600);
 }catch(e){db.close();throw e}
 function prepare(sql){let args=[];return {bind(...v){args=v;return this},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){return run(sql,args)},_run(){return run(sql,args)}}}
 function run(sql,args){if(/^\s*(SELECT|PRAGMA)\b/i.test(sql))return {success:true,results:db.prepare(sql).all(...args)};const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}
 return {prepare,async batch(statements){db.exec('BEGIN IMMEDIATE');try{const results=statements.map(q=>q._run());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}},async backupTo(target){await backup(db,target);if(process.platform!=='win32')chmodSync(target,0o600)},close(){db.close()}};
}
