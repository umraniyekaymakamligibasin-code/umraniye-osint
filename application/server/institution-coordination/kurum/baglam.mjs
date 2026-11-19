/**
 * Kurum bazli BAGLAM motoru.
 *
 * Amac: bir olayi yalnizca "konu terimi gecti" diye kuruma gondermek yerine,
 *   - olay gercekten bir OLAY mi (duyuru/acilis/ziyaret degil),
 *   - o konu bu KURUMUN gorev alaninda mi (profil),
 *   - konu icin gereken BAGLAM var mi (ornek: parkta kavga),
 *   - konum Umraniye olarak dogrulanmis mi,
 *   - kisisel veri / hassas icerik var mi
 * kontrollerinden gecirir.
 *
 * Bu modul YAZMAZ; yalnizca karar uretir. Yazma katmani (projeksiyon) ayridir.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { derle, terimRegex } from './eslesme.mjs';
import { displayTitles } from './display-titles.mjs';

const KOK = path.dirname(fileURLToPath(import.meta.url));

const UNSAFE = new Set(['homicide_or_assault', 'weapon_or_shooting', 'missing_person',
  'child_or_student_identity', 'victim_or_witness_identity', 'medical_or_disability_details',
  'domestic_violence', 'crime_allegation', 'police_investigation', 'social_assistance_case_details',
  'private_address', 'unverified_location', 'unclear_or_multiple_authorities']);

/** Asayis/guvenlik sinyalleri: genel alan konulari bu sinyalle yalnizca guvenlik kurumuna gider. */
export const ASAYIS_SINYALLERI = Object.freeze([
  'kavga', 'saldiri', 'silah', 'darp', 'hirsiz', 'soygun', 'gasp', 'yarali',
  'olu', 'gozalti', 'tutukla', 'tehdit', 'taciz', 'bicak', 'kundakla'
]);

/** Park/cop/moloz gibi herkese acik alan konulari. */
export const GENEL_ALAN_KONULARI = Object.freeze(new Set([
  'parks_public_space', 'illegal_dumping_public_space', 'street_cleanliness',
  'waste_container', 'municipal_roadside_asset', 'neighborhood_service_observation'
]));

/** Bu konularda basligin kendisi konuyu soylemiyorsa rota acilmaz:
 *  tesis/hizmet erisimi gibi genel konular uzun haber metninde tesadufen gecmemeli. */
export const BASLIK_GEREKEN_KONULAR = Object.freeze(new Set([
  'public_health_facility', 'health_service_access', 'school_facility',
  'education_service_access', 'civil_registry_service_access',
  'land_registry_service_access', 'social_security_service_access',
  'social_service_access', 'social_assistance_service_access',
  'employment_service_access', 'public_service_access', 'municipal_service_access',
  'metropolitan_service_access', 'neighborhood_service_observation',
  'fire_rescue', 'traffic_safety'
]));

const KISISEL = [
  /\b(?:tc|t\.c\.|kimlik|pasaport)\s*(?:no|numarası|numarasi)?\s*[:#-]?\s*\d{5,}/iu,
  /\b\+?\d[\d ()-]{8,}\d\b/u,
  /\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b/iu,
  /\b(?:daire|kapı|kapi|bina)\s*(?:no|numarası|numarasi)?\s*[:#-]?\s*\d+/iu,
  /\b(?:plaka|araç plakası|arac plakasi)\s*[:#-]?\s*[0-9]{2}\s*[A-ZÇĞİÖŞÜ]{1,3}\s*\d{2,4}\b/iu
];

export const PAYLASIM = Object.freeze({
  // ORTAK GOREV: bir konu birden fazla kurumun gorev alanina giriyorsa
  // olay TUM listelenen kurumlara gider (profil+grant kapisi yine zorunlu).
  // Listedeki kurumlardan hangisi o olay icin aday olduysa ona gider;
  // aday olmayan kurum etkilenmez.
  flooding: ['UMR_AFET', 'UMR_BELEDIYE', 'ISKI_UMR', 'ISTANBUL_ITFAIYE'],
  storm_damage: ['AYEDAS_UMR', 'UMR_AFET', 'UMR_BELEDIYE'],
  public_transport_safety: ['IETT', 'METRO_ISTANBUL', 'UMR_EMNIYET'],
  fire_rescue: ['ISTANBUL_ITFAIYE', 'UMR_EMNIYET'],
  hazardous_material_response: ['ISTANBUL_ITFAIYE', 'UMR_EMNIYET'],
  gas_leak_public_hazard: ['IGDAS_UMR', 'ISTANBUL_ITFAIYE', 'UMR_EMNIYET'],
  electrical_hazard: ['AYEDAS_UMR', 'UMR_BELEDIYE', 'UMR_EMNIYET'],
  fallen_power_equipment: ['AYEDAS_UMR', 'UMR_BELEDIYE', 'UMR_EMNIYET'],
  district_emergency_coordination: ['UMR_AFET', 'UMR_EMNIYET'],
  drainage_public_space: ['IBB_ALTYAPI', 'UMR_BELEDIYE', 'ISKI_UMR'],
  district_coordination: ['UMR_KAYMAKAMLIK', 'UMR_BELEDIYE'],
  public_service_access: ['UMR_KAYMAKAMLIK', 'UMR_BELEDIYE'],
  // Nöbetçi muhtarlık sistemi okul binalarını/bahçelerini de kapsar:
  // okul tesisi olayı hem İlçe MEM'e hem muhtarlığa gider.
  school_facility: ['UMR_ILCE_MEM', 'UMR_MUHTARLIK'],
  school_perimeter_safety: ['UMR_EMNIYET', 'UMR_ILCE_MEM'],
  // Parkta asayiş sinyali varsa Emniyet de aday olur; ikisi de alır.
  parks_public_space: ['UMR_BELEDIYE', 'UMR_EMNIYET'],
  bus_service_disruption: ['IETT', 'UMR_BELEDIYE'],
  bus_stop_infrastructure: ['IETT', 'UMR_BELEDIYE'],
  water_leak: ['ISKI_UMR', 'UMR_BELEDIYE'],
  water_outage: ['ISKI_UMR', 'UMR_BELEDIYE'],
  water_infrastructure: ['ISKI_UMR', 'UMR_BELEDIYE'],
  sewer_overflow: ['ISKI_UMR', 'UMR_BELEDIYE'],
  telecom_outage: ['TURK_TELEKOM_UMR', 'TELEKOM_OPERATOR_UMR'],
  telecom_infrastructure: ['TURK_TELEKOM_UMR', 'TELEKOM_OPERATOR_UMR'],
  employment_service_access: ['UMR_ISKUR', 'UMR_BELEDIYE'],
  animal_health_public_agriculture: ['UMR_ILCE_TARIM', 'UMR_BELEDIYE'],
  urban_animal_welfare: ['UMR_ILCE_TARIM', 'UMR_BELEDIYE'],
  metropolitan_waste_collection: ['IBB_ATIK', 'UMR_BELEDIYE'],
  illegal_dumping_public_space: ['IBB_ATIK', 'UMR_BELEDIYE'],
  social_assistance_service_access: ['UMR_SYDV', 'UMR_BELEDIYE'],
  neighborhood_service_observation: ['UMR_MUHTARLIK', 'UMR_BELEDIYE']
});

export function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/İ/g, 'i').replace(/I/g, 'i')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

export function metin(event, limit = 8000) {
  return [event?.title, event?.summary, event?.description, event?.fullText]
    .filter(Boolean).join(' \n ').slice(0, limit);
}

export function profilleriYukle(yol = path.join(KOK, 'profiller.json')) {
  return JSON.parse(fs.readFileSync(yol, 'utf8'));
}

export function terimKatalogu(konular) {
  const katalog = new Map();
  for (const [konu, terimler] of Object.entries(konular || {})) {
    if (Array.isArray(terimler)) katalog.set(konu, derle(terimler));
  }
  return katalog;
}

function terimGecti(text, terim) {
  const r = terimRegex(terim);
  return r ? r.test(text) : false;
}

export function konulariBul(text, katalog) {
  const bulunan = [];
  for (const [konu, regexler] of katalog) {
    const eslesen = regexler.filter(x => x.regex.test(text)).map(x => x.terim);
    if (eslesen.length) bulunan.push({ konu, hits: eslesen.length, terimler: eslesen });
  }
  return bulunan.sort((a, b) => b.hits - a.hits);
}

/** Metin bir OLAY mi yoksa duyuru/acilis/ziyaret mi? */
export function duyuruAnaliz(text, genel) {
  const duyuru = (genel.duyuru_kelimeleri || []).filter(t => terimGecti(text, t));
  const olay = (genel.olay_sinyalleri || []).filter(t => terimGecti(text, t));
  return { duyuru: duyuru.length > 0, duyuruTerim: duyuru, olay: olay.length > 0, olayTerim: olay };
}

export function hassasMi(event, text) {
  const flags = event?.sensitivityFlags ?? {};
  if (Object.values(flags).some(Boolean)) return 'sensitive_flags';
  const kat = String(event?.riskCategory ?? '');
  if (UNSAFE.has(kat)) return 'unsafe_category';
  if (['restricted', 'high', 'special'].includes(String(event?.sensitivity ?? '').toLowerCase())) return 'high_sensitivity';
  if (KISISEL.some(r => r.test(text))) return 'possible_personal_data';
  return null;
}

/**
 * HİÇBİR HABER DÜŞMESİN — genel yönlendirme.
 *
 * Konu eşleşmese veya hiçbir kurumun görev alanına girmese bile, olay sinyali
 * taşıyan yerel haber kaybolmaz: ilçe koordinasyonu konusuyla Kaymakamlık ve
 * Belediye'ye düşer. Duyuru/hassas/PII kapıları yukarıda zaten uygulanmıştır.
 */
function genelYonlendirme(event, { profiller, izinler, reason, d }) {
  if (!d || d.olay !== true) return null;
  const izinSet = new Set((izinler || []).map(x => x.institution + '|' + x.topic));
  const routes = [];
  for (const kurum of ['UMR_KAYMAKAMLIK', 'UMR_BELEDIYE']) {
    const profil = profiller?.kurumlar?.[kurum];
    if (!profil) continue;
    const izinli = new Set([...(profil.oncelik || []), ...(profil.ek || [])]);
    const haric = new Set(profil.haric || []);
    if (!izinli.has('district_coordination') || haric.has('district_coordination')) continue;
    if (!izinSet.has(kurum + '|district_coordination')) continue;
    routes.push({
      institution: kurum, topic: 'district_coordination', confidence: 0.66,
      hits: 0, terms: [], titleHit: false, alternatifler: [], fallback: true,
    });
  }
  if (!routes.length) return null;
  return {
    decision: 'candidates', reason: 'fallback_district_coordination',
    routes, fallbackFrom: reason,
  };
}

/**
 * Vatandas basvurusu: olay metninde bir kurum acikca etiketlenmisse
 * (@umraniyeilcemem gibi) veya institutionalReference.targets doluysa,
 * basvuru o kuruma OTOMATIK gider. Insan yonlendirmesi gerekmez.
 * Kisisel veri / hassas kapilari yine yukarida uygulanir.
 */
const HEDEF_ANAHTAR = [
  ['UMR_ILCE_MEM', ['ilcemem', 'mem', 'milli egitim', 'milli egitim mudurlugu', 'meb', 'okul mudurlugu', 'ilce mem']],
  ['UMR_KAYMAKAMLIK', ['kaymakam', 'tc umraniye', 'umraniye kaymakamligi', 'kaymakamlik']],
  ['UMR_BELEDIYE', ['umraniye belediyesi', 'umbel', 'belediye baskani']],
  ['UMR_EMNIYET', ['emniyet', 'ilce emniyet', 'polis merkezi', 'karakol']],
  ['ISTANBUL_ITFAIYE', ['itfaiye']],
  ['ISKI_UMR', ['iski']],
  ['AYEDAS_UMR', ['ayedas']],
  ['IGDAS_UMR', ['igdas']],
  ['IETT', ['iett']],
  ['METRO_ISTANBUL', ['metro istanbul']],
  ['UMR_ILCE_NUFUS', ['nufus mudurlugu', 'ilce nufus']],
  ['UMR_TAPU', ['tapu mudurlugu']],
  ['UMR_ILCE_SAGLIK', ['ilce saglik', 'saglik mudurlugu']],
  ['UMR_ISKUR', ['iskur']],
  ['UMR_SGK', ['sgk']],
  ['UMR_SHM', ['sosyal hizmet merkezi', 'shm']],
  ['UMR_SYDV', ['sydv', 'sosyal yardimlasma']],
  ['UMR_MUHTARLIK', ['muhtarlik', 'muhtar']],
  ['UMR_ILCE_TARIM', ['ilce tarim', 'tarim mudurlugu']],
  ['IBB_ATIK', ['ibb atik']],
  ['IBB_ALTYAPI', ['ibb altyapi', 'altyapi']],
  ['TURK_TELEKOM_UMR', ['turk telekom']],
];

function hedefKurumCoz(hedefler, metinNorm) {
  const kumeler = new Set();
  const kaynak = [...(hedefler || []).map(h => normalize(String(h))), metinNorm];
  const bulunan = [];
  for (const [kurum, anahtarlar] of HEDEF_ANAHTAR) {
    const eslesti = anahtarlar.some(a => {
      const n = normalize(a);
      if (!n) return false;
      // handle icinde bitisik gecis (umraniyeilcemem) veya kelime grubu
      return kaynak.some(k => {
        if (!k) return false;
        if (n.includes(' ')) return k.includes(n);
        if (k.split(' ').includes(n)) return true;
        // bitisik: 'umraniyeilcemem' -> 'ilcemem' ile biter
        return n.length >= 5 && k.split(/\s+/).some(t => t === n || t.endsWith(n));
      });
    });
    if (eslesti) bulunan.push(kurum);
  }
  return bulunan;
}

function vatandasYonlendirme(event, { profiller, izinler, bulunan, norm }) {
  const ref = event?.institutionalReference;
  const hedefler = Array.isArray(ref?.targets) ? ref.targets : [];
  const kurumlar = hedefKurumCoz(hedefler, norm);
  if (!kurumlar.length) return null;
  const izinSet = new Set((izinler || []).map(x => x.institution + '|' + x.topic));
  const routes = [];
  for (const kurum of kurumlar) {
    const profil = profiller?.kurumlar?.[kurum];
    if (!profil) continue;
    const izinli = new Set([...(profil.oncelik || []), ...(profil.ek || [])]);
    const haric = new Set(profil.haric || []);
    // En iyi konu: eslesen konulardan bu kurumun yetkili oldugu ilki,
    // yoksa kamu hizmeti / ilce koordinasyonu, yoksa oncelik sirasindaki ilk konu.
    let topic = null;
    for (const b of bulunan || []) {
      if (izinli.has(b.konu) && !haric.has(b.konu) && izinSet.has(kurum + '|' + b.konu)) { topic = b.konu; break; }
    }
    for (const yedek of ['public_service_access', 'district_coordination', 'education_service_access', 'municipal_service_access']) {
      if (topic) break;
      if (izinli.has(yedek) && !haric.has(yedek) && izinSet.has(kurum + '|' + yedek)) topic = yedek;
    }
    if (!topic) {
      topic = (profil.oncelik || []).find(k => !haric.has(k) && izinSet.has(kurum + '|' + k)) ?? null;
    }
    if (!topic) continue;
    routes.push({
      institution: kurum, topic, confidence: 0.9, hits: 0, terms: [],
      titleHit: false, alternatifler: [], vatandasBasvurusu: true,
    });
  }
  if (!routes.length) return null;
  return { decision: 'candidates', reason: 'citizen_reference_target', routes };
}

/**
 * @param {object} event  locality alani doldurulmus olay
 * @param {object} secenekler { katalog, profiller, izinler:[{institution,topic}] }
 */
export function baglamliDegerlendir(event, { katalog, profiller, izinler }) {
  const genel = profiller.genel || {};
  const minGuven = Number(genel.minimumGuven ?? 0.88);
  const text = metin(event);
  const norm = normalize(text);

  const loc = event?.locality;
  if (!loc || loc.district !== 'Ümraniye' || loc.verified !== true
      || !['district', 'neighborhood'].includes(loc.precision)) {
    return { decision: 'held', reason: 'verified_umraniye_locality_required', routes: [] };
  }

  const hassas = hassasMi(event, text);
  if (hassas) return { decision: 'held', reason: hassas, routes: [] };

  const d = duyuruAnaliz(norm, genel);
  // Basliktaki olay sinyali yoksa metindeki "duyuru/egitim/toren" icerigi
  // olayi gercek bir olay gibi gostermemeli (ornek: AFAD gonullu egitimi).
  const dBaslik = duyuruAnaliz(normalize(event.title || ''), genel);
  if (d.duyuru && !dBaslik.olay) {
    return { decision: 'held', reason: 'announcement_not_incident', routes: [], duyuru: d.duyuruTerim.slice(0, 5) };
  }

  const bulunan = konulariBul(norm, katalog);
  // Vatandas basvurusu: acikca etiketlenen kuruma dogrudan gider.
  const vatandas = vatandasYonlendirme(event, { profiller, izinler, bulunan, norm });
  if (!bulunan.length) {
    if (vatandas) return { ...vatandas, topics: [] };
    // HIÇBİR HABER DÜŞMESİN: konu sözlüğü eşleşmese de, olay sinyali taşıyan
    // yerel haber ilçe koordinasyonuna (Kaymakamlık + Belediye) düşer.
    const fb = genelYonlendirme(event, { profiller, izinler, reason: 'no_topic_match', d });
    if (fb) return fb;
    return { decision: 'held', reason: 'no_topic_match', routes: [] };
  }

  const izinSet = new Set((izinler || []).map(x => x.institution + '|' + x.topic));
  const asayis = ASAYIS_SINYALLERI.some(t => terimGecti(norm, t));
  const adaylar = [];

  for (const [kurum, profil] of Object.entries(profiller.kurumlar || {})) {
    const izinli = new Set([...(profil.oncelik || []), ...(profil.ek || [])]);
    const haric = new Set(profil.haric || []);
    const guvenlikKurumu = profil.guvenlikKurumu === true
      || [...izinli].some(k => ['public_safety', 'traffic_safety',
        'school_perimeter_safety', 'public_transport_safety'].includes(k));
    const uygun = [];
    for (const b of bulunan) {
      if (!izinli.has(b.konu) || haric.has(b.konu)) continue;
      if (!izinSet.has(kurum + '|' + b.konu)) continue;          // DB grant sarti
      // Asayis sinyali varsa park/cop/moloz gibi genel alan konulari yalnizca
      // guvenlik kurumuna gider; belediyeye "parkta kavga" dusmez.
      if (asayis && GENEL_ALAN_KONULARI.has(b.konu) && !guvenlikKurumu) continue;
      const baglam = profil.baglam?.[b.konu];
      if (Array.isArray(baglam) && baglam.length && !baglam.some(t => terimGecti(norm, t))) continue;
      const baslikta = (b.terimler || []).some(t => terimGecti(normalize(event.title || ''), t));
      if (BASLIK_GEREKEN_KONULAR.has(b.konu) && !baslikta) continue;
      uygun.push({ ...b, baslikta });
    }
    if (!uygun.length) continue;
    const oncelik = new Map((profil.oncelik || []).map((k, i) => [k, i]));
    uygun.sort((a, b) => (b.hits - a.hits) || ((oncelik.get(a.konu) ?? 99) - (oncelik.get(b.konu) ?? 99)));
    const sec = uygun[0];
    const baslikta = sec.baslikta === true;
    const conf = Math.min(0.97, 0.64 + 0.07 * Math.min(sec.hits, 3)
      + (loc.precision === 'neighborhood' ? 0.06 : 0) + (baslikta ? 0.18 : 0));
    if (conf < minGuven) continue;
    adaylar.push({ institution: kurum, topic: sec.konu, confidence: Number(conf.toFixed(2)),
      hits: sec.hits, terms: sec.terimler.slice(0, 5), titleHit: baslikta, alternatifler: uygun.slice(1).map(x => x.konu) });
  }

  if (!adaylar.length) {
    const sebep = bulunan.some(b => {
      for (const [k, p] of Object.entries(profiller.kurumlar || {})) {
        if ((p.oncelik || []).includes(b.konu) && !(p.haric || []).includes(b.konu)) return true;
      }
      return false;
    }) ? 'no_institution_scope_match' : 'topic_not_in_any_profile';
    const fb = genelYonlendirme(event, { profiller, izinler, reason: sebep, d });
    if (fb) { fb.topics = bulunan.map(b => b.konu); return fb; }
    return { decision: 'held', reason: sebep, routes: [], topics: bulunan.map(b => b.konu) };
  }

  // Ayni konu birden fazla kuruma dusuyorsa yalnizca tanimli ORTAK gorevlerde izin ver.
  const konuGruplari = new Map();
  for (const a of adaylar) {
    if (!konuGruplari.has(a.topic)) konuGruplari.set(a.topic, []);
    konuGruplari.get(a.topic).push(a);
  }
  const routes = [];
  const reddedilen = [];
  for (const [topic, grup] of konuGruplari) {
    if (grup.length === 1) { routes.push(grup[0]); continue; }
    const ortak = PAYLASIM[topic];
    if (ortak) {
      const secilen = grup.filter(a => ortak.includes(a.institution));
      if (secilen.length) {
        routes.push(...secilen);
        for (const a of grup) {
          if (!secilen.includes(a)) reddedilen.push({ institution: a.institution, topic, reason: 'not_shared_duty' });
        }
        continue;
      }
    }
    grup.sort((a, b) => b.confidence - a.confidence);
    routes.push(grup[0]);
    for (const a of grup.slice(1)) reddedilen.push({ institution: a.institution, topic, reason: 'not_shared_duty' });
  }

  return { decision: 'candidates', reason: 'context_match', routes, rejected: reddedilen };
}

/** Guvenli, kategori duzeyinde projeksiyon basligi (serbest metin KOPYALANMAZ). */
export function guvenliBaslik(topic, profiller) {
  return profiller?.basliklar?.[topic] ?? displayTitles[topic] ?? null;
}

/** ISO tarihi TR yerel saatle okunur metne cevirir (panel ozeti icin). */
function tarihTR(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul',
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .format(new Date(t));
}

export function guvenliOzet(event, route, profiller) {
  const baslik = guvenliBaslik(route.topic, profiller);
  if (!baslik) return null;
  const nb = event?.locality?.neighborhood;
  let ozet = `${nb ? nb + ' Mahallesi, ' : ''}Ümraniye'de ${baslik.toLocaleLowerCase('tr-TR')} kaydı oluşturuldu.`;
  // Guvenli kaynak metaverisi: yayinci adi + platform + ilk yayin tarihi.
  // Kaynak metni ve baslik KOPYALANMAZ (kisisel veri politikasi degismez).
  const kaynaklar = Array.isArray(event?.kaynaklar)
    ? event.kaynaklar.filter(k => k && typeof k.url === 'string') : [];
  if (kaynaklar.length) {
    const adlar = [...new Set(kaynaklar.map(k => String(k?.name || '').trim()).filter(Boolean))].slice(0, 4);
    if (adlar.length) ozet += ` Kaynak${kaynaklar.length > 1 ? `lar (${kaynaklar.length})` : ''}: ${adlar.join(', ')}.`;
    const platformlar = [...new Set(kaynaklar.map(k => String(k?.platform || '').trim()).filter(Boolean))];
    if (platformlar.length === 1) ozet += ` Platform: ${platformlar[0]}.`;
  }
  const ilk = tarihTR(event?.publishedAt);
  if (ilk) ozet += ` İlk yayın: ${ilk}.`;
  return ozet.length > 900 ? ozet.slice(0, 897) + '...' : ozet;
}
