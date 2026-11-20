import{catalog}from'./catalog.mjs';
// Additive data migration, disabled and pending. No grants or users modified.
export function registerCatalog(db,{allowWrites=false}={}){
 if(!allowWrites)throw Error('catalog_registration_requires_explicit_opt_in');
 let inserted=0;db.exec('BEGIN IMMEDIATE');
 try{const stmt=db.prepare("INSERT INTO coord_topics(id,code,display_name,sensitivity,approval_status,approval_reference,enabled,created_at,updated_at) VALUES(?,?,?,?,'pending',NULL,0,?,?) ON CONFLICT(code) DO NOTHING");
  const now=new Date().toISOString();for(const r of catalog)inserted+=stmt.run('citizen-shadow:'+r.code,r.code,r.title,r.sensitivity,now,now).changes;
  db.exec('COMMIT');return{inserted,enabled:0,grantsCreated:0};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
export function rollbackCatalog(db,{allowWrites=false}={}){
 if(!allowWrites)throw Error('catalog_rollback_requires_explicit_opt_in');
 db.exec('BEGIN IMMEDIATE');let removed=0;
 try{for(const r of catalog){const row=db.prepare('SELECT id,enabled,approval_status FROM coord_topics WHERE id=? AND code=?').get('citizen-shadow:'+r.code,r.code);if(!row)continue;
   if(row.enabled||row.approval_status!=='pending'||db.prepare('SELECT 1 FROM coord_cases WHERE topic_id=? LIMIT 1').get(row.id)||db.prepare('SELECT 1 FROM coord_institution_topic_grants WHERE topic_id=? LIMIT 1').get(row.id))throw Error('used_or_approved_topic_rollback_refused');
   removed+=db.prepare('DELETE FROM coord_topics WHERE id=?').run(row.id).changes;
  }db.exec('COMMIT');return{removed};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
