async function accountActor(request,env,user){return await teamActor(request,env)||await workspaceActor(request,env,user)}
function personalRecord(row,history=[]){return {eventId:row.event_id,title:row.title,url:row.url,status:row.status,saved:!!row.saved,notes:row.notes,revision:row.revision,viewedAt:row.viewed_at,updatedAt:row.updated_at,history}}
async function accountAPI(request,env,user,url){
 const actor=await accountActor(request,env,user);if(!actor)return json({error:'Kullanıcı girişi gerekli'},401);
 if(!['GET','POST'].includes(request.method))return json({error:'Yöntem desteklenmiyor'},405);
 if(request.method==='POST'&&request.headers.get('Origin')!==url.origin)return json({error:'İstek kaynağı reddedildi'},403);
 if(url.pathname==='/api/account/password'&&request.method==='POST'){
  if(actor.admin)return json({error:'Yönetici şifresi sunucunun gizli ayarlarından değiştirilir.'},403);
  const body=await readBody(request,4096),now=Math.floor(Date.now()/1000),key='password-change-'+actor.id;
  const guard=await env.DB.prepare('SELECT failures,reset_at FROM login_guard WHERE user_id=?').bind(key).first();
  if(guard?.failures>=5&&guard.reset_at>now)return json({error:'Çok fazla deneme. 15 dakika sonra yeniden deneyin.'},429);
  if(typeof body.currentPassword!=='string'||body.currentPassword.length>128||typeof body.newPassword!=='string'||body.newPassword.length<6||body.newPassword.length>128)return json({error:'Yeni şifre 6–128 karakter olmalı.'},400);
  const account=await env.DB.prepare('SELECT * FROM team_accounts WHERE id=?').bind(actor.id).first();
  if(!account?.active||!await equalSecret(await passwordHash(body.currentPassword,account.salt),account.password_hash)){
   const reset=guard?.reset_at>now?guard.reset_at:now+900;
   await env.DB.prepare('INSERT INTO login_guard(user_id,failures,reset_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET failures=CASE WHEN login_guard.reset_at<=? THEN 1 ELSE login_guard.failures+1 END,reset_at=excluded.reset_at').bind(key,1,reset,now).run();
   return json({error:'Mevcut şifreniz hatalı.'},400);
  }
  const salt=crypto.randomUUID(),hash=await passwordHash(body.newPassword,salt);
  const results=await env.DB.batch([
   env.DB.prepare('UPDATE team_accounts SET password_hash=?,salt=? WHERE id=? AND password_hash=? AND active=1').bind(hash,salt,actor.id,account.password_hash),
   env.DB.prepare('DELETE FROM team_sessions WHERE account_id=? AND EXISTS(SELECT 1 FROM team_accounts WHERE id=? AND password_hash=?)').bind(actor.id,actor.id,hash),
   env.DB.prepare('DELETE FROM login_guard WHERE user_id=?').bind(key)
  ]);
  if(!results[0].meta?.changes)return json({error:'Hesap değişti. Yeniden giriş yapın.'},409);
  return json({ok:true},200,{'Set-Cookie':'__Host-osint_team=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'});
 }
 if(url.pathname==='/api/account'&&request.method==='GET'){
  const rows=(await env.DB.prepare('SELECT * FROM personal_records WHERE account_id=? ORDER BY updated_at DESC').bind(actor.id).all()).results;
  const history=(await env.DB.prepare('SELECT id,event_id,title,action,created_at FROM personal_activity WHERE account_id=? ORDER BY created_at DESC,id DESC LIMIT 100').bind(actor.id).all()).results;
  const records={};for(const row of rows)records['live:'+row.event_id]=personalRecord(row,history.filter(h=>h.event_id===row.event_id).slice(0,30).reverse().map(h=>({at:h.created_at,action:h.action})));
  return json({actor:{id:actor.id,name:actor.name,username:actor.username||actor.name,admin:actor.admin},records,activity:history,activityTruncated:history.length===100});
 }
 if(url.pathname==='/api/account/history'&&request.method==='GET'){
  const id=String(url.searchParams.get('eventId')||'');if(!id||id.length>150)return json({error:'Geçersiz kayıt'},400);
  const rows=(await env.DB.prepare('SELECT id,event_id,title,action,created_at FROM personal_activity WHERE account_id=? AND event_id=? ORDER BY created_at DESC,id DESC LIMIT 100').bind(actor.id,id).all()).results;return json({entries:rows});
 }
 if(url.pathname!=='/api/account/record'||request.method!=='POST')return json({error:'Bulunamadı'},404);
 const body=await readBody(request,10000);if(body.expectedActorId!==undefined&&body.expectedActorId!==actor.id)return json({error:'Hesap değişti. İşlemi yeniden yapın.'},409);if(typeof body.eventId!=='string'||body.eventId.length>150)return json({error:'Geçersiz haber kaydı'},400);
 const data=await publishedData(env),event=data.events.find(e=>e.id===body.eventId||(e.relatedIds||[]).includes(body.eventId));
 const allAliases=event?[...new Set([event.id,...(event.relatedIds||[])])]:[body.eventId];
 if(body.recordEventId!==undefined&&(typeof body.recordEventId!=='string'||!allAliases.includes(body.recordEventId)))return json({error:'Kişisel kayıt bu olayla eşleşmiyor.'},400);
 const aliases=body.recordEventId?[body.recordEventId]:allAliases.slice(0,90);
 const existing=await env.DB.prepare('SELECT * FROM personal_records WHERE account_id=? AND event_id IN ('+aliases.map(()=>'?').join(',')+') ORDER BY updated_at DESC,event_id ASC LIMIT 1').bind(actor.id,...aliases).first();
 if(body.recordEventId&&!existing)return json({error:'Kişisel kayıt değişti. Hesabınızı yenileyin.'},409);
 if(!event&&!existing)return json({error:'Haber bulunamadı'},404);
 if(!['open','update'].includes(body.action))return json({error:'Geçersiz işlem'},400);
 if(body.action==='update'&&(!Number.isInteger(body.revision)||body.revision!==(existing?.revision||0)))return json({error:'Kayıt başka bir sekmede güncellendi. Hesabınızı yenileyip tekrar deneyin.'},409);
 const old=existing||{status:'unread',saved:0,notes:'',revision:0,viewed_at:null},at=new Date().toISOString();let status=old.status,saved=old.saved,notes=old.notes,viewedAt=old.viewed_at,changes=[];
 if(body.action==='open'){
  if(viewedAt&&Date.now()-Date.parse(viewedAt)<60000)return json({ok:true,key:'live:'+existing.event_id,record:personalRecord(existing)});
  viewedAt=at;changes.push('Haber açıldı');
 }else{
  if(body.status!==undefined){if(!['unread','reviewing','tracking','closed'].includes(body.status))return json({error:'Geçersiz inceleme durumu'},400);status=body.status;}
  if(body.saved!==undefined){if(typeof body.saved!=='boolean')return json({error:'Geçersiz kaydetme durumu'},400);saved=Number(body.saved);}
  if(body.notes!==undefined){if(typeof body.notes!=='string'||body.notes.length>5000)return json({error:'Not en fazla 5000 karakter olmalı'},400);notes=body.notes;}
  if(body.status==='tracking')saved=1;
  if(status!==old.status)changes.push('Durum: '+({unread:'İncelenmedi',reviewing:'İnceleniyor',tracking:'Takipte',closed:'Kapatıldı'}[status]));
  if(saved!==old.saved)changes.push(saved?'Haber kaydedildi':'Kayıtlılardan çıkarıldı');if(notes!==old.notes)changes.push('Kişisel not güncellendi');
  if(!changes.length)return json({ok:true,key:'live:'+(existing?.event_id||event.id),record:personalRecord({...old,event_id:existing?.event_id||event.id,title:existing?.title||event.title,url:existing?.url||event.sources?.[0]?.url||'',updated_at:existing?.updated_at||at})});
 }
 const eventId=existing?.event_id||event.id,id=existing?.id||crypto.randomUUID(),title=event?.title||existing.title,link=event?.sources?.[0]?.url||existing?.url||'',revision=old.revision+1,operationId=crypto.randomUUID();
 const update=existing?env.DB.prepare('UPDATE personal_records SET title=?,url=?,status=?,saved=?,notes=?,viewed_at=?,updated_at=?,operation_id=?,revision=revision+1 WHERE id=? AND account_id=? AND revision=?').bind(title,link,status,saved,notes,viewedAt,at,operationId,id,actor.id,old.revision):env.DB.prepare('INSERT OR IGNORE INTO personal_records(id,account_id,event_id,title,url,status,saved,notes,viewed_at,revision,updated_at,operation_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,actor.id,eventId,title,link,status,saved,notes,viewedAt,revision,at,operationId);
 const history=changes.map(action=>env.DB.prepare('INSERT INTO personal_activity(id,account_id,event_id,title,action,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM personal_records WHERE id=? AND account_id=? AND revision=? AND operation_id=?)').bind(crypto.randomUUID(),actor.id,eventId,title,action,at,id,actor.id,revision,operationId));
 const result=await env.DB.batch([update,...history]);if(!result[0].meta?.changes)return json({error:'Kayıt eşzamanlı değişti. Yenileyip tekrar deneyin.'},409);
 const row=await env.DB.prepare('SELECT * FROM personal_records WHERE id=? AND account_id=?').bind(id,actor.id).first();const entries=(await env.DB.prepare('SELECT action,created_at FROM personal_activity WHERE account_id=? AND event_id=? ORDER BY created_at DESC,id DESC LIMIT 30').bind(actor.id,eventId).all()).results;
 return json({ok:true,key:'live:'+eventId,record:personalRecord(row,entries.reverse().map(h=>({at:h.created_at,action:h.action})))});
}
