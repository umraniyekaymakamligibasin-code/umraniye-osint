const MIGRATION_TABLES=['workspace_settings','team_accounts','members','snapshots','case_records','case_history','alert_log','alert_reads','briefings','personal_records','personal_activity','audit'];
async function migrationExport(request,env,user,url){
 if(!await adminSession(request,env,user))return json({error:'Yönetici girişi gerekli'},401);
 if(request.method!=='POST'||request.headers.get('Origin')!==url.origin)return json({error:'İstek kaynağı reddedildi'},403);
 const rows=await env.DB.batch(MIGRATION_TABLES.map(t=>env.DB.prepare('SELECT * FROM '+t)));
 const tables=Object.fromEntries(MIGRATION_TABLES.map((t,i)=>[t,rows[i].results||[]]));
 await auditStatement(env,user,'Sunucu aktarım yedeği oluşturuldu','Hesaplar ve kayıtlar; oturumlar hariç').run();
 return json({format:'umraniye-osint-transfer-v1',createdAt:new Date().toISOString(),tables},200,{'Content-Disposition':'attachment; filename="umraniye-osint-transfer.json"'});
}
