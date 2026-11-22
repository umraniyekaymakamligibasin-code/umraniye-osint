# 05 · Kurum koordinasyonu, Telegram, ops: inceleme raporu (1. aşama)

Kapsam: `application/server/institution-coordination/**`, `development/institution-coordination/**`,
`telegram/**`, `ops/**`. Tüm dosyalar satır satır okundu. `application/...` altındaki 17 dosyanın
`development/...` kopyalarıyla birebir aynı olduğu `cmp` ile doğrulandı; düzeltmeler iki kopyaya da
uygulandı ve kopyalar yeniden birebir eşitlendi. `telegram/bot.mjs` ile `bot-v2.mjs` de birebir aynı tutuldu.
Satır sonları (CRLF/LF karışık dosyalar) korunarak düzenlendi.

Satır numaraları düzeltilmiş dosyaya göredir (`application/server/institution-coordination` = `IC`).

## Düzeltilen hatalar

### 1. KRİTİK: Telegram botu ilk yeni uyarıda çöküyor
- **Dosya:** `telegram/bot.mjs:40` (eski), `telegram/bot-v2.mjs` (aynı)
- **Gözlem:** `formatAlert(row, event)` çağrısındaki `event` hiçbir yerde tanımlı değil.
- **Hata senaryosu:** `alert_log` tablosuna gönderilmemiş bir uyarı girdiği anda `ReferenceError: event is not defined`.
  Hata `try` bloğunun dışında olduğundan üst düzey `await check()` reddedilir ve süreç çıkar. Hiçbir uyarı gönderilmez;
  servis yeniden başlatılırsa aynı uyarıda tekrar çöker. Orijinal dosya sahte veritabanıyla çalıştırılarak çöküş doğrulandı.
- **Değişiklik:** Uyarının `event_id` alanı sorguya eklendi; haber ayrıntısı son 100 `snapshots` kaydından okunuyor
  (`telegram/test-v2.mjs` ile aynı yöntem). Bulunamazsa `formatAlert` satırdaki başlıkla devam eder.
- **Doğrulama:** Sahte SQLite + sahte `fetch` ile: bulunan olay "Kaynak A" ile, bulunamayan olay yedek başlıkla gönderildi.

### 2. YÜKSEK: Telegram botunda çakışan turlar aynı uyarıyı iki kez gönderebiliyor
- **Dosya:** `telegram/bot.mjs` (`check`, `setInterval` 30 sn)
- **Gözlem:** Her gönderim 15 sn'ye kadar sürebiliyor. Bekleyen birkaç uyarı veya yavaş ağda tur 30 sn'yi aşar;
  zamanlayıcı ikinci turu başlatır, iki tur da `sent` kümesinde olmayan aynı satırı gönderir.
- **Değişiklik:** Tek tur kilidi (`running`), başlangıçtaki `await check()` hatasının süreci düşürmemesi için `.catch`.
- **Doğrulama:** Zamanlayıcı aynı anda iki kez tetiklendi; her uyarı tam bir kez gönderildi.

### 3. YÜKSEK: Kurum yönetimi API'sinde tüm hatalar dış katmana kaçıyor (genel 500)
- **Dosya:** `IC/server/institution-coordination.mjs:274` (`return adminRoute(...)`)
- **Gözlem:** Async fonksiyon içinde `await` edilmeden döndürülen promise'in reddi `try/catch`'e düşmez.
- **Hata senaryosu:** `/api/institution/admin/*` altındaki her hata (kısa şifre, geçersiz e-posta, bozuk JSON,
  bulunmayan kurum, SQL hatası) bu modülün hata eşlemesini ve `onError` kaydını atlayıp `http.mjs`'in genel
  "İşlem tamamlanamadı." 500 yanıtına dönüşüyordu. Bozuk JSON bile 400 yerine 500 dönüyordu.
- **Değişiklik:** `return await adminRoute(...)`.
- **Doğrulama:** Önce sahte test hatayı modül dışına fırlatırken yakalandı; düzeltmeden sonra yanıtlar modül içinde üretiliyor.

### 4. ORTA: Doğrulama hataları 500 "request_failed" olarak dönüyor, yönetici sebebi göremiyor
- **Dosya:** `IC/server/institution-coordination.mjs:20-25, 283-284`; `IC/web/admin.js:2`
- **Gözlem:** Alıcı deposu ve şifre kasası `valid_email_required`, `recipient_confirmation_required`,
  `password_16_to_128_required`, `institution_not_found`, `account_not_found`, `password_changed_outside_vault`,
  `username_collision_<KOD>` hatalarını fırlatıyor; hepsi 500 oluyordu. Yönetim ekranı ham kodu gösteriyordu.
- **Değişiklik:** Bu bilinen kodlar 400/404/409 olarak dönüyor (yalnız merkez yönetici rotalarında üretilir; SQL/iç hata
  metni yine dönmüyor). `admin.js` kodları Türkçe açıklamalara çeviriyor; ağ hatası ayrı mesajla gösteriliyor.
- **Doğrulama:** Sahte veritabanı testi: kısa şifre 400, geçersiz adres 400, bilinmeyen kurum 404, kasa dışı şifre değişimi 409.

### 5. ORTA: Kurum panelinde filtre değişikliği yok sayılıyor veya eski yanıt yeni filtreyi eziyor
- **Dosya:** `IC/web/institution.js:20` (`load`)
- **Gözlem:** `if(state.busy)return;` kilidi yüzünden liste yüklenirken yapılan durum/arama/kurum seçimi
  sessizce düşüyordu; ekranda yeni filtre seçili, liste eski filtreye ait kalıyordu (MD madde 1 ile aynı sınıf).
- **Değişiklik:** İstek sürüm sayacı: yeni filtre isteği hemen başlar, eski yanıt atılır. "Daha eski kayıtlar"
  yalnız başka istek yokken çalışır (çift tıklamada aynı sayfa iki kez eklenmez).
- **Doğrulama:** `node --check`; akış kod üzerinden izlendi (tarayıcı testi yapılamadı).

### 6. ORTA: Durum seçicisi geçersiz geçişleri sunuyor, kullanıcı anlamsız hata alıyor
- **Dosya:** `IC/web/institution.js` (`openCase`)
- **Gözlem:** Seçici her zaman 5 durumu sunuyordu ve ilk seçenek "Alındı" idi. Sunucu geçişleri kısıtlıyor
  (ör. `new → resolved` yok, `resolved → assessing` dışında yok). Kullanıcı 409 alıp "İstek tamamlanamadı." görüyordu.
- **Değişiklik:** Seçenekler sunucudaki `STATUS_TRANSITIONS` ile süzülüyor; geçiş yoksa seçici gösterilmiyor.
  API hata kodları Türkçe açıklamaya çevrildi; 500'de destek kodu (`requestId`) gösteriliyor.
  Geçmişte ham durum kodu (`assessing`) yerine "Durum: Alındı → İnceleniyor", öncelikte "Normal/Önemli/Acil",
  başlıkta kurum kodu yerine kurum adı gösteriliyor.

### 7. ORTA: Konu izni başarısız olunca onay kutusu yanlış durumda kalıyor
- **Dosya:** `IC/web/admin.js:4, 13`
- **Gözlem:** Onaylanmamış kurumda konu kutusu işaretlenince sunucu 409 `scope_not_approved` döner; ekran yeniden
  çizilmediği için kutu işaretli kalıyor, izin verilmiş gibi görünüyordu.
- **Değişiklik:** `act()` başarı durumunu döndürüyor; başarısızlıkta kutu eski haline alınıyor.

### 8. DÜŞÜK (performans): Her HTML isteğinde oturum iki kez çözülüyordu
- **Dosya:** `IC/server/institution-host.mjs:20-23`
- **Gözlem:** `handle()` ve HTML sarmalayıcı aynı isteği ayrı ayrı doğruluyordu; her biri iç `/api/account`
  çağrısı. Ana sayfa açılışında gereksiz bir tur (MD madde 5).
- **Değişiklik:** İstek nesnesi başına tek doğrulama (`WeakMap`). Hata olursa önbellekten silinir.
- **Doğrulama:** Sahte host testi: HTML yanıtında `actor` çağrı sayısı 1.

### 9. DÜŞÜK: Anahtar yükleme hatası kalıcı önbelleğe alınıyor; `DATA_DIR` yoksa modül çalışmıyor
- **Dosya:** `IC/server/institution-host.mjs:27-30`
- **Gözlem:** `vaultPromise ??= ...` reddedilen promise'i sonsuza kadar saklıyordu; geçici bir dosya hatası yeniden
  başlatmaya kadar kasa/alıcı ekranlarını kapatıyordu. `DATA_DIR` tanımsızsa `join(undefined)` TypeError veriyordu
  (`start.mjs` ise `./data` varsayılanını kullanıyor).
- **Değişiklik:** Başarısız yükleme önbellekten düşüyor; `DATA_DIR` varsayılanı `start.mjs` ile aynı.

### 10. DÜŞÜK: Gönderilmiş e-posta "sonucu bilinmiyor" diye ölü işaretlenebiliyor
- **Dosya:** `IC/server/gmail-smtp.py:20-31`
- **Gözlem:** Mesaj kabul edildikten sonra `with` çıkışındaki QUIT 221 dışı kod dönerse istisna `return {'ok':True}`'yu
  eziyor ve kayıt `delivery_outcome_unknown` ile `dead` oluyordu. `SMTPSenderRefused` (DATA öncesi) da "bilinmiyor"
  sayılıp yeniden denenmiyordu.
- **Değişiklik:** Kabul sonrası hata `ok` döner; gönderen reddi `definitelyNotSent`.
- **Doğrulama:** `verify-gmail.py` iki yeni durumla genişletildi; eski kodda başarısız, yeni kodda geçiyor.

### 11. DÜŞÜK: Geçmiş olay yönlendirmesinde alt dize eşleşmesi yanlış kuruma atıyor
- **Dosya:** `development/institution-coordination/server/historical-routing.mjs:25`, `historical-live-job.mjs:25`
- **Gözlem:** Kalıplarda sözcük sınırı yok: "polise" içindeki `lise` Millî Eğitim'e, "sokulan" içindeki `okul` aynı yere atanıyordu.
- **Değişiklik:** Kalıp başına sözcük başı koşulu; ek çekim eşleşmesi (okulda, yangını) korunuyor.
- **Doğrulama:** `verify-historical.mjs`'e iki olumsuz örnek eklendi, geçiyor. Not: canlıda bir kez çalıştırılmış tek seferlik betik.

## 3. aşama: güvenlik bulguları (düzeltilmedi)

| # | Önem | Yer | Bulgu |
|---|---|---|---|
| G1 | Yüksek | `ops/github_sync.py:39` | `p.suffix != '.json'` koşulu yüzünden **tüm** `.json` dosyaları aktarılıyor; `JSON_NAMES` listesi etkisiz. Kaynak dizinlerinde `config.json`, `auth.json`, `storage_state.json`, `smtp.json` gibi dosyalar GitHub'a gidebilir. Düzeltme dikkat ister: yalnız listeye geçilirse depodaki mevcut `.json` dosyaları (drizzle/meta, neighborhood-map vb.) bir sonraki eşitlemede silinir. Yasaklı ad listesi + açık izin listesi önerilir. |
| G2 | Yüksek | `ops/github_sync.py:22-23` | Sır kalıpları dar: Google API anahtarı (`AIza…`), JWT, Slack, Gmail uygulama şifresi, Facebook/Instagram/X oturum çerezleri (`sessionid`, `c_user`, `xs`, `auth_token`, `ct0`) yakalanmıyor. `ASSIGNED_SECRET` JSON biçimindeki `"password": "…"` satırlarını eşleştirmiyor (anahtar tırnaklı). |
| G3 | Orta | `IC/server/institution-credentials.mjs:25`, `institution-coordination.mjs:300-303` | Kurum şifreleri geri çözülebilir biçimde saklanıyor ve "Şifreyi göster" yeniden kimlik doğrulama istemiyor (`progress.json`'da da açık iş: `admin_reauthentication_for_password_reveal`). |
| G4 | Orta | `IC/server/institution-credentials.mjs:10-19` | `provision` onaylanmamış/taslak kurumlar dahil **tüm** kurumlar için etkin hesap ve etkin üyelik oluşturuyor. Kurum onaylanınca erişim kendiliğinden açılıyor. |
| G5 | Orta | `development/institution-coordination/historical-live-job.mjs:62-64` | Geçmiş dağıtım betiği kurum, konu ve izinleri merkez onayı olmadan `approved/enabled` yapıyor. |
| G6 | Orta | `IC/enrich-historical-content.mjs:15-19` | Serbest metin (regex ile kısmen maskelenmiş) kurum vakalarına kopyalanıyor; `route-event.mjs` "serbest metin kopyalanmaz" ilkesiyle çelişiyor. Ad/soyad gibi kişisel veri maskelenmiyor. |
| G7 | Düşük | `IC/server/institution-coordination.mjs:194-222` | Kurumlar arası yönlendirme (`/refer`) denetim kaydı (`coord_audit`) yazmıyor. |
| G8 | Düşük | `IC/server/institution-recipients.mjs:19` | Alıcı pasifleştirme denetim kaydı yazmıyor; alıcının var olup olmadığını kontrol etmeden `ok` dönüyor. |
| G9 | Düşük | `IC/server/institution-coordination.mjs:135` | Denetim kaydındaki `request_id` istemcinin gönderdiği `x-request-id` başlığından alınıyor; kayıt sahte kimlikle doldurulabilir. |
| G10 | Bilgi | `IC/server/require-approved-viewer.mjs` | Hiçbir yerde kullanılmıyor (ölü kod). Gerçek erişim kapısı `institution-host.mjs` içinde. |

## Açık kalan / bilgi notları (düzeltilmedi)

- **Eşitleyici ve PR akışı (`ops/github_sync.py:58-60`):** `main`'e GitHub'da birleştirilen değişiklik `--ff-only` ile alınır, sonra
  sunucu kopyası üstüne yazılır; değişiklik geri alınır. Fetch ile push arasındaki birkaç saniyede `main`'e birleştirme olursa push
  reddedilir, yerel commit ileride kalır ve sonraki tüm turlarda `--ff-only` başarısız olur: eşitleme elle müdahaleye kadar durur.
  README bu durmayı bilinçli tasarım olarak anlatıyor, bu yüzden değiştirilmedi. Önerilen düzeltme: yerel depoyu her turda
  `origin/main`'e sıfırlayıp anlık görüntüyü yeniden yazmak (force push gerektirmez, depo zaten tam ayna).
- **`ops/github_sync.py:70`:** Bir kök dizinden hiç dosya gelmezse `git add -- <kök>` "pathspec" hatasıyla eşitlemeyi durdurur (uç durum).
- **Kurum e-posta hattı canlıya bağlı değil:** `institution-event-jobs.mjs`, `dispatch-event-email.mjs`, `gmail-sender.mjs`,
  `route-event.mjs` yalnız `development/.../verify*.mjs` tarafından kullanılıyor; olay üretici kancası yok (`progress.json`: `event_feed_producer_hook`).
  `topic-rules.json` kuralları `approvalStatus` taşımadığı için bağlansa bile hiçbir olay yönlendirilmez (bilinçli taslak).
- **E-posta politikası ekranda yok:** `admin.js`'te `/email-policy` çağrısı yok; ayrıca "Ayarlar" kaydı her seferinde `email_enabled=0` yapıyor
  (`institution-coordination.mjs:357`). Kurum e-postası arayüzden hiç açılamaz.
- **`/admin/cases` 100 kayıtla sınırlı:** Yönetimdeki "Görevler" sekmesi kurumun eski kayıtlarını göstermiyor (2. aşama).
- **Eşzamanlı aynı yönlendirme:** İki kullanıcı aynı anda aynı kuruma yönlendirirse ikincisi UNIQUE ihlaliyle 500 alır (veri bozulmaz).
- **`institution-event-jobs.mjs:33`:** İş hatası sessizce yutuluyor; hata sınıfı kaydedilmiyor (MD madde 11).
- **Telegram durumu:** `telegram-state.json` gönderilen tüm uyarı kimliklerini sınırsız biriktiriyor.
- `development/institution-coordination/patched-portal-shell.mjs`, canlı `application/server/portal-shell.mjs`'ten yalnız tarayıcı işçisi
  rotasında farklı (geliştirme kopyası yalnız POST, canlı GET+POST). `portal-shell.mjs` bu fork'un kapsamında değil.

## 2. aşama: arayüz notları

- Kurum paneli ve yönetim ekranı, ana uygulamadan bağımsız ayrı stil kullanıyor; tasarım birliği için ortak tema düşünülmeli.
- Yönetim ekranındaki hata metni diyaloğun üstünde tek satır; uzun formlarda görünmeyebilir.
- Kurum panelinde not/durum hatası ayrıntının en altına ekleniyor; kullanıcı görmeyebilir.

## Doğrulama özeti

- `node --check`: tüm `IC/**/*.mjs`, `IC/web/*.js`, `development/institution-coordination/**/*.mjs`, `telegram/*.mjs`.
- `python3 -m py_compile`: `gmail-smtp.py`.
- Mevcut testler (değişiklikten önce ve sonra hepsi geçti): `verify.mjs`, `verify-historical.mjs`, `verify-multi.mjs`,
  `verify-host.mjs`, `verify-jobs.mjs`, `verify-recipients.mjs`, `verify-credentials.mjs`, `verify-gmail.py`,
  `ops/test_sync.py` (yerel geçici test kopyasında depo dosyasına yönlendirilerek; yalnız yerel geçici git depoları).
- Ek geçici testler (yerel geçici test dizini): Telegram botu sahte DB/fetch; yönetici hata eşlemesi ve tek doğrulama.
- Ağ isteği, e-posta veya Telegram gönderimi yapılmadı. Git'te durum değiştiren komut çalıştırılmadı.
