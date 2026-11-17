/**
 * GERCEK SEMALI UCTAN UCA TEST
 *
 * Sahte tablo kurmaz: panelin kendi `openDatabase()` fonksiyonu ile
 * drizzle/*.sql goclerini uygular, sonra yonlendirme zamanlayicisini ayri
 * surecte calistirir. Amac: coord_cases + coord_audit + coord_mail_outbox
 * satirlarinin gercekten olustugunu, ikinci turun idempotent kaldigini ve
 * alici adresinin sifresinin cozulup gonderildigini KANITLAMAK.
 *
 * Calistir:
 *   node --no-warnings test-gercek-sema.mjs <panel-kok>
 *   node --no-warnings test-gercek-sema.mjs C:\yol\umraniye-osint-proje
 * (panel kokunde `application/` varsa orasi, yoksa kokun kendisi kullanilir.)
 */
import { rmSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const KOK = dirname(fileURLToPath(import.meta.url));
const PANEL = process.argv[2] || process.env.OSINT_PROJE
  || resolve(KOK, '..', '..', '..', '..');
const UYG = existsSync(join(PANEL, 'application')) ? join(PANEL, 'application') : PANEL;
const TEST = process.env.OSINT_TEST_DIR || join(tmpdir(), 'osint-gercek-sema');
const DB = join(TEST, 'osint.sqlite');
const ZAMANLAYICI = join(KOK, 'kurum-zamanlayici.mjs');
const NODE = process.execPath;
const HTTP = await import(pathToFileURL(join(UYG, 'server', 'database.mjs')).href);
const { accountKey } = await import(pathToFileURL(join(UYG, 'server', 'accounts.mjs')).href);
const { createInstitutionRecipients } = await import(
  pathToFileURL(join(UYG, 'server', 'institution-coordination', 'server', 'institution-recipients.mjs')).href);
const { dispatchDueInstitutionNotices } = await import(
  pathToFileURL(join(UYG, 'server', 'institution-coordination', 'server', 'dispatch-event-email.mjs')).href);

const hatalar = [];
const kontrol = (ad, kosul, ek = '') => {
  console.log(`${kosul ? '  OK  ' : ' HATA '} ${ad}${ek ? ' :: ' + ek : ''}`);
  if (!kosul) hatalar.push(ad);
};
const simdi = () => new Date().toISOString();

// ---------------------------------------------------------------- 1. temiz DB
if (existsSync(TEST)) rmSync(TEST, { recursive: true, force: true });
mkdirSync(TEST, { recursive: true });

const db = HTTP.openDatabase(DB);
const at = simdi();

// ---------------------------------------------------------------- 2. izinler
// Yalnizca iki kurum/konu cifti onaylanir; gerisi taslak kalir.
db.prepare(`UPDATE coord_institutions SET enabled=1,email_enabled=1,approval_status='approved',
  approval_reference='test-kurum-onayi' WHERE code='ISKI_UMR'`).run();
db.prepare(`UPDATE coord_topics SET enabled=1,approval_status='approved',
  approval_reference='test-konu-onayi' WHERE code='water_leak'`).run();
db.prepare(`UPDATE coord_institution_topic_grants SET granted=1,approval_reference='test-grant'
  WHERE institution_id='catalog-ISKI_UMR' AND topic_id='catalog-water_leak'`).run();
if (!await db.prepare(`SELECT 1 x FROM coord_institution_topic_grants WHERE institution_id='catalog-ISKI_UMR'
  AND topic_id='catalog-water_leak'`).first()) {
  db.prepare(`INSERT INTO coord_institution_topic_grants
    (institution_id,topic_id,granted,approval_reference,updated_by,updated_at)
    VALUES('catalog-ISKI_UMR','catalog-water_leak',1,'test-grant','test',?)`).bind(at).run();
}

// Baslik listesinde OLMAYAN bir konu da onaylanir: kapinin gercek oldugu kanitlansin.
db.prepare(`UPDATE coord_institutions SET enabled=1,email_enabled=1,approval_status='approved',
  approval_reference='test-kurum-onayi' WHERE code='UMR_BELEDIYE'`).run();
db.prepare(`UPDATE coord_topics SET enabled=1,approval_status='approved',
  approval_reference='test-konu-onayi' WHERE code='traffic_safety'`).run();
if (!await db.prepare(`SELECT 1 x FROM coord_institution_topic_grants WHERE institution_id='catalog-UMR_BELEDIYE'
  AND topic_id='catalog-traffic_safety'`).first()) {
  db.prepare(`INSERT INTO coord_institution_topic_grants
    (institution_id,topic_id,granted,approval_reference,updated_by,updated_at)
    VALUES('catalog-UMR_BELEDIYE','catalog-traffic_safety',1,'test-grant','test',?)`).bind(at).run();
}

// ------------------------------------------------------- 3. sifreli alici adresi
const anahtar = await accountKey(join(TEST, 'institution-recipients.key'));
const alicilar = createInstitutionRecipients({ db, key: anahtar });
await alicilar.save('test-actor', 'ISKI_UMR',
  { address: 'test@example.com', active: true, confirmed: true });
const aliciSatir = db.prepare(`SELECT r.id,r.address_ciphertext,r.key_version,r.address_fingerprint
  FROM coord_mail_recipients r JOIN coord_institutions i ON i.id=r.institution_id
  WHERE i.code='ISKI_UMR' AND r.active=1`).first();
kontrol('sifreli alici kaydi olustu', !!aliciSatir);

// ---------------------------------------------------------------- 4. snapshot
const olaylar = [
  { id: 'ev-su-1', revision: 'r1',
    title: 'Altinsehir Mahallesi su kacagi',
    description: 'Kaldirimdan su akiyor, su borusu patladi.',
    fullText: 'Altinsehir Mahallesi Muammer Yilmaz Caddesi uzerinde su kacagi olustu.',
    publishedAt: at, neighborhood: 'Altinsehir', locationVerified: true, locationStatus: 'verified' },
  { id: 'ev-silah-1', revision: 'r1',
    title: 'Altinsehir silahli olay',
    description: 'Silahla yaralama ihbari, su kacagi da var.',
    publishedAt: at, neighborhood: 'Altinsehir', locationVerified: true,
    riskCategory: 'weapon_or_shooting' },
  { id: 'ev-konum-1', revision: 'r1',
    title: 'Su kacagi ihbari',
    description: 'Su borusu patladi deniyor.',
    publishedAt: at, locationVerified: false, locationStatus: 'review_required' },
  { id: 'ev-trafik-1', revision: 'r1',
    title: 'Altinsehir trafik kazasi',
    description: 'Kavsakta trafik kazasi meydana geldi.',
    publishedAt: at, neighborhood: 'Altinsehir', locationVerified: true },
];
db.prepare('INSERT INTO snapshots(id,data,updated_at) VALUES(?,?,?)')
  .bind('snap-test', JSON.stringify({ events: olaylar }), at).run();
db.close();

// ------------------------------------------------------- 5. zamanlayici turlari
function zamanlayici(...ek) {
  const r = spawnSync(NODE, [ZAMANLAYICI, '--tek-sefer', '--sunucu', PANEL,
    '--data-dir', TEST, ...ek], { encoding: 'utf8', timeout: 120000 });
  const cikti = (r.stdout || '') + (r.stderr || '');
  let json = null;
  try { json = JSON.parse(cikti.slice(cikti.indexOf('{'))); } catch { /* asagida raporlanir */ }
  return { json, cikti };
}

console.log('\n=== 1. tur ===');
const t1 = zamanlayici();
if (!t1.json) { console.log(t1.cikti); process.exit(1); }
console.log(JSON.stringify(t1.json, null, 1));
kontrol('1. tur: 4 olay kuyruga girdi', t1.json.kuyruga === 4, `kuyruga=${t1.json.kuyruga}`);
kontrol('1. tur: 4 is islendi', t1.json.islenen === 4, `islenen=${t1.json.islenen}`);
kontrol('1. tur: 1 yeni case', t1.json.yeniCase === 1, `yeniCase=${t1.json.yeniCase}`);

console.log('\n=== 2. tur (idempotentlik) ===');
const t2 = zamanlayici();
if (!t2.json) { console.log(t2.cikti); process.exit(1); }
console.log(JSON.stringify(t2.json, null, 1));
kontrol('2. tur: yeni kuyruk yok', t2.json.kuyruga === 0, `kuyruga=${t2.json.kuyruga}`);
kontrol('2. tur: yeni is yok', t2.json.islenen === 0, `islenen=${t2.json.islenen}`);
kontrol('2. tur: yeni case yok', t2.json.yeniCase === 0, `yeniCase=${t2.json.yeniCase}`);

// ---------------------------------------------------------------- 6. DB kaniti
const db2 = HTTP.openDatabase(DB);
const caseSayisi = Number((await db2.prepare('SELECT COUNT(*) n FROM coord_cases').first()).n);
const outbox = await db2.prepare('SELECT * FROM coord_mail_outbox').all();
const audit = await db2.prepare("SELECT action,target_type FROM coord_audit WHERE action='event_projection'").all();
const isler = await db2.prepare('SELECT state,COUNT(*) n FROM coord_event_jobs GROUP BY state').all();
const kararlar = await db2.prepare('SELECT event_id,decision_json FROM coord_event_jobs').all();
const cm = await db2.prepare('SELECT title,summary_redacted,neighborhood,location_precision,confidence FROM coord_cases').first();
console.log('\n=== 7. DB kaniti ===');
console.log('case:', JSON.stringify(cm));
console.log('outbox:', JSON.stringify(outbox.results));
console.log('audit:', JSON.stringify(audit.results));
console.log('kuyruk:', JSON.stringify(isler.results));
console.log('kararlar:', JSON.stringify(kararlar.results.map(r => ({ id: r.event_id, k: JSON.parse(r.decision_json) }))));
kontrol('tek case (coklu kurum fan-out yok)', caseSayisi === 1, `n=${caseSayisi}`);
kontrol('case basligi guvenli kategori basligi', cm?.title === 'Su kaçağı bildirimi', cm?.title);
kontrol('case serbest metin tasimiyor', !String(cm?.summary_redacted).includes('Muammer'), cm?.summary_redacted);
kontrol('mahalle korundu', cm?.neighborhood === 'Altinsehir', cm?.neighborhood);
kontrol('outbox 1 satir', outbox.results.length === 1, `n=${outbox.results.length}`);
kontrol('outbox kuyrukta', outbox.results[0]?.state === 'queued', outbox.results[0]?.state);
kontrol('outbox vadesi gelmis', !!outbox.results[0]?.next_attempt_at, outbox.results[0]?.next_attempt_at);
kontrol('audit event_projection yazildi', audit.results.length >= 1, `n=${audit.results.length}`);
kontrol('kuyruk completed (4 karar)', isler.results.find(r => r.state === 'completed')?.n === 4,
        JSON.stringify(isler.results));
const karar = (id) => JSON.parse(kararlar.results.find(r => r.event_id === id)?.decision_json || '{}');
// Cok kurumlu sozlesme, tutma sebebini tek bir nedene indirger
// ('no_eligible_route'). Gercek kapilarin calistigini gormek icin motoru
// tek kural uzerinden dogrudan cagiriyoruz.
const policyMod = await import(pathToFileURL(join(UYG, 'server', 'institution-coordination', 'kurum', 'policy.mjs')).href);
const routeMod = await import(pathToFileURL(join(UYG, 'server', 'institution-coordination', 'server', 'route-event.mjs')).href);
const politika = await policyMod.kurallariUret(db2, {});
const suKural = politika.rules.find(r => r.topic === 'water_leak');
const trafikKural = politika.rules.find(r => r.topic === 'traffic_safety');
const yer = { district: 'Ümraniye', neighborhood: 'Altinsehir', verified: true, precision: 'neighborhood' };
const kapi = (ev, kural) => routeMod.classifyForInstitution(
  { title: '', description: '', sensitivity: 'ordinary', sensitivityFlags: {}, ...ev }, { ...politika, rules: [kural] });
const suKapi = kapi({ title: 'su kacagi', description: 'su borusu patladi', locality: yer }, suKural);
kontrol('kapı: temiz olay aday oldu', suKapi.decision === 'candidate', JSON.stringify(suKapi));
kontrol('kapi: silah olayi hassas diye tutuldu',
        kapi({ title: 'su kacagi', description: 'silah', riskCategory: 'weapon_or_shooting', locality: yer }, suKural).reason
          === 'sensitive_or_restricted');
kontrol('kapi: konumsuz olay tutuldu',
        kapi({ title: 'su kacagi', description: 'su borusu patladi', locality: { ...yer, verified: false } }, suKural).reason
          === 'verified_umraniye_locality_required');
kontrol('kapi: kisisel veri iceren metin tutuldu',
        kapi({ title: 'su kacagi', description: 'tc kimlik no 12345678901', locality: yer }, suKural).reason
          === 'possible_personal_data');
kontrol('kapi: basliksiz konu tutuldu',
        kapi({ title: 'trafik kazasi', description: 'kavsakta trafik kazasi', locality: yer }, trafikKural).reason
          === 'topic_has_no_safe_projection_title');

// ------------------------------------------------------------- 7. gonderim testi
console.log('\n=== 8. gonderim (stub SMTP) ===');
const gonderilen = [];
const sahteGonder = async (m) => { gonderilen.push(m); };
sahteGonder.supportsIdempotency = false;
sahteGonder.durableClaimOnly = true;
const sonuc = await dispatchDueInstitutionNotices({
  db: db2,
  decryptAddress: alicilar.decrypt,
  sendWithIdempotency: sahteGonder,
  portalUrl: 'https://panel.example.test/kurum',
  limit: 5,
  onError: (h) => console.log('  onError:', h.code),
});
console.log('dispatch:', JSON.stringify(sonuc), 'gonderim:', gonderilen.length);
kontrol('1 bildirim gonderildi', sonuc.sent === 1, `sent=${sonuc.sent}`);
kontrol('sifreli adres dogru cozuldu', gonderilen[0]?.to === 'test@example.com', gonderilen[0]?.to);
kontrol('govdede panel adresi var', String(gonderilen[0]?.text).includes('panel.example.test'));
kontrol('idempotency anahtari tasindi', !!gonderilen[0]?.idempotencyKey);
const sonOutbox = await db2.prepare('SELECT state,sent_at,attempts FROM coord_mail_outbox').first();
kontrol('outbox sent', sonOutbox?.state === 'sent', JSON.stringify(sonOutbox));

// ikinci gonderim turu bos olmali
const bos = await dispatchDueInstitutionNotices({
  db: db2, decryptAddress: alicilar.decrypt, sendWithIdempotency: sahteGonder,
  portalUrl: 'https://panel.example.test/kurum', limit: 5,
});
kontrol('tekrar gonderim yok', bos.sent === 0, JSON.stringify(bos));

// ------------------------------------------- 8. guvenli olmayan olaylar disarida
const reddedilen = await db2.prepare(`SELECT COUNT(*) n FROM coord_cases WHERE source_event_id IN
  ('ev-silah-1','ev-konum-1','ev-trafik-1')`).first();
kontrol('hassas/konumsuz/basliksiz olaylar case uretmedi', Number(reddedilen.n) === 0, `n=${reddedilen.n}`);
db2.close();

// ------------------------------------------------------------ 9. guvenli atlama
// Anahtar dosyasi yokken surucu YENI ANAHTAR URETMEMELI; aksi halde mevcut
// sifreli alici adresleri bir daha acilamaz. Bu yuzden atlanmasi beklenir.
console.log('\n=== 9. --gonder guvenli atlama (anahtar yok) ===');
rmSync(join(TEST, 'institution-recipients.key'), { force: true });
const g = zamanlayici('--gonder', '--portal-url', 'https://panel.example.test/kurum');
const gonderim = g.json?.gonderim;
console.log('gonderim:', JSON.stringify(gonderim));
kontrol('anahtar yokken gonderim atlandi', gonderim?.atlandi === 'institution_recipients_key_yok',
        JSON.stringify(gonderim));
kontrol('anahtar dosyasi yeniden URETILMEDI', !existsSync(join(TEST, 'institution-recipients.key')));

console.log(`\n===== SONUC: ${hatalar.length ? hatalar.length + ' HATA' : 'TUM KONTROLLER GECTI'} =====`);
if (hatalar.length) { console.log(hatalar.join('\n')); process.exit(1); }
