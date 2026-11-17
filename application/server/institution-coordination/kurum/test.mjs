// Kurum boru hatti — birim testleri (DB gerekmez)
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const KOK = dirname(fileURLToPath(import.meta.url));
const { katalogYukle, konulariBul, cakismalariBul, normalize, terimRegex } =
  await import('file:///' + join(KOK, 'eslesme.mjs').replace(/\\/g, '/'));
const { displayTitles, baslikVar } = await import('file:///' + join(KOK, 'display-titles.mjs').replace(/\\/g, '/'));
const { localityCikar, yonlendirilebilir } = await import('file:///' + join(KOK, 'locality.mjs').replace(/\\/g, '/'));

let gecen = 0, kalan = 0;
function t(ad, fn) {
  try { fn(); gecen++; console.log('  [OK  ] ' + ad); }
  catch (e) { kalan++; console.log('  [HATA] ' + ad + '  -> ' + e.message); }
}

console.log('=== 1) normalize ===');
t('Turkce karakterler sadeleşir', () => {
  assert.equal(normalize('Şişli Ğüçlü Çağlayan'), 'sisli guclu caglayan');
});
t('noktalama boşluğa döner', () => {
  assert.equal(normalize('su, borusu! patladı.'), 'su borusu patladi');
});

console.log();
console.log('=== 2) kok eslestirme (Turkce ekler) ===');
t('ek almis hali yakalanir: yanginda', () => {
  assert.ok(terimRegex('yangin').test('binada yanginda mahsur kaldilar'));
});
t('ek almis hali yakalanir: yangini', () => {
  assert.ok(terimRegex('yangin').test('apartman yangini'));
});
t('yanlis pozitif YOK: kaza != kazandi', () => {
  assert.equal(terimRegex('kaza').test('piyangodan para kazandi'), false);
});
t('yanlis pozitif YOK: kaza != kazak', () => {
  assert.equal(terimRegex('kaza').test('kirmizi kazak giydi'), false);
});
t('cok kelimeli terim eslesir', () => {
  assert.ok(terimRegex('trafik kazasi').test('TEMde trafik kazasi meydana geldi'));
});

console.log();
console.log('=== 3) katalog butunlugu ===');
const katalog = katalogYukle(join(KOK, 'topic-terms.json'));
t('50 konu yuklendi', () => {
  assert.equal(katalog.size, 50, 'bulunan: ' + katalog.size);
});
t('her konunun en az 2 terimi var', () => {
  for (const [konu, r] of katalog) assert.ok(r.length >= 2, konu + ': ' + r.length);
});
const cakisma = cakismalariBul(katalog);
t('terim cakismasi yok (veya raporlandi)', () => {
  // cakisma varsa yazdir, hata verme — bilincli olabilir
  if (cakisma.length) console.log('        cakismalar: ' + JSON.stringify(cakisma));
});

console.log();
console.log('=== 4) gercek haber metinlerinde konu bulma ===');
const ornekler = [
  ['Apartman yangını', 'Çakmak Mahallesi\'nde 5 katlı apartmanda çıkan yangında 2 kişi mahsur kaldı. İtfaiye ekipleri müdahale ediyor.', 'fire_rescue'],
  ['Su borusu patladı', 'Dudullu\'da ana su borusu patladı, sokak su altında kaldı. İSKİ ekipleri sevk edildi.', 'water_leak'],
  ['Trafik kazası', 'TEM otoyolunda iki araç çarpıştı, 3 kişi yaralandı. Ambulanslar olay yerinde.', 'traffic_safety'],
  ['Gaz kokusu', 'İstiklal Mahallesi\'nde doğal gaz kaçağı nedeniyle sokak tahliye edildi.', 'gas_leak_public_hazard'],
  ['Elektrik kesintisi', 'Yamanevler\'de 4 saatlik elektrik kesintisi yaşanacak.', 'power_outage'],
  ['Metro arızası', 'M7 metro hattında arıza nedeniyle seferler iptal edildi.', 'metro_service_disruption'],
  ['Çöp konteyneri', 'Sokakta çöp konteyneri devrildi, çevreye atık yayıldı.', 'waste_container'],
  ['Okul çevresi', 'Okul önünde servis aracı kaza yaptı, öğrenciler korkuyla kaçtı.', 'school_perimeter_safety'],
];
for (const [ad, metin, beklenen] of ornekler) {
  t(ad + ' -> ' + beklenen, () => {
    const bulunan = konulariBul(metin, katalog);
    const konular = bulunan.map(b => b.konu);
    assert.ok(konular.includes(beklenen), 'bulunan: ' + JSON.stringify(bulunan));
  });
}

console.log();
console.log('=== 5) displayTitles kapsami ===');
t('50 konunun tamami baslikli', () => {
  const eksik = [...katalog.keys()].filter(k => !baslikVar(k));
  assert.deepEqual(eksik, [], 'eksik: ' + JSON.stringify(eksik));
});

console.log();
console.log('=== 6) locality cikarimi ===');
t('dogrulanmis mahalle', () => {
  const l = localityCikar({
    title: 'Çakmak Mahallesi\'nde yangın', neighborhood: 'Çakmak',
    locationVerified: true, locationStatus: 'verified',
  });
  assert.equal(l.district, 'Ümraniye');
  assert.equal(l.neighborhood, 'Çakmak');
  assert.equal(l.verified, true);
  assert.equal(l.precision, 'neighborhood');
  assert.ok(yonlendirilebilir(l));
});
t('dogrulanmamis mahalle -> yonlendirilemez', () => {
  const l = localityCikar({
    title: 'Çakmak Mahallesi\'nde yangın', neighborhood: 'Çakmak',
    locationVerified: false, locationStatus: 'review_required',
  });
  assert.equal(l.verified, false);
  assert.equal(yonlendirilebilir(l), false);
});
t('sadece metinde ilce -> ilce duzeyi', () => {
  const l = localityCikar({ title: 'Ümraniye\'de su kesintisi', locationVerified: true });
  assert.equal(l.district, 'Ümraniye');
  assert.equal(l.precision, 'district');
  assert.ok(yonlendirilebilir(l));
});
t('hicbir ipucu yok -> dogrulanmamis', () => {
  const l = localityCikar({ title: 'Bir olay oldu' });
  assert.equal(l.district, null);
  assert.equal(l.verified, false);
});
t('mevcut locality korunur', () => {
  const l = localityCikar({
    title: 'x',
    locality: { district: 'Ümraniye', neighborhood: 'Dudullu', verified: true, precision: 'neighborhood' },
  });
  assert.equal(l.kaynak, 'mevcut');
  assert.equal(l.neighborhood, 'Dudullu');
});

console.log();
console.log('SONUC: ' + gecen + ' gecti, ' + kalan + ' kaldi');
process.exit(kalan ? 1 : 0);
