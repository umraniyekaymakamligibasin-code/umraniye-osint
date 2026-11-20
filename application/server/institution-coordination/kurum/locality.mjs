/**
 * Olay -> kurum yonlendirmesinin bekledigi `locality` alani.
 *
 * Yerellik, olayin kendi kanitindan TURETILIR (yeni veri uydurulmaz):
 *   1) `neighborhood` alani tam olarak Ümraniye mahallesi ise  -> mahalle duzeyi
 *   2) Metinde (baslik + ozet + ilk 250 karakter) Ümraniye / Dudullu
 *      veya ayirt edici bir mahalle adi geciyorsa               -> ilce duzeyi
 *   3) Kaynak adi Ümraniye/mahalle tasiyorsa ve metin baska bi
 *      il/ilceye isaret etmiyorsa                               -> ilce duzeyi
 *
 * Guvenlik: "İlçe geneli" / "Türkiye geneli" gibi YER TUTUCU mahalle
 * degerleri kanit sayilmaz. Baska bir il/ilce baskin ise (ve baslikta
 * yerel cipa yoksa) olay yerel sayilmaz. Atatürk, İstiklal, Site, Saray
 * gibi jenerik adlar yalnizca "X Mahallesi/Mah./Mh." baglaminda kabul edilir.
 */

/** Metinde ilce adi geciyor mu? (ekli halleriyle) */
const ILCE = /\b(?:umraniye|dudullu)(?:de|da|den|dan|nin|nun|ye|ya|deki|daki|miz|li|li[ler]*)?\b/;

/** Ümraniye'nin 35 resmi mahallesi (geo-dictionary-data.mjs ile ayni liste). */
export const MAHALLELER = [
  'Adem Yavuz', 'Altınşehir', 'Armağanevler', 'Aşağı Dudullu', 'Atakent',
  'Atatürk', 'Cemil Meriç', 'Çakmak', 'Çamlık', 'Dumlupınar', 'Elmalıkent',
  'Esenevler', 'Esenkent', 'Esenşehir', 'Fatih Sultan Mehmet', 'Hekimbaşı',
  'Huzur', 'Ihlamurkuyu', 'İnkılap', 'İstiklal', 'Kazım Karabekir', 'Madenler',
  'Mehmet Akif', 'Namık Kemal', 'Necip Fazıl', 'Parseller', 'Saray', 'Site',
  'Şerifali', 'Tantavi', 'Tatlısu', 'Tepeüstü', 'Topağacı', 'Yamanevler',
  'Yukarı Dudullu',
];

/** Yer tutucu / anlamsiz mahalle degerleri. */
const YER_TUTUCU = new Set([
  '', 'belirtilmemis', 'ilce geneli', 'turkiye geneli', 'sehir geneli',
  'genel', 'yok', 'bilinmiyor', 'diger', 'merkez',
]);

/**
 * Ayirt edici mahalle adlari: metinde tek basina gecmesi yeterli.
 * (Jenerik adlar burada YOK; onlar yalniz "Mahallesi" ile kabul edilir.)
 */
const AYIRT_EDICI = [
  'umraniye', 'dudullu', 'esensehir', 'altinsehir', 'armaganevler',
  'esenevler', 'esenkent', 'elmalikent', 'hekimbasi', 'cemilmeric',
  'necipfazil', 'mehmetakif', 'namikkemal', 'kazimkarabekir', 'dumlupinar',
  'topagaci', 'tatlisu', 'tepeustu', 'ademyavuz', 'fatihsultanmehmet',
  'ihlamurkuyu', 'yamanevler', 'serifali', 'parseller', 'madenler',
  'tantavi', 'atakent',
];

/** Jenerik adlar: yalnizca "X Mahallesi | X Mah. | X Mh." baglaminda. */
const JENERIK = [
  'ataturk', 'inkilap', 'istiklal', 'camlik', 'cakmak', 'huzur', 'saray', 'site',
  'asagi dudullu', 'yukari dudullu',
];

/** Baska il isaretleri: bunlar baskinsa olay yerel sayilmaz (81 il, aksansiz). */
const DIGER_IL_ADLARI = [
  'adana', 'adiyaman', 'afyonkarahisar', 'afyon', 'agri', 'aksaray', 'amasya',
  'ankara', 'antalya', 'ardahan', 'artvin', 'aydin', 'balikesir', 'bartin',
  'batman', 'bayburt', 'bilecik', 'bingol', 'bitlis', 'bolu', 'burdur', 'bursa',
  'canakkale', 'cankiri', 'corum', 'denizli', 'diyarbakir', 'duzce', 'edirne',
  'elazig', 'erzincan', 'erzurum', 'eskisehir', 'gaziantep', 'giresun',
  'gumushane', 'hakkari', 'hatay', 'igdir', 'isparta', 'izmir', 'kahramanmaras',
  'karabuk', 'karaman', 'kars', 'kastamonu', 'kayseri', 'kilis', 'kirikkale',
  'kirklareli', 'kirsehir', 'kocaeli', 'konya', 'kutahya', 'malatya', 'manisa',
  'mardin', 'mersin', 'mugla', 'mus', 'nevsehir', 'nigde', 'ordu', 'osmaniye',
  'rize', 'sakarya', 'samsun', 'sanliurfa', 'siirt', 'sinop', 'sirnak', 'sivas',
  'tekirdag', 'tokat', 'trabzon', 'tunceli', 'usak', 'van', 'yalova', 'yozgat',
  'zonguldak',
  // Istanbul'un diger ilceleri: baska ilce haberi Ümraniye sayilmaz.
  'tuzla', 'kadikoy', 'uskudar', 'atasehir', 'maltepe', 'kartal', 'pendik',
  'sancaktepe', 'cekmekoy', 'beykoz', 'beylikduzu', 'besiktas', 'sisli',
  'bakirkoy', 'bahcelievler', 'kucukcekmece', 'buyukcekmece', 'arnavutkoy',
  'basaksehir', 'sultanbeyli', 'esenyurt', 'esenler', 'fatih', 'gaziosmanpasa',
  'gungoren', 'kagithane', 'sariyer', 'silivri', 'sultangazi', 'tuzla',
];
const DIGER_IL = new RegExp('\\b(?:' + [...new Set(DIGER_IL_ADLARI)].join('|') + ')\\b');

/** Sehir geneli ifadeler: yerel cipa yoksa kaynak adi tek basina yetmez. */
const SEHIR_GENEL = /\b(?:istanbul|turkiye)(?:'?[a-z]{1,4})?\b/;

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

function temiz(value) {
  const s = typeof value === 'string' ? value.trim() : '';
  return s || null;
}

/** Alan degeri tam olarak bir Ümraniye mahallesi mi? */
function mahalleAlani(value) {
  const ham = temiz(value);
  if (!ham) return null;
  const n = normalize(ham);
  if (YER_TUTUCU.has(n)) return null;
  for (const m of MAHALLELER) if (normalize(m) === n) return m;
  // "Aşağı Dudullu Altınşehir" gibi birleşik degerleri de ayir.
  const parcalar = n.split(/\s{2,}|\s*[,;/]\s*/).filter(Boolean);
  if (parcalar.length > 1) {
    for (const p of parcalar) for (const m of MAHALLELER) if (normalize(m) === p) return m;
  }
  return null;
}

/** Metinde yerel cipa var mi? */
function metinYerelMi(normMetin) {
  if (!normMetin) return false;
  if (ILCE.test(normMetin)) return true;
  if (AYIRT_EDICI.some(t => normMetin.includes(t))) return true;
  for (const g of JENERIK) {
    if (new RegExp('\\b' + g.replace(/ /g, '\\s+') + '\\s+(?:mahallesi|mah|mh)\\b').test(normMetin)) return true;
  }
  return false;
}

/** Kaynak adi yerel mi? (Ümraniye/mahalle adi tasiyor mu) */
function kaynakYerelMi(event) {
  const s = normalize([event?.sourceName, event?.sourceId, event?.authorName, event?.publisher]
    .filter(Boolean).join(' '));
  if (!s) return false;
  if (s.includes('umraniye')) return true;
  return AYIRT_EDICI.some(t => t !== 'umraniye' && s.includes(t))
    || JENERIK.some(g => s.includes(g));
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

  // 0) Cagiran taraf zaten locality vermisse dokunma.
  if (e.locality && typeof e.locality === 'object' && e.locality.district) {
    return {
      district: e.locality.district,
      neighborhood: temiz(e.locality.neighborhood),
      verified: e.locality.verified === true,
      precision: e.locality.precision ?? null,
      kaynak: e.locality.kaynak ?? 'mevcut',
    };
  }

  const mahalle = mahalleAlani(e.neighborhood) || mahalleAlani(e.neighborhoodName)
    || mahalleAlani(e.locationName) || mahalleAlani(e.mahalle);

  const acikDogrulama = e.locationVerified === true;
  const incelemeGerekli = e.locationStatus === 'review_required'
    || e.locationStatus === 'local_indicated';

  const normBaslik = normalize(e.title);
  const normMetin = normalize([
    e.title, e.summary,
    String(e.description || e.fullText || e.text || '').slice(0, 250),
  ].filter(Boolean).join(' '));

  const metinYerel = metinYerelMi(normMetin);
  const baslikYerel = metinYerelMi(normBaslik);
  const digerIl = DIGER_IL.test(normMetin);
  const sehirGenel = SEHIR_GENEL.test(normMetin);

  let verified = false;
  let precision = null;
  let kaynak = 'yetersiz';

  // 1) Acik dogrulama her zaman gecerlidir.
  if (acikDogrulama && !incelemeGerekli) {
    verified = true;
    precision = mahalle ? 'neighborhood' : 'district';
    kaynak = 'alan';
  }
  // 2) Mahalle alani: en guclu yapisal kanit.
  if (!verified && mahalle) {
    verified = true;
    precision = 'neighborhood';
    kaynak = 'mahalle-alani';
  }
  // 3) Metin cipasi (baslik/ozet/ilk 250 karakter).
  if (!verified && metinYerel) {
    if (digerIl && !baslikYerel) {
      kaynak = 'baska-il-baskin';
    } else {
      verified = true;
      precision = 'district';
      kaynak = 'metin-cipasi';
    }
  }
  // 4) Kaynak adi: yalniz baska il ve sehir-geneli ifade yoksa.
  if (!verified && kaynakYerelMi(e)) {
    if (digerIl) kaynak = 'kaynak-yerel-ama-baska-il';
    else if (sehirGenel) kaynak = 'kaynak-yerel-ama-sehir-genel';
    else { verified = true; precision = 'district'; kaynak = 'kaynak-adi'; }
  }

  // 5) Eski opt-in kapsam kurali (geriye uyumluluk).
  if (!verified && String(process.env.OSINT_ROUTING_LOCAL_SCOPE || '') === '1'
      && String(e.scope || '').toLowerCase() === 'local' && metinYerel) {
    verified = true;
    precision = 'district';
    kaynak = 'kapsam-yerel-metin';
  }

  return {
    district: verified ? 'Ümraniye' : null,
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
