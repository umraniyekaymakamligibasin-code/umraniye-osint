import{DatabaseSync}from'node:sqlite';
import{readFile,lstat,chmod}from'node:fs/promises';
import{createHash,createDecipheriv}from'node:crypto';
import{join}from'node:path';
import{createGmailSender}from'../server/gmail-sender.mjs';
const directoryDefault='/var/lib/umraniye-osint-deneme';
const hash=s=>createHash('sha256').update(s).digest('hex');
async function configuration(directory){
 try{
  for(const name of ['institution-admin-alert.key','institution-admin-alert.json']){const m=await lstat(join(directory,name));if(!m.isFile()||m.isSymbolicLink()||(m.mode&0o077))throw Error('private_config_permissions');}
  const c=JSON.parse(await readFile(join(directory,'institution-admin-alert.json'),'utf8'));
  if(c.version!==1||c.role!=='owner_admin'||c.enabled!==true||!Number.isFinite(Date.parse(c.configuredAt)))throw Error('private_config_invalid');
  const key=await readFile(join(directory,'institution-admin-alert.key'));if(key.length!==32)throw Error('private_config_invalid');
  const b=Buffer.from(c.sealed,'base64'),d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAAD(Buffer.from('institution-admin-alert-v1'));d.setAuthTag(b.subarray(12,28));
  const address=Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8');
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address))throw Error('private_config_invalid');
  return{...c,address};
 }catch(error){if(error.code==='ENOENT')return null;throw Error('admin_alert_configuration_unavailable');}
}
function open(directory){const db=new DatabaseSync(join(directory,'institution-admin-alerts.sqlite'),{timeout:5000});db.exec(`PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS notices(id TEXT PRIMARY KEY,at TEXT NOT NULL,kind TEXT NOT NULL,codes TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN('queued','sending','sent','dead')),attempts INTEGER NOT NULL DEFAULT 0,available_at INTEGER NOT NULL,lease_until INTEGER,sent_at TEXT,error_code TEXT);CREATE INDEX IF NOT EXISTS admin_notice_due ON notices(state,available_at);`);return db;}
export async function queueAdminHealthAlerts({directory=directoryDefault,state,now=Date.now(),verification=false}={}){
 const config=await configuration(directory);if(!config)return{configured:false,queued:0};
 const db=open(directory);await chmod(join(directory,'institution-admin-alerts.sqlite'),0o600);
 try{
  let queued=0;const entries=verification?[{at:config.configuredAt,kind:'verification',codes:[]}]:state?.history||[];
  db.exec('BEGIN IMMEDIATE');
  try{for(const entry of entries){
   if(!['critical','recovered','verification'].includes(entry.kind)||!Number.isFinite(Date.parse(entry.at))||Date.parse(entry.at)<Date.parse(config.configuredAt)||Date.parse(entry.at)>now+300000)continue;
   const codes=(entry.codes||[]).filter(c=>typeof c==='string'&&/^[a-z_]{1,80}$/.test(c)).sort();
   const id=hash(JSON.stringify([entry.at,entry.kind,codes]));
   queued+=Number(db.prepare("INSERT OR IGNORE INTO notices(id,at,kind,codes,state,available_at) VALUES(?,?,?,?,'queued',?)").run(id,entry.at,entry.kind,JSON.stringify(codes),now).changes);
  }db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
  return{configured:true,queued};
 }finally{db.close();}
}
export async function dispatchAdminHealthMail({directory=directoryDefault,now=Date.now(),send}={}){
 const config=await configuration(directory);if(!config)return{configured:false,sent:0,dead:0,queued:0};
 const db=open(directory);await chmod(join(directory,'institution-admin-alerts.sqlite'),0o600);
 try{
  db.prepare("UPDATE notices SET state='dead',error_code='delivery_outcome_unknown',lease_until=NULL WHERE state='sending' AND lease_until<=?").run(now);
  const row=db.prepare("SELECT * FROM notices WHERE state='queued' AND available_at<=? ORDER BY available_at,at,id LIMIT 1").get(now);
  let sent=0;
  if(row){
   const claimed=db.prepare("UPDATE notices SET state='sending',attempts=attempts+1,lease_until=? WHERE id=? AND state='queued'").run(now+120000,row.id);
   if(claimed.changes){
    const sender=send||createGmailSender({directory}).send;
    const codes=JSON.parse(row.codes);const title=row.kind==='verification'?'Yönetici hata bildirimi bağlantısı doğrulaması':row.kind==='recovered'?'Kurum panelleri yeniden sağlıklı':'Kurum panellerinde kritik hata';
    const text=[title,'',row.kind==='verification'?'Bu tek doğrulama bildirimi, kurum paneli kritik hata bildirimleri için belirlediğiniz yönetici e-posta adresine gönderilmiştir.':row.kind==='recovered'?'Önceki kritik sağlık koşulları giderildi.':'Otomatik sağlık kontrolü aşağıdaki koşulları tespit etti:',...codes.map(c=>'- '+c),'','Kontrol zamanı: '+row.at,'Yönetim paneli: https://umraniyeosint.com/kurum/yonetim','','Bu bildirim sistem sağlığı içindir; haber veya kurum olay bildirimi değildir.'].join('\n');
    try{
     await sender({to:config.address,idempotencyKey:'institution-admin-health:'+row.id,subject:'Ümraniye OSINT · '+title,text});
     db.prepare("UPDATE notices SET state='sent',sent_at=?,lease_until=NULL,error_code=NULL WHERE id=? AND state='sending'").run(new Date().toISOString(),row.id);sent=1;
    }catch(error){
     if(error?.definitelyNotSent===true&&row.attempts+1<5)db.prepare("UPDATE notices SET state='queued',available_at=?,lease_until=NULL,error_code='provider_rejected' WHERE id=? AND state='sending'").run(now+Math.min(3600000,60000*2**row.attempts),row.id);
     else db.prepare("UPDATE notices SET state='dead',lease_until=NULL,error_code=? WHERE id=? AND state='sending'").run(error?.definitelyNotSent===true?'provider_rejected':'delivery_outcome_unknown',row.id);
    }
   }
  }
  const counts=db.prepare('SELECT state,count(*) count FROM notices GROUP BY state').all();
  return{configured:true,sent,dead:counts.filter(r=>r.state==='dead').reduce((s,r)=>s+r.count,0),queued:counts.filter(r=>r.state==='queued').reduce((s,r)=>s+r.count,0)};
 }finally{db.close();}
}
