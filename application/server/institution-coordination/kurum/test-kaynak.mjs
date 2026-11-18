/**
 * UCTAN UCA KAYNAK YAZMA KANITI (gecici DB, canliya dokunmaz).
 * Kaynakli bir olayi projeksiyon yolundan yazar; coord_case_sources ve
 * zengin ozet dogrulanir. Ikinci yazim mukerrer olmali.
 */
import { rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

process.env.OSINT_ROUTING_LOCAL_SCOPE = '1';
const KOK = dirname(fileURLToPath(import.meta.url));
const PANEL = '/opt/umraniye-osint-deneme';
const UYG = PANEL;

const { projectContextEvent } = await import(pathToFileURL(join(KOK, 'projeksiyon.mjs')).href);
const { openDatabase } = await import(pathToFileURL(join(UYG, 'server', 'database.mjs')).href);

const TEST = join(tmpdir(), 'osint-kaynak-test');
if (existsSync(TEST)) rmSync(TEST, { recursive: true, force: true });
mkdirSync(TEST, { recursive: true });
const db = openDatabase(join(TEST, 'osint.sqlite'));
const at = new Date().toISOString();

for (const code of ['UMR_EMNIYET']) {
  db.prepare(`UPDATE coord_institutions SET enabled=1,approval_status='approved',
    approval_reference='test' WHERE code=?`).bind(code).run();
}
for (const code of ['public_safety']) {
  db.prepare(`UPDATE coord_topics SET enabled=1,approval_status='approved',
    approval_reference='test' WHERE code=?`).bind(code).run();
}
db.prepare(`UPDATE coord_institution_topic_grants SET granted=1,approval_reference='test'
  WHERE institution_id=? AND topic_id=?`).bind('catalog-UMR_EMNIYET', 'catalog-public_safety').run();
if (!await db.prepare(`SELECT 1 x FROM coord_institution_topic_grants
  WHERE institution_id=? AND topic_id=?`).bind('catalog-UMR_EMNIYET', 'catalog-public_safety').first()) {
  db.prepare(`INSERT INTO coord_institution_topic_grants
    (institution_id,topic_id,granted,approval_reference,updated_by,updated_at)
    VALUES(?,?,1,'test','test',?)`).bind('catalog-UMR_EMNIYET', 'catalog-public_safety', at).run();
}

const profiller = { basliklar: { public_safety: 'Kamu güvenliği bildirimi' } };
const olay = {
  id: 'e-kaynakli-1',
  title: 'Ümraniye parkta kavga',
  description: 'Ümraniye’de parkta kavga çıktı, ekip sevk edildi.',
  publishedAt: '2026-11-18T09:00:00.000Z',
  firstSeenAt: '2026-11-18T09:01:00.000Z',
  locality: { district: 'Ümraniye', neighborhood: 'Şerifali', verified: true, precision: 'neighborhood' },
  kaynaklar: [
    { url: 'https://ornek-gazete.com/umraniye-kavga/1', name: 'Örnek Gazete', platform: 'news', publishedAt: '2026-11-18T09:00:00.000Z' },
    { url: 'https://x.com/ornek/status/123', name: 'Örnek X Hesabı', platform: 'x', publishedAt: '2026-11-18T09:05:00.000Z' },
  ],
};

const r1 = await projectContextEvent({ db, event: olay, profiller,
  route: { institution: 'UMR_EMNIYET', topic: 'public_safety', confidence: 0.94 } });
console.log('1. yazim:', JSON.stringify(r1));
if (r1.decision !== 'projected') { console.log('FAIL: yazilmadi'); process.exit(1); }

const vaka = await db.prepare('SELECT title,summary_redacted,neighborhood FROM coord_cases').first();
console.log('vaka:', JSON.stringify(vaka));
const kaynaklar = (await db.prepare('SELECT source_url,source_name,platform FROM coord_case_sources ORDER BY source_url').all()).results;
console.log('kaynak satirlari:', JSON.stringify(kaynaklar));

const r2 = await projectContextEvent({ db, event: olay, profiller,
  route: { institution: 'UMR_EMNIYET', topic: 'public_safety', confidence: 0.94 } });
console.log('2. yazim (mukerrer olmali):', JSON.stringify(r2));

const kontrol = [];
kontrol.push(['vaka yazildi', r1.decision === 'projected']);
kontrol.push(['ozet kaynak iceriyor', /Kaynaklar \(2\): Örnek Gazete, Örnek X Hesabı/.test(vaka.summary_redacted)]);
kontrol.push(['ozet ilk yayin iceriyor', /İlk yayın: 18 Kasım 2026/.test(vaka.summary_redacted)]);
kontrol.push(['ozet mahalle iceriyor', /Şerifali Mahallesi/.test(vaka.summary_redacted)]);
kontrol.push(['ozet KAYNAK METNI icermiyor', !/kavga çıktı, ekip/.test(vaka.summary_redacted)]);
kontrol.push(['2 kaynak satiri', kaynaklar.length === 2]);
kontrol.push(['mukerrer yazim engelli', r2.decision === 'duplicate']);
kontrol.push(['kaynak satiri artmadi', (await db.prepare('SELECT COUNT(*) n FROM coord_case_sources').first()).n === 2]);

let fail = 0;
for (const [ad, sonuc] of kontrol) { console.log((sonuc ? '  OK   ' : '  FAIL ') + ad); if (!sonuc) fail++; }
console.log(fail === 0 ? 'SONUC: GECTI' : 'SONUC: HATA VAR (' + fail + ')');
process.exit(fail === 0 ? 0 : 1);
