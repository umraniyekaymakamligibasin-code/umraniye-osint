# 03 · app.html, admin.html ve ilgili varlıklar — 1. aşama inceleme raporu

Kapsam: `application/src/app.html`, `application/src/admin.html`, `application/src/assets/content-moderation-ui.js`,
`content-moderation-ui.css`, `admin-portal.css`, `workspace-refresh.css`, `briefing-pdf.js` (özel kod kısmı, satır 386–434;
gömülü jsPDF ve base64 font atlandı). Satır numaraları düzeltilmiş dosyaya göredir.

## Ölçüm düzeneği ve kanıt

Gerçek `app.html` betiği, sahte DOM ve sahte `fetch` ile Node `vm` içinde çalıştırıldı (2000 kayıt, 2 aya yayılmış,
35 noktalı gerçek mahalle haritası). Düzenek: yerel geçici test dizini `apphtml/harness.mjs`, eşdeğerlik testi `apphtml/equiv.mjs`.

| İşlem (2000 kayıt) | Önce | Sonra |
| --- | --- | --- |
| `renderAll()` | 4949 ms | 11 ms |
| Haber Gündemi → Ulusal Gündem | 6310 ms | 3 ms |
| Ulusal Gündem → Haber Gündemi | 4795 ms | 9 ms |
| Dönem: Bugün / Bu hafta / Bu ay | 8075 / 4890 / 7175 ms | 8 / 11 / 7 ms |
| 60 sn'lik `refreshAgenda`, veri değişmemiş | 4818 ms, 12 innerHTML yazımı | 0,1 ms, 0 yazım |
| 60 sn'lik `loadAccount`, veri değişmemiş | 6953 ms, 9 innerHTML yazımı | 0 ms, 0 yazım |

Eşdeğerlik: eski ve yeni dosya aynı veriyle feed/national/saved görünümlerinde bugün/hafta/ay/tümü, son dakika, arama,
odak filtresi, sayaçlar ve harita çıktısında **birebir aynı sonucu** verdi (`AYNI SONUÇ`). Tarayıcıda (özellikle kurum
bilgisayarlarında) süreler Node'dakinden daha uzun olabilir; canlı tarayıcı ölçümü takip işi olarak kalır.

## Bulgular

### F-01 · Kritik · Madde 1 ve 3 · Sekme/dönem geçişinde saniyelerce donma — **Düzeltildi**
- **Dosya:** `application/src/app.html:179, 220–233, 241, 362–366` (eski satırlar 176, 216–222, 231, 340–342)
- **Gözlem:** Bugün/Bu hafta/Bu ay ve Haber Gündemi/Ulusal Gündem geçişleri 5–8 sn ana iş parçacığını kilitliyor.
- **Kök neden (kanıtlı):** Filtre değişiminde **ağ isteği yok**; tüm iş istemci tarafında. `dateKey()` ve `todayKey()` her
  çağrıda yeni `Intl.DateTimeFormat` kuruyordu (tek kurulum ≈ 35 µs; 2000 kayıtlık tek `events()` geçişi 149 ms, önbellekli
  biçimleyiciyle 1,6 ms). `events()` her çağrıda tüm listeyi yeniden süzüyordu ve `renderPublicMap()` **her mahalle noktası
  için (35 kez)** `events()` çağırıyordu. Ayrıca dönem sekmesine tıklama `navigate()` → `renderAll()` (hesap, sayaç, liste,
  görünmeyen mahalle haritası, brifing) ve ardından ikinci bir `renderFeed()` çalıştırıyordu.
- **Değişiklik:** Tek paylaşılan `istanbulDay` biçimleyicisi; `formatDate` için seçenek başına önbellek; saklama sınırı
  günde bir hesaplanıyor (`retentionCutoff`); `events()` veri dizisi ve gün değişmedikçe önbellekten dönüyor; arama/odak
  metni `WeakMap` ile kayıt başına bir kez katlanıyor; harita sayıları tek geçişte `Map` ile sayılıyor; mahalle görünümü
  yalnız açıkken çiziliyor; dönem ve “Son dakika” sekmesi aynı görünümdeyken yalnız listeyi güncelliyor (sayfa en üste
  kaydırılmıyor, tüm ekran yeniden kurulmuyor).
- **Doğrulama:** yukarıdaki ölçüm tablosu + eşdeğerlik testi; `node --check` (inline betikler).

### F-02 · Yüksek · Madde 1, 9 benzeri (app.html) · Dakikalık yenilemeler veri değişmese de tüm ekranı baştan çiziyor — **Düzeltildi**
- **Dosya:** `app.html:269–271` (`loadAccount`), `app.html:546–568` (`fetchAgendaSnapshot`, `refreshAgenda`)
- **Gözlem:** `refreshAgenda` (60–75 sn) ve `loadAccount` (60 sn, ayrıca sekmeye dönüşte ikisi birden) her seferinde
  `renderAll()` çağırıyordu; F-01 maliyetiyle her dakika ~5 sn donma, açık filtre listesinin kapanması
  (`initFilters` select içeriğini yeniden yazıyor), klavye odağının kaybı.
- **Değişiklik:** `/api/config` yanıt metni öncekiyle aynıysa ayrıştırma, filtre listesi ve çizim atlanıyor; hesap verisi
  imzası (`actor/records/activity`) değişmediyse ve ilk yükleme değilse yeniden çizilmiyor.
- **Açık kalan (başka dosya):** İndirme hâlâ her dakika tam veri kümesi; `worker/index.js` `/api/config` için ETag /
  `If-None-Match` ve `http.mjs` `Cache-Control: no-store` düzenlemesi önerilir. Bu yapıldığında istemcide
  `cache:'no-store'` → `cache:'no-cache'` yapılmalı.

### F-03 · Yüksek · Madde 11 · `loadAgenda()` hatası sessizce yutuluyor — **Düzeltildi**
- **Dosya:** `app.html:148` (durum çubuğu düğmesi), `362` (`renderAgendaStatus`), `530`, `567–568`
- **Gözlem:** `refreshAgenda(){try{await loadAgenda()}catch{}}`. Ağ/sunucu hatasında durum çubuğu eski “Son güncelleme”
  metnini göstermeye devam ediyor; ilk yüklemede hata olursa sonsuza kadar “Gündem hazırlanıyor” yazıyor.
- **Değişiklik:** Hata sınıflandırılıyor (zaman aşımı, ağ, 429, 503, diğer HTTP, geçersiz yanıt); durum çubuğunda kısa
  Türkçe mesaj + ekrandaki verinin hangi güncellemeye ait olduğu + “Yeniden dene” düğmesi gösteriliyor; elle yenilemede
  toast. Teknik kayıt yalnız `{"event":"agenda_load_failed","kind","status"}` (sır/oturum/kişisel veri yok). 401 yolu
  değişmedi (giriş sayfasına yönlendirme).
- **Doğrulama:** düzenekte ağ hatası → “Gündem yenilenemedi: Sunucuya bağlanılamadı…”, düğme görünür; başarıda gizlenir.

### F-04 · Yüksek · Mahalle haritası hata yanıtı tüm render zincirini bozuyor — **Düzeltildi**
- **Dosya:** `app.html:364–366, 565`
- **Gözlem / senaryo:** `/api/public/map` 503 (“Sunucu meşgul”, `http.mjs` 80 eşzamanlı istek sınırı) veya 429 dönerse
  `r.ok` kontrol edilmeden `state.map={error:…}` atanıyordu. Sonraki her `renderAll()` `m.points.map` satırında
  `TypeError` fırlatıyor; `renderBrief()` hiç çalışmıyor (brifing ekranı boş kalır), `loadAccount` finally bloğunda
  yakalanmamış hata oluşuyor ve `state.map` dolu sayıldığı için harita sayfa yenilenene kadar tekrar denenmiyor.
- **Değişiklik:** `loadPublicMap()` `r.ok` ve şekil (`points` dizisi, `bounds`) doğruluyor; geçersizse atamıyor ve sonraki
  yenilemede yeniden deniyor; `renderPublicMap` da şekli doğruluyor.
- **Doğrulama:** düzenekte 503 harita yanıtıyla `renderAll()` hatasız, `state.map=null`.

### F-05 · Orta · Madde 11 · Yönetim panelinde oturum kontrolü hatası görünmüyor — **Düzeltildi**
- **Dosya:** `application/src/admin.html:280` (`checkSession`)
- **Gözlem:** `checkSession(){try{…}catch{}}` 60 sn'de bir çalışıyor; ağ/sunucu hatası yönetiye hiç yansımıyor, yönetici
  oturumu doğrulanamadığı halde kaydetmeye devam ediyor.
- **Değişiklik:** Hata durumunda mesaj alanında “Oturum durumu doğrulanamadı: … Kontrol 1 dakika içinde yinelenecek”
  uyarısı; kontrol düzelince yalnız bu uyarı gizleniyor. Teknik kayıt yalnız olay adı ve hata sınıfı.

### F-06 · Orta · Kaynak tarama döngüsü pasif kaynak varken hata veriyor (koordinatör iletisi L-02) — **Düzeltildi**
- **Dosya:** `admin.html:268` (`$('sync').onclick`)
- **Kök neden:** Sunucu (`worker/index.js` `/api/sync`) grup sayısını yalnız **etkin** kaynaklardan hesaplayıp
  `batch>=totalBatches` için 400 “Geçersiz kaynak grubu” dönüyor; panel ise tüm kaynak sayısıyla döngü kuruyordu. Bir kaynak
  pasifleştirildiğinde son gruplar hata veriyor, yapılandırma yeniden okunmuyor, “Tarama kısmen tamamlanmış olabilir” görülüyor.
- **Değişiklik:** Yanıtta `totalBatches` varsa o kullanılıyor (worker fork'u ekleyecek), yoksa eski hesaba düşülüyor; etkin
  kaynak yoksa açık mesaj.

### F-07 · Düşük · Yönetici kimliği “null · Site sahibi” (koordinatör iletisi L-07) — **Düzeltildi**
- **Dosya:** `admin.html:270`. `/api/session` e-postası `OSINT_ADMIN_EMAIL` boşsa `null` (`worker/index.js` yönetici
  kullanıcısı `email:env.OSINT_ADMIN_EMAIL||null`). E-posta yoksa “Yönetici” gösteriliyor.

### F-08 · Orta · Yönetim paneli her açılış ve her kaydetmede tüm haber yükünü indiriyor — **Düzeltildi**
- **Dosya:** `admin.html:65` (`load`)
- **Gözlem:** `load()` her çağrıda `/api/config` (2 aylık yayımlanmış tüm haberler) indiriyordu; yalnız kapalı “Kaynaklı
  sosyal paylaşım ekleme” bölümündeki “Öncelik listesi” için. `load()` her kaydetme/tarama/oturum işleminden sonra da çağrılıyor.
- **Değişiklik:** Liste yalnız bölüm açıkken (açıldığında veya açıkken `load()` çağrıldığında) indiriliyor; yükleme ve hata
  durumu bölüm içinde yazıyor.

### F-09 · Orta · Moderasyon ekranında hızlı sekme geçişi listeleri karıştırıyor — **Düzeltildi**
- **Dosya:** `application/src/assets/content-moderation-ui.js:5–8, 21`
- **Senaryo:** “Kaldırılanlar”a, hemen ardından “Görünür haberler”e geçilir; eski istek geç dönerse iki kovanın kayıtları
  aynı listeye eklenir ve eski kovanın kayıtları yeni sekmenin düğmeleriyle (ör. “Kaldır”) çizilir (yanlış içerik/eylem).
- **Değişiklik:** İstek sırası numarası + `AbortController`; eski yanıt ve iptal hatası yok sayılıyor.

### F-10 · Düşük · `institutional-pin-form` hata nedenini gizliyor — **Düzeltildi**
- **Dosya:** `admin.html:301`. `catch{…'İşlem tamamlanamadı.'}` `readAdminJSON`'ın verdiği nedeni (oturum bitti, 403 vb.)
  siliyordu; artık nedeni ekliyor. Sunucu hata gövdesinde `error` yoksa “PIN değiştirilemedi.” yazıyor (önce boş kalıyordu).

### Sınıflandırılan diğer sessiz `catch` blokları (madde 11) — değiştirilmedi
- `app.html` son betik (`/api/session` → kurumsal menü): hata halinde menü gizli kalır; güvenli varsayılan. Kabul edilebilir.
- `app.html:457` `openDetail` “açıldı” kaydı `.catch(()=>{})`: arka plan izleme kaydı; okuma akışını etkilemez. Kabul edilebilir.
- `app.html` `persist()` ve `localStorage` okumaları: özel tarayıcı modu/kota için tolere. Kabul edilebilir.
- `loadPublicMap` içindeki `catch{}`: isteğe bağlı harita; artık sonraki yenilemede tekrar deneniyor.

### Diğer bulgular — açık (önem düşük, davranışa dokunulmadı)
- `admin.html` `x-source-form` ve birkaç form `e.submitter` kullanıyor; Safari < 15.4'te tanımsız olup `TypeError` verir.
- `admin.html:141` ilk `$('feed-form').onsubmit` ataması `admin.html` sonundaki ikinci atamayla eziliyor (ölü kod).
  Legacy betikteki `[data-legacy-tab]` dalı da ölü kod.
- `content-moderation-ui.js` toplu kaldırmada JSON olmayan hata yanıtı `SyntaxError` mesajı gösterir.
- `briefing-pdf.js:389` `briefText` “Facebook/WhatsApp/Telegram” kelimelerini `\b` olmadan siliyor; `app.html:183`
  önizlemesi `\b` ile siliyor. Önizleme ile PDF metni farklı olabilir (ör. “Facebook'tan” → “'tan”).
- `briefing-pdf.js:423–424` kaynak listesi sınırsız; çok sayıda yayıncılı kayıtta metin sayfa altına taşabilir.
- `admin.html` legacy betiği `/api/admin/config` ile `initialData: publishedData()` (tüm haberler) indiriyor; kaynak
  durum sayıları için gerekli olmayan kısım sunucu tarafında ayrılabilir (worker fork'u).

## 3. aşama için güvenlik bulguları (DÜZELTİLMEDİ)

| # | Önem | Yer | Bulgu |
| --- | --- | --- | --- |
| S-1 | Orta | `admin.html:60` `drawEvents` | Dış RSS'ten gelen `e.url` yalnız HTML kaçışıyla `href`'e yazılıyor; şema kontrolü yok (`javascript:`). CSP (`script-src` 'unsafe-inline' içermiyor) `javascript:` gezinmesini engellediği için şu an hafifletilmiş; yine de `safeUrl` ile http/https sınırlanmalı. |
| S-2 | Düşük | `admin.html:40` | Facebook “Son paylaşımlar” `link.href=p.canonical_url` şema kontrolsüz (sekme şu an erişilemez). |
| S-3 | Düşük | `admin.html:249` legacy kaynak listesi | `s.url` şema kontrolsüz `href` (sunucu sabiti; risk düşük). |
| S-4 | Düşük | `app.html:457` `openDetail` | `e.publisherCount` innerHTML'e kaçışsız yazılıyor (sunucu verisi). Ayrıca admin'de `s.item_count`, `w.recordedSocialMatches`, `data-common-edit="'+w.id+'"` kaçışsız sayısal alanlar. Sayı zorlaması (`Number()`) önerilir. |
| S-5 | Orta | `app.html` şifre formu, `admin.html` üye formu | Kullanıcı şifresi en az 6 karakter. Sunucu tarafında daha güçlü politika (≥10–12) ve sızmış parola kontrolü değerlendirilmeli. |
| S-6 | Orta | `admin.html` kurumsal PIN | 4 haneli PIN (10.000 olasılık); sunucu tarafında deneme sınırı/kilit doğrulanmalı. |
| S-7 | Orta | `content-moderation-ui.js` | Eylem isteğinde tüm `item` nesnesi istemciden gönderiliyor; sunucu (`content-moderation.mjs`) yalnız kimlik alanına güvenmeli, istemcideki `url/status/stream` alanlarını doğrulamadan kullanmamalı. |
| S-8 | Bilgi | `admin.html` aktarım dışa aktarımı | Parola özetleri içeren JSON tek tıkla iniyor; sunucuda yeniden kimlik doğrulama ve işlem kaydı doğrulanmalı. |
| S-9 | Bilgi | `app.html` `/giris?next=` | Yönlendirme hedefi istemciden geliyor; sunucunun `next` değerini yalnız yerel yol olarak kabul ettiği doğrulanmalı (açık yönlendirme). |
| S-10 | Bilgi | CSP | `style-src 'unsafe-inline'` gerekli (yaygın inline stil); `img-src https:` geniş. |

## 2. aşama için arayüz notları (Madde 2: “Son dakika”)

`app.html` içinde “Son dakika” şu yerlerde: (1) üst çubukta zil düğmesi `#bell` (`app.html:142`) ve 330 px açılır kutu
(en fazla 5 kayıt); (2) “Kişisel araçlar” menüsünde sayaçlı bağlantı; (3) haber sekmelerinde 5. sekme
(`app.html:152`, `.breaking-tab`); (4) kartlarda kırmızı “Son dakika” etiketi (`isBreaking`, `app.html:317`); (5) seçildiğinde
başlık/alt başlık değişimi. `app.html`'de tam genişlik bir şerit **yok**. Ekranı en çok kaplayan öğe, masaüstünde ilk kartın
tam genişlikte, 28 px başlık ve “Akıştaki en güncel kayıt” etiketiyle çizilen “lead” kartı (`app.html:50, 54`:
`.event-card:first-child{grid-column:1/-1;…}`); son dakika algısının kaynağı bu olabilir. Tam genişlik “haber şeridi”
(`.newswire`, `#wire-text`, 48 px) `portal.html`/`portal.css`/`portal.js` içinde (ana oturumun alanı). Diğer notlar:
`.summary-overview{display:none}` sayaç/özet panelini tamamen gizliyor (içindeki “Son güncelleme” yenileme düğmesi de
erişilemez); mobilde sekmeler 5 öğeyle sıkışıyor.

## İncelenen kapsam
- `app.html` 1–573: stiller, işaretleme, ana betik (tamamı), son betik.
- `admin.html` 1–302: stiller, işaretleme, 6 inline betik (tamamı).
- `content-moderation-ui.js` tamamı; `content-moderation-ui.css`, `admin-portal.css`, `workspace-refresh.css` tamamı
  (hata yok; yalnız görsel kurallar).
- `briefing-pdf.js`: özel kod 1–12 ve 386–434; gömülü jsPDF (13–385) ve base64 fontlar incelenmedi (üçüncü taraf/veri).
- Doğrulama: tüm inline betikler `node --check`; `content-moderation-ui.js` `node --check`; app.html ölçüm + eşdeğerlik
  düzeneği. `content-moderation-ui.js` sekme yarışı ve admin değişiklikleri yalnız sözdizimi düzeyinde doğrulandı;
  tarayıcıda elle kontrol gerekir.
