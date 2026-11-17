/**
 * BAGLAM MOTORU TESTLERI
 *
 * 1) Saf karar testleri: duyuru, park-kavga, trafik kazasi, baska ilce,
 *    kisisel veri, yangin paylasimi.
 * 2) Otomatik profil uretimi: grant'lardan gorev alani + guvenlik kurumu
 *    tespiti + genel alan baglam sarti.
 * 3) Gercek semali yazma testi: coord_cases + coord_audit yazilir, ikinci
 *    tur mukerrer uretmez, mail outbox KAPALI kalir.
 *
 * Calistir:
 *   node --no-warnings test-baglam.mjs <panel-kok>
 */
import { rmSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';

process.env.OSINT_ROUTING_LOCAL_SCOPE = '1';

const KOK = dirname(fileURLToPath(import.meta.url));
const PANEL = process.argv[2] || process.env.OSINT_PROJE
  || resolve(KOK, '..', '..', '..', '..');
const UYG = existsSync(join(PANEL, 'application')) ? join(PANEL, 'application') : PANEL;

const { profilleriUret, profilleriBirlestir } = await import(
  pathToFileURL(join(KOK, 'profil-uret.mjs')).href);
const { terimKatalogu, baglamliDegerlendir, guvenliBaslik } = await import(
  pathToFileURL(join(KOK, 'baglam.mjs')).href);
const { localityCikar } = await import(pathToFileURL(join(KOK, 'locality.mjs')).href);
const { projectContextEvent } = await import(pathToFileURL(join(KOK, 'projeksiyon.mjs')).href);
const { openDatabase } = await import(pathToFileURL(join(UYG, 'server', 'database.mjs')).href);
const { readFileSync } = await import('node:fs');

let ok = 0; const hatalar = [];
const kontrol = (ad, kosul, ek = '') => {
  if (kosul) { ok++; console.log(`  OK   ${ad}`); }
  else { hatalar.push(ad); console.log(` HATA  ${ad}${ek ? ' :: ' + ek : ''}`); }
};

// ---------------------------------------------------------- 1. sahte DB
const kurumlar = [
  { code: 'UMR_EMNIYET', grp: 'public_agency' },
  { code: 'UMR_BELEDIYE', grp: 'municipality' },
  { code: 'ISTANBUL_ITFAIYE', grp: 'regional_agency' },
  { code: 'ISKI_UMR', grp: 'utility' },
];
const konular = ['public_safety', 'traffic_safety', 'parks_public_space',
  'municipal_roadside_asset', 'fire_rescue', 'water_leak'].map(code => ({ code, sensitivity: 'ordinary' }));
const grantlar = [
  ['UMR_EMNIYET', 'public_safety'], ['UMR_EMNIYET', 'traffic_safety'],
  ['UMR_EMNIYET', 'parks_public_space'], ['UMR_EMNIYET', 'fire_rescue'],
  ['UMR_BELEDIYE', 'parks_public_space'], ['UMR_BELEDIYE', 'municipal_roadside_asset'],
  ['ISTANBUL_ITFAIYE', 'fire_rescue'], ['ISKI_UMR', 'water_leak'],
].map(([kurum, konu]) => ({ kurum, konu }));

const sahteDb = {
  prepare(sql) {
    if (sql.includes('institution_group')) return { all: async () => kurumlar };
    if (sql.includes('FROM coord_topics')) return { all: async () => konular };
    if (sql.includes('coord_institution_topic_grants')) return { all: async () => grantlar };
    return { all: async () => [] };
  },
};

const elle = JSON.parse(readFileSync(join(KOK, 'profiller.json'), 'utf8'));
const otomatik = await profilleriUret(sahteDb, elle);
const profiller = profilleriBirlestir(otomatik, elle);
const terimler = JSON.parse(readFileSync(join(KOK, 'topic-terms.json'), 'utf8'));
const katalog = terimKatalogu(terimler.konular);
const izinler = grantlar.map(g => ({ institution: g.kurum, topic: g.konu }));

const olay = (baslik, aciklama, ek = {}) => {
  const e = { id: 't-' + Math.random().toString(36).slice(2, 8), title: baslik,
    description: aciklama, fullText: aciklama, publishedAt: new Date().toISOString(),
    firstSeenAt: new Date().toISOString(), scope: 'local', ...ek };
  return { ...e, locality: localityCikar(e) };
};
const kurumlarD = k => (k.routes ?? []).map(r => r.institution).sort();
const karar = e => baglamliDegerlendir(e, { katalog, profiller, izinler });

// ------------------------------------------------- 2. profil uretimi
console.log('== OTOMATIK PROFIL');
kontrol('her onayli kurum icin profil var',
  kurumlar.every(k => profiller.kurumlar[k.code]));
kontrol('emniyet guvenlik kurumu olarak isaretlendi',
  profiller.kurumlar.UMR_EMNIYET.guvenlikKurumu === true);
kontrol('belediye guvenlik kurumu DEGIL',
  profiller.kurumlar.UMR_BELEDIYE.guvenlikKurumu === false);
kontrol('emniyet park konusunda baglam sarti var',
  Array.isArray(profiller.kurumlar.UMR_EMNIYET.baglam?.parks_public_space));
kontrol('belediye park konusunda OTOMATIK baglam sarti YOK',
  !otomatik.kurumlar.UMR_BELEDIYE.baglam?.parks_public_space);
kontrol('her grant konusu icin guvenli baslik var',
  [...new Set(grantlar.map(g => g.konu))].every(k => !!guvenliBaslik(k, profiller)));

// ------------------------------------------------- 3. karar senaryolari
console.log('== KARAR SENARYOLARI');

const duyuru = olay('Ümraniye yeni park hizmete açıldı',
  'Ümraniye Belediyesi yeni parkı hizmete açtı, açılış töreni kutlandı.');
const dDuyuru = karar(duyuru);
kontrol('duyuru vaka uretmez', dDuyuru.decision === 'held' && /announcement/.test(dDuyuru.reason), dDuyuru.reason);

const kavga = olay('Ümraniye parkta kavga',
  'Ümraniye’de parkta kavga çıktı, silahla yaralama ihbarı üzerine ekip sevk edildi.');
const dKavga = karar(kavga);
kontrol('park-kavga emniyete gider', kurumlarD(dKavga).includes('UMR_EMNIYET'), JSON.stringify(kurumlarD(dKavga)));
kontrol('park-kavga belediyeye GITMEZ', !kurumlarD(dKavga).includes('UMR_BELEDIYE'), JSON.stringify(kurumlarD(dKavga)));

const trafik = olay('Ümraniye trafik kazası',
  'Ümraniye’de kavşakta trafik kazası meydana geldi, yaralılar var.');
const dTrafik = karar(trafik);
kontrol('trafik kazasi emniyete gider', kurumlarD(dTrafik).includes('UMR_EMNIYET'), JSON.stringify(kurumlarD(dTrafik)));

const yol = olay('Ümraniye kaldırım bozuk',
  'Ümraniye’de kaldırım bozuk ve bordür kırık, yaya geçidi hasarlı.');
const dYol = karar(yol);
kontrol('kaldirim belediyeye gider', kurumlarD(dYol).includes('UMR_BELEDIYE'), JSON.stringify(kurumlarD(dYol)));
kontrol('kaldirim emniyete GITMEZ', !kurumlarD(dYol).includes('UMR_EMNIYET'), JSON.stringify(kurumlarD(dYol)));

const yangin = olay('Ümraniye yangın',
  'Ümraniye’de apartmanda yangın çıktı, itfaiye ekipleri müdahale ediyor.');
const dYangin = karar(yangin);
kontrol('yangin itfaiye + emniyet paylasimi',
  ['ISTANBUL_ITFAIYE', 'UMR_EMNIYET'].every(k => kurumlarD(dYangin).includes(k)),
  JSON.stringify(kurumlarD(dYangin)));

const baskaIlce = olay('Nazilli su borusu patladı',
  'Nazilli’de su borusu patladı, cadde su altında kaldı.');
const dBaska = karar(baskaIlce);
kontrol('baska ilce olayi tutulur', dBaska.decision === 'held'
  && /locality/.test(dBaska.reason), dBaska.reason);

const kisisel = olay('Ümraniye kavga',
  'Ümraniye’de kavga çıktı, TC 12345678901 numaralı kişi gözaltına alındı.');
const dKisisel = karar(kisisel);
kontrol('kisisel veri iceren olay tutulur', dKisisel.decision === 'held'
  && /personal/.test(dKisisel.reason), dKisisel.reason);

const su = olay('Ümraniye su kaçağı',
  'Ümraniye’de su borusu patladı, kaldırımdan su akıyor.');
const dSu = karar(su);
kontrol('su kacagi ISKIye gider', kurumlarD(dSu).includes('ISKI_UMR'), JSON.stringify(kurumlarD(dSu)));

// --------------------------------------- 4. gercek semali yazma testi
console.log('== GERCEK SEMA / YAZMA');
const TEST = join(tmpdir(), 'osint-baglam-test');
if (existsSync(TEST)) rmSync(TEST, { recursive: true, force: true });
mkdirSync(TEST, { recursive: true });
const db = openDatabase(join(TEST, 'osint.sqlite'));
const at = new Date().toISOString();

for (const [code, group] of [['UMR_EMNIYET', 'public_agency'], ['ISKI_UMR', 'utility']]) {
  db.prepare(`UPDATE coord_institutions SET enabled=1,approval_status='approved',
    approval_reference='test' WHERE code=?`).bind(code).run();
}
for (const code of ['public_safety', 'water_leak']) {
  db.prepare(`UPDATE coord_topics SET enabled=1,approval_status='approved',
    approval_reference='test' WHERE code=?`).bind(code).run();
}
for (const [kurum, konu] of [['UMR_EMNIYET', 'public_safety'], ['ISKI_UMR', 'water_leak']]) {
  db.prepare(`UPDATE coord_institution_topic_grants SET granted=1,approval_reference='test'
    WHERE institution_id=? AND topic_id=?`).bind('catalog-' + kurum, 'catalog-' + konu).run();
  if (!await db.prepare(`SELECT 1 x FROM coord_institution_topic_grants
    WHERE institution_id=? AND topic_id=?`).bind('catalog-' + kurum, 'catalog-' + konu).first()) {
    db.prepare(`INSERT INTO coord_institution_topic_grants
      (institution_id,topic_id,granted,approval_reference,updated_by,updated_at)
      VALUES(?,?,1,'test','test',?)`).bind('catalog-' + kurum, 'catalog-' + konu, at).run();
  }
}

const testProfiller = {
  basliklar: { public_safety: 'Kamu güvenliği bildirimi', water_leak: 'Su kaçağı bildirimi' },
};
const e1 = olay('Ümraniye kavga', 'Ümraniye’de silahla yaralama ve kavga ihbarı.');
const r1 = await projectContextEvent({ db, event: e1, profiller: testProfiller,
  route: { institution: 'UMR_EMNIYET', topic: 'public_safety', confidence: 0.94 } });
kontrol('vaka yazildi', r1.decision === 'projected', JSON.stringify(r1));
const caseSayisi = async () => Number((await db.prepare('SELECT COUNT(*) n FROM coord_cases').first()).n);
const auditSayisi = async () => Number((await db.prepare('SELECT COUNT(*) n FROM coord_audit').first()).n);
kontrol('coord_cases 1 satir', await caseSayisi() === 1);
kontrol('coord_audit 1 satir', await auditSayisi() === 1);
kontrol('mail outbox KAPALI (0)', Number((await db.prepare('SELECT COUNT(*) n FROM coord_mail_outbox').first()).n) === 0);

const r2 = await projectContextEvent({ db, event: e1, profiller: testProfiller,
  route: { institution: 'UMR_EMNIYET', topic: 'public_safety', confidence: 0.94 } });
kontrol('ikinci yazim mukerrer', r2.decision === 'duplicate', JSON.stringify(r2));
kontrol('vaka sayisi hala 1', await caseSayisi() === 1);

const r3 = await projectContextEvent({ db, event: e1, profiller: testProfiller,
  route: { institution: 'UMR_EMNIYET', topic: 'water_leak', confidence: 0.9 } });
kontrol('grant olmayan konu yazilmaz', r3.decision === 'held'
  && r3.reason === 'institution_topic_not_approved', JSON.stringify(r3));

const e2 = olay('Nazilli kavga', 'Nazilli’de kavga çıktı.');
const r4 = await projectContextEvent({ db, event: e2, profiller: testProfiller,
  route: { institution: 'UMR_EMNIYET', topic: 'public_safety', confidence: 0.9 } });
kontrol('dogrulanmamis konum yazilmaz', r4.decision === 'held'
  && /locality/.test(r4.reason), JSON.stringify(r4));

const satir = await db.prepare('SELECT title,summary_redacted FROM coord_cases').first();
kontrol('baslik kategori duzeyinde', satir?.title === 'Kamu güvenliği bildirimi', satir?.title);
kontrol('ozet kaynak metni KOPYALAMAZ',
  !String(satir?.summary_redacted).includes('silahla'), satir?.summary_redacted);
db.close();

console.log('==============================================');
console.log(`SONUC: ${hatalar.length ? 'BASARISIZ' : 'TUM KONTROLLER GECTI'}  (OK=${ok}, FAIL=${hatalar.length})`);
if (hatalar.length) { console.log('BASARISIZ: ' + hatalar.join(' | ')); process.exit(1); }
