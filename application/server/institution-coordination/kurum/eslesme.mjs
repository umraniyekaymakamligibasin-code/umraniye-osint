/**
 * Kurum konusu eslestirme — Turkce kok tabanli, guvenli.
 *
 * Neden ayri modul? `route-event.mjs` icindeki eski eslesme tam kelime dizisi
 * ariyordu: " su kacagi " ancak metinde birebir "su kacagi" gecerse eslesiyordu.
 * Gercek haberler "su borusu patladi" yaziyor -> hicbir zaman eslesmiyordu.
 *
 * Buradaki eslesme:
 *   - metni normalize eder (kucuk harf, aksansiz, noktalama -> bosluk)
 *   - her terimi "kok + sinirli Turkce ek" regex'ine cevirir
 *   - boylece "yangin" -> yanginda / yangini / yanginlar yakalanir,
 *     ama "kaza" -> "kazandi" YAKALANMAZ (yanlis pozitif korumasi)
 */
import { readFileSync } from 'node:fs';

/** Metni karsilastirilabilir hale getirir. */
export function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/İ/g, 'i').replace(/I/g, 'i')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Turkce isim cekim ekleri — sinirli liste, tahmin yok. */
const EKLER = [
  'ları', 'leri', 'larin', 'lerin', 'daki', 'deki', 'taki', 'teki',
  'ndan', 'nden', 'ndan', 'nda', 'nde', 'dan', 'den', 'tan', 'ten',
  'lar', 'ler', 'nin', 'nun', 'yla', 'yle', 'la', 'le', 'sına', 'sine',
  'sı', 'si', 'su', 'sü', 'ya', 'ye', 'da', 'de', 'ta', 'te',
  'di', 'dı', 'du', 'dü', 'ti', 'tı', 'tu', 'tü',
  'na', 'ne', 'ni', 'nu', 'nü',
  'in', 'ın', 'un', 'ün', 'ı', 'i', 'u', 'ü', 'a', 'e',
];

/**
 * Tek terimi regex'e cevirir.
 *
 * Kurallar:
 *  - Son kelime Turkce ek alabilir: "yangin" -> yanginda / yangini
 *  - Cok kelimeli terimde kelimeler arasi EN FAZLA 2 kelime girebilir:
 *    "metro ariza" -> "M7 metro hattinda ariza" eslesir (1 araya giren kelime)
 *  - Bu esneklik yanlis pozitifi artirmamak icin 2 ile sinirlidir.
 */
export function terimRegex(terim) {
  const parcalar = normalize(terim).split(' ').filter(Boolean);
  if (!parcalar.length) return null;
  const kacis = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ek = EKLER.map(kacis).join('|');
  const ara = '\\s+(?:\\w+\\s+){0,2}';
  const govde = parcalar
    .map((p, i) => {
      const kelime = kacis(p) + `(?:${ek})?`;
      return i === 0 ? kelime : ara + kelime;
    })
    .join('');
  try {
    return new RegExp(`\\b${govde}\\b`, 'u');
  } catch {
    return null;
  }
}

/** Terim listesini hazir regex'lere cevirir (tekrar tekrar derlememek icin). */
export function derle(terimler) {
  const cikti = [];
  for (const t of terimler ?? []) {
    const r = terimRegex(t);
    if (r) cikti.push({ terim: String(t), regex: r });
  }
  return cikti;
}

/**
 * Konu -> anahtar kelime katalogunu yukler.
 * `topic-terms.json` bicimi: {"konular": {"water_leak": ["su kacagi", ...]}}
 */
export function katalogYukle(yol) {
  const ham = JSON.parse(readFileSync(yol, 'utf8'));
  const konular = ham?.konular ?? ham ?? {};
  const sonuc = new Map();
  for (const [konu, terimler] of Object.entries(konular)) {
    if (!Array.isArray(terimler)) continue;
    sonuc.set(konu, derle(terimler));
  }
  return sonuc;
}

/**
 * Metinde gecen konulari bulur. Skor = eslesen terim sayisi.
 * @returns {{konu:string, hits:number, terimler:string[]}[]} skora gore azalan
 */
export function konulariBul(metin, katalog) {
  const t = normalize(metin);
  if (!t) return [];
  const bulunan = [];
  for (const [konu, regexler] of katalog) {
    const eslesen = [];
    for (const { terim, regex } of regexler) {
      if (regex.test(t)) eslesen.push(terim);
    }
    if (eslesen.length) bulunan.push({ konu, hits: eslesen.length, terimler: eslesen });
  }
  return bulunan.sort((a, b) => b.hits - a.hits || a.konu.localeCompare(b.konu));
}

/** Katalogda ayni terimi paylasan konulari raporlar (kalite kontrolu). */
export function cakismalariBul(katalog) {
  const sahiplik = new Map();
  for (const [konu, regexler] of katalog) {
    for (const { terim } of regexler) {
      const anahtar = normalize(terim);
      if (!sahiplik.has(anahtar)) sahiplik.set(anahtar, []);
      sahiplik.get(anahtar).push(konu);
    }
  }
  return [...sahiplik.entries()]
    .filter(([, konular]) => konular.length > 1)
    .map(([terim, konular]) => ({ terim, konular }));
}
