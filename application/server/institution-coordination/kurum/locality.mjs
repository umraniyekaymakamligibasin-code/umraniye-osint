/**
 * Olay -> kurum yonlendirmesinin bekledigi `locality` alani.
 *
 * Sorun: `route-event.mjs` olayda `event.locality = {district:'Ümraniye',
 * verified:true, precision:'district'|'neighborhood'}` ariyor. Ama gercek
 * olaylarda bu alan HIC URETILMIYOR (worker/index.js, portal-api.mjs,
 * social-quality.mjs icinde `locality` kelimesi 0 kez geciyor). Bu yuzden
 * istisnasiz her olay `verified_umraniye_locality_required` ile dusuyordu.
 *
 * Bu modul mevcut alanlardan locality TURETIR; yeni veri uydurmaz:
 *   - neighborhood / locationName / neighborhoodName -> mahalle
 *   - locationVerified === true                      -> dogrulanmis
 *   - locationStatus === 'review_required'           -> dogrulanmamis
 *   - ilce adi metinde geciyorsa                     -> ilce duzeyi
 */

/** Metinde ilce adi geciyor mu? (ekli halleriyle) */
const ILCE = /\b(?:umraniye|dudullu)(?:de|da|den|dan|nin|nun|ye|ya|deki|daki|miz|li|li[ler]*)?\b/;

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

/** Mukerrer/ bos degerleri temizler. */
function temiz(value) {
  const s = typeof value === 'string' ? value.trim() : '';
  return s || null;
}

/**
 * Olaydan locality uretir. Emin olunmayan her durumda `verified:false` doner;
 * yonlendirme katmani bunu `held` olarak degerlendirir (guvenli varsayilan).
 *
 * @param {object} event
 * @returns {{district:string|null, neighborhood:string|null, verified:boolean,
 *            precision:'district'|'neighborhood'|null, kaynak:string}}
 */
export function localityCikar(event) {
  const e = event && typeof event === 'object' ? event : {};

  // 1) Zaten varsa dokunma (ileride bir gun uretilirse bozmayalim).
  if (e.locality && typeof e.locality === 'object' && e.locality.district) {
    return {
      district: e.locality.district,
      neighborhood: temiz(e.locality.neighborhood),
      verified: e.locality.verified === true,
      precision: e.locality.precision ?? null,
      kaynak: 'mevcut',
    };
  }

  // 2) Olay uzerinde dogrudan verilmis mahalle alanlari.
  let mahalle = temiz(e.neighborhood) || temiz(e.neighborhoodName)
    || temiz(e.locationName) || temiz(e.mahalle);

  // 3) Dogrulama durumu — yalnizca ACIK true kabul edilir.
  const acikDogrulama = e.locationVerified === true;
  const incelemeGerekli = e.locationStatus === 'review_required'
    || e.locationStatus === 'local_indicated';

  // 4) Metinden ilce ipucu. Yalnizca BASLIK + OZET + ilk 400 karakter
  //    dikkate alinir: uzun İstanbul/ Türkiye haberlerinde Ümraniye'nin
  //    tesadufen gecmesi olayi yerel yapmaz (Nazilli/Üsküdar sizmasi).
  const metinBas = normalize([e.title, e.summary,
    String(e.description || e.fullText || e.text || '').slice(0, 400)].filter(Boolean).join(' '));
  const metindeIlce = ILCE.test(metinBas);

  // 5) Belirsizse dogrulanmamis kabul et.
  let verified = acikDogrulama && !incelemeGerekli;
  let precision = null;
  let kaynak = 'alan';

  if (mahalle) {
    precision = 'neighborhood';
  } else if (metindeIlce) {
    precision = 'district';
    if (!acikDogrulama) kaynak = 'metin-ipucu';
  } else {
    // Ne mahalle ne ilce ipucu var: dogrulanmis sayma.
    verified = false;
    kaynak = 'yetersiz';
  }

  // Dogrulanmis olmak icin acik isaret sart; istisna yok.
  if (!acikDogrulama || incelemeGerekli) verified = false;

  // 6) Kapsam + METIN temelli ILCE dogrulamasi (opt-in, varsayilan KAPALI).
  //    Yalnizca olayin kendi metni ilceyi ACIKCA yaziyorsa (metindeIlce)
  //    ilce duzeyinde dogrulanmis sayilir. `scope='local'` TEK BASINA
  //    yeterli degildir: akista 'local' yalnizca "yerel haber" demek;
  //    baska ilce/il haberi de bu kapsamda gelir (ornek: Nazilli, Esenler).
  //    Mahalle alani da tek basina kanit sayilmaz; MAHALLE bilgisi kuruma
  //    tasinmaz, yalnizca ilce duzeyi kullanilir.
  if (!verified && String(process.env.OSINT_ROUTING_LOCAL_SCOPE || '') === '1'
      && String(e.scope || '').toLowerCase() === 'local' && metindeIlce) {
    verified = true;
    precision = 'district';
    mahalle = null;
    kaynak = 'kapsam-yerel-metin';
  }

  return {
    // Ilce yalnizca metinde acikca geciyorsa veya konum acikca
    // dogrulanmissa 'Ümraniye' kabul edilir. Mahalle adi tek basina yetmez.
    district: metindeIlce || (verified && mahalle) ? 'Ümraniye' : null,
    neighborhood: mahalle,
    verified,
    precision,
    kaynak,
  };
}

/** Yonlendirme icin hazir mi? (yalnizca bilgi amacli) */
export function yonlendirilebilir(locality) {
  return locality?.district === 'Ümraniye'
    && locality?.verified === true
    && (locality?.precision === 'district' || locality?.precision === 'neighborhood');
}
