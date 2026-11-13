// Read-only application checks; restore exercises use an isolated temporary directory.
import {DatabaseSync,backup} from 'node:sqlite';
import {mkdtemp,copyFile,rm,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {validateOwner} from './owner-policy.mjs';
const origin=new URL(process.env.PUBLIC_ORIGIN||'http://invalid');
if(Number(process.versions.node.split('.')[0])<24)throw Error('Node.js 24 veya üzeri gerekli.');
if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password)throw Error('PUBLIC_ORIGIN geçersiz.');
validateOwner(process.env.OSINT_ADMIN_USERNAME,process.env.OSINT_ADMIN_PASSWORD||'',process.env.OSINT_ALLOW_SHORT_OWNER_PASSWORD==='true');
if(process.argv.includes('--config-only')){console.log('PASS Gizli ayarlar ve Node sürümü doğrulandı; şifreler gösterilmedi.');process.exit(0)}
const dir=resolve(process.env.DATA_DIR||'./data'),port=Number(process.env.PORT||3000);
const health=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(10000)});if(!health.ok)throw Error('Yerel sağlık kontrolü başarısız.');
const file=join(dir,'osint.sqlite');await stat(file);const db=new DatabaseSync(file,{readOnly:true,timeout:5000});let temp;
const counts=d=>Object.fromEntries(['team_accounts','personal_records','personal_activity','case_records','snapshots'].map(t=>[t,Number(d.prepare('SELECT COUNT(*) AS n FROM '+t).get().n)]));
const integrity=d=>{const result=d.prepare('PRAGMA integrity_check').all();if(result.length!==1||result[0].integrity_check!=='ok')throw Error('SQLite bütünlüğü doğrulanamadı.')};
try{
 integrity(db);console.log('PASS Yerel HTTP ve kalıcı SQLite bütünlüğü.');
 if(process.argv.includes('--restore-test')){
  temp=await mkdtemp(join(tmpdir(),'osint-restore-check-'));const saved=join(temp,'backup.sqlite'),restored=join(temp,'restored.sqlite');
  await backup(db,saved);await copyFile(saved,restored);
  const a=new DatabaseSync(saved,{readOnly:true}),b=new DatabaseSync(restored,{readOnly:true});
  try{integrity(a);integrity(b);if(JSON.stringify(counts(a))!==JSON.stringify(counts(b)))throw Error('Geri dönüşte kayıt sayısı değişti.');
   for(const table of ['team_accounts','personal_records','case_records']){const rows=d=>JSON.stringify(d.prepare('SELECT * FROM '+table+' ORDER BY id').all());if(rows(a)!==rows(b))throw Error('Geri dönüş içeriği eşleşmedi.');}
   console.log('PASS Tutarlı yedek ayrı dizine geri yüklendi; hesaplar, kişisel notlar ve olay dosyaları birebir eşleşiyor. Canlı dosya değiştirilmedi.');
  }finally{a.close();b.close()}
 }
 if(process.argv.includes('--https')){
  const r=await fetch(origin.origin+'/giris',{signal:AbortSignal.timeout(15000),redirect:'manual'});if(r.status!==200)throw Error('Dış HTTPS giriş sayfası doğrulanamadı.');
  if(!r.headers.get('strict-transport-security'))throw Error('HTTPS güvenlik başlığı eksik.');console.log('PASS HTTPS giriş sayfasına erişiliyor. Mobil ağ testi ayrıca yapılmalı.');
 }
}finally{db.close();if(temp)await rm(temp,{recursive:true,force:true})}
