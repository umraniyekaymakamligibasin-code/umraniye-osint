/**
 * KURUM PANELI ICIN GUVENLI HABER METNI.
 *
 * Amac: panele "Trafik güvenliği kaydı oluşturuldu" gibi kategori basligi
 * yerine, ana ekranda gorunen gercek haber basligi/ozetini tasimak.
 *
 * Guvenlik siniri degismez:
 *   - Kisisel veri (telefon, e-posta, TCKN, IBAN, plaka, kapi no) MASKELENIR.
 *   - Hassas kategori (cinayet, saldiri, kayip kisi, magdur kimligi ...)
 *     zaten `baglam.mjs` kapisinda tutulur; buraya gelmez.
 *   - Metin bulunamazsa kategori duzeyindeki guvenli baslik/ozet kullanilir.
 *
 * Ayrica ayni hikayenin farkli kaynaklardaki tekrarlarini birlestirmek icin
 * muhafazakar bir benzerlik olcutu saglar (bkz. `hikayeAyniMi`).
 */
import { guvenliBaslik, guvenliOzet, normalize } from './baglam.mjs';

const BOILER = [
  /whatsapp\s*x\s*facebook\s*telegram/giu,
  /v[iİ]deo\s*haber/giu,
  /ihlas haber ajans[ıi]\s*\([İi]ha\)[^.]{0,160}\./giu,
  /[İi]stanbul muhabirlerinin sahadan aktard[ıi][ğg][ıi] bilgilere g[öo]re,?/giu,
  /haberin devam[ıi]\s*[.…]*/giu,
  /reklam\s*[.…-]*/giu,
];

/** Metnin devaminda gelen site/etiket/reklam copunu keser. */
const KES = /(Ümraniye\s+haberleri|Okuyacağınız\s+haberin\s+kaynağını|İlçe\s+Haber\s*[-–—]\s*Son\s+Dakika|Google['’]?da\s+tercih\s+edilen|Tıkla\s+ve\s+ekle|İlgili\s+Haberler|Bu\s+habere\s+yorum|habere\s+yorum|Etiketler|Yorumlar|Tüm\s+hakları|©|Haberin\s+Devamı|haberin\s+devamı)/iu;

/** Haber ajansi oneklerini atar. */
const ON_EK = [
  /^\s*İhlas\s+Haber\s+Ajansı\s*\(İHA\)\s*İstanbul\s+muhabirlerinin\s+sahadan\s+aktardığı\s+bilgilere\s+göre,?/iu,
  /^\s*İhlas\s+Haber\s+Ajansı\s*\(İHA\)\s*/iu,
  /^\s*(?:DHA|AA|ANKA|İHA)\s*[-–—,:]\s*/u,
];

const SITE = [
  /\s*\|\s*[^|]{0,70}$/u,
  /\s*[-–—]\s*(ensonhaber\.com|net\s*haberler?|son\s*gazete|yerel\s*haber[^-]{0,40}|tgrt\s*haber|haberler\.com|h[üu]rriyet[^-]{0,40}|milliyet[^-]{0,40}|sabah[^-]{0,40}|ntv[^-]{0,40}|cnn\s*t[üu]rk[^-]{0,40}|iha[^-]{0,40})\s*$/iu,
  /\s+(ümraniye\s+haberleri|haberleri)\s*$/iu,
];

const PII = [
  [/\b\d{11}\b/gu, '[kimlik no gizlendi]'],
  [/\bTR\d{2}\s?(?:\d{4}\s?){5}\d{2}\b/giu, '[IBAN gizlendi]'],
  [/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gu, '[e-posta gizlendi]'],
  [/\b(?:\+90|0)?[\s(]*\d{3}[\s).-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}\b/gu, '[telefon gizlendi]'],
  [/\b(?:daire|kap[ıi]|bina)\s*(?:no|numaras[ıi])?\s*[:#-]?\s*\d+[A-Za-z]?\b/giu, '[adres no gizlendi]'],
  [/\b(?:plaka|ara[çc] plakas[ıi])\s*[:#-]?\s*[0-9]{2}\s*[A-ZÇĞİÖŞÜ]{1,3}\s*\d{2,4}\b/giu, '[plaka gizlendi]'],
  // "Ali H.", "Seçil Ö." gibi yarim anonim isimler
  [/\b[A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,}\s+[A-ZÇĞİÖŞÜ]\.(?=[\s,;:!?)]|$)/gu, '[kişi adı gizlendi]'],
  // "S.Ö." gibi bas harf kisaltmalari (T.C. / M.Ö. haric)
  [/\b(?:[A-ZÇĞİÖŞÜ]\.\s?){2,3}(?=[\s,;:!?)]|$)/gu, (m) => (/T\.C\.|M\.Ö\.|M\.S\./u.test(m) ? m : '[kişi adı gizlendi]')],
];

const GENEL_KELIME = new Set(`umraniye umraniyede umraniyenin istanbul turkiye bir ve ile de da bu o yerel
gazete haber haberler son dakika yeni trafik kazasi kazasi meydana geldi yarali olu yangin cikti
surucu arac yol kapandi itfaiye polis ekip olay yeri saat mahalle sokak cadde buyuksehir ilce
belediye kamu guvenlik altyapi cevre acil durum bolge ekipleri calisma basladi sonra aciklama
yapildi oldu edildi kisi yaralandi hayatini kaybetti maddi hasar hasar hasarli nedeniyle dolayi
bugun dun aksam gece sabah ogle saatlerinde yasandi gerceklesti`.split(/\s+/).filter(Boolean));

const YER_EK = /(mahallesi|mahalle|sokagi|sokak|caddesi|cadde|tuneli|koprusu|giseler|yolu|yolunda|bulvari|meydani|parki|caddesinde|sokaginda)$/u;

const BIRLESTIRME_PENCERE_MS = 48 * 3600 * 1000;
const BENZERLIK_ESIGI = 0.8;

/** HTML, varlik ve haber sitesi suslerini temizler. */
export function temizMetin(value) {
  let t = String(value ?? '').replace(/<[^>]*>/g, ' ');
  t = t.replace(/&(?:[a-z]+|#\d+);/giu, ' ');
  for (const r of BOILER) t = t.replace(r, ' ');
  const kes = KES.exec(t);
  if (kes) t = t.slice(0, kes.index);
  for (const r of ON_EK) t = t.replace(r, '');
  // Kaynak metinlerde apostrof/kesme isaretinin etrafinda bosluk olabiliyor:
  // "Ümraniye' de" -> "Ümraniye'de", "Mahallesi ’nde" -> "Mahallesi'nde".
  t = t.replace(/\s+([‘’'])\s*/gu, '$1');
  return t.replace(/\s+/g, ' ').trim();
}

/** Kisisel veri kaliplarini maskeler (metni atmaz, kullanilabilir tutar). */
export function piiTemizle(value) {
  let t = String(value ?? '');
  for (const [r, yer] of PII) t = t.replace(r, yer);
  return t;
}

function basligiTemizle(value) {
  let t = temizMetin(value);
  for (const r of SITE) t = t.replace(r, '');
  // Bazi kaynaklarda baslik + spot tek alanda geliyor:
  // "Ümraniye'de vinç devrildi ... Ümraniye, Elmalıkent Mahallesi ...".
  // Ayni ilce adi ikinci kez geciyorsa spot kismini at.
  const m = [...t.matchAll(/Ümraniye/giu)];
  if (m.length > 1 && m[1].index >= 30) t = t.slice(0, m[1].index);
  t = t.replace(/^[\s:;,\-–—]+/u, '').replace(/[\s:;,\-–—]+$/u, '');
  return piiTemizle(t).replace(/\s+/g, ' ').trim();
}

function ozetCumleleri(value, adet = 3, sinir = 620) {
  const t = temizMetin(value);
  if (!t) return '';
  // Kisaltmalardan (S.Ö., 15.30 vb.) bolmemek icin sonraki karakter buyuk harf olmali.
  const cumleler = t.split(/(?<=[.!?…])\s+(?=[A-ZÇĞİÖŞÜ])/u).map(x => x.trim()).filter(x => x.length >= 25);
  let sec = (cumleler.length ? cumleler.slice(0, adet).join(' ') : t).slice(0, sinir).trim();
  return piiTemizle(sec);
}

/** Panel basligi: gercek haber basligi; yoksa kategori basligi. */
export function panelBaslik(event, profiller, topic) {
  const yedek = guvenliBaslik(topic, profiller);
  const t = basligiTemizle(event?.title);
  if (t.length < 15) return yedek;
  return t.length > 200 ? t.slice(0, 197).trimEnd() + '…' : t;
}

/** Panel ozeti: gercek haber ozeti; yoksa kategori duzeyindeki guvenli ozet. */
export function panelOzet(event, route, profiller) {
  const yedek = guvenliOzet(event, route, profiller);
  const raw = event?.description || event?.fullText || event?.summary || '';
  const o = ozetCumleleri(raw);
  if (o.length < 40) return yedek;
  return o;
}

/* ------------------------- hikaye birlestirme ------------------------- */

function tokenler(text) {
  return new Set(normalize(text).split(' ').filter(w => w.length > 2 && !GENEL_KELIME.has(w)));
}

function yerAdlari(text) {
  const w = normalize(text).split(' ');
  const out = new Set();
  for (let i = 1; i < w.length; i++) {
    if (YER_EK.test(w[i]) && w[i - 1] && w[i - 1].length > 2 && !GENEL_KELIME.has(w[i - 1])) {
      out.add(w[i - 1]);
    }
  }
  return out;
}

function yerCakismasi(a, b) {
  const A = yerAdlari(a), B = yerAdlari(b);
  if (!A.size || !B.size) return false;
  for (const x of A) if (B.has(x)) return false;
  return true; // iki baslikta da yer adi var ve hic ortak degil -> farkli yer
}

/**
 * Iki baslik ayni hikayeyi mi anlatiyor?
 * Muhafazakar: pencere 48 saat, >=2 ortak ayirt edici kelime, >=0.8 benzerlik,
 * ve yer adlari celisMIyorsa true.
 */
export function hikayeAyniMi(a, b, zamanA, zamanB) {
  const ta = Date.parse(zamanA), tb = Date.parse(zamanB);
  if (Number.isFinite(ta) && Number.isFinite(tb) && Math.abs(ta - tb) > BIRLESTIRME_PENCERE_MS) return false;
  if (!a || !b || a.length < 25 || b.length < 25) return false;
  const A = tokenler(a), B = tokenler(b);
  if (A.size < 4 || B.size < 4) return false;
  let ortak = 0;
  for (const x of A) if (B.has(x)) ortak++;
  if (ortak < 2) return false;
  if (yerCakismasi(a, b)) return false;
  return ortak / Math.min(A.size, B.size) >= BENZERLIK_ESIGI;
}
