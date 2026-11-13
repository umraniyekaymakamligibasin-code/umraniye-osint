import {randomBytes,randomUUID,createCipheriv,createDecipheriv,pbkdf2Sync} from 'node:crypto';
const hash=(password,salt)=>pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex');
export function createInstitutionCredentials({db,key}){
 if(!Buffer.isBuffer(key)||key.length!==32)throw Error('credential_key_required');
 const stamp=()=>new Date().toISOString();
 const seal=(password,id)=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(id));const b=Buffer.concat([c.update(password,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),b]).toString('base64')};
 const open=(value,id)=>{const b=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAAD(Buffer.from(id));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8')};
 const audit=(actor,action,target)=>db.prepare(`INSERT INTO coord_audit(id,actor_account_id,actor_kind,action,target_type,target_id,created_at) VALUES(?,?,'central_admin',?,'credential',?,?)`).bind(randomUUID(),actor,action,target,stamp());
 async function provision(actor){
  const rows=(await db.prepare("SELECT id,code,display_name FROM coord_institutions ORDER BY code").all()).results;let created=0;
  for(const i of rows){
   if(await db.prepare('SELECT account_id FROM coord_account_credentials WHERE institution_id=?').bind(i.id).first())continue;
   const username='kurum_'+i.code.toLowerCase();
   if(await db.prepare('SELECT id FROM team_accounts WHERE username=?').bind(username).first())throw Error('username_collision_'+i.code);
   const id=randomUUID(),password=randomBytes(24).toString('base64url'),salt=randomUUID(),digest=hash(password,salt),at=stamp();
   await db.batch([
    db.prepare('INSERT INTO team_accounts(id,username,name,email,password_hash,salt,active,created_at) VALUES(?,?,?,?,?,?,1,?)').bind(id,username,i.display_name,'',digest,salt,at),
    db.prepare('INSERT INTO coord_account_credentials(institution_id,account_id,sealed,password_hash,updated_at) VALUES(?,?,?,?,?)').bind(i.id,id,seal(password,id),digest,at),
    db.prepare(`INSERT INTO coord_memberships(id,institution_id,account_id,role,active,approval_reference,approved_by,approved_at,created_at,updated_at) VALUES(?,?,?,'case_worker',1,?,?,?,?,?)`).bind(randomUUID(),i.id,id,'Kullanıcının otomatik kurum hesabı talebi',actor,at,at,at),
    audit(actor,'institution_account_created',id)
   ]);created++;
  }return {created};
 }
 async function list(){return (await db.prepare(`SELECT i.code,i.display_name,a.id account_id,a.username,a.active,c.updated_at FROM coord_account_credentials c JOIN coord_institutions i ON i.id=c.institution_id JOIN team_accounts a ON a.id=c.account_id ORDER BY i.display_name`).all()).results}
 async function reveal(actor,account){const r=await db.prepare(`SELECT c.sealed,c.password_hash,a.password_hash current_hash FROM coord_account_credentials c JOIN team_accounts a ON a.id=c.account_id WHERE c.account_id=?`).bind(account).first();if(!r)throw Error('account_not_found');if(r.password_hash!==r.current_hash)throw Error('password_changed_outside_vault');await audit(actor,'institution_password_revealed',account).run();return {password:open(r.sealed,account)}}
 async function rotate(actor,account,password){if(typeof password!=='string'||password.length<16||password.length>128)throw Error('password_16_to_128_required');if(!await db.prepare('SELECT account_id FROM coord_account_credentials WHERE account_id=?').bind(account).first())throw Error('account_not_found');const salt=randomUUID(),digest=hash(password,salt);await db.batch([db.prepare('UPDATE team_accounts SET password_hash=?,salt=? WHERE id=?').bind(digest,salt,account),db.prepare('DELETE FROM team_sessions WHERE account_id=?').bind(account),db.prepare('UPDATE coord_account_credentials SET sealed=?,password_hash=?,updated_at=? WHERE account_id=?').bind(seal(password,account),digest,stamp(),account),audit(actor,'institution_password_changed',account)]);return {ok:true}}
 return {provision,list,reveal,rotate};
}
