# 08 · legacy-application inceleme raporu (1. aşama)

## Etkinlik durumu (önce okunmalı)

**Sonuç: Büyük olasılıkla hâlâ çalışıyor; depodan kesin kanıtlanamıyor.**

- `application/deploy/DENEME_KURULUM.md` (2 Kasım 2026) tablosu: "Mevcut canlı" = `umraniyeosint.com`, `/opt/umraniye-osint`, servis `umraniye-osint`, port 3000. Yeni uygulama ayrı: `deneme.umraniyeosint.com`, port 3001.
- 13 Kasım tarihli geliştirme betikleri `umraniye-osint.service` birimini "production" olarak koruyor ve kurulum öncesi/sonrası başlama zamanını karşılaştırıyor: `development/x-supplement-bridge/osint-x-yedek-bagla.py:35-36,94`, `development/reading-quality-v1/osint-okuma-kalite-kur.py:10,53,115,122`, `facebook-shadow/install.py:11`, `x-shadow/prepare.py:5`.
- `ops/github_sync.py:9` `/opt/umraniye-osint` dizinini eşitliyor; dizin yoksa eşitleme `Source missing` ile durur, yani dizin sunucuda mevcut.
- `application/server/http.mjs:18` `OSINT_REDIRECT_HOST` eski host'tan yeni origin'e yönlendirme yapabiliyor; ancak bu değişkenin canlıda ayarlı olduğuna veya ana alan adının yeni uygulamaya taşındığına dair depoda kanıt yok.
- Bu yüzden legacy uygulama "çalışan üretim servisi" kabul edilip güvenlik bulgularının önemi yüksek tutuldu. Canlıda `systemctl is-active umraniye-osint` ve Cloudflare tünel rotası ile doğrulanmalı.

## Düzeltilen hatalar

Tüm değişiklikler `legacy-application/worker/index.js` içinde (diff: 7 ekleme, 6 silme; gömülü HTML satırları 2, 4, 983 dahil).

### L-01 · Orta · Favicon/logo her istekte 2,4 MB base64 çözümlüyor
- **Konum:** `worker/index.js:1311` (eski 1310), yeni yardımcı `:1278`.
- **Gözlem:** `/favicon.png` ve `/assets/umraniye-kaymakamligi-logo.png` her istekte `Uint8Array.from(atob(LOGO_BASE64),…)` çalıştırıyor. Uç oturum istemiyor; her sayfa açılışında da çağrılıyor.
- **Hata senaryosu:** Ölçüm (yerel Node 25): orijinalde her istek ~70 ms CPU (ilk 118 ms, ikinci 71 ms). Tek iş parçacıklı sunucuda girişsiz bir istemci 240 istek/dk sınırıyla dakikada ~17 sn ana iş parçacığı tüketebilir.
- **Değişiklik:** Logo baytları ilk istekte bir kez çözülüp `LOGO_BYTES` içinde tutuluyor. `Response` gövdeyi kopyaladığı için paylaşım güvenli.
- **Doğrulama:** Duman testi: iki yanıt bayt bayt aynı, PNG imzası doğru; ikinci istek 0,7 ms.

### L-02 · Orta · Kaynak kapatılınca yönetici "Kaynakları tara" HTTP 500 veriyor
- **Konum:** `worker/index.js:1320` (`/api/sync`), `:788` (`/api/admin/config`), yönetici sayfası betiği (satır 4 içinde `$('sync').onclick`).
- **Gözlem:** `/api/sync` grup sınırını tüm `SOURCES` sayısıyla (72 → 15 grup) doğruluyor, `syncBatch` ise yalnız etkin kaynaklarla (`activeSources`) hesaplıyor. Yönetici ekranı da döngüyü tüm kaynak sayısıyla kuruyor.
- **Hata senaryosu:** Ortak olay masasında herhangi bir kaynak kapatılırsa etkin grup sayısının üstündeki grup için `syncBatch` `RangeError` fırlatıyor; yönlendiricide yakalanmadığı için `http.mjs` 500 dönüyor ve yönetici "Tarama kısmen tamamlanmış olabilir" görüyor. Tüm kaynaklar kapatılırsa ilk grup bile hata veriyor.
- **Değişiklik:** `/api/sync` etkin grup sayısıyla doğruluyor; etkin kaynak yoksa boş/önbellekli yanıt dönüyor. `/api/admin/config` yanıtına `totalBatches` eklendi; yönetici döngüsü bunu kullanıyor (alan yoksa eski hesaba düşüyor).
- **Doğrulama:** Duman testi, 6 kaynak etkin bırakıldı: orijinal `RangeError: Geçersiz kaynak grubu` fırlattı; düzeltilmiş sürüm `totalBatches=2` ve aralık dışı grup için `400 {"error":"Geçersiz kaynak grubu"}` döndü.

### L-03 · Orta · Harita isteği başarısız olursa tüm ekran çizimi kalıcı olarak bozuluyor
- **Konum:** Ana sayfa betiği, `loadAgenda()` (satır 2 içinde).
- **Gözlem:** `state.map=await(await fetch('/api/public/map')).json()` durum kodunu kontrol etmiyor.
- **Hata senaryosu:** Harita isteği 429 (oran sınırı), 503 (sunucu meşgul) veya 401 dönerse `{error:…}` nesnesi `state.map` olarak saklanıyor ve bir daha istenmiyor. `renderPublicMap` `m.bounds.minLon` okurken `TypeError` atıyor; `renderAll()` her çağrıda (hesap yenileme, filtre, kaydetme) yarıda kalıyor, brifing ve mahalle görünümü güncellenmiyor. Sayfa yenilenene kadar sürüyor.
- **Değişiklik:** Yalnız `r.ok` ve `bounds`/`points` içeren yanıt saklanıyor; aksi halde sonraki yüklemede yeniden deneniyor. (Aynı düzeltme `application/src/app.html:565` içinde zaten var.)
- **Doğrulama:** Gömülü betik `node --check` geçti; değişiklik diff ile kontrol edildi.

### L-04 · Orta · Her yenilemede gündem verisi grup sayısı kadar yeniden indiriliyor
- **Konum:** Ana sayfa betiği, `refreshAgenda()`.
- **Gözlem:** Her kaynak grubundan sonra koşulsuz `loadAgenda()` (tam `/api/config`, 500 olayla birlikte) çağrılıyor. `refreshAgenda` sayfa açılışında, 10 dakikada bir ve **her sekme görünür olduğunda** (`visibilitychange`) çalışıyor.
- **Hata senaryosu:** 15 grupta tek yenileme 16 tam indirme ve sunucuda 16 kez `publishedData` (tüm anlık görüntüleri JSON çözme, yeniden sınıflandırma, gruplama) demek. Sunucu tarafı 9 dakikalık önbellek nedeniyle grupların çoğu `cached:true` döndüğünde bu indirmelerin hiçbiri yeni veri getirmiyor. MD madde 1 ve 3'teki "geçişte donma" şikâyetinin legacy karşılığı.
- **Değişiklik:** Bir grup ancak gerçekten taranmışsa (`cached:false`) veya başka bir süreç tararken beklenmişse (`busy`) gündem yeniden yükleniyor; atlanan grup varsa döngü sonunda tek bir yükleme yapılıyor. Önbellekli bir turda indirme sayısı 16'dan 2'ye düşüyor.
- **Doğrulama:** `node --check` geçti; mantık diff ile gözden geçirildi. Tarayıcıda ağ ölçümü yapılmadı.

### L-05 · Düşük · İlk gündem yüklemesi sessizce başarısız oluyor
- **Konum:** Ana sayfa betiği, `refreshAgenda()` `catch` bloğu.
- **Gözlem:** Elle tetiklenmeyen yenilemede hata yutuluyor.
- **Hata senaryosu:** Açılışta `/api/config` başarısız olursa (ağ, 503, zaman aşımı) liste boş kalıyor ve "Henüz haber bulunamadı" yazıyor; kullanıcı haber olmadığını sanıyor (MD madde 11).
- **Değişiklik:** Hiç yapılandırma yüklenmemişse ve oturum kilitli değilse "Gündem yüklenemedi… Yenile düğmesini kullanın." bildirimi gösteriliyor. Arka plandaki sonraki yenileme hataları sessiz kalıyor (eski veri gösterilmeye devam ediyor).
- **Doğrulama:** `node --check` geçti.

### L-06 · Düşük · Bugün/Bu hafta/Bu ay sekmesi tüm görünümleri baştan çiziyor
- **Konum:** Ana sayfa betiği, `[data-period]` tıklama işleyicisi.
- **Gözlem:** Dönem sekmesi zaten gündem görünümündeyken bile `navigate()` çağırıyor; bu `renderAll()` ile gizli mahalle haritasını, mahalle kartlarını ve `Intl.Segmenter` kullanan brifingi yeniden üretiyor, sonra sayfayı en üste kaydırıyor; ardından `renderFeed()` bir kez daha çalışıyor.
- **Hata senaryosu:** Büyük olay listesinde art arda sekme geçişi ana iş parçacığını kilitliyor (MD madde 1'in legacy karşılığı).
- **Değişiklik:** Yalnız gündem/ulusal görünüm dışındaysa `navigate('feed')`; aksi halde sadece liste çiziliyor. Başlık ve sekme durumu `renderFeed()`/`syncTabs()` tarafından güncelleniyor. (Aynı düzeltme `application/src/app.html:498` içinde zaten var.)
- **Doğrulama:** `node --check` geçti; `[data-tab]` öğesi işaretlemede bulunmadığı için `state.tab` davranışı değişmiyor.

### L-07 · Düşük · Yönetici başlığında "null · Site sahibi" yazıyor
- **Konum:** Yönetici sayfası betiği (satır 4).
- **Gözlem:** `/api/session` e-postayı platform başlığından (`oai-authenticated-user-email`) okuyor; `http.mjs:23` bu başlığı siliyor, değer her zaman `null`.
- **Değişiklik:** E-posta yoksa "Yönetici" gösteriliyor.
- **Doğrulama:** Duman testi `/yonetim` HTML'inde yeni ifadeyi doğruladı.

### L-08 · Düşük · Yazım hatası "Üyelik veruldu"
- **Konum:** Ortak olay masası betiği (satır 983). **Değişiklik:** "Üyelik verildi".

## 3. aşama için güvenlik bulguları (düzeltilmedi)

| No | Önem | Konum | Bulgu |
| --- | --- | --- | --- |
| LS-01 | Yüksek | `server/http.mjs:6` | Oran sınırlayıcı tek `Map` içinde iki pencereyi tutuyor; 10 000 kayıt aşılınca temizlik `v.bucket!==bucket` ile yapılıyor. Giriş penceresi (15 dk) ve genel pencere (1 dk) numaraları hiç eşleşmediğinden normal bir istek tüm giriş sayaçlarını siliyor; 25 giriş/15 dk sınırı sıfırlanabiliyor. `application/server/request-budget.mjs` bunu ayrı süre sonlarıyla düzeltmiş; legacy'ye taşınmalı. |
| LS-02 | Yüksek (yapılandırmaya bağlı) | `server/http.mjs:18`, `worker/index.js:750,1035` | `TRUST_CLOUDFLARE=false` iken tüm Cloudflare Tunnel trafiği `127.0.0.1` olarak görünür: herkes aynı 240 istek/dk kovasını paylaşır ve 5 hatalı yönetici girişi (herhangi birinden) yöneticiyi 15 dk kilitler. `true` iken `CF-Connecting-IP` eş adresi ve `isIP` kontrolü olmadan kabul ediliyor (application `http.mjs:20-21` kontrol ediyor). Canlı env değeri doğrulanmalı. |
| LS-03 | Orta | `worker/index.js:1020,1107`, `deploy/GUVENLIK.md` | Ekip parolası en az 6 karakter; PBKDF2-SHA256 100 000 yineleme (güncel öneri 600 000). Yönetici için `basınadmin` + 9 karakter istisnası var. İki faktörlü giriş yok. |
| LS-04 | Orta | `worker/index.js:772-779,997` | `publishedData()` neredeyse her oturumlu istekte tüm anlık görüntüleri JSON çözüp her olayı yeniden sınıflandırıyor ve grupluyor; önbellek yok. Herhangi bir ekip üyesi ağır CPU yükü oluşturabilir (`/api/workspace`, `/api/config`, `/api/account/record`). |
| LS-05 | Orta | `server/start.mjs:19-20`, `deploy/KURULUM.md:74` | Yedekler hiç silinmiyor (açılış + 24 saat + kapanış). Disk dolarsa SQLite yazmaları başarısız olur. Application `maintenance.mjs` ile saklama süresi uyguluyor. |
| LS-06 | Düşük | `worker/index.js:1255-1261` | Aktarım dışa aktarımı parola özetleri, tuzlar ve kişisel notları içeriyor (yalnız yönetici + aynı origin POST). Bilinçli tasarım; dosyanın saklanması kurum politikasına bağlı. |
| LS-07 | Düşük | `worker/index.js:720-724,1304-1308` | `identity()` `oai-authenticated-*` başlıklarına güveniyor. Node'da `http.mjs:23` bunları siliyor, yani güvenli; ancak worker başka bir önyüzle çalıştırılırsa kimlik sahteciliği mümkün. |
| LS-08 | Düşük | `worker/index.js:725,1326` | Worker'ın kendi CSP'si `script-src 'unsafe-inline'` ve `frame-ancestors https://chatgpt.com` içeriyor. Node'da `http.mjs:28-31` bunları hash'li CSP ve `DENY` ile eziyor; worker doğrudan kullanılırsa geçerli olur. |
| LS-09 | Düşük | `server/http.mjs:8` | HSTS `includeSubDomains` içermiyor. |
| LS-10 | Bilgi | `deploy/umraniye-osint.service` | Sertleştirme iyi; `ProtectProc=invisible`, `SystemCallFilter=@system-service`, `RestrictNamespaces=true` eklenebilir. |

Sır taraması: incelenen legacy dosyalarında parola, anahtar veya token değeri yok. `.env.example` depoda yok (eşitleyici nokta ile başlayan dosyaları atlıyor). Git geçmişi taraması bu forkun kapsamında değil.

## Açık kalan hatalar (düzeltilmedi, gerekçeli)

| No | Önem | Konum | Bulgu ve gerekçe |
| --- | --- | --- | --- |
| LA-01 | Orta | Ana sayfa `setInterval(loadAccount,60000)` → `renderAll()` | Her dakika tüm görünümler (liste, harita, brifing) baştan çiziliyor; MD madde 9'un legacy karşılığı. Düzeltmesi değişiklik tespiti gerektiriyor, küçük bir düzeltme değil. |
| LA-02 | Düşük | `worker/index.js:770` `activeData()` | Gösterimde olaylar varsayılan anahtar kelime profiliyle yeniden sınıflandırılıyor. Yöneticinin eklediği ifadeyle (örn. yalnız "Yüksel Çelik") toplanan kayıt `relevant:false` olup `publicBundle` tarafından eleniyor. Ümraniye/Dudullu içeren ifadelerde varsayılan ilçe kuralı da eşleştiği için etki dar. Aynı kod `application/src/server.js:770` ve `application/worker/index.js:788` içinde var. |
| LA-03 | Düşük | `worker/index.js:1066` | Geçersiz `dueAt` `RangeError` atıyor; `workspaceAPI` yakalayıp genel 400 dönüyor. Veri bozulmuyor, mesaj belirsiz. |
| LA-04 | Düşük | `worker/index.js:662-671` | `safeFetch` yönlendirme yanıtlarının gövdesini tüketmiyor; robots 404 gövdesi de okunmuyor. Bağlantılar çöp toplayıcıya kalıyor. |
| LA-05 | Düşük | `deploy/install-linux.sh:12`, `deploy/KURULUM.md`, `deploy/GUVENLIK.md` | `.env.example` ve `scripts/run-tests.mjs` depoda yok; belgelerdeki kurulum ve test adımları depodan yeniden üretilemez. |

## application ile karşılaştırma

**application'da düzeltilmiş, legacy'de açık:** LS-01 (oran sınırlayıcı), LS-02'nin IP doğrulama kısmı, LS-05 (yedek saklama). L-03 ve L-06 application'da zaten düzeltilmişti; legacy'ye de uygulandı.

**Legacy'de düzeltilen, application'da hâlâ açık (başka fork'un dosyaları):**
- L-01 logo çözümleme: `application/src/server.js:898`.
- L-02 `/api/sync` grup doğrulaması: `application/src/server.js:907`, `application/worker/index.js:1264`. İstemci döngüsü: `application/src/admin.html:263`, `application/server/integrations.html:146`.
- L-07 "null · Site sahibi": `application/src/admin.html:265`, `application/server/integrations.html:148`.
- L-08 "Üyelik veruldu": `application/src/workspace.html:52`.
- LA-02 `activeData` profili: `application/src/server.js:770`, `application/worker/index.js:788`.

## İncelenen kapsam

- `worker/index.js` 1338 satırın tamamı. Kod 531–1338. 8–530 kaynak listesi ve anahtar kelime verisi. Gömülü sabitler çözülüp ayrıca okundu:
  - `APP_HTML` (betik 165 satır);
  - `ADMIN_HTML`;
  - `ADMIN_LOGIN_HTML`;
  - `WORKSPACE_HTML` (satır 983);
  - `TEAM_LOGIN_HTML` (satır 984);
  - `BRIEFING_JS` özel PDF kodu (jsPDF/pako üçüncü taraf kodu yalnız bütünlük için `node --check`).
  - `INITIAL_DATA`, `MAP_DATA` ve `LOGO_BASE64` veri olarak geçildi.
- `server/*.mjs` 9 dosya. `database`, `backup` ve `import` application ile birebir aynı; `verify`, `transfer` ve `owner-policy` da aynı.
- `deploy/*` 5 dosya; `drizzle/*.sql` 8 dosya (application ile aynı, değiştirilmedi); `package.json`, `RELEASE.json`.
- Gömülü betiklerde script tarafından kullanılan tüm `id`'lerin işaretlemede var olduğu ve CSP'yi bozacak satır içi olay işleyici bulunmadığı kontrol edildi.

## Doğrulama özeti

- Değiştirilen ana dosya `node --check worker/index.js` geçti; gömülü 5 betik ayrıca çıkarılıp `node --check` ile geçti.
- Geçici SQLite ile duman testi (ağ isteği yok): favicon, yönetici girişi, `/api/admin/config`, ayar kaydı, `/api/sync` sınırı, `/`, `/yonetim`. Aynı test `yedek/orijinal-2026-11-13` sürümüyle çalıştırılıp önceki hata (`RangeError`, favicon başına ~70 ms) kayda geçirildi.
- Tarayıcıda ölçüm ve canlı sunucu testi yapılamadı.
