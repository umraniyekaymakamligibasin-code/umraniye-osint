#!/usr/bin/env node
/**
 * KURUM BAGLAM ONIZLEMESI (SALT OKUNUR)
 *
 * Hicbir tabloya YAZMAZ. Mevcut snapshot'lardaki olaylari yeni baglam
 * motorundan gecirir ve "hangi kuruma ne duserdi / neden dusmezdi" raporu basar.
 *
 * Kullanim:
 *   node onizleme.mjs --sunucu /opt/umraniye-osint-deneme
 *   node onizleme.mjs --sunucu ... --kurum UMR_EMNIYET --liste
 *   node onizleme.mjs --sunucu ... --liste --limit 50
 *   node onizleme.mjs --sunucu ... --json
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { profilleriYukle, terimKatalogu, baglamliDegerlendir, normalize } from './baglam.mjs';
import { profilleriUret, profilleriBirlestir } from './profil-uret.mjs';
import { localityCikar } from './locality.mjs';

const arg = process.argv.slice(2);
const al = (ad, vars = null) => { const i = arg.indexOf(ad); return i >= 0 ? (arg[i + 1] ?? true) : vars; };
const bayrak = (ad) => arg.includes(ad);

const sunucu = String(al('--sunucu', '/opt/umraniye-osint-deneme'));
const veriDir = String(al('--veri', process.env.DATA_DIR || '/var/lib/umraniye-osint-deneme'));
const kurumFiltre = al('--kurum', null);
const limit = Number(al('--limit', 0)) || 0;
const liste = bayrak('--liste');
const jsonCikti = bayrak('--json');

const mods = {
  db: pathToFileURL(join(sunucu, 'server', 'database.mjs')).href,
  ic: join(sunucu, 'server', 'institution-coordination'),
};
const { openDatabase } = await import(mods.db);
const db = openDatabase(join(veriDir, 'osint.sqlite'));

const elleProfiller = profilleriYukle();
const profiller = profilleriBirlestir(await profilleriUret(db, elleProfiller), elleProfiller);
const katalog = terimKatalogu(
  JSON.parse(fs.readFileSync(new URL('./topic-terms.json', import.meta.url), 'utf8')).konular);

const izinler = (await db.prepare(`SELECT i.code institution, t.code topic
  FROM coord_institution_topic_grants g
  JOIN coord_institutions i ON i.id=g.institution_id AND i.enabled=1 AND i.approval_status='approved'
  JOIN coord_topics t ON t.id=g.topic_id AND t.enabled=1 AND t.approval_status='approved'
  WHERE g.granted=1`).all()).results ?? [];

const satirlar = (await db.prepare('SELECT data FROM snapshots').all()).results ?? [];
const olaylar = new Map();
for (const r of satirlar) {
  let j; try { j = JSON.parse(r.data); } catch { continue; }
  for (const e of j.events || []) {
    if (!e || typeof e.id !== 'string' || !e.id) continue;
    const eski = olaylar.get(e.id);
    const boy = x => String(x.fullText || x.description || x.text || '').length;
    if (!eski || boy(e) > boy(eski)) olaylar.set(e.id, e);
  }
}

const kurumSayac = new Map();
const sebepSayac = new Map();
const cikti = [];
const gorulenBaslik = new Set();
let adayOlay = 0, adayRota = 0, incelenen = 0;

for (const e of olaylar.values()) {
  const locality = localityCikar(e);
  const olay = { ...e, locality, description: [e.description, e.text, e.fullText].filter(Boolean).join('\n').slice(0, 8000) };
  const k = baglamliDegerlendir(olay, { katalog, profiller, izinler });
  incelenen++;
  if (k.decision !== 'candidates') {
    sebepSayac.set(k.reason, (sebepSayac.get(k.reason) || 0) + 1);
    if (jsonCikti) cikti.push({ id: e.id, decision: 'held', reason: k.reason, title: String(e.title).slice(0, 120) });
    continue;
  }
  adayOlay++;
  for (const r of k.routes) {
    if (kurumFiltre && r.institution !== kurumFiltre) continue;
    const anahtar = `${r.institution}|${r.topic}|${normalize(e.title || '')}`;
    if (gorulenBaslik.has(anahtar)) continue;
    gorulenBaslik.add(anahtar);
    adayRota++;
    kurumSayac.set(r.institution, (kurumSayac.get(r.institution) || 0) + 1);
    const kayit = { id: e.id, institution: r.institution, topic: r.topic, confidence: r.confidence,
      hits: r.hits, terms: r.terms, title: String(e.title).slice(0, 110),
      neighborhood: locality.neighborhood || null };
    cikti.push(kayit);
    if (liste && !jsonCikti) {
      console.log(`${r.institution.padEnd(22)} ${r.topic.padEnd(30)} conf=${r.confidence} | ${kayit.title}`);
    }
  }
}

if (jsonCikti) {
  console.log(JSON.stringify({ incelenen, adayOlay, adayRota, kurumlar: [...kurumSayac].sort((a, b) => b[1] - a[1]),
    sebepler: [...sebepSayac].sort((a, b) => b[1] - a[1]), kayitlar: limit ? cikti.slice(0, limit) : cikti }, null, 2));
} else {
  console.log('== OZET');
  console.log(`  incelenen olay : ${incelenen}`);
  console.log(`  aday olay      : ${adayOlay}`);
  console.log(`  aday rota      : ${adayRota}`);
  console.log('== KURUM BAZLI');
  for (const [k, v] of [...kurumSayac].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(24)} ${v}`);
  console.log('== BEKLETME NEDENLERI');
  for (const [k, v] of [...sebepSayac].sort((a, b) => b[1] - a[1])) console.log(`  ${String(k).padEnd(34)} ${v}`);
}
db.close();
