/**
 * Yonlendirme kurallarini veritabanindan uretir.
 *
 * Neden var: `route-event.mjs` kendisine `rules.state === 'approved'` olan bir
 * kural seti verilmesini bekliyor, ama kod tabaninda bu kume hicbir yerde
 * uretilmiyordu. Bu modul onayli kurum + onayli konu + aktif grant ucclusunu
 * DB'den okuyup yonlendirme motorunun bekledigi sekle cevirir.
 *
 * Sozlesme (route-event.mjs ile birebir): motor kuralda `topicId` ve
 * `institutionId` (SAYISAL kimlik) arar; `projectEligibleEvent` ise yeniden
 * dogrulama yaparken `topic` ve `institution` (KOD) alanlarini kullanir.
 * Bu yuzden her kural her iki formu da tasir.
 *
 * Guvenlik: yalnizca `approval_status='approved'` + `enabled=1` kayitlar
 * alinir, hicbir onay varsayilmaz. Guvensiz kategoriler burada ACIKCA
 * tanimlanir; bos liste, guvenlik filtresinin olmasindan iyidir.
 */

/**
 * Kategori redd listesi (deny-list).
 *
 * Ayni isimli listenin worker tarafinda da bir kopyasi var; orada sozlesme
 * degisirse burada da degismesi gerektigi icin sabit bilincli: bu klasor
 * `worker/` altindan import edemez (farkli katman), o yuzden tek dogru kural
 * listesi burada tutulur ve asagidaki normallestirme ile birlestirilir.
 */
const GUVENSSIZ_KATEGORILER = [
  'adliye', 'gundem', 'gundem-turkiye-genel', 'gundem-turkiye', 'gundem-istanbul',
  'gundem-dunya', 'gundem-politika', 'gundem-siyaset', 'gundem-ekonomi', 'gundem-spor',
  'gundem-magaza', 'gundem-sanat', 'gundem-kultur-sanat', 'gundem-egitim', 'gundem-saglik',
  'gundem-teknoloji', 'gundem-bilim',
  'adliyecadir', 'adliyecadir-olay', 'asayis', 'asayisolay', 'politiya', 'politiyagundem',
  'yasa', 'yasa-kapsam', 'yasa-yurutme',
  'teror', 'teroropolitik', 'savunma-havacilik-guvenlik', 'guvenlik',
  'spor', 'futbol', 'magazin', 'kultur', 'kultur-sanat', 'eglence',
  'ekonomi', 'finans', 'bilim-teknoloji', 'teknoloji', 'saglik', 'saglik-genel',
  'egitim', 'egitim-genel',
  'ulke', 'ulke-gundem', 'dunya', 'dunya-genel', 'turkiye-genel', 'istanbul-genel',
  'reklam', 'duyuru-genel',
];

/**
 * Kategori normallestirme.
 *
 * Yonlendirme motoru `normalizedCategory` degerini okur ama o alani hicbir
 * kaynak yazmiyordu; bu yuzden kategori redd listesi hic devreye girmiyordu.
 * Ayni fonksiyon hem kurallardaki hem de olaylarin kategorisini isler, boylece
 * iki taraf ayni alfabeyi kullanir.
 */
export function kategoriNormallestir(deger) {
  return String(deger ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

function normalKume(degerler) {
  const yeni = new Set();
  for (const deger of degerler ?? []) {
    const n = kategoriNormallestir(deger);
    if (n) yeni.add(n);
  }
  return [...yeni].sort();
}

// readFileSync modul duzeyinde (ESM statik import).
import { readFileSync } from 'node:fs';

let _terimler = null;
function terimleriGetir(yol) {
  if (!_terimler) {
    const hedef = typeof yol === 'string' ? yol : new URL('./topic-terms.json', import.meta.url);
    const ham = JSON.parse(readFileSync(hedef, 'utf8'));
    _terimler = ham?.konular ?? {};
  }
  return _terimler;
}

const ONAYLI_KURULUS = new Set(['belediye', 'il-cevre-mudurlugu', 'islak']);

/**
 * DB'den onayli yonlendirme kurallariyla birlikte politika kumesini uretir.
 *
 * @param {object} db        D1 benzeri `prepare().all()` arayuzu
 * @param {object} [secenekler]
 * @param {string}   [secenekler.version]            politika surum etiketi
 * @param {string[]} [secenekler.guvenliMahal]       yonlendirilebilir yer adlari
 * @param {string[]} [secenekler.guvenliIlce]        yonlendirilebilir ilce adlari
 * @param {number}   [secenekler.minimumGuven]       varsayilan 0.75
 * @param {boolean}  [secenekler.ekGuvenliKategoriler] varsayilan listeden fazladan kategoriler
 * @returns {Promise<object>} route-event.mjs'in bekledigi politika kumesi
 */
export async function kurallariUret(db, secenekler = {}) {
  const terimler = terimleriGetir(secenekler.terimDosyasi);
  const surum = String(secenekler.version || 'kurum-politikasi-v3');
  const minGuven = Number(secenekler.minimumGuven ?? 0.75);
  const guvenliMahal = normalKume(secenekler.guvenliMahal);
  const guvenliIlce = normalKume(secenekler.guvenliIlce);
  const reddi = normalKume([
    ...GUVENSSIZ_KATEGORILER,
    ...(secenekler.guvenliOlmayanKategoriler ?? []),
  ]);

  const bosKume = (sebep, sayilar = {}) => ({
    state: 'draft',
    version: surum,
    minimumConfidence: minGuven,
    unsafeCategories: reddi,
    safeLocalities: [...new Set([...guvenliMahal, ...guvenliIlce])].sort(),
    rules: [],
    sebep,
    sayilar,
  });

  if (!db?.prepare) return bosKume('db_yok');

  let satirlar = [];
  let kurumSayisi = 0;
  let konuSayisi = 0;
  let aliciSayisi = 0;
  try {
    const sonuc = await db.prepare(`
      SELECT g.approval_reference AS grant_ref,
             t.id AS topic_id, t.code AS topic_code, t.sensitivity AS topic_sensitivity,
             t.approval_reference AS topic_ref,
             i.id AS institution_id, i.code AS institution_code, i.display_name AS institution_name,
             i.institution_group AS institution_group,
             i.approval_reference AS inst_ref, i.email_enabled AS email_enabled,
             (SELECT COUNT(*) FROM coord_mail_recipients r
               WHERE r.institution_id = i.id AND r.verified_at IS NOT NULL) AS alici
      FROM coord_institution_topic_grants g
      JOIN coord_institutions i ON i.id = g.institution_id
      JOIN coord_topics t ON t.id = g.topic_id
      WHERE g.granted = 1
        AND g.approval_reference IS NOT NULL
        AND i.enabled = 1 AND i.approval_status = 'approved'
        AND t.enabled = 1 AND t.approval_status = 'approved'
      ORDER BY i.code, t.code
    `).all();
    satirlar = sonuc?.results ?? sonuc ?? [];

    kurumSayisi = await say(db, `SELECT COUNT(*) AS c FROM coord_institutions
      WHERE enabled = 1 AND approval_status = 'approved'`);
    konuSayisi = await say(db, `SELECT COUNT(*) AS c FROM coord_topics
      WHERE enabled = 1 AND approval_status = 'approved'`);
    aliciSayisi = await say(db, `SELECT COUNT(*) AS c FROM coord_mail_recipients
      WHERE verified_at IS NOT NULL`);
  } catch (hata) {
    // Tablolar henuz yoksa bu bir hata degil, henüz seed edilmemis bir bos durumdur.
    return bosKume('tablo_yok', { hata: String(hata?.message || hata).slice(0, 180) });
  }

  const kurallar = [];
  let hassasAtlanan = 0;
  let terimsiz = 0;
  let alicisiz = 0;
  for (const s of satirlar) {
    const konu = kategoriNormallestir(s.topic_code);
    if (!konu) continue;
    if (reddi.includes(konu)) continue;                 // redd listesi konu kodlarina da isler
    if (s.topic_sensitivity && s.topic_sensitivity !== 'ordinary') { hassasAtlanan++; continue; }
    const kelime = Array.isArray(terimler[s.topic_code]) ? terimler[s.topic_code] : [];
    const liste = normalKume(kelime);
    if (!liste.length) { terimsiz++; continue; }
    if (Number(s.alici) === 0) alicisiz++;              // uyari icin sayilir, kurali engellemez

    const rol = String(s.institution_group || '').trim() === 'utility' ? 'support' : 'lead';
    kurallar.push({
      // route-event.mjs bunlari ister:
      topicId: Number(s.topic_id),
      institutionId: Number(s.institution_id),
      approvalStatus: 'approved',
      approvalReference: s.grant_ref || s.topic_ref || s.inst_ref || null,
      sensitivity: 'ordinary',
      role: rol,
      terms: liste,
      // Ayni olaydan birden fazla kuruma gitmesi gereken haller icin:
      // Ayni konuyu paylasan TUM onayli kurallar ayni gruba girer. Grant
      // (kurum+konu) zaten yonetici tarafindan acikca verildigi icin burada
      // "cok kurumlu gorev" kasitlidir; farkli konular ise bagimsizdir.
      coRouteGroup: konu,
      // projectEligibleEvent'in yeniden dogrulaması icin:
      topic: s.topic_code,
      institution: s.institution_code,
      institutionName: s.institution_name || null,
      organizationalUnit: null,
      institutionGroup: s.institution_group || null,
      emailEnabled: Number(s.email_enabled) === 1,
    });
  }

  const kuralSayisi = kurallar.length;
  const durum = kuralSayisi ? 'approved' : 'draft';
  let sebep = null;
  if (!kuralSayisi) {
    if (!satirlar.length) sebep = 'onayli_kurum_konu_grant_yok';
    else if (terimsiz === satirlar.length) sebep = 'terim_tanimli_degil';
    else if (hassasAtlanan === satirlar.length) sebep = 'tumu_hassas_konu';
    else sebep = 'kural_uretilmedi';
  }

  return {
    state: durum,
    version: surum,
    minimumConfidence: minGuven,
    unsafeCategories: reddi,
    safeLocalities: [...new Set([...guvenliMahal, ...guvenliIlce])].sort(),
    rules: kurallar,
    sayilar: {
      grant: satirlar.length,
      kural: kuralSayisi,
      onayliKurum: kurumSayisi,
      onayliKonu: konuSayisi,
      dogrulanmisAlici: aliciSayisi,
      hassasAtlanan,
      terimYok: terimsiz,
      alicisizKural: alicisiz,
    },
    ...(sebep ? { sebep } : {}),
  };
}

async function say(db, sql) {
  try {
    const s = db.prepare(sql);
    // Panelin openDatabase() sarmalayicisi `first()` sunar; cig D1 `get()` sunar.
    const r = typeof s.first === 'function' ? await s.first() : await s.get();
    return Number(r?.c ?? r?.results?.[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

/** Insan okunur özet. */
export function kurallariOzetle(politika) {
  const kurumlar = new Map();
  for (const r of politika.rules ?? []) {
    const dizi = kurumlar.get(r.institution) || [];
    dizi.push(r.topic);
    kurumlar.set(r.institution, dizi);
  }
  return {
    state: politika.state,
    version: politika.version,
    kuralSayisi: (politika.rules ?? []).length,
    kurumSayisi: kurumlar.size,
    reddedilenKategoriSayisi: (politika.unsafeCategories ?? []).length,
    guvenliYerSayisi: (politika.safeLocalities ?? []).length,
    sayilar: politika.sayilar ?? null,
    sebep: politika.sebep ?? null,
    kurumlar: [...kurumlar.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'tr'))
      .map(([k, v]) => ({ kurum: k, konular: v.sort() })),
  };
}

/** ONAYLI_KURULUS disariya da verilsin (testler ve raporlama icin). */
export { ONAYLI_KURULUS, GUVENSSIZ_KATEGORILER };
