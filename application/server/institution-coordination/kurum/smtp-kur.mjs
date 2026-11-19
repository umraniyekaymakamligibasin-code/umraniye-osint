#!/usr/bin/env node
// Kurum e-posta gönderimi için smtp.json + smtp.key dosyalarını üretir.
// gmail-sender.mjs'nin beklediği biçim: AES-256-GCM, düzen iv(12)|tag(16)|veri, AAD = gönderen adres,
// 32 baytlık ham smtp.key, sealed base64. Şifre ekrana/günlüğe/dosyaya düz yazılmaz.
//
// Kullanım (sunucuda, gönderim servisinin kullanıcısıyla — osintdeneme):
//   node smtp-kur.mjs --data-dir /var/lib/umraniye-osint-deneme
//   node smtp-kur.mjs --data-dir /var/lib/umraniye-osint-deneme --durum
//   node smtp-kur.mjs --data-dir /var/lib/umraniye-osint-deneme --kapat
//   printf '%s\n' "<uygulama-şifresi>" | node smtp-kur.mjs --data-dir ... --sifre-stdin
//
// Gönderen hesap kodda sabittir (umraniyekaymakamligibasin@gmail.com). Girilen şifre bu Gmail
// hesabının "uygulama şifresi"dir (normal şifre değil; iki adımlı doğrulama açıkken üretilir).
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {openSync,writeSync,fsyncSync,closeSync,unlinkSync,readFileSync,statSync,lstatSync,constants} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';

const SENDER='umraniyekaymakamligibasin@gmail.com';
const CONF={sender:SENDER,host:'smtp.gmail.com',port:587,tls:'STARTTLS'};

function arg(name,def=null){const i=process.argv.indexOf(name);return i>=0?(process.argv[i+1]??true):def;}
const dataDir=arg('--data-dir')||process.env.DATA_DIR;
if(!dataDir||typeof dataDir!=='string'){console.error('Hata: --data-dir <klasör> gerekli (veya DATA_DIR).');process.exit(2);}
const jsonPath=join(dataDir,'smtp.json'),keyPath=join(dataDir,'smtp.key');

function seal(password){
 const key=randomBytes(32),iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);
 c.setAAD(Buffer.from(SENDER));
 const enc=Buffer.concat([c.update(password,'utf8'),c.final()]),tag=c.getAuthTag();
 const sealed=Buffer.concat([iv,tag,enc]).toString('base64');
 // Yazmadan önce aynı çözme yoluyla doğrula (gmail-sender.mjs ile birebir aynı mantık).
 const b=Buffer.from(sealed,'base64'),d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));
 d.setAAD(Buffer.from(SENDER));d.setAuthTag(b.subarray(12,28));
 const back=Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8');
 if(back!==password)throw Error('mühürleme doğrulaması başarısız');
 return {key,sealed};
}

// Sembolik bağlantıyı izlemeden, 0600 ile, atomik yaz.
function writeSecure(path,data){
 try{const s=lstatSync(path);if(s.isSymbolicLink())throw Error('hedef sembolik bağlantı: '+path);unlinkSync(path);}catch(e){if(e.code!=='ENOENT')throw e;}
 const fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW||0),0o600);
 try{writeSync(fd,data);fsyncSync(fd);}finally{closeSync(fd);}
}

function status(){
 try{
  const raw=readFileSync(jsonPath,'utf8'),c=JSON.parse(raw);
  const ok=c.sender===SENDER&&c.host==='smtp.gmail.com'&&c.port===587&&c.tls==='STARTTLS';
  const ks=statSync(keyPath);
  console.log(JSON.stringify({smtpJson:true,anahtar:ks.isFile()&&ks.size===32,yapilandirmaGecerli:ok,etkin:c.enabled===true,gonderen:c.sender},null,2));
 }catch(e){console.log(JSON.stringify({smtpJson:false,hata:e.code||e.message}));}
}

function hiddenPrompt(q){
 return new Promise(res=>{
  const rl=createInterface({input:process.stdin,output:process.stdout,terminal:true});
  const out=process.stdout;let on=true;
  const mute=s=>{if(on&&s!=='\r\n'&&s!=='\n'&&s!=='\r')out.write('*');};
  process.stdin.on('data',mute);rl.question(q,a=>{on=false;process.stdin.removeListener('data',mute);out.write('\n');rl.close();res(a);});
 });
}

async function main(){
 if(process.argv.includes('--durum'))return status();
 if(process.argv.includes('--kapat')){
  let c={...CONF,enabled:false,sealed:''};
  try{const cur=JSON.parse(readFileSync(jsonPath,'utf8'));if(cur.sealed)c.sealed=cur.sealed;}catch{}
  writeSecure(jsonPath,JSON.stringify(c));console.log('E-posta gönderimi kapatıldı (smtp.json enabled=false). smtp.key korundu.');return;
 }
 let password;
 if(process.argv.includes('--sifre-stdin')){
  password=readFileSync(0,'utf8').replace(/\r?\n$/,'');
 }else{
  password=await hiddenPrompt('Gmail uygulama şifresi: ');
  const again=await hiddenPrompt('Tekrar: ');
  if(password!==again){console.error('Şifreler eşleşmedi.');process.exit(1);}
 }
 password=password.replace(/\s+/g,''); // Gmail uygulama şifreleri 16 harf; boşluklu yapıştırılırsa temizle
 if(password.length<8||password.length>128){console.error('Şifre uzunluğu beklenenin dışında (8–128).');process.exit(1);}
 const {key,sealed}=seal(password);
 writeSecure(keyPath,key);
 writeSecure(jsonPath,JSON.stringify({...CONF,enabled:true,sealed}));
 console.log('Tamam: smtp.json ve smtp.key yazıldı (0600).');
 console.log('Dizin:',dataDir);
 console.log('Sonraki adımlar:');
 console.log('  1) Panelde kuruma doğrulanmış bir alıcı ekleyin.');
 console.log('  2) O kurum için e-postayı açın (Kurum Yönetimi > E-posta).');
 console.log('  3) umraniye-kurum-gonderim.timer zaten 2 dakikada bir kuyruğu gönderir.');
 console.log('Kapatmak için: node smtp-kur.mjs --data-dir '+dataDir+' --kapat');
}
main().catch(e=>{console.error('Hata:',e.message);process.exit(1);});
