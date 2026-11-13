# 02 · application/src JS, workspace ve giriş sayfaları incelemesi

## Önemli bağlam: hangi dosyalar canlıda çalışıyor?

`application/src/` altındaki dosyaların bir kısmı çalışma zamanında hiç yüklenmiyor. Depoda
bulunmayan bir build betiğinin (`scripts/build.mjs`) girdileri bunlar ve içerikleri
`application/worker/index.js` içine gömülmüş. Kontrol yöntemi: tüm depoda dosya adıyla arama yapıldı,
ayrıca her dosyanın 30 karakterden uzun satırlarının `worker/index.js` içinde geçip geçmediği sayıldı.

| Dosya | Canlıda yükleniyor mu? | Not |
| --- | --- | --- |
| `grouping.js` | Evet (`worker`, `portal-records`, `review-queue-policy`, `system-four-audit` içe aktarıyor) | |
| `event-equivalence.js` | Evet (`worker`, `telegram-event-queue`, `shared-refresh-dedupe-activate`) | |
| `intelligence.js` | Evet (`worker`, `integrations`, `browser-research`, `critical-alerts`, `telegram-delivery`, X/Facebook adaptörleri) | 4 birebir kopyası var |
| `retention.js` | Evet (yalnız dışa aktarılan fonksiyonlar; `maintainRetention` worker'daki kopyadan çalışıyor) | |
| `newsworthiness.js` | Evet (`social-quality.mjs` ve kopyaları) | 4 birebir kopyası var |
| `server.js` | **Hayır.** Hiçbir dosya içe aktarmıyor. `__APP_HTML__`, `__WORKSPACE_CODE__` gibi yer tutucular içeriyor; yüklense `ReferenceError` verirdi. `worker/index.js`'in eski bir şablonu, en az 35 satırı canlı koddan farklı. | **Kullanılmıyor, kaldırılması önerilir.** |
| `account.js`, `access.js`, `migration.js`, `workspace.js`, `national.js` | Hayır. Build parçaları; içerikleri `worker/index.js` içinde (account/access/migration birebir, workspace 93/99, national 32/42 satır). | Kaldırılması veya build betiğinin geri getirilmesi önerilir. |
| `briefing.js` | Hayır. `assets/briefing-pdf.js` paketinin eski kaynağı; paket sonradan ayrışmış (72 saat penceresi). | Kaldırılması önerilir. |
| `workspace.html`, `team-login.html`, `admin-login.html` | Hayır. `worker/index.js` içindeki `WORKSPACE_HTML`, `TEAM_LOGIN_HTML`, `ADMIN_LOGIN_HTML` sabitleri kullanılıyor. | |
| `styles/reader-modern.css`, `styles/reader-newsroom.css` | Hayır. Yalnız `legacy-application/worker/index.js` içine gömülü. | |

Sonuç: Bu ölü kopyalarda yapılan bir düzeltme canlıyı etkilemez, ama canlı koddan ayrışmış kopyalar
ileride yanlış dosyanın düzenlenmesine yol açar (Orta önem, bakım riski).

## Bulgular

### B1 · Yüksek · RSS tarihleri `+0300` saat dilimi yüzünden reddediliyor — Düzeltildi
- **Konum:** `application/src/intelligence.js:15` (+ 4 kopya)
- **Gözlem:** `const rfc=/\b(?:GMT|UTC|[+-]\d{4})\s*$/i` ifadesinde `\b` boşluk ile `+` arasında
  eşleşmez (ikisi de kelime karakteri değil). Standart RSS `pubDate` biçimi
  `Fri, 13 Nov 2026 10:00:00 +0300` bu yüzden "Geçersiz tarih veya saat dilimi eksik" diye reddediliyor.
- **Hata senaryosu:** `worker/index.js` `parseRSS` → `makeItem` ham `pubDate` değerini doğrudan
  `publicationTime()`'a veriyor. Saat dilimini sayısal yazan tüm RSS kaynaklarında (Türk yayıncıların
  çoğu) `publishedAt=null` oluyor. Etkileri:
  - Kayıt "Tarih bilinmiyor" görünüyor, Bugün/Bu hafta filtrelerinden düşüyor.
  - `prioritize()` yaşı sonsuz sayıyor; P1/P2 hiç oluşmuyor, `notificationEligible` her zaman false.
    Telegram'a acil bildirim gitmiyor.
  - `retainedEvents()` tarihsiz kayıtları siliyor; günlük bakım (`maintainRetention`) bu kayıtları
    anlık görüntülerden temizliyor (veri kaybı).
  - `integrations.mjs` RSS yolunda `if(!time.publishedAt)return ''` ile kayıt tamamen atlanıyor.
- **Değişiklik:** `/(?:\b(?:GMT|UTC)|[+-]\d{4})\s*$/i`. Saat dilimi olmayan, geçersiz takvim günlü,
  gelecek tarihli, ISO benzeri `+0300` ve `dd.mm.yyyy` biçimleri eskisi gibi reddediliyor.
- **Kopyalar:** Aynı düzeltme `x-shadow/rules/src/`, `facebook-shadow/rules/src/`,
  `development/facebook-supplement-v2/rules/src/`, `development/x-coverage-v2/rules/src/` altına
  birebir uygulandı (5 dosyanın SHA-1 değeri aynı).
- **Zorunlu eşlik eden değişiklik:** `x-shadow/prepare.py` ve `facebook-shadow/prepare.py`, canlı
  uygulamadaki `src/intelligence.js` SHA-256 değerini `rules-manifest.json` ile karşılaştırıyor;
  eşleşmezse `reviewed_filter_version_changed` / `shared_filter_version_changed` hatasıyla gölge
  toplayıcılar duruyor. Bu yüzden 4 `rules-manifest.json` dosyasında yalnız `src/intelligence.js`
  karması `dd1a1259…cd14e0` olarak güncellendi. **Dağıtımda uygulama dosyası, kural kopyaları ve
  manifestler birlikte kurulmalı.**
- **Doğrulama:** Scratchpad testi (`t-fix.mjs`, `t-cmp.mjs`): eski sürüm `+0300` için `null`, yeni sürüm
  `2026-11-13T07:00:00.000Z` döndürüyor. 7 reddedilmesi gereken biçim hâlâ reddediliyor. Taze yerel
  yangın haberi artık `P2` / `notificationEligible:true`. `node --check` geçti.

### B2 · Orta · "İlgili Haberler / Diğer Haberler" blokları olay türünü bozuyor — Düzeltildi
- **Konum:** `application/src/event-equivalence.js:69` (`incidentText`)
- **Gözlem:** İlgili haber bloğunu kesen `/ilgili haberler|…|diger haberler|…|son dakika haberleri/i`
  ifadesi Türkçe yazılışları yakalamıyor: `/i` bayrağı `İ`↔`i` ve `ğ`↔`g` eşlemesi yapmıyor.
  "İlgili Haberler", "İLGİLİ HABERLER", "Diğer Haberler", "SON DAKİKA HABERLERİ" kesilmiyor.
- **Hata senaryosu:** Altında "İlgili Haberler … Esenyurt'ta yangın" bulunan bir toplantı haberi
  eski sürümde `eventKind = 'fire'` oluyordu. Yanlış tür ve yanlış şehir; olay gruplamasında yanlış
  "çelişki", ulusal kritik sınıflamasında ve Telegram kuyruğu ayıklamasında (`telegram-event-queue.mjs`)
  hatalı eşleşme demek.
- **Değişiklik:** `/[iİIı]lg[iİIı]l[iİIı] haberler|benzer haberler|d[iİIı][gğ]er haberler|related news|son dak[iİIı]ka haberler/i`
- **Doğrulama:** 6 yazılış biçimi için tür ve şehir artık doğru. Eski/yeni karşılaştırma `fire → general`.

### B3 · Orta · Mahalle adının önündeki kelime aynı olayı "çelişkili" yapıyor — Düzeltildi
- **Konum:** `application/src/event-equivalence.js:17` (`sites`) ve `:38` (`conflict`)
- **Gözlem:** `fold()` noktalamayı sildiği için başlık ile gövde ve cümleler birleşiyor. `sites()`
  mahalle/cadde adının önündeki son 2 kelimeyi ad olarak alıyor: aynı yangın için bir haberde
  `"yangin tatlisu"`, diğerinde `"cikti tatlisu"` çıkıyor. `conflict()` bu adları `compatibleName` ile
  karşılaştırınca uyumsuz buluyor ve iki haberi "farklı olay" ilan ediyor.
- **Hata senaryosu:** Aynı mahalledeki aynı olayı anlatan haberler panelde gruplanmıyor. Telegram
  çıkış kuyruğunda yinelenen bildirim ayıklaması (`eventRelation(...)===true`) devreye girmiyor,
  aynı olay için birden çok bildirim gidiyor.
- **Değişiklik:** Yalnız çelişki kontrolünde yeni `sameSiteWord` karşılaştırması: ad sonları (asıl yer
  kelimesi) aynıysa ve önlerindeki yön/niteleyici kelime (`yukari/asagi/yeni/eski/…`) farklı değilse
  çelişki sayılmıyor. Olumlu kanıt (`sharedSites`) katı kaldı; birleşme hâlâ ayrı benzerlik kuralları istiyor.
- **Doğrulama:** `t-site.mjs`: Tatlısu/Tatlısu farklı ön kelime → `true` (önce `false`); Tatlısu/Çakmak
  → `false`; Alemdağ Cd./Şile Yolu Cd. → `false`; Yukarı/Aşağı Dudullu → `false` (çelişki korunuyor).
  `national-initial.json` (6 kayıt) üzerinde grup sayısı ve tür sınıflaması değişmedi.

### B4 · Düşük · `workspace.html` yazım hatası "Üyelik veruldu" — Düzeltildi
- **Konum:** `application/src/workspace.html:52`. Canlı karşılığı `worker/index.js` içinde worker fork'u
  tarafından zaten düzeltilmiş; build girdisi de tutarlı olsun diye düzeltildi.

### B5 · Orta · Ölü ve ayrışmış kaynak kopyaları — Açık (bakım)
- `src/server.js`, `account.js`, `access.js`, `migration.js`, `workspace.js`, `national.js`,
  `briefing.js`, `workspace.html`, `team-login.html`, `admin-login.html`, `styles/*.css` çalışma zamanında
  kullanılmıyor. `package.json` içindeki `build`, `test`, `validate` betiklerinin dosyaları
  (`scripts/build.mjs` vb.) depoda yok.
- **Öneri:** Ya build betiği depoya geri konmalı ya da bu kopyalar silinip tek kaynak `worker/index.js`
  olmalı. `server.js` için öneri: **kullanılmıyor, kaldırılması önerilir.**

### B6 · Düşük · `turkeyTime()` geçersiz değerde istisna fırlatıyor — Açık
- **Konum:** `application/src/intelligence.js:48`. `turkeyTime('garbage')` → `RangeError: Invalid time value`.
- Tek çağıran `telegram-delivery.mjs` ve doğrulanmış tarih geçiriyor; canlıda tetiklendiğine dair kanıt yok.
  İsteğe bağlı sağlamlaştırma: geçersiz tarihte `'Tarih bilinmiyor'` döndürmek.

### B7 · Düşük · ISO temel biçimli saat dilimi (`…T10:00:00+0300`) reddediliyor — Açık
- **Konum:** `intelligence.js:14`. ISO ifadesi saat diliminde iki nokta istiyor. Kaynakların bu biçimi
  kullandığına dair kanıt bulunamadı; değiştirilmedi.

### B8 · Düşük · Gruplama sıralamasında `Date.parse(0)` kullanımı — Açık
- **Konum:** `grouping.js:125`. `Date.parse(b.publishedAt||0)` V8'de `"0"` değerini 2000 yılı olarak
  ayrıştırıyor; geçersiz tarih dizgesinde sıralayıcı `NaN` dönüyor. Yalnız grup içindeki yayın sırası
  etkileniyor; kullanıcıya etkisi düşük.

### B9 · Düşük · `workspace.js` dosya kaydında takma ad (alias) altında açılmış dosya bulunmuyor — Açık
- **Konum:** `workspace.js:75` (canlısı `worker/index.js` içinde). `caseId` gönderilmezse dosya yalnız
  `event.id` ile aranıyor; `relatedIds` altında açılmış bir dosya bulunmuyor ve aynı olay için ikinci
  dosya açılabiliyor (`event_id` UNIQUE farklı id'de engellemiyor). Arayüz normalde `caseId` gönderdiği
  için düşük olasılık. Worker fork'una iletilmeli.

### Arayüz notları (2. aşama)
- `workspace.html` (canlısı worker içinde) her 60 saniyede `load()` → `draw()` ile tüm masa listesini
  `innerHTML` ile yeniden çiziyor. MD madde 9'daki portal sorununun aynısı; kaydırma ve odak kaybolabilir.
- Giriş sayfaları JSON dışı yanıtta (`502` HTML) kullanıcıya "Unexpected token '<'" gösteriyor;
  anlaşılır bir hata metni gösterilmeli.
- `workspace` hedef tarih alanı (`datetime-local`) tarayıcının yerel saat dilimiyle ISO'ya çevriliyor;
  Türkiye dışı saat dilimli cihazda saat kayar.

## Güvenlik bulguları (3. aşama, düzeltilmedi)
1. **Orta · Zayıf şifre politikası:** Ekip hesabı ve şifre değişiminde en az 6 karakter
   (`account.js:12`, `workspace.js:37-38`; canlısı worker içinde). Öneri: en az 12 karakter ve yaygın
   şifre listesi kontrolü.
2. **Düşük · Ekip girişi deneme sınırı IP+kullanıcı adı anahtarlı** (`workspace.js:53`). Tek IP'den çok
   sayıda kullanıcı adına deneme bu katmanda sınırlanmıyor (yalnız `http.mjs` genel bütçesi var).
   Öneri: IP başına ek sayaç.
3. **Düşük · `identity()` `oai-authenticated-*` başlıklarına güveniyor** (`server.js:720-724`, worker'da
   aynı). `http.mjs` bu başlıkları sildiği için şu an istismar edilemez. Öneri: worker'dan bu yolu
   tamamen kaldırmak.
4. **Bilgi · `htmlResponse` CSP'si `frame-ancestors https://chatgpt.com`, `script-src 'unsafe-inline'`**
   içeriyor (`server.js:725, 914`; worker'da aynı). `http.mjs` HTML yanıtlarında CSP ve
   `X-Frame-Options: DENY` ile geçersiz kılıyor. Öneri: worker'daki eski başlıkları temizlemek.
5. **Bilgi · `/api/automation/instructions` yanıtı dış bir otomasyon platformunun belirteç kullanım
   talimatını içeriyor** (`server.js:887`). `http.mjs` `/api/automation/*` yollarını 404 ile kapatıyor;
   ölü kod olarak kaldırılmalı.

## İncelenen kapsam
Satır satır: `intelligence.js`, `event-equivalence.js`, `grouping.js`, `retention.js`,
`newsworthiness.js`, `account.js`, `access.js`, `migration.js`, `workspace.js`, `national.js`,
`briefing.js`, `server.js` (532–926 kod bölümü; 1–531 kaynak/anahtar kelime verisi göz gezdirildi),
`workspace.html` / `team-login.html` / `admin-login.html` inline script'leri (`node --check` geçti).
`styles/*.css`: yalnız yapı (parantez dengesi) ve kullanım yeri kontrolü.

## Değişen dosyalar (commit yok)
- `application/src/intelligence.js`
- `application/src/event-equivalence.js`
- `application/src/workspace.html`
- `x-shadow/rules/src/intelligence.js`, `facebook-shadow/rules/src/intelligence.js`,
  `development/facebook-supplement-v2/rules/src/intelligence.js`,
  `development/x-coverage-v2/rules/src/intelligence.js`
- `x-shadow/rules-manifest.json`, `facebook-shadow/rules-manifest.json`,
  `development/facebook-supplement-v2/rules-manifest.json`,
  `development/x-coverage-v2/rules-manifest.json` (yalnız `src/intelligence.js` karması)
