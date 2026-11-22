# 01 · `application/worker/index.js` inceleme raporu

Kapsam: dosyanın tamamı (1283 satır, 413 KB). Satır numaraları düzeltme öncesi dosyaya göredir
(`git show HEAD:application/worker/index.js`; `sed -n` sayımı).

Bu dosyanın canlıdaki rolü: `server/start.mjs` tarafından yüklenir. `/calisma` (eski `app.html`),
`/ekip` (ortak olay masası, `WORKSPACE_HTML`), `/giris`, `/yonetim`, `/api/config`, `/api/workspace/*`,
`/api/account/*`, `/api/admin/*`, `/api/sync`, toplayıcı (`/api/automation/refresh`) bu dosyadan cevaplanır.

## Düzeltilen hatalar

### W1 · Orta · Son taramadaki acil olaylar için bildirim ve brifing bayat veriyle üretiliyor
- **Konum:** `publishedData()` satır 792-798, `afterSourceRefresh()` satır 1018-1019.
- **Gözlem:** `publishBatch()` önbelleği geçersiz kılıyor, ardından son kaynak grubunda
  `afterSourceRefresh()` → `publishedData(env)` çağrılıyor. `publishedData` son 120 sn içinde hesaplanmış
  bir değer varsa yeniden hesaplamayı arka planda başlatıp **eski değeri döndürüyor**. Panel her dakika
  istek yaptığı için bu neredeyse her zaman geçerli.
- **Hata senaryosu:** Son grupta yeni bir "fabrikada patlama, 5 ölü" haberi kaydediliyor; acil bildirim
  (`alert_log`) oluşmuyor; en erken 10 dk sonraki döngüde oluşuyor. Sabah/akşam brifingi günde bir kez
  kaydedildiği için o günün brifingi son grubun haberlerini kalıcı olarak kaçırabiliyor. (PROJE-ACIKLAMASI
  madde 6 ile ilişkili: kaydedilen verinin bildirimde geç görünmesi.)
- **Değişiklik:** `publishedData(env,fresh)` parametresi eklendi. `fresh=true` iken bayat değer
  döndürülmez; geçersiz kılmadan önce başlamış bekleyen hesaplama varsa beklenip yenisi başlatılır
  (`promiseEpoch`). `afterSourceRefresh` artık `publishedData(env,true)` kullanıyor; taze hesaplama
  başarısız olursa eski davranışa (son geçerli veri) düşüyor.
- **Doğrulama:** Sahte `fetch` ile duman testi (`yerel geçici test dizini/worker-test/smoke.mjs`): önbellek ısıtıldıktan
  sonra `/api/sync?batch=0`. Eski sürüm: `alert_log` boş, `/api/workspace` alerts=0. Yeni sürüm: 1 bildirim.

### W2 · Orta · Deprem başlıklı haberlerde bina çökmesi/enkaz kuralı hiç çalışmıyor
- **Konum:** `nationalCritical()` satır 1176.
- **Gözlem:** `else if(/deprem|tsunami/...)` dalına girildiğinde büyüklük koşulu dalın **içinde** kontrol
  ediliyordu. Büyüklük yazmayan bir deprem haberi dala girip grup atamadan çıkıyor, `else if` zinciri
  yüzünden sonraki "bina çöktü / enkaz altında" kuralları hiç denenmiyordu.
- **Hata senaryosu:** "Malatya'da deprem sonrası bina çöktü, enkaz altında kalanlar var" ulusal kritik
  sayılmıyordu.
- **Değişiklik:** Büyüklük (`quake`) zincirden önce hesaplanıyor, koşul `else if` ifadesine taşındı.
  Büyüklük eşiğini sağlamayan deprem haberleri artık sonraki kurallara düşüyor.
- **Doğrulama:** Eski: `false`, yeni: `true`. "6.1 büyüklüğünde deprem" → true, "3.2 büyüklüğünde
  deprem" → false, "deprem olabilir" → false (değişmedi).
- **Aynı hata:** `legacy-application/worker/index.js` içinde de var (sahibi başka fork).

### W3 · Orta · `/api/sync` devre dışı kaynak varken son gruplarda 500 veriyor
- **Konum:** satır 1263-1264.
- **Gözlem:** Grup sınırı tüm `SOURCES` sayısına göre kontrol ediliyor, `syncBatch` ise yalnız etkin
  kaynaklarla çalışıp aralık dışında `RangeError` fırlatıyor (try yok → `http.mjs` 500).
  `src/admin.html` "Tara" düğmesi döngüyü tüm kaynak sayısına göre kuruyor.
- **Hata senaryosu:** Yönetici bir kaynağı kapatınca "Tara" düğmesi son grupta
  "Tarama kısmen tamamlanmış olabilir: İşlem tamamlanamadı." hatası veriyor.
- **Değişiklik (legacy L-02 ile aynı sözleşme, koordinatör isteği):** `/api/sync` grup numarasını
  etkin kaynaklardan hesaplanan `totalBatches` ile doğruluyor; aralık dışı → 400
  `{"error":"Geçersiz kaynak grubu"}`; etkin kaynak yoksa `{batch:0,totalBatches:0,events:[],results:[],
  cached:true,syncedAt:null}`. `/api/admin/config` yanıtına etkin kaynaklarla `totalBatches` eklendi.
- **Doğrulama:** Eski: `RangeError` fırlatıyor (canlıda 500). Yeni: tek etkin kaynakla
  `/api/admin/config` → `totalBatches:1` (74 kaynaktan), `batch=3` → 400, `batch=-1` → 400, `batch=0` → 200;
  tüm kaynaklar kapalıyken `batch=0` → 200 boş/önbellekli, `totalBatches:0`.
- **İstemci notu:** `src/admin.html` ve `server/integrations.html` döngüleri `config.totalBatches`
  alanını kullanmalı (alan yoksa eski hesap). Bu istemciler güncellenmeden sunucu kurulursa, kaynak
  kapalıyken eski istemcinin son grupları 400 alır (önceden 500). `application/src/server.js` aynı eski
  sınır kontrolünü içeriyor.

### W4 · Düşük · Yönetim API'sinde doğrulama hataları "Yönetim verisi okunamadı. Yeniden deneyin." (503) olarak dönüyor
- **Konum:** `readBody()` satır 911, `strings()` satır 933, `/api/admin/` yakalayıcısı satır 1245.
- **Gözlem:** Geçersiz JSON, büyük istek ve 100 karakteri aşan ifade gibi kullanıcı hataları genel 503
  mesajına dönüşüyordu; kullanıcı "yeniden dene"yi izliyor ama sonuç değişmiyor.
- **Değişiklik:** `readBody` ve `strings` hatalarına `status` (400/413) eklendi; yakalayıcı 4xx durumlu
  hatayı kendi mesajıyla döndürüyor, diğerleri eskisi gibi 503.
- **Doğrulama:** 150 karakterlik hariç tutma ifadesi: eski 503 → yeni 400 "Geçersiz ifade listesi: en
  fazla 100 ifade, her biri en fazla 100 karakter olabilir."; bozuk JSON: 503 → 400.

### W5 · Düşük · Yanıt gövdeleri tüketilmeden bırakılıyor (bağlantı/bellek tutma)
- **Konum:** `safeFetch()` yönlendirme dalı satır 689; `collectSource()` robots 404 ve hatalı yanıt satır
  699; sayfa döngüsü satır 704; ayrıntı okuma satır 714.
- **Gözlem:** 3xx, 404 ve 2xx dışı yanıtların gövdesi okunmadan/iptal edilmeden bırakılıyordu. Node
  `fetch` (undici) bu durumda bağlantıyı çöp toplayıcıya kadar tutar. 10 dakikada bir ~70 kaynak taranıyor.
- **Değişiklik:** Bu yollarda `response.body?.cancel()` çağrılıyor.
- **Doğrulama:** Sahte akışla: yönlendirme + robots 404 + RSS 500 → 3 gövde iptal edildi, sonuç
  `status:error, HTTP 500` (davranış aynı).

### W6 · Düşük · Zaman aşımı mesajı yanlış süre bildiriyor
- **Konum:** satır 722. Zaman aşımları 15/20/40/120 sn iken mesaj her zaman "20 saniyede" diyordu.
- **Değişiklik:** "Kaynak zaman sınırı içinde yanıt vermedi". Aynı metin `src/server.js` ve
  `legacy-application/worker/index.js` içinde de var.

### W7 · Düşük · Ortak olay masasında (`/ekip`) otomatik yenileme hataları sessizce yutuluyor (madde 11)
- **Konum:** `WORKSPACE_HTML` (satır 897) `setInterval(...load().catch(()=>{}))` ve `visibilitychange`.
- **Hata senaryosu:** Sunucu/ağ hatasında ekran eski veriyi göstermeye devam ediyor, kullanıcı fark etmiyor.
- **Değişiklik:** Hata kısa bildirimle gösteriliyor: "Otomatik yenileme yapılamadı: … · Yenile düğmesiyle
  yeniden deneyin."

### W8 · Düşük · Ortak olay masası JSON olmayan hata yanıtında anlamsız mesaj gösteriyor
- **Konum:** `WORKSPACE_HTML` `api()`.
- **Gözlem:** `r.json()` durum kontrolünden önce çağrılıyordu; vekil sunucu 502 HTML döndürdüğünde
  kullanıcı "Unexpected token '<'" görüyordu.
- **Değişiklik:** Gövde okunamazsa "İşlem tamamlanamadı (HTTP 502)" gösteriliyor; 401 yönlendirmesi korunuyor.

### W9 · Düşük · Yazım hatası
- `WORKSPACE_HTML`: "Üyelik veruldu." → "Üyelik verildi."

Doğrulama özeti: `node --check application/worker/index.js` geçti. Gömülü `WORKSPACE_HTML`,
`TEAM_LOGIN_HTML`, `ADMIN_LOGIN_HTML` betikleri ayrı ayrı çıkarılıp `node --check` ile denetlendi.
Duman testi geçici SQLite üzerinde gerçek göçlerle (`drizzle/*.sql`) çalıştırıldı: `/health`, yönetici
girişi, ayar kaydı, `/api/config`, `/api/sync`, `/api/workspace`.

## 3. aşama · güvenlik bulguları (düzeltilmedi)

| # | Önem | Konum | Bulgu | Önerilen düzeltme |
|---|---|---|---|---|
| G1 | Orta | `passwordHash()` satır 961; hesap oluşturma/şifre yenileme satır 948-952, `/api/account/password` | Ekip şifresi en az 6 karakter; PBKDF2-SHA256 100.000 tur (güncel öneri 600.000). | En az 12 karakter, tur sayısını artırıp girişte yeniden özetleme. |
| G2 | Orta | `teamLogin()` satır 966-970 | Deneme sınırı "IP + kullanıcı adı" anahtarlı; aynı IP'den farklı kullanıcı adlarıyla sınırsız deneme (yalnız genel istek bütçesi). Okuma ve artırma ayrı adımlar; eşzamanlı isteklerle 5 sınırı aşılabiliyor. | Kullanıcı başına ve IP başına ayrı sayaç; artırmayı atomik `UPDATE … RETURNING` ile yapma. |
| G3 | Düşük | `passwordAction()` satır 768-778 | Yönetici giriş sınırı yalnız IP anahtarlı; dağıtık denemeye karşı hesap düzeyinde kilit yok. | Hesap düzeyinde artan bekleme süresi. |
| G4 | Orta | `migrationExport()` satır 1198-1205 | İndirilen aktarım dosyasında `team_accounts.password_hash/salt` ve kişisel notlar düz JSON olarak var (yönetici oturumu + Origin + POST gerekli). | Özetleri dışarıda bırakma veya dosyayı şifreleme; indirmeyi ikinci doğrulamaya bağlama. |
| G5 | Düşük | `identity()` satır 738-742, `/mcp`, `/api/automation/instructions` | Eski barındırma ortamından kalan kod: `oai-authenticated-*` başlıklarına güveniyor; talimat metni token adı içeriyor. `http.mjs` bu başlıkları siliyor ve yolları 404 yapıyor, yani şu an etkisiz; ancak worker başka bir sarmalayıcıyla açılırsa yönetici yetkisi başlıkla taklit edilebilir. | Ölü yolları ve başlık tabanlı kimliği kaldırma. |
| G6 | Düşük | `htmlResponse()` satır 743, APP_HTML yanıtı satır 1271 | Worker'ın kendi CSP'si `script-src 'unsafe-inline'` ve `frame-ancestors https://chatgpt.com` içeriyor. Canlıda `http.mjs` CSP'yi karma tabanlı ve `frame-ancestors 'none'` ile eziyor. | Worker'daki CSP'yi `http.mjs` ile aynı yapma (savunma derinliği). |
| G7 | Düşük | `WORKSPACE_HTML` `openCase()`/`renderBrief()` | Kaynak bağlantıları `href=esc(url)` ile basılıyor; şema denetimi yok. Haber URL'leri `canonical()` ile http/https'e sınırlı; ancak `OSINT_LAB_EVENTS` (entegrasyon) kayıtlarının şeması bu dosyada denetlenmiyor. `http.mjs` CSP'si `javascript:` bağlantılarını engelliyor. | Bağlantıları yalnız `http:`/`https:` ise basma. |
| G8 | Bilgi | `safeFetch()` | SSRF koruması: yalnız sabit kaynak kökenleri ve yönlendirmeler de denetleniyor. Uygun. | — |
| G9 | Bilgi | Giriş sayfaları | `next` parametresi izin listesiyle sınırlı (açık yönlendirme yok); tüm durum değiştiren POST'larda Origin denetimi ve `SameSite=Strict` çerez var. | — |

## 2. aşama · arayüz notları
- `WORKSPACE_HTML` `draw()` arama kutusunda her tuşta görev panosu, harita, bildirim ve rapor
  seçeneklerini de baştan çiziyor; aramada gecikmeli (debounce) ve yalnız liste çizimi önerilir.
- Ekip girişi, yönetici girişi ve olay masası farklı görsel dillerde; tek tasarımda birleştirilebilir.
- `/api/config` yanıtı yerel veriyle (154 kayıt) ~171 KB; canlıda 500 kayda ve kayıt başına 12.000
  karaktere kadar `fullText` ile birkaç MB'a çıkabilir (madde 1, 5). `app.html` brifing PDF'i `fullText`
  kullandığı için alan kaldırılmadı; ayrı hafif uç nokta veya sayfalı yükleme önerilir.
- Toplayıcı (`server/collector.mjs`) her döngüde yalnız `totalBatches` için `/api/config` çağırıyor ve tüm
  yayın paketini hesaplatıyor; hafif bir uç nokta önerilir.

## Açık kalan konular (düzeltilmedi)
- **Saklama süresi tutarsızlığı:** worker `retentionCutoff` ≈ 2 ay (`month-3`), `src/retention.js` ≈ 6 ay
  (`month-7`, `integrations.mjs` "altı aylık saklama"). Worker'ın `maintainRetention` işlemi 2 aydan eski
  haber ve brifingleri siliyor. Arayüz "Son 2 ay" diyor. Politika kararı gerektiriyor.
- `activeData(…,true)` yolu, kaynak değiştirildiğinde eski `e.sourceId` ile sınıflıyor; şu an yalnız
  `false` ile çağrıldığı için etkisiz.
- Son grup önbellekten dönerse veya kilitliyse (`busy`) `afterSourceRefresh` o döngüde çalışmıyor.
- `/api/workspace/case` GET isteği 405 yerine 400 dönüyor (önemsiz).
- `nationalCritical` savaş dalı `nationalPhase` alanı olmadan dönüyor (görsel tutarsızlık).
- Başka fork'lara: `legacy-application/worker/index.js` (W2, W6), `application/src/server.js` (W3, W6),
  `src/admin.html` tarama döngüsü (W3).

## İncelenen kapsam
- 1-17 (içe aktarmalar, gömülü giriş sayfası ve betiği), 18 (`INITIAL_DATA`, veri; yapısı kontrol edildi),
  19-544 (`SOURCES`, `SOURCE_CANDIDATES`, `KEYWORD_GROUPS`; yalnız veri olduğu doğrulandı),
  545-896 (ayrıştırma, ilgi, robots, güvenli fetch, toplama, kimlik, önbellek, yönetim, senkron, MCP),
  897 (`WORKSPACE_HTML` CSS+HTML+betik, tamamı), 898 (`TEAM_LOGIN_HTML`), 899 (`MAP_DATA`, veri),
  900-1283 (ayarlar, CSV, ortak masa, hesap, saklama, ulusal kritik sınıflandırma, aktarım, yönlendirici).
