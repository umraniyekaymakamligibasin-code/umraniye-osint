const WORKSPACE_HTML=__WORKSPACE_HTML__;
const TEAM_LOGIN_HTML=__TEAM_LOGIN_HTML__;
const MAP_DATA=__MAP_DATA__;
const DEFAULT_SETTINGS={disabledSources:[],extraTerms:[],excludedTerms:[],groupSimilar:true,splitEventIds:[],alertTopics:[],alertNeighborhoods:[],alertKeywords:[],briefMorningHour:8,briefEveningHour:18};
async function workspaceSettings(env){if(!env?.DB)return {...DEFAULT_SETTINGS};const row=await env.DB.prepare('SELECT data FROM workspace_settings WHERE id=?').bind('main').first();try{return {...DEFAULT_SETTINGS,...(row?JSON.parse(row.data):{})}}catch{return {...DEFAULT_SETTINGS}}}
function profileFor(settings){return settings.extraTerms?.length?[...KEYWORD_GROUPS,{name:'Yönetici tarafından eklenen ifadeler',terms:settings.extraTerms,context:'Genel ifadeler ilçe bağlamıyla birlikte kullanılır.'}]:KEYWORD_GROUPS}
function activeSources(settings){return SOURCES.filter(s=>!settings.disabledSources.includes(s.id))}
function csvCell(value){let v=String(value??'');if(/^[\s]*[=+@\-\t\r\n]/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"'}
export function eventsCSV(events){return '\ufeff'+[['Başlık','Konu','Mahalle','Yayın tarihi','Yayıncı sayısı','Yayın sayısı','Özgün yayın bağlantıları'],...events.map(e=>[e.title,e.topic,e.neighborhood,e.publishedAt||'',e.publisherCount||new Set(e.sources.map(s=>s.sourceId||s.sourceName)).size,e.sources.length,e.sources.map(s=>s.url).join(' | ')])].map(row=>row.map(csvCell).join(';')).join('\r\n')}
function turkeyDay(value=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))}
function incidentKind(text){const t=norm(text);if(/balkon\w* cok|balkon\w* cokk|balkon.{0,20}cokme/.test(t))return 'balcony';if(/yangin|alev/.test(t)&&!/tatbikat|egitim/.test(t))return 'fire';if(/trafik kazasi|zincirleme kaza|minibus.{0,20}devril|otomobil.{0,20}carp/.test(t))return 'traffic';if(/silahli saldiri|silahli kavga|kursun/.test(t))return 'shooting';if(/gocuk|bina.{0,20}cokme/.test(t))return 'collapse';return ''}
export const sameIncident=sameEvent;
export function groupRelatedEvents(events,settings=DEFAULT_SETTINGS){return groupEventRecords(events,settings)}
function urgentEvent(event,now=Date.now()){const date=event.publishedAt;if(!date||/^\d{4}-\d{2}-\d{2}$/.test(date))return false;const age=now-Date.parse(date),t=norm(event.title);return age>=-300000&&age<=6*3600000&&(event.nationalCritical?event.nationalUrgent!==false:!!incidentKind(t))&&!/tatbikat|egitim|anma|belgesel|film|gecmis olsun/.test(t)}
function publicBundle(data,settings){const rows=publicationRecords(data.events).filter(e=>e.relevant!==false&&!(settings.excludedTerms||[]).some(t=>phraseMatches(searchText(e.title+' '+e.description),t)));return {...data,events:groupRelatedEvents(rows.filter(e=>e.scope!=='national'||e.publishedAt&&e.nationalCritical),settings).sort(publicationOrder).slice(0,500)}}
async function readBody(request,limit=16000){if(Number(request.headers.get('Content-Length')||0)>limit)throw new Error('İstek çok büyük');const text=await request.text();if(text.length>limit)throw new Error('İstek çok büyük');return JSON.parse(text)}
async function adminWorkspaceAPI(request,env,user,url){
 if(!await adminSession(request,env,user))return json({error:'Yönetici girişi gerekli'},401);
 if(request.method!=='GET'&&(request.method!=='POST'||request.headers.get('Origin')!==url.origin))return json({error:'İstek kaynağı reddedildi'},403);
 if(url.pathname==='/api/admin/workspace-settings'){
  if(request.method==='GET')return json({settings:await workspaceSettings(env),sources:SOURCES.map(({id,name})=>({id,name})),externalNotifications:'Bağlı dış bildirim kanalı yok',unattended:env.OSINT_AUTO_UPDATE_ENABLED==='true'});
  const input=await readBody(request),old=await workspaceSettings(env),ids=new Set(SOURCES.map(s=>s.id));
  const strings=(list,max=100)=>{if(!Array.isArray(list)||list.length>max||list.some(s=>typeof s!=='string'||s.trim().length>100))throw Error('Geçersiz ifade listesi');return [...new Set(list.map(s=>s.trim()).filter(Boolean))]};
  const next={...old,disabledSources:strings(input.disabledSources||[]).filter(id=>ids.has(id)),extraTerms:strings(input.extraTerms||[]),excludedTerms:strings(input.excludedTerms||[]),groupSimilar:input.groupSimilar!==false,alertTopics:strings(input.alertTopics||[]),alertNeighborhoods:strings(input.alertNeighborhoods||[]).filter(n=>NEIGHBORHOODS.includes(n)),alertKeywords:strings(input.alertKeywords||[]),briefMorningHour:Number(input.briefMorningHour??8),briefEveningHour:Number(input.briefEveningHour??18)};
  if(![next.briefMorningHour,next.briefEveningHour].every(h=>Number.isInteger(h)&&h>=0&&h<=23)||next.briefMorningHour>=next.briefEveningHour)return json({error:'Brifing saati 0–23 arasında olmalı'},400);
  await env.DB.batch([env.DB.prepare('INSERT INTO workspace_settings(id,data,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind('main',JSON.stringify(next),new Date().toISOString()),auditStatement(env,user,'Çalışma alanı ayarları güncellendi','Arama ve bildirim kuralları')]);return json({ok:true});
 }
 if(url.pathname==='/api/admin/grouping'){
  if(request.method!=='POST')return json({error:'POST gerekli'},405);
  const body=await readBody(request),data=await publishedData(env),event=data.events.find(e=>e.id===body.eventId||(e.relatedIds||[]).includes(body.eventId));if(!event)return json({error:'Olay bulunamadı'},404);
  const settings=await workspaceSettings(env);settings.splitEventIds=[...new Set([...settings.splitEventIds,...(event.relatedIds||[event.id])])].slice(-200);
  await env.DB.batch([env.DB.prepare('INSERT INTO workspace_settings(id,data,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind('main',JSON.stringify(settings),new Date().toISOString()),auditStatement(env,user,'Otomatik olay grubu ayrıldı',event.id)]);return json({ok:true});
 }
 if(url.pathname==='/api/admin/accounts'){
  if(request.method==='GET')return json({accounts:(await env.DB.prepare('SELECT id,username,name,email,active,created_at FROM team_accounts ORDER BY name').all()).results});
  const body=await readBody(request),username=String(body.username||'').trim().toLocaleLowerCase('tr-TR'),name=String(body.name||username).trim().slice(0,120),email=String(body.email||'').trim().slice(0,254);
  if(body.id){const account=await env.DB.prepare('SELECT id FROM team_accounts WHERE id=?').bind(body.id).first();if(!account)return json({error:'Hesap bulunamadı'},404);if(body.password!==undefined){if(typeof body.password!=='string'||body.password.length<6||body.password.length>128)return json({error:'Şifre 6–128 karakter olmalı'},400);const salt=crypto.randomUUID(),hash=await passwordHash(body.password,salt);await env.DB.batch([env.DB.prepare('UPDATE team_accounts SET password_hash=?,salt=? WHERE id=?').bind(hash,salt,body.id),env.DB.prepare('DELETE FROM team_sessions WHERE account_id=?').bind(body.id),auditStatement(env,user,'Ekip şifresi yenilendi',body.id)]);return json({ok:true});}if(![0,1].includes(body.active))return json({error:'Durum geçersiz'},400);await env.DB.batch([env.DB.prepare('UPDATE team_accounts SET active=? WHERE id=?').bind(body.active,body.id),env.DB.prepare('DELETE FROM team_sessions WHERE account_id=?').bind(body.id),auditStatement(env,user,body.active?'Ekip hesabı açıldı':'Ekip hesabı kapatıldı',body.id)]);return json({ok:true});}
  if(!/^[a-z0-9çğıöşü._-]{3,40}$/.test(username)||!name||typeof body.password!=='string'||body.password.length<6||body.password.length>128)return json({error:'Kullanıcı adı 3–40 karakter, şifre en az 6 karakter olmalı.'},400);
  if(username===(env.OSINT_ADMIN_USERNAME||'').trim().toLocaleLowerCase('tr-TR'))return json({error:'Bu kullanıcı adı yönetici hesabına ayrılmıştır.'},409);
  const exists=await env.DB.prepare('SELECT id FROM team_accounts WHERE username=?').bind(username).first();if(exists)return json({error:'Bu kullanıcı adı zaten var'},409);
  const salt=crypto.randomUUID(),id=crypto.randomUUID(),hash=await passwordHash(body.password,salt);
  await env.DB.batch([env.DB.prepare('INSERT INTO team_accounts(id,username,name,email,password_hash,salt,active,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,username,name,email,hash,salt,1,new Date().toISOString()),auditStatement(env,user,'Ekip hesabı oluşturuldu',username)]);return json({ok:true,id});
 }
 return json({error:'Bulunamadı'},404);
}
async function passwordHash(password,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),{name:'PBKDF2'},false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256);return [...new Uint8Array(bits)].map(n=>n.toString(16).padStart(2,'0')).join('')}
function teamToken(request){return request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-osint_team=([a-f0-9]{64})(?:;|$)/)?.[1]||''}
async function teamActor(request,env){const token=teamToken(request);if(!token||!env?.DB)return null;const row=await env.DB.prepare('SELECT a.id,a.name,a.username,a.active,s.expires_at FROM team_sessions s JOIN team_accounts a ON a.id=s.account_id WHERE s.token_hash=?').bind(await sha(token)).first();return row?.active&&row.expires_at>Math.floor(Date.now()/1000)?{id:row.id,name:row.name,username:row.username,admin:false}:null}
async function workspaceActor(request,env,user){if(await adminSession(request,env,user))return {id:ADMIN_PRINCIPAL,name:'Yönetici',admin:true};return teamActor(request,env)}
async function teamLogin(request,env,url){
 if(!['/api/team/login','/api/team/logout'].includes(url.pathname))return json({error:'Bulunamadı'},404);if(request.method!=='POST'||request.headers.get('Origin')!==url.origin)return json({error:'İstek reddedildi'},403);if(!env?.DB)return json({error:'Veritabanı bağlı değil'},503);
 if(url.pathname.endsWith('/logout')){const token=teamToken(request);if(token)await env.DB.prepare('DELETE FROM team_sessions WHERE token_hash=?').bind(await sha(token)).run();return json({ok:true},200,{'Set-Cookie':'__Host-osint_team=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'});}
 const input=await readBody(request,4096),name=String(input.username||'').trim().toLocaleLowerCase('tr-TR'),now=Math.floor(Date.now()/1000),key='team-'+await sha((request.headers.get('CF-Connecting-IP')||'anonymous')+'|'+name);
 const guard=await env.DB.prepare('SELECT failures,reset_at FROM login_guard WHERE user_id=?').bind(key).first();if(guard?.failures>=5&&guard.reset_at>now)return json({error:'Çok fazla deneme. 15 dakika sonra yeniden deneyin.'},429);
 const account=await env.DB.prepare('SELECT * FROM team_accounts WHERE username=?').bind(name).first();const hash=await passwordHash(String(input.password||'').slice(0,129),account?.salt||'unmatched-account-salt');
 if(!account?.active||!await equalSecret(hash,account.password_hash)){
  const reset=guard?.reset_at>now?guard.reset_at:now+900;await env.DB.prepare('INSERT INTO login_guard(user_id,failures,reset_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET failures=CASE WHEN login_guard.reset_at<=? THEN 1 ELSE login_guard.failures+1 END,reset_at=excluded.reset_at').bind(key,1,reset,now).run();return json({error:'Kullanıcı adı veya şifre hatalı'},401);
 }
 const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');await env.DB.batch([env.DB.prepare('DELETE FROM team_sessions WHERE expires_at<=?').bind(now),env.DB.prepare('INSERT INTO team_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').bind(await sha(token),account.id,now+14400),env.DB.prepare('DELETE FROM login_guard WHERE user_id=?').bind(key)]);return json({ok:true},200,{'Set-Cookie':'__Host-osint_team='+token+'; Path=/; Secure; HttpOnly; SameSite=Strict'});
}
async function workspaceAPI(request,env,user,url){
 const actor=await workspaceActor(request,env,user);if(!actor)return json({error:'Ekip veya yönetici girişi gerekli'},401);
 if(request.method!=='GET'&&(request.method!=='POST'||request.headers.get('Origin')!==url.origin))return json({error:'İstek kaynağı reddedildi'},403);
 await maintainRetention(env);
 if(url.pathname==='/api/workspace'){
  const data=await publishedData(env),cases=(await env.DB.prepare('SELECT * FROM case_records ORDER BY updated_at DESC LIMIT 500').all()).results,team=(await env.DB.prepare('SELECT id,name FROM team_accounts WHERE active=1 ORDER BY name').all()).results;
  const alerts=(await env.DB.prepare('SELECT a.* FROM alert_log a LEFT JOIN alert_reads r ON r.alert_id=a.id AND r.actor=? WHERE r.id IS NULL ORDER BY a.created_at DESC LIMIT 100').bind(actor.id).all()).results;
  const briefs=(await env.DB.prepare('SELECT id,date,slot,created_at FROM briefings ORDER BY created_at DESC LIMIT 60').all()).results;
  return json({actor,events:[...data.events,...cases.filter(c=>!data.events.some(e=>e.id===c.event_id||(e.relatedIds||[]).includes(c.event_id))).flatMap(c=>{const e=parseCaseEvent(c.event_data);return e?[{...e,caseArchive:true}]:[]})],cases,team,alerts:alerts.filter(a=>{const e=data.events.find(e=>e.id===a.event_id||(e.relatedIds||[]).includes(a.event_id));return !e?.nationalCritical||e.nationalUrgent!==false}),briefs,map:MAP_DATA,syncedAt:data.syncedAt});
 }
 if(url.pathname==='/api/workspace/case'){
  const body=await readBody(request),data=await publishedData(env),event=data.events.find(e=>e.id===body.eventId||(e.relatedIds||[]).includes(body.eventId))||await caseEvent(env,body.eventId);if(!event)return json({error:'Olay bulunamadı'},404);
  if(request.method==='GET')return json({error:'POST gerekli'},405);
  const statuses=['new','reviewing','referred','tracking','resolved'],status=body.status||'new';if(!statuses.includes(status))return json({error:'Geçersiz durum'},400);
  const existing=body.caseId?await env.DB.prepare('SELECT * FROM case_records WHERE id=?').bind(body.caseId).first():await env.DB.prepare('SELECT * FROM case_records WHERE event_id=?').bind(event.id).first();
  if(body.caseId&&!existing)return json({error:'Dosya bulunamadı'},404);if(existing&&!([event.id,...(event.relatedIds||[])]).includes(existing.event_id))return json({error:'Dosya olayla eşleşmiyor'},400);
  if(existing&&Number(body.revision)!==existing.revision)return json({error:'Başka bir ekip üyesi bu kaydı güncelledi. Listeyi yenileyin.'},409);
  const assignee=String(body.assignee||'');if(assignee&&assignee!==ADMIN_PRINCIPAL&&!await env.DB.prepare('SELECT id FROM team_accounts WHERE id=? AND active=1').bind(assignee).first())return json({error:'Atanacak aktif ekip üyesi bulunamadı'},400);
  if(existing&&!actor.admin&&existing.assignee&&existing.assignee!==actor.id)return json({error:'Bu dosya başka bir ekip üyesine atanmış; değişiklik için yöneticiye başvurun.'},403);
  if(!actor.admin&&assignee&&assignee!==actor.id)return json({error:'Başka personele görev atama yetkisi yöneticidedir'},403);
  const latitude=body.latitude===null||body.latitude===''||body.latitude===undefined?null:Number(body.latitude),longitude=body.longitude===null||body.longitude===''||body.longitude===undefined?null:Number(body.longitude),locationNote=String(body.locationNote||'').slice(0,250);
  if((latitude===null)!==(longitude===null)||(latitude!==null&&(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude<40.98||latitude>41.08||longitude<29.07||longitude>29.21)))return json({error:'Koordinatlar Ümraniye çevresinde geçerli enlem/boylam olmalı'},400);
  const note=String(body.note||'').trim().slice(0,5000);if(!existing&&!note&&status==='new'&&!assignee)return json({error:'Durum, görev veya not ekleyin'},400);
  const dueAt=body.dueAt?new Date(body.dueAt).toISOString():null,id=existing?.id||crypto.randomUUID(),at=new Date().toISOString();
  if(dueAt&&Date.parse(dueAt)<Date.now()-86400000)return json({error:'Geçmiş tarihli görev süresi seçilemez'},400);
  const update=existing?env.DB.prepare('UPDATE case_records SET status=?,assignee=?,due_at=?,latitude=?,longitude=?,location_note=?,event_data=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?').bind(status,assignee,dueAt,latitude,longitude,locationNote,JSON.stringify(compactCaseEvent(event)),at,actor.name,id,existing.revision):env.DB.prepare('INSERT INTO case_records(id,event_id,status,assignee,due_at,latitude,longitude,location_note,event_data,revision,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,event.id,status,assignee,dueAt,latitude,longitude,locationNote,JSON.stringify(compactCaseEvent(event)),1,at,actor.name);
  const history=env.DB.prepare('INSERT INTO case_history(id,case_id,actor,action,note,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM case_records WHERE id=? AND revision=? AND updated_at=?)').bind(crypto.randomUUID(),id,actor.name,'Durum: '+status+(assignee?' · Görev atandı':''),note,at,id,existing?existing.revision+1:1,at);
  const result=await env.DB.batch([update,history]);if(!result[0].meta?.changes)return json({error:'Kayıt eşzamanlı güncellendi; yenileyin'},409);return json({ok:true,id});
 }
 if(url.pathname==='/api/workspace/history'){const id=url.searchParams.get('id');return json({entries:(await env.DB.prepare('SELECT actor,action,note,created_at FROM case_history WHERE case_id=? ORDER BY created_at DESC LIMIT 100').bind(id).all()).results});}
 if(url.pathname==='/api/workspace/alerts/read'){const body=await readBody(request);if(!Array.isArray(body.ids)||body.ids.length>100)return json({error:'Geçersiz bildirim listesi'},400);await env.DB.batch(body.ids.filter(id=>typeof id==='string').map(id=>env.DB.prepare('INSERT OR IGNORE INTO alert_reads(id,actor,alert_id) VALUES(?,?,?)').bind(actor.id+'|'+id,actor.id,id)));return json({ok:true});}
 if(url.pathname==='/api/workspace/briefing'){const row=await env.DB.prepare('SELECT data FROM briefings WHERE id=?').bind(url.searchParams.get('id')).first();return row?json({...JSON.parse(row.data),events:retainedEvents(JSON.parse(row.data).events)}):json({error:'Brifing bulunamadı'},404);}
 if(url.pathname==='/api/workspace/briefing/create'){const body=await readBody(request);const result=await saveBriefing(env,await publishedData(env),body.slot==='morning'?'morning':'evening',true);return json(result);}
 if(url.pathname==='/api/workspace/export'){const data=await publishedData(env);const rows=reportEvents(data.events,url);return new Response(eventsCSV(rows),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="Umraniye_OSINT_'+turkeyDay()+'.csv"','Cache-Control':'no-store'}});}
 return json({error:'Bulunamadı'},404);
}
function reportEvents(events,url){const date=url.searchParams.get('date'),from=url.searchParams.get('from'),to=url.searchParams.get('to'),neighborhood=url.searchParams.get('neighborhood'),topic=url.searchParams.get('topic');return events.filter(e=>{if((date||from||to)&&!e.publishedAt)return false;const day=e.publishedAt?turkeyDay(e.publishedAt):'';return (!date||day===date)&&(!from||day>=from)&&(!to||day<=to)&&(!neighborhood||e.neighborhood===neighborhood)&&(!topic||e.topic===topic)})}
async function saveBriefing(env,data,slot,manual=false){
 const date=turkeyDay(),id=date+'-'+slot,old=await env.DB.prepare('SELECT data FROM briefings WHERE id=?').bind(id).first();if(old&&!manual)return JSON.parse(old.data);
 const settings=await workspaceSettings(env),previousDay=turkeyDay(Date.parse(date+'T12:00:00+03:00')-86400000),hour=h=>String(h).padStart(2,'0')+':00:00+03:00';
 const windowStart=(slot==='morning'?previousDay:date)+'T'+hour(slot==='morning'?settings.briefEveningHour:settings.briefMorningHour),windowEnd=date+'T'+hour(slot==='morning'?settings.briefMorningHour:settings.briefEveningHour);
 const events=data.events.filter(e=>e.publishedAt&&Date.parse(e.publishedAt)>=Date.parse(windowStart)&&Date.parse(e.publishedAt)<Date.parse(windowEnd)).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
 const cases=(await env.DB.prepare("SELECT status,assignee,due_at FROM case_records WHERE status!='resolved'").all()).results;
 const brief={id,date,slot,generatedAt:new Date().toISOString(),windowStart,windowEnd,syncedAt:data.syncedAt,events,openTasks:cases.length,overdueTasks:cases.filter(c=>c.due_at&&Date.parse(c.due_at)<Date.now()).length,summary:events.length+' gündem kaydı · '+cases.length+' açık dosya',method:'Kaynak başlık ve açıklamalarından zaman aralığına göre kurallı derleme; yeni iddia üretilmedi.'};
 await env.DB.prepare('INSERT INTO briefings(id,date,slot,data,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,created_at=excluded.created_at').bind(id,date,slot,JSON.stringify(brief),brief.generatedAt).run();return brief;
}
async function afterSourceRefresh(env){
 const settings=await workspaceSettings(env),data=await publishedData(env);for(const event of data.events.filter(e=>urgentEvent(e))){if(settings.alertTopics.length&&!settings.alertTopics.includes(event.topic))continue;if(settings.alertNeighborhoods.length&&!settings.alertNeighborhoods.includes(event.neighborhood))continue;if(settings.alertKeywords.length&&!settings.alertKeywords.some(t=>phraseMatches(searchText(event.title+' '+event.description),t)))continue;
  const id='alert-'+event.id;await env.DB.prepare('INSERT OR IGNORE INTO alert_log(id,event_id,title,created_at) VALUES(?,?,?,?)').bind(id,event.id,event.title,new Date().toISOString()).run();}
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Istanbul',hour:'numeric',hourCycle:'h23'}).format(new Date()));if(hour>=settings.briefMorningHour)await saveBriefing(env,data,'morning');if(hour>=settings.briefEveningHour)await saveBriefing(env,data,'evening');
 await env.DB.prepare('DELETE FROM team_sessions WHERE expires_at<=?').bind(Math.floor(Date.now()/1000)).run();
}
