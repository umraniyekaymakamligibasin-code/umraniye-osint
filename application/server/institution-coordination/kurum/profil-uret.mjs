/**
 * KURUM KONU PROFILLERINI OTOMATIK URETIR.
 *
 * Neden: `profiller.json` elle bakimliydi. Yeni bir kurum/konu/grant
 * eklendiginde kimse dosyayi guncellemezse o kurum sessizce bos kalir.
 * Bu modul DB'deki GERCEK durumu (onayli kurum + onayli konu + verilmis grant)
 * okuyup her kurum icin gorev alani profilini uretir; elle yazilan
 * `profiller.json` yalnizca INCE AYAR (haric konular, baglam sarti,
 * oncelik sirasi) olarak ustune biner.
 *
 * Ilkeler:
 *   - Grant URETMEZ. Yalnizca var olan grant'lari profile cevirir.
 *   - Guvenli baslik listesi (display-titles.mjs) temel alinir; basligi
 *     olmayan konu profile yazilir ama projeksiyonda bloklanir.
 *   - "Guvenlik kurumu" tespiti otomatiktir: asayis/trafik/okul/toplu tasima
 *     konularindan en az biri grant'li ise, park/cop/moloz gibi GENEL alan
 *     konulari icin olay sinyali (kavga, silah, darp...) sarti konur.
 *     Boylece Emniyet'e "park bakim duyurusu" gitmez, "parkta kavga" gider.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { displayTitles } from './display-titles.mjs';

const KOK = fileURLToPath(new URL('.', import.meta.url));

export const SURUM = 'kurum-profili-v1';

/** Guvenlik gorevi sayilan konular (bir kurumda varsa "guvenlik kurumu"). */
export const GUVENLIK_KONULARI = new Set([
  'public_safety', 'traffic_safety', 'school_perimeter_safety', 'public_transport_safety',
]);

/** Herkese acik alan/genel konular: guvenlik kurumunda BAGLAM ister. */
export const GENEL_ALAN_KONULARI = new Set([
  'parks_public_space', 'illegal_dumping_public_space', 'street_cleanliness',
  'waste_container', 'municipal_roadside_asset', 'neighborhood_service_observation',
]);

/** Kurum grubundan insan okunur rol. */
const GRUP_ROL = {
  municipality: 'belediye hizmetleri',
  utility: 'altyapi isletmesi',
  regional_agency: 'bolgesel kamu kurumu',
  district_admin: 'ilce yonetimi',
  public_agency: 'kamu kurumu',
};

function siraliKonular() {
  try {
    const ham = JSON.parse(readFileSync(new URL('./topic-terms.json', import.meta.url), 'utf8'));
    return Object.keys(ham?.konular ?? {});
  } catch {
    return [];
  }
}

export function metinDosyasi(yol = KOK + 'topic-terms.json') {
  return JSON.parse(readFileSync(yol, 'utf8'));
}

async function satirlar(db, sql) {
  try {
    const s = db.prepare(sql);
    const r = typeof s.all === 'function' ? await s.all() : await s.run();
    return Array.isArray(r) ? r : (r?.results ?? []);
  } catch {
    return [];
  }
}

/**
 * DB + elle ayarlardan etkin profili uretir.
 *
 * @param {object} db     panel openDatabase() sarmalayicisi
 * @param {object} elle   profiller.json icerigi (ince ayar; bos olabilir)
 * @param {object} [sec]  { basliklar, genel }
 */
export async function profilleriUret(db, elle = {}, sec = {}) {
  const temelBasliklar = { ...displayTitles, ...(sec.basliklar ?? {}) };
  const temelGenel = {
    minimumGuven: 0.88,
    duyuru_kelimeleri: [],
    olay_sinyalleri: [],
    ...(elle.genel ?? {}),
    ...(sec.genel ?? {}),
  };

  const [kurumSatir, konuSatir, grantSatir] = await Promise.all([
    satirlar(db, `SELECT code, institution_group grp FROM coord_institutions
      WHERE enabled=1 AND approval_status='approved'`),
    satirlar(db, `SELECT code, sensitivity FROM coord_topics
      WHERE enabled=1 AND approval_status='approved'`),
    satirlar(db, `SELECT i.code kurum, t.code konu
      FROM coord_institution_topic_grants g
      JOIN coord_institutions i ON i.id=g.institution_id AND i.enabled=1 AND i.approval_status='approved'
      JOIN coord_topics t ON t.id=g.topic_id AND t.enabled=1 AND t.approval_status='approved'
      WHERE g.granted=1`),
  ]);

  const sira = new Map(siraliKonular().map((k, i) => [k, i]));
  const hassasiyet = new Map(konuSatir.map(s => [s.code, s.sensitivity]));
  const grantlar = new Map();
  for (const g of grantSatir) {
    if (!grantlar.has(g.kurum)) grantlar.set(g.kurum, new Set());
    grantlar.get(g.kurum).add(g.konu);
  }

  const kurumlar = {};
  let grantsizKurum = 0;
  const basliksiz = new Set();
  const guvenlikKurumlari = [];

  for (const k of kurumSatir) {
    const verilen = [...(grantlar.get(k.code) ?? [])]
      .sort((a, b) => (sira.get(a) ?? 999) - (sira.get(b) ?? 999));
    const elleKurum = elle.kurumlar?.[k.code] ?? {};
    const haric = new Set(elleKurum.haric ?? []);
    const guvenlik = verilen.some(x => GUVENLIK_KONULARI.has(x));
    if (guvenlik) guvenlikKurumlari.push(k.code);

    // Otomatik taban: grant'li her konu, haricler cikarilip, oncelikli olanlar one.
    const taban = verilen.filter(x => !haric.has(x));
    const elleOncelik = (elleKurum.oncelik ?? []).filter(x => !haric.has(x));
    const oncelik = [...new Set([...elleOncelik, ...taban])];

    // Genel alan konulari icin baglam sarti (yalnizca guvenlik kurumlarinda).
    const baglam = {};
    if (guvenlik) {
      for (const konu of oncelik) {
        if (GENEL_ALAN_KONULARI.has(konu) && !baglam[konu]) {
          baglam[konu] = temelGenel.olay_sinyalleri.length
            ? [...temelGenel.olay_sinyalleri]
            : ['kavga', 'saldiri', 'silah', 'darp', 'hirsiz', 'gozalti', 'tehdit', 'olay', 'guvenlik'];
        }
      }
    }

    kurumlar[k.code] = {
      rol: elleKurum.rol ?? GRUP_ROL[k.grp] ?? k.grp ?? 'kurum',
      grup: k.grp ?? null,
      guvenlikKurumu: guvenlik,
      oncelik,
      haric: [...haric],
      ...(Object.keys(baglam).length ? { baglam } : {}),
    };

    if (!verilen.length) grantsizKurum++;
    for (const konu of oncelik) if (!temelBasliklar[konu]) basliksiz.add(konu);
  }

  // Elle tanimli ama DB'de onayli olmayan kurumlar da raporda gorunsun.
  for (const [code, p] of Object.entries(elle.kurumlar ?? {})) {
    if (kurumlar[code]) continue;
    kurumlar[code] = { ...p, grup: null, guvenlikKurumu: false };
  }

  return {
    surum: SURUM,
    kaynak: 'db-grant+elle',
    genel: temelGenel,
    kurumlar,
    basliklar: temelBasliklar,
    rapor: {
      onayliKurum: kurumSatir.length,
      onayliKonu: konuSatir.length,
      grantSatiri: grantSatir.length,
      profilKurum: Object.keys(kurumlar).length,
      grantsizKurum,
      guvenlikKurumu: guvenlikKurumlari,
      dokuzHassasiyet: [...new Set([...hassasiyet.values()])],
      basliksizKonu: [...basliksiz].sort(),
    },
  };
}

/**
 * Elle yazilan profili otomatik profilin USTUNE bindirir.
 * Elle oncelik/haric/baglam degerleri kazanir; bos alanlar otomatikten gelir.
 */
export function profilleriBirlestir(otomatik, elle = {}) {
  const kurumlar = {};
  for (const [code, o] of Object.entries(otomatik.kurumlar ?? {})) {
    const e = elle.kurumlar?.[code] ?? {};
    const haric = e.haric ?? o.haric ?? [];
    const oncelik = [...new Set([...(e.oncelik ?? []), ...(o.oncelik ?? [])])]
      .filter(x => !(haric ?? []).includes(x));
    kurumlar[code] = {
      ...o, ...e, haric,
      oncelik,
      baglam: { ...(o.baglam ?? {}), ...(e.baglam ?? {}) },
    };
  }
  for (const [code, e] of Object.entries(elle.kurumlar ?? {})) {
    if (!kurumlar[code]) kurumlar[code] = { ...e, guvenlikKurumu: false };
  }
  return {
    ...otomatik,
    ...elle,
    surum: `${otomatik.surum}${elle.surum ? `+elle-${elle.surum}` : ''}`,
    genel: { ...(otomatik.genel ?? {}), ...(elle.genel ?? {}) },
    kurumlar,
    basliklar: { ...(otomatik.basliklar ?? {}), ...(elle.basliklar ?? {}) },
    rapor: otomatik.rapor ?? null,
  };
}

// ----------------------------------------------------------------- CLI
async function cli() {
  const arg = process.argv.slice(2);
  const al = (ad, vars = null) => { const i = arg.indexOf(ad); return i >= 0 ? (arg[i + 1] ?? true) : vars; };
  const bayrak = ad => arg.includes(ad);
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const { readFileSync: oku, writeFileSync: yaz, copyFileSync: kopyala } = await import('node:fs');

  const sunucu = String(al('--sunucu', process.env.OSINT_PROJE || '.'));
  const veriDir = String(al('--veri', process.env.DATA_DIR || '/var/lib/umraniye-osint-deneme'));
  const elleYolu = String(al('--elle', join(KOK, 'profiller.json')));
  const elle = JSON.parse(oku(elleYolu, 'utf8'));
  const { openDatabase } = await import(pathToFileURL(join(sunucu, 'server', 'database.mjs')).href);
  const db = openDatabase(join(veriDir, 'osint.sqlite'));
  try {
    const otomatik = await profilleriUret(db, elle);
    const etkin = profilleriBirlestir(otomatik, elle);
    if (bayrak('--json')) {
      console.log(JSON.stringify(etkin, null, 2));
      return 0;
    }
    console.log('== OTOMATIK KURUM PROFILI');
    console.log(`  onayli kurum : ${etkin.rapor.onayliKurum}`);
    console.log(`  onayli konu  : ${etkin.rapor.onayliKonu}`);
    console.log(`  grant satiri : ${etkin.rapor.grantSatiri}`);
    console.log(`  guvenlik kurumu: ${etkin.rapor.guvenlikKurumu.join(', ') || '-'}`);
    console.log(`  basliksiz konu : ${etkin.rapor.basliksizKonu.join(', ') || '-'}`);
    console.log('== KURUM -> GOREV ALANI');
    for (const [code, p] of Object.entries(etkin.kurumlar)) {
      const ek = p.guvenlikKurumu ? ' [guvenlik]' : '';
      const bag = Object.keys(p.baglam ?? {}).length ? ` | baglam: ${Object.keys(p.baglam).join(',')}` : '';
      console.log(`  ${code.padEnd(22)} ${String(p.oncelik.length).padStart(2)} konu${ek}${bag}`);
    }
    if (bayrak('--yaz')) {
      const zaman = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const yedek = `${elleYolu}.bak-${zaman}`;
      kopyala(elleYolu, yedek);
      yaz(elleYolu, JSON.stringify(etkin, null, 2) + '\n');
      console.log(`YAZILDI: ${elleYolu}`);
      console.log(`YEDEK  : ${yedek}`);
    }
    return 0;
  } finally { db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const kod = await cli();
  process.exit(kod);
}
