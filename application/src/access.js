async function unifiedLogin(request,env,url){
 if(request.method!=='POST'||request.headers.get('Origin')!==url.origin)return json({error:'İstek reddedildi'},403);
 let body;try{body=await readBody(request.clone(),4096)}catch{return json({error:'Geçersiz giriş isteği'},400)}
 const administrator=typeof body.username==='string'&&body.username.normalize('NFC')===env.OSINT_ADMIN_USERNAME?.normalize('NFC');
 return administrator?passwordAction(request,env,identity(request,env),new URL('/api/admin/login',url)):teamLogin(request,env,new URL('/api/team/login',url));
}
async function unifiedLogout(request,env,url){
 if(request.method!=='POST'||request.headers.get('Origin')!==url.origin)return json({error:'İstek reddedildi'},403);
 const statements=[],a=cookieToken(request),t=teamToken(request);
 if(a)statements.push(env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await adminTokenDigest(a,env)));
 if(t)statements.push(env.DB.prepare('DELETE FROM team_sessions WHERE token_hash=?').bind(await sha(t)));
 if(statements.length)await env.DB.batch(statements);
 const response=json({ok:true});response.headers.append('Set-Cookie',clearAdminCookie);response.headers.append('Set-Cookie','__Host-osint_team=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');return response;
}
async function serviceCanRead(request,env){const token=request.headers.get('X-OSINT-Service-Key');return !!(token&&env.OSINT_AUTOMATION_KEY_SHA256&&await equalSecret(await sha(token),env.OSINT_AUTOMATION_KEY_SHA256))}
