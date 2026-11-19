import {randomUUID,randomBytes,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
export function createInstitutionRecipients({db,key}){
 if(!Buffer.isBuffer(key)||key.length!==32)throw Error('recipient_key_required');
 async function institution(code){const r=await db.prepare('SELECT id FROM coord_institutions WHERE code=?').bind(code).first();if(!r)throw Error('institution_not_found');return r.id}
 async function list(code){return (await db.prepare('SELECT id,address_ciphertext,key_version,active,verified_at FROM coord_mail_recipients WHERE institution_id=? ORDER BY created_at').bind(await institution(code)).all()).results.map(r=>({id:r.id,address:decrypt({ciphertext:r.address_ciphertext,keyVersion:r.key_version}),active:!!r.active,verifiedAt:r.verified_at}))}
 function decrypt({ciphertext,keyVersion}){if(keyVersion!=='institution-mail-v1')throw Error('recipient_key_version_invalid');const b=Buffer.from(ciphertext,'base64'),d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAAD(Buffer.from(keyVersion));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8')}
 async function save(actor,code,{address,active}){
  if(typeof address!=='string'||address.length>254||!(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(address)))throw Error('valid_email_required');
  if(typeof active!=='boolean')throw Error('invalid_active_required');
  const i=await institution(code),version='institution-mail-v1',iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(version));
  const encrypted=Buffer.concat([c.update(address,'utf8'),c.final()]),sealed=Buffer.concat([iv,c.getAuthTag(),encrypted]).toString('base64');
  const fingerprint=createHash('sha256').update(address.toLowerCase()).digest('hex'),at=new Date().toISOString();
  const statements=[db.prepare(`INSERT INTO coord_mail_recipients(id,institution_id,address_ciphertext,key_version,address_fingerprint,verified_at,verified_by,active,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(institution_id,address_fingerprint) DO UPDATE SET active=excluded.active,verified_at=excluded.verified_at,verified_by=excluded.verified_by,updated_at=excluded.updated_at`)
    .bind(randomUUID(),i,sealed,version,fingerprint,active?at:null,active?actor:null,active?1:0,at,at),
   db.prepare(`INSERT INTO coord_audit(id,actor_account_id,actor_kind,institution_id,action,target_type,created_at) VALUES(?,?,'central_admin',?,'recipient_saved','recipient',?)`).bind(randomUUID(),actor,i,at)];
  if(active)statements.push(db.prepare(`UPDATE coord_institutions SET email_enabled=1,updated_at=? WHERE id=? AND enabled=1 AND approval_status='approved'`).bind(at,i));
  await db.batch(statements);
  return {ok:true};
 }
 async function deactivate(actor,code,id,requestId=null){const i=await institution(code),at=new Date().toISOString();const r=await db.batch([db.prepare('UPDATE coord_mail_recipients SET active=0,updated_at=? WHERE id=? AND institution_id=?').bind(at,id,i),db.prepare(`UPDATE coord_mail_outbox SET state='cancelled',last_error_code='recipient_disabled' WHERE recipient_id=? AND institution_id=? AND state IN ('held','queued')`).bind(id,i),db.prepare(`INSERT INTO coord_audit(id,actor_account_id,actor_kind,institution_id,action,target_type,target_id,request_id,created_at) SELECT ?,?,'central_admin',?,'recipient_disabled','recipient',?,?,? WHERE EXISTS(SELECT 1 FROM coord_mail_recipients WHERE id=? AND institution_id=?)`).bind(randomUUID(),actor,i,id,requestId,at,id,i)]);if(Number(r?.[0]?.meta?.changes??r?.[0]?.changes??0)!==1)throw Error('recipient_not_found');return {ok:true}}
 return {list,save,deactivate,decrypt};
}
