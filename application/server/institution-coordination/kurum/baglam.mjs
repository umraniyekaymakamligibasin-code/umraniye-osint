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
  flooding: ['UMR_AFET', 'UMR_BELEDIYE', 'ISKI_UMR'],
  storm_damage: ['AYEDAS_UMR', 'UMR_AFET', 'UMR_BELEDIYE'],
  public_transport_safety: ['IETT', 'METRO_ISTANBUL', 'UMR_EMNIYET'],
  fire_rescue: ['ISTANBUL_ITFAIYE', 'UMR_EMNIYET'],
  hazardous_material_response: ['ISTANBUL_ITFAIYE', 'UMR_EMNIYET'],
  gas_leak_public_hazard: ['IGDAS_UMR', 'ISTANBUL_ITFAIYE', 'UMR_EMNIYET'],
  electrical_hazard: ['AYEDAS_UMR', 'UMR_BELEDIYE', 'UMR_EMNIYET'],
  fallen_power_equipment: ['AYEDAS_UMR', 'UMR_BELEDIYE', 'UMR_EMNIYET'],
  district_emergency_coordination: ['UMR_AFET', 'UMR_EMNIYET']
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
  if (d.duyuru && !d.olay) {
    return { decision: 'held', reason: 'announcement_not_incident', routes: [], duyuru: d.duyuruTerim.slice(0, 5) };
  }

  const bulunan = konulariBul(norm, katalog);
  if (!bulunan.length) return { decision: 'held', reason: 'no_topic_match', routes: [] };

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
    const izinliOrtak = PAYLASIM[topic] || [];
    const ortak = grup.filter(a => izinliOrtak.includes(a.institution));
    if (grup.length === 1) { routes.push(grup[0]); continue; }
    if (ortak.length === grup.length) { routes.push(...grup); continue; }
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

export function guvenliOzet(event, route, profiller) {
  const baslik = guvenliBaslik(route.topic, profiller);
  if (!baslik) return null;
  const nb = event?.locality?.neighborhood;
  return `${nb ? nb + ' Mahallesi, ' : ''}Ümraniye'de ${baslik.toLocaleLowerCase('tr-TR')} kaydı oluşturuldu.`;
}
