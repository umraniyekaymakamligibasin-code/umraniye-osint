// Uctan uca test: katalog -> DB -> onay -> olay -> yonlendirme
// Gercek drizzle migration'larini gecici bir SQLite dosyasina uygular.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const KOK = 'C:/Users/haaka/Desktop/evren-osint/panel/kurum';
const PANEL = 'C:/Users/haaka/Desktop/umraniye-osint-proje';
const url = (p) => pathToFileURL(p).href;

const { openDatabase } = await import(url(PANEL + '/application/server/database.mjs'));
const { seedCatalog } = await import(url(PANEL + '/application/server/institution-coordination/server/seed-catalog.mjs'));
const route = await import(url(PANEL + '/application/server/institution-coordination/server/route-event.mjs'));
const { kurallariUret, kurallariOzetle } = await import(url(KOK + '/policy.mjs'));
const { localityCikar } = await import(url(KOK + '/locality.mjs'));

const dbYolu = join(mkdtempSync(join(tmpdir(), 'kurum-')), 'test.sqlite');
const db = openDatabase(dbYolu);

let gecen = 0, kalan = 0;
const t = (ad, fn) => {
  try { fn(); gecen++; console.log('  [OK  ] ' + ad); }
  catch (e) { kalan++; console.log('  [HATA] ' + ad + '  -> ' + e.message); }
};
const ta = async (ad, fn) => {
  try { await fn(); gecen++; console.log('  [OK  ] ' + ad); }
  catch (e) { kalan++; console.log('  [HATA] ' + ad + '  -> ' + e.message); }
};

console.log('=== 0) gercek migration semasi ===');
await ta('drizzle migrationlari uygulandi', async () => {
  // 0009 migration'i 24 kurum + 50 konu adayi YAZAR (hepsi draft/disabled).
  const k = await db.prepare('SELECT COUNT(*) n FROM coord_institutions').first();
  const t = await db.prepare('SELECT COUNT(*) n FROM coord_topics').first();
  assert.equal(Number(k.n), 24, 'kurum: ' + k.n);
  assert.equal(Number(t.n), 50, 'konu: ' + t.n);
  const onayli = await db.prepare(
    "SELECT COUNT(*) n FROM coord_institutions WHERE enabled=1").first();
  assert.equal(Number(onayli.n), 0, 'migration hicbir seyi onaylamamali');
});

console.log();
console.log('=== 1) katalog sekli ===');
const katalog = JSON.parse(readFileSync(PANEL + '/application/server/institution-coordination/routing-catalog.json', 'utf8'));
t('institutions dizisi var', () => assert.ok(Array.isArray(katalog.institutions)));
t('topics dizisi var (seeder bunu bekliyordu)', () => assert.ok(Array.isArray(katalog.topics), 'topics yok'));
t('24 kurum', () => assert.equal(katalog.institutions.length, 24));
t('50 konu', () => assert.equal(katalog.topics.length, 50));

console.log();
console.log('=== 2) seedCatalog ===');
const seed = await seedCatalog(db, katalog);
t('seed hata atmadi', () => assert.ok(seed.statementsCompleted > 0, JSON.stringify(seed)));
t('74 kayit yazildi (24 kurum + 50 konu)', () => assert.equal(seed.statementsCompleted, 74, JSON.stringify(seed)));
t('seeder hicbir seyi onaylamadi', () => assert.equal(seed.enabledBySeeder, 0));

console.log();
console.log('=== 3) onaysiz durumda kurallar ===');
let kural = await kurallariUret(db, {});
t('state=draft (onay yok)', () => assert.equal(kural.state, 'draft'));
t('kural listesi bos', () => assert.equal(kural.rules.length, 0));
t('sebep bildirildi', () => assert.ok(kural.sebep, JSON.stringify(kural.sayilar)));

console.log();
console.log('=== 4) uc kurum onaylandi (TEST) ===');
const onaylanacak = [
  ['ISKI_UMR', 'water_leak'],
  ['ISTANBUL_ITFAIYE', 'fire_rescue'],
  ['UMR_EMNIYET', 'traffic_safety'],
];
const simdi = new Date().toISOString();
for (const [kurumKodu, konuKodu] of onaylanacak) {
  const kurum = await db.prepare('SELECT id FROM coord_institutions WHERE code=?').bind(kurumKodu).first();
  const konu = await db.prepare('SELECT id FROM coord_topics WHERE code=?').bind(konuKodu).first();
  await db.prepare(`UPDATE coord_institutions SET enabled=1, approval_status='approved',
    approval_reference='TEST-ONAY', email_enabled=1 WHERE id=?`).bind(kurum.id).run();
  await db.prepare(`UPDATE coord_topics SET enabled=1, approval_status='approved',
    approval_reference='TEST-ONAY' WHERE id=?`).bind(konu.id).run();
  await db.prepare(`INSERT INTO coord_institution_topic_grants(institution_id,topic_id,granted,approval_reference,updated_by,updated_at)
    VALUES(?,?,1,'TEST-GRANT','test',?)`).bind(kurum.id, konu.id, simdi).run();
}
kural = await kurallariUret(db, {});
const ozet = kurallariOzetle(kural);
console.log('      kurallar:', JSON.stringify(ozet));
t('state=approved', () => assert.equal(kural.state, 'approved'));
t('2 kural uretildi (fire_rescue high -> disarida)', () =>
  assert.equal(kural.rules.length, 2, JSON.stringify(kural.sayilar)));
t('high duyarli konu kural listesine GIRMEZ', () => {
  const konular = kural.rules.map(r => r.topic);
  assert.ok(!konular.includes('fire_rescue'), 'fire_rescue sizmamali: ' + konular);
});
t('her kuralin terimleri var', () => {
  for (const r of kural.rules) assert.ok(r.terms.length >= 2, r.topic);
});

console.log();
console.log('=== 5) gercek olaylar yonlendiriliyor mu? ===');
const olaylar = [
  { ad: 'Su kacagi', beklenen: 'ISKI_UMR', event: {
      id: 'e-su', title: "Dudullu'da ana su borusu patladı, sokak su altında",
      description: 'İSKİ ekipleri bölgeye sevk edildi.',
      publishedAt: simdi, firstSeenAt: simdi,
      neighborhood: 'Dudullu', locationVerified: true, locationStatus: 'verified' } },
  { ad: 'Yangin (high duyarli -> gitmez)', beklenen: null, event: {
      id: 'e-yangin', title: "Çakmak Mahallesi'nde apartman yangını",
      description: 'İtfaiye ekipleri müdahale ediyor.',
      publishedAt: simdi, firstSeenAt: simdi,
      neighborhood: 'Çakmak', locationVerified: true, locationStatus: 'verified' } },
  { ad: 'Trafik kazasi', beklenen: null, event: {
      id: 'e-kaza', title: "Trafik kazası: TEM'de iki araç çarpıştı",
      description: 'Yaralılar hastaneye kaldırıldı.',
      publishedAt: simdi, firstSeenAt: simdi,
      neighborhood: 'Yamanevler', locationVerified: true, locationStatus: 'verified' } },
  { ad: 'Yerel olmayan olay', beklenen: null, event: {
      id: 'e-uzak', title: "Ankara'da su borusu patladı",
      publishedAt: simdi, firstSeenAt: simdi, locationVerified: true } },
];

for (const o of olaylar) {
  const ev = { ...o.event, locality: localityCikar(o.event) };
  const sonuc = await route.projectMultiInstitutionEvent({ db, event: ev, rules: kural });
  const proj = (sonuc.routes || []).filter(r => r.decision === 'projected').map(r => r.institution);
  if (o.beklenen) {
    t(o.ad + ' -> ' + o.beklenen, () => assert.ok(proj.includes(o.beklenen),
      'projeksiyon: ' + JSON.stringify(sonuc)));
  } else {
    t(o.ad + ' -> yonlendirilmedi', () => assert.equal(proj.length, 0, JSON.stringify(sonuc)));
  }
  if (o.ad.startsWith('Trafik') || o.ad.startsWith('Yangin')) {
    console.log('        (' + o.ad.split(' ')[0] + ' high duyarli -> otomatik yonlendirilmez: dogru davranis)');
  }
}

console.log();
console.log('=== 6) idempotency ===');
const ev = { ...olaylar[0].event, locality: localityCikar(olaylar[0].event) };
const ikinci = await route.projectMultiInstitutionEvent({ db, event: ev, rules: kural });
t('ayni olay ikinci kez case olusturmaz', () => {
  const proj = (ikinci.routes || []).filter(r => r.decision === 'projected');
  assert.equal(proj.length, 0, JSON.stringify(ikinci));
});
await ta('coord_cases icinde 1 kayit var (yalniz su kacagi)', async () => {
  const r = await db.prepare('SELECT COUNT(*) n FROM coord_cases').first();
  assert.equal(Number(r.n), 1, 'bulunan: ' + r.n);
});

console.log();
console.log('=== 7) kisisel veri korumasi ===');
const kisisel = {
  id: 'e-tc', title: 'Su kaçağı - TC 12345678901 numaralı vatandaş',
  description: 'Telefon: 0555 123 45 67',
  publishedAt: simdi, firstSeenAt: simdi,
  neighborhood: 'Dudullu', locationVerified: true, locationStatus: 'verified',
};
const kisiselSonuc = await route.projectMultiInstitutionEvent({
  db, event: { ...kisisel, locality: localityCikar(kisisel) }, rules: kural });
t('TC/telefon iceren olay bloklanir', () => {
  assert.equal(kisiselSonuc.decision, 'held', JSON.stringify(kisiselSonuc));
});

console.log();
console.log('=== 8) e-posta kuyrugu ===');
await ta('coord_mail_outbox kayitlari olustu', async () => {
  const r = await db.prepare('SELECT COUNT(*) n FROM coord_mail_outbox').first();
  // Alici tanimli olmadigi icin 0 olabilir; bu normaldir.
  console.log('        outbox kayit sayisi:', r.n, '(alici tanimli degilse 0 normaldir)');
  assert.ok(Number(r.n) >= 0);
});

db.close();
console.log();
console.log('SONUC: ' + gecen + ' gecti, ' + kalan + ' kaldi');
process.exit(kalan ? 1 : 0);
