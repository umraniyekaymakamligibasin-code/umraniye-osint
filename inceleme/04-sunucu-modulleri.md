# 04 · application/server, scripts, deploy, drizzle — 1. aşama inceleme raporu

Kapsam dışı bırakılanlar (başka sahipler): `portal-api.mjs`, `portal-shell.mjs`, `portal-records.mjs`, `portal-assets.mjs`, `server/institution-coordination/`.
Git'te durum değiştiren komut çalıştırılmadı. Canlı sisteme istek yapılmadı.

## Düzeltilenler

### S-01 · Yüksek · Konum sözlüğü analizi her çağrıda yüzlerce RegExp ve normalize işlemi üretiyordu
- **Dosya:** `application/server/geo-dictionary.mjs:5-9, 23-30` (+ birebir 4 kopya: `x-shadow/rules/server/`, `facebook-shadow/rules/server/`, `development/facebook-supplement-v2/rules/server/`, `development/x-coverage-v2/rules/server/`)
- **Gözlem:** `analyzeGeoText()` her eşleşmede tüm mahalle adlarını (`geoNormalize` → `toLocaleLowerCase('tr-TR')`) yeniden normalize edip yeni `RegExp` kuruyordu; ayrıca her çağrıda `allNeighborhoods` baştan hesaplanıyordu. Bu fonksiyon olay başına 5–6 kez çağrılıyor (`prioritize`, `applyLocalScopeSafety`, `outsideLocalScope`, `withCorrelation`).
- **Ölçüm (kanıt):** 1500 sentetik haber için `newsRecords + prioritize + applyLocalScopeSafety` (= `/api/config` son işleme yolu, `integrations.mjs:508`) **2114 ms → ~416 ms**. CPU profili: önce `geoFold` 937 ms, `analyzeGeoText` 476 ms; sonra 61 ms / 36 ms.
- **Hata senaryosu:** Önbellek dolunca her `/api/config`, `/api/workspace`, `/api/admin/config` isteği saniyeler süren hesaplama yapıyor → açılış yavaşlığı ve sekme/filtre geçişlerinde bekleme (MD madde 1, 3, 5, 10).
- **Değişiklik:** Biçimler, mahalle desenleri ve genel mahalle listesi `compile()` içinde bir kez hazırlanıyor (sözlük değişince yeniden). Mantık değişmedi.
- **Doğrulama:** Eski/yeni modülle 23.000 rastgele metin + kayıt pasifleştirme/mahalle değişikliği yolu: `analyzeGeoText` ve `outsideLocalScope` çıktıları **birebir aynı (0 fark)**. `node --check` geçti.
- **DİKKAT – başka sahibin dosyası:** `x-shadow/rules-manifest.json`, `facebook-shadow/rules-manifest.json`, `development/facebook-supplement-v2/rules-manifest.json`, `development/x-coverage-v2/rules-manifest.json` içinde `"server/geo-dictionary.mjs"` değeri **`fc8807f6a022c7c927b41bc75f4f8ae7f9ac4e89d9090f64973bef0ebb35580e`** olarak güncellenmeli. Aksi halde `prepare.py` canlıya kurulumdan sonra `shared_filter_version_changed:server/geo-dictionary.mjs` hatasıyla durur.

### S-02 · Yüksek · `/api/config` analizinde eşzamanlı yeniden hesaplama (thundering herd)
- **Dosya:** `application/server/integrations.mjs:281-283, 510`
- **Gözlem:** 10 sn'lik `prioritizedNewsCache` süresi dolunca aynı anda gelen her istek (kullanıcı ekranları, portal hazırlığı, toplayıcı `enqueuePublished`) tüm haber listesini ayrı ayrı yeniden analiz ediyordu (MD madde 10'un integrations katmanındaki karşılığı).
- **Değişiklik:** Süre dolunca tek bir analiz işi paylaşılıyor (single-flight). Geçersiz kılma (`editorialApprove`, anahtar kelime kaydı) artık `invalidatePrioritizedNews()` ile nesil sayacını artırıyor; geçersiz kılınmadan önce başlayan iş sonucu önbelleğe yazmıyor.
- **Doğrulama:** 800 olayla geçici veritabanında `createIntegrations`: tek istek 143 ms, eşzamanlı 5 istek toplam 148 ms (önce ~5 katı), yanıtlar birebir aynı; önbellekli istek 9 ms; `/api/workspace` yolu değişmedi.

### S-03 · Yüksek · Sosyal liste yenilemesi facebook_posts tablosunu indekssiz defalarca tarıyordu (eşzamanlı SQLite → tüm sunucu bloklanıyor)
- **Dosya:** `application/server/browser-research.mjs:175-178, 185`
- **Gözlem:** `buildSocialItems()` URL'leri 100'lük gruplarla `json_extract(data,'$.canonical_url') IN (...)` ile arıyor; indeks yok. `node:sqlite` eşzamanlı olduğu için bu süre boyunca hiçbir HTTP isteği işlenmiyor.
- **Ölçüm:** 3000 satırda 155 ms, 10.000 satırda 538 ms blok (bellekte; diskte daha fazla) → indeksle ~1 ms. İndeks kurulumu 7–23 ms (tek sefer).
- **Değişiklik:** İlk sosyal liste hazırlığında `CREATE INDEX IF NOT EXISTS facebook_posts_canonical_url ON facebook_posts(json_extract(data,'$.canonical_url'))` (hata olursa sessizce sonraki denemeye bırakılır; salt-okunur denetim adaptörünü bozmaz). Drizzle geçişi eklenmedi çünkü `facebook_posts` depodaki geçişlerde yok.
- **Doğrulama:** Geçici DB'de `socialItems()` 1 kayıt döndü, indeks oluştu, `EXPLAIN QUERY PLAN` indeksi kullanıyor.

### S-04 · Orta · Haber okuyucu, akışta duran haberi 48 saat sonra silip yeniden “yeni” sayıyordu
- **Dosya:** `application/server/news-reader.mjs:40-45`
- **Gözlem:** `seen` yalnız ilk görülmede yazılıyordu; kabul edilen/ilgisiz kayıt 48 saat sonra siliniyor, RSS'te hâlâ duruyorsa tekrar `pending` olup detay sayfası yeniden indiriliyordu. Kaynak başına tur bütçesi 4 olduğu için yeni haberlerin okunmasını geciktiriyor (MD “aynı içerik tekrar indirilmez” ilkesi, madde 6'nın haber tarafı). `firstSeenAt` da sıfırlanabiliyordu.
- **Değişiklik:** `lastSeen` alanı; silme süresi akışta son görülmeden itibaren işliyor.
- **Doğrulama:** 4 gün boyunca akışta kalan haber için detay okuma sayısı 2 → 1; akıştan çıktıktan 48 saat sonra kayıt temizleniyor.

### S-05 · Orta · Sosyal Medya Gündemi (`/sosyal-medya`) tarih filtresi ve otomatik yenileme
- **Dosya:** `application/server/social.html:77-83, 369-372` (CRLF satır sonu korundu)
- **Gözlem / senaryo:**
  1. `day()` ve `format()` her çağrıda yeni `Intl.DateTimeFormat` kuruyordu; Bugün/Bu hafta/Bu ay değişiminde kayıt başına çağrılıyor (6000 çağrı: 165 ms → 7 ms) — MD madde 1'in sosyal sayfadaki karşılığı.
  2. Geçersiz tarih (`undefined`/bozuk metin) `RangeError` fırlatıp tüm `draw()`'ı durduruyordu (liste donmuş görünür).
  3. 30 sn'de bir yenileme veri değişmese de listeyi `innerHTML` ile baştan çiziyordu; açık “Kaynakları göster / Gönderi metnini göster” bölümleri kapanıyor, konum bozuluyordu (MD madde 9'un bu sayfadaki karşılığı).
  4. Arama kutusunda her tuşta tüm gruplama yeniden çalışıyordu.
- **Değişiklik:** Biçimleyiciler bir kez kuruluyor; geçersiz tarih güvenli; yanıt metni değişmediyse yeniden çizim yapılmıyor (hata durumundan sonra çiziliyor); aramaya 200 ms gecikme.
- **Doğrulama:** Satır içi betikler `node --check` geçti; tarih yardımcıları ayrı denendi (`undefined`→'', bozuk→'Tarih belirsiz').

### S-06 · Orta · Teslim zamanlayıcısında kayıp uyandırma yarışı
- **Dosya:** `application/server/delivery-scheduler.mjs:9`
- **Senaryo:** Döngü `requested=false` görüp çıktıktan sonra, `finally` `task=null` yapmadan önce gelen `request()` mevcut (bitmekte olan) işi döndürüyor; yeni sosyal kayıtlar için Telegram teslimi bir sonraki tetiklemeye (10 dk'lık tur) kadar gecikebiliyordu.
- **Değişiklik:** `finally` içinde bekleyen istek varsa yeniden başlatılıyor. **Doğrulama:** küçük benzetim; birleştirme davranışı korunuyor, `stop()` sorunsuz.

### S-07 · Orta · Tarayıcı oturum kapatma betiği zaman aşımsız bekleniyordu
- **Dosya:** `application/server/browser-login.mjs:24`
- **Senaryo:** `login-session.py --logout` asılı kalırsa HTTP yanıtı hiç dönmüyor, `http.mjs` aktif istek sayacı (80 sınırı) düşmüyordu.
- **Değişiklik:** 60 sn zaman aşımı + `SIGKILL`, `logout_timeout` hatası.

### S-08 · Orta · Kapanışta `await cycling` reddi işlenmiyordu
- **Dosya:** `application/server/start.mjs:43`
- **Senaryo:** SIGTERM sırasında devam eden tur hata verirse `stop()` işlenmemiş ret ile düşüyor; son yedek ve `DB.close()` atlanıyordu.
- **Değişiklik:** `await cycling?.catch(()=>{})`; `lab.stop()` hatası kaydedilip kapanış sürdürülüyor.

### S-09 · Düşük-Orta · platformSources 80×2000 URL ayrıştırması
- **Dosya:** `application/server/panel-management.mjs:3`
- **Gözlem:** Her tarayıcı işçisi POST/GET'inde ve yönetim ekranında 80 kaynak × 2000 kayıt için `new URL` (ölçüm: 52 ms → 1 ms, eşzamanlı CPU).
- **Değişiklik:** Kayıtlar bir kez gruplanıyor. **Doğrulama:** eski/yeni fonksiyon geçici DB'de birebir aynı çıktı.

### S-10 · Düşük · DHA toplayıcısı her liste sayfasını iki kez indiriyordu
- **Dosya:** `application/server/dha-collector.py:34-46` — `PAGES + PAGES` yerine sayfa başına bir indirme, yalnız hatada bir kez yeniden deneme. Sahte `fetch` ile test edildi.

### S-11 · Düşük · Instagram ön değerlendirme betiği `sourceName: null` kayıtta çöküyordu
- **Dosya:** `application/scripts/instagram-intelligence-v1.py:94` — `item.get('sourceName','').lower()` → `str(... or '')`. `--selftest` geçti.

### S-12 · Düşük · Moderasyon işleminde bozuk JSON 500 dönüyordu
- **Dosya:** `application/server/content-moderation.mjs:117-119` — artık 400 “Geçersiz istek”.

### S-13 · Düşük · Telegram olay kuyruğunda sınırsız özyineleme olasılığı
- **Dosya:** `application/server/telegram-event-queue.mjs:21` — kayıt kaybolduğunda yeniden deneme sayacı aktarılıyor (en fazla 3).

### S-14 · Koordinatör talebi · `integrations.html` (L-02, L-07)
- **Dosya:** `application/server/integrations.html:146, 148`
- “Kaynakları tara” döngüsü `config.totalBatches` varsa onu kullanıyor, yoksa eski hesaba düşüyor; başlıkta e-posta yoksa “Yönetici” gösteriliyor.
- **ÖNEMLİ:** `integrations.html` hiçbir rotada sunulmuyor (depoda tek referans yok; `/yonetim/entegrasyonlar` `src/admin.html` döndürüyor, `integrations.mjs:467`). **Aynı iki kod `application/src/admin.html` içinde de var** (`'Site sahibi'` 1 kez, `Math.ceil(config.sources.length/config.batchSize)` 2 kez) — canlı etki için düzeltme admin.html sahibinde yapılmalı. `integrations.html` ölü dosya olarak kaldırılabilir.

## Açık bulgular (düzeltilmedi)

- **A-01 · Orta · Madde 6 gecikme zinciri (X/Instagram):** tarama aralığı X 300 sn, Facebook 300 sn, Instagram 600 sn (`browser-research.mjs:122`, `scan-pacing-state.mjs:3`), Instagram Graph API 300 sn (`instagram-api-state.mjs:15`) → işçi POST'u → `research.ingest` sosyal önbelleği hemen geçersiz kılıyor (10 sn memo) → `/api/social` (sosyal sayfa 30 sn yoklama). Portal tarafı: `portal-api` 30 sn önbellek + `portal.js` 60 sn yenileme; **sosyal ingest portal önbelleğini geçersiz kılmıyor** (`collector` onBatch yalnız haber turunda `portal.invalidate()` çağırıyor, `start.mjs:30`). Ana gecikme bilinçli tarama aralıkları; ikinci katkı portal önbelleği/yenilemesi (ana oturumun alanı). Öneri: `integrations.mjs:317` sonrasında portal'ı geçersiz kılacak bir kanca.
- **A-02 · Orta · `instagram-targets` yazımı `/opt/umraniye-osint-browser/.instagram-v60/targets.json` (`integrations.mjs:330`):** `install-deneme.sh` birimi `ProtectSystem=strict` + `ReadWritePaths=$data`; sunucuda ek drop-in yoksa yazma her zaman EROFS → 503. Canlıda doğrulanmalı.
- **A-03 · Düşük · `news-thumbnails.mjs:56`:** geçici ağ/DNS hatası da 6 saat “missing” olarak önbelleğe alınıyor.
- **A-04 · Düşük · `dha-collector.py:133`:** aday yoksa istisna atılıyor, `no_match` sağlık durumu hiç yazılamıyor.
- **A-05 · Düşük · `merge-regression.cjs` / `merge-candidate.js`:** test `social.html`'deki `groupItems`'ı `new Function` ile çalıştırıyor ama `groupEventRecords` modül içe aktarımı olduğu için her zaman ReferenceError; `mergeEventGroups` artık kullanılmıyor (ölü/kırık geliştirme betiği).
- **A-06 · Düşük · Sosyal ingest başına tam tablo taramaları:** `browser-research.mjs:63,66,78,113` (`facebookPostId`, `url LIKE '%id%'`, `contentFingerprint`, `max(collected_at)` + `json_extract`). Yalnız yeni gönderilerde çalışıyor; tablo büyükse ifade indeksleri eklenebilir.
- **A-07 · Düşük · `facebook-dedupe.mjs:23` ile `social.html:69` farklı kural:** sunucu yalnız iki sayısal kimlik farklıysa birleştirmeyi atlıyor, istemci “ikisi de sayısal ya da ikisi de değil” durumunda atlıyor. Hangisinin doğru olduğu ürün kararı.
- **A-08 · Bilgi · Kopya sürümleri:** `social-quality.mjs` (2 farklı sürüm: application+facebook kopyaları ≠ x-shadow/x-coverage), `local-scope-policy.mjs` (2 sürüm) — düzenlenmedi.
- **A-09 · Bilgi · Koordinatör notu:** `start.mjs` açılışta `loadCentralKeywords` çağırıyor; `common_keyword_*` / `facebook_*` tablolarını oluşturan geçiş depoda yok (temiz kurulumda “no such table: common_keyword_state”). Ana oturumun `EKSIK-DOSYALAR.md` kaydına referans; burada düzeltilmedi.
- **A-10 · Bilgi · Drizzle:** uygulanmış geçişlerde içerik hatası görülmedi; `lab_items` için yalnız `published_at` indeksi var.

## 3. aşama — güvenlik bulguları (düzeltilmedi)

1. **Yüksek · Alt süreçlere tüm ortam değişkenleri aktarılıyor:** `browser-login.mjs:13,19,24` (`{...process.env}`), `news-thumbnails.mjs:38`, `content-retention.mjs:48` — `OSINT_ADMIN_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `YOUTUBE_API_KEY` güvenilmeyen sitelere giden Chromium/Playwright süreçlerinin ortamına geçiyor. Yalnız gereken değişkenler verilmeli.
2. **Yüksek (yapılandırmaya bağlı) · Oran sınırı tek IP'de toplanabilir:** `http.mjs:28-29` `TRUST_CLOUDFLARE!=='true'` ise tünel arkasındaki tüm kullanıcılar `127.0.0.1` kovasını paylaşır: 240 istek/dk toplam, **25 giriş/15 dk toplam** → bir saldırgan herkesin girişini kilitleyebilir. Canlı env doğrulanmalı.
3. **Orta · `login-browser.sh:15,17`:** `x11vnc -nopw` (localhost) ve depoda iç IP + kullanıcı adı (`ssh ... basin@100.x.x.x`) açık.
4. **Orta · `owner-policy.mjs:2`:** adı koda gömülü sahip için 9 karakter parola istisnası.
5. **Orta · Kurumsal PIN 4 hane** (`institutional-manager.mjs:19-24`): 5 deneme/15 dk kilit; varsayılan PIN değiştirilmemişse risk (`default_pin`).
6. **Orta · CSRF modeli rota bazlı:** `http.mjs:34` yalnız `Sec-Fetch-Site: cross-site` POST'u reddediyor; Origin kontrolü rotalara dağılmış (integrations/moderation/institutional var). Tüm POST rotaları için merkezi Origin kontrolü önerilir.
7. **Düşük · `dha-collector.py`/`dha-preview.py`:** `curl -L` yönlendirmeleri her hosta/protokole izliyor; `--proto =https --max-redirs` eklenmeli.
8. **Düşük · `request-budget.mjs:10`:** 10.000 girişte yeni kimlikler 1–15 dk kapalı (çok IP'li dolum).
9. **Düşük · `safe-feed.mjs:6`:** `192.2/16`, `198.51/16`, `203.0/16` gibi genel aralıkları da engelliyor (aşırı engelleme, güvenlik açığı değil).
10. **Bilgi · `instagram-intelligence-v1.py:101`:** durum dosyası 0644.

## 2. aşama — arayüz notları
- `social-review.html`: onay sonrası `render()` geri bildirimi ve “Onaylanan haberi aç” bağlantısını hemen siliyor; bağlantı yalnız `x.com`, `www.instagram.com`, facebook için gösteriliyor (`twitter.com`, `instagram.com` eksik).
- `social.html`, `institutional.html`, `instagram-targets.html` ayrı satır içi stiller kullanıyor; ortak tasarım sistemiyle birleştirilebilir.
- `integrations.html` ölü dosya.

## İncelenen kapsam
`application/server/*.mjs|*.js|*.cjs|*.py|*.html|*.sql` (portal-* ve institution-coordination hariç; `geo-dictionary-data.mjs` yalnız yapı/sayılar), `application/server/filters/`, `application/scripts/*.py`, `application/deploy/*.sh|*.service` ve `GUVENLIK.md` (diğer .md'ler sır/IP taraması ile), `application/drizzle/*.sql` + `meta/_journal.json`. Kopyalar `shasum` ile karşılaştırıldı.
Doğrulama: tüm `.mjs/.js/.cjs` için `node --check`, `.py` için `py_compile`, HTML satır içi betikleri ayrıştırılıp `node --check`; eşdeğerlik ve davranış testleri yerel geçici test dizininde.
