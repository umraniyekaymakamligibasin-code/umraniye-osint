# 07 — X ve Facebook yardımcı okuyucuları: 1. aşama inceleme raporu

Kapsam: `x-shadow/**`, `facebook-shadow/**` (rules/ hariç; `vendor/fbgql` yalnız güvenlik ve çökme açısından),
`development/x-coverage-v2/**`, `development/facebook-supplement-v2/**`, `development/x-supplement-bridge/**`
(rules/ hariç), `development/reading-quality-v1/facebook/worker.py`, `development/*.md|*.json` (bağlam).

## Sürüm karşılaştırması (kopyalar)

| Dosya | Durum |
| --- | --- |
| `x-shadow/{worker,prepare,coverage,coverage_fixtures,test_coverage}.py`, `adapter.mjs`, `config.example.json`, `rules-manifest.json`, `README.md` ↔ `development/x-coverage-v2/` | Birebir aynıydı; düzeltmeler ikisine de uygulandı, yine birebir aynı. `osint-x-kapsam-v2-kur.py` içindeki base64 yük, düzeltme öncesi sürümle aynı. |
| `x-shadow/backup_publish.py` ↔ `development/x-supplement-bridge/publish.py` | Birebir aynı (değişiklik yapılmadı). |
| `facebook-shadow/{reader,prepare,publish,test_worker,test_publish}.py`, `adapter.mjs`, `test_backend.mjs`, `README.md`, `rules-manifest.json` ↔ `development/facebook-supplement-v2/` | Birebir aynıydı; düzeltmeler ikisine de uygulandı. |
| `facebook-shadow/worker.py` ↔ `development/reading-quality-v1/facebook/worker.py` | Birebir aynı. **`development/facebook-supplement-v2/worker.py` daha eski sürüm** (bütçe ertelemesi, `source_progress`, yeni kimlik sayımı yok). Güncel/doğru olan `facebook-shadow/worker.py`. |
| `development/facebook-supplement-v2/browser-research.next.mjs` | `application/server/browser-research.mjs` ile birebir aynı (kurulu sürüm). |
| `development/x-supplement-bridge/browser-research.next.mjs` | Daha eski sürüm (yalnız X yedeği; Facebook yedeği yok). Tarihsel. |
| Kurulum betiklerindeki base64 yükler | `osint-x-yedek-bagla.py`, `osint-x-servis-erisim-duzelt.py`, `osint-facebook-yedek-kur.py` yükleri depodaki dosyalarla birebir aynı. |

## Düzeltilen hatalar

### D1 — Yüksek — X okuyucusu zaman aşımı ve geçici hatalarda 6 saate kadar susuyordu (Madde 6)
- **Dosya:** `x-shadow/worker.py:95-98, 160-162` (+ `development/x-coverage-v2/worker.py`)
- **Gözlem:** `run()` her `failure` durumunda (erişim hatası olmasa da) `failures` sayacını artırıp `retryAt = now + 600·2^(n-1)` (en çok 21600 sn) yazıyordu. `time_budget_exceeded` (120 sn bütçe dolması, yavaş ağ) ve genel `reader_error` da bu üstel beklemeyi tetikliyordu.
- **Hata senaryosu:** Ağ birkaç tur yavaş → tur 120 sn'yi aşar → 10, 20, 40, 80 dk… 6 saate kadar X yedek okuma hiç çalışmaz; 60 dakikalık tazelik penceresi nedeniyle bu sürede yayınlanan gönderiler kalıcı olarak kaçar. README yalnız "erişim hatasında" bekleme öngörüyor. Kısmi sonuçlar zaten saklanıyor, imleç ilerliyor; zaman aşımı erişim kısıtı değildir (`wait_timeout=0` ile hesap kısıtı `NoAccountError` olarak anında gelir).
- **Değişiklik:** `ACCESS_FAILURES` kümesi (`rate_limited_or_account_unavailable`, `access_error`, `session_inactive`, `session_missing`, `one_independent_account_required`) eklendi; yalnız bunlar beklemeyi büyütür. Zaman aşımı/genel hata sayacı sıfırlamaz ve bekleme yazmaz; normal 7 dakikalık zamanlayıcı ile tekrar dener (tarama sıklığı artmaz).
- **Doğrulama:** `test_coverage.py::test_only_access_failures_pause_reader` eklendi (TimeoutError ve RuntimeError beklemesiz, NoAccountError beklemeli). Eski `worker.py` ile test başarısız (`True != False`), yeni sürümle 10/10 test geçti. `py_compile` geçti.

### D2 — Orta — X eski sayfa (backlog) boşaltmada açlık: taze boşluk hiç okunmayabiliyordu (Madde 6)
- **Dosya:** `x-shadow/coverage.py:82-87` (+ `development/x-coverage-v2/coverage.py`)
- **Gözlem:** Tur başına yalnız bir eski sayfa okunuyor; hangi sorgunun okunacağı `SELECT … WHERE backlog IS NOT NULL` tablo sırasına bağlıydı (`INSERT OR REPLACE` her tur satırları plan sırasıyla yeniden yazıyor).
- **Hata senaryosu:** Yoğun saatte ilçe araması her tur 40 sonuçla dolar ve son 7–10 dakikada yeni bir boşluk bırakır; plan sırasında önce gelen (ör. hesap grubu) sorgunun eski boşluğu varsa her tur o okunur, ilçe aramasının taze boşluğu hiç okunmaz. Boşluktaki gönderiler 60 dk kabul penceresi geçince kalıcı olarak kaçar.
- **Değişiklik:** Bu turun planındaki backlog'lar `max` kimliğine göre azalan sıralanıyor; en yeni boşluk önce okunuyor. Sorgu sayısı değişmedi (yine en çok 1 ek sorgu).
- **Doğrulama:** `test_newest_backlog_gap_drained_first` eklendi; eski kodda `max_id:100` okunduğu için başarısız, yeni kodda geçiyor. Tüm X kapsam testleri (10) geçti.

### D3 — Yüksek — Facebook okuyucusu bütçe/zaman dolunca o kaynakta okunmuş tüm gönderileri atıyordu
- **Dosya:** `facebook-shadow/reader.py:61-98` (+ `development/facebook-supplement-v2/reader.py`)
- **Gözlem:** `BoundedTransport` bütçe/süre dolunca `GuardStop` (BaseException) fırlatıyor. fbgql `_paginate_feed` sayfalama sırasında yalnız `SessionInvalid/RequestRejected/TransportError` yakalayıp "elimdekini koru" diyor; `GuardStop` ise tüm `Scraper.run` zincirini kırıyor ve önceki sayfalarda okunan gönderiler kayboluyordu (`result['posts']=[]`).
- **Hata senaryosu:** Zaman çizelgesi sayfası 3 gönderi döndürür; 12 gönderi için kimlik çözme GET'i + 4 POST gerekir. Tur toplam 40 istekle sınırlı ve sonraki kaynaklara 5–7 istek kalır → 3. sayfadan sonra `request_budget_reached` → 6–9 gerçek gönderi atılır. `worker.py` bu durumu erteleme sayıp turu bitirir ve aynı kaynağı bir sonraki turda yeniden dener; aynı şey tekrarlanır, iki ertelemeden sonra kaynak hiç gönderi vermeden geçilir.
- **Değişiklik:** `runner._append_unique` sarmalanarak biriken liste `BoundedTransport.partial` içinde izleniyor; `GuardStop` veya genel hata sonrası `salvage()` ilk 12 gönderiyi normalize edip sonuca ekliyor (`partial: true`). Bütçe/süre durmasında durum `read_completed` + `stoppedBy` olur (kaynak gerçekten okundu); erişim kısıtı (`rate_limited`, `public_access_blocked`, `human_verification_required`) durum kodu korunur, böylece mevcut bekleme kuralları aynen çalışır. Vendor koduna dokunulmadı.
- **Doğrulama:** `test_worker.py::test_budget_stop_keeps_already_read_feed_pages` eklendi (1. sayfa 3 gönderi, 2. sayfada bütçe durması). Eski reader ile başarısız (`'request_budget_reached' != 'read_completed'`), yeni sürümle geçiyor. Ağ erişimi kapalıyken 18 Facebook testi geçti.

### D4 — Düşük — Facebook yayımlayıcısında kopyala-yapıştır: yedek kaynak adı "X"
- **Dosya:** `facebook-shadow/publish.py:40` (+ `development/facebook-supplement-v2/publish.py`)
- **Gözlem / senaryo:** `sourceName` ve `author` boşsa Facebook kaydı "X" kaynak adıyla gönderiliyordu.
- **Değişiklik:** Varsayılan `'Facebook'`. **Doğrulama:** `test_publish.py` 4/4 geçti.

### D5 — Orta — `facebook-shadow/test_reader.py` eskimişti ve canlı Facebook isteği yapıyordu
- **Dosya:** `facebook-shadow/test_reader.py:12, 18, 20`
- **Gözlem:** Test, bütçe tavanını 6 varsayıyordu; güncel varsayılan 8 olduğu için `requests_made=6` bütçe hatası üretmiyor ve test **gerçek** `https://www.facebook.com` isteği yapıyordu. `normalized()` testleri `source_id` olmadan çağrıldığı için `KeyError`.
- **Değişiklik:** Testte `max_requests=6` açıkça ayarlandı; kaynak sözlüklerine `source_id` eklendi.
- **Doğrulama:** Soket bağlantısı kapatılmış süreçte 18 test geçti.
- **Bildirim:** İnceleme sırasında bu eski test bir kez çalıştırıldı ve yerel bilgisayardan `https://www.facebook.com/` adresine **bir adet anonim GET isteği** gitti (oturum/çerez yok). Test düzeltildi; sonraki tüm çalıştırmalar ağ kapalıyken yapıldı.

## Açık kalan hatalar / riskler (düzeltilmedi)

### A1 — Orta — X kural kopyaları eski: canlı kabulün kabul edeceği gönderiler X'te eleniyor (Madde 6)
- `x-shadow/rules/server/local-scope-policy.mjs` ve `social-quality.mjs` (+ `development/x-coverage-v2/rules/…`) `rules-manifest.json`'daki onaylı özetle **eşleşmiyor**; uygulamadaki yeni sürümlerde bulunan `sourceNeighborhoodContext` (kayıtlı mahalle kaynağından ilçe çıkarımı) eksik. `prepare.py` yalnız `application/` dosyalarının özetini kontrol ediyor, `adapter.mjs` ise denetlenmeyen yerel kopyaları içe aktarıyor.
- Sonuç: X yedeği bu kurala dayalı gönderileri `district_context_missing` ile eliyor; yayımlayıcıya hiç gelmiyor.
- Öneri (rules sahibi + ana oturum): uygulamadaki `local-scope-policy.mjs`, `social-quality.mjs`, `social-source-context.mjs` dosyalarını X kopyalarına aktarmak; X `prepare.py` de Facebook'taki gibi `social-source-context.json` dışa aktarmalı ve `worker.adapter()` `DATA_DIR` vermeli; ardından `prepare.py` yerel kopyaların özetini de doğrulamalı. Yerel kopya doğrulaması kopyalar eşitlenmeden eklenirse X okuyucusu tamamen durur.

### A2 — Orta — Kural dosyası değişikliği yardımcı okuyucuları sessizce durdurur (Madde 6, süreç riski)
- `application/server/{central-keywords,geo-dictionary,geo-dictionary-data,local-scope-policy,social-quality,…}.mjs` ve `src/intelligence.js` değişip `x-shadow/facebook-shadow` `rules-manifest.json` + `rules/` kopyaları aynı anda güncellenmezse `ExecStartPre=prepare.py` `reviewed_filter_version_changed` / `shared_filter_version_changed` ile düşer; `ExecStartPost` yayımlayıcı da çalışmaz → X ve Facebook yedek akışı tamamen durur.
- Not: Bu inceleme sırasında başka bir fork `geo-dictionary.mjs` ve `intelligence.js` dosyalarını değiştiriyor; son kontrolde `geo-dictionary.mjs` için hem uygulama hem kopya manifestle eşleşmiyordu. Birleştirme öncesi manifest/kopya/uygulama üçlüsünün eşleştiği doğrulanmalı ve sunucuya birlikte kurulmalı.

### A3 — Orta — Zamanlayıcılar kurulumda yalnız taze gönderi doğrulanırsa etkinleşiyor (Madde 6)
- `osint-x-yedek-bagla.py`, `osint-x-servis-erisim-duzelt.py`, `osint-facebook-yedek-kur.py` zamanlayıcıyı ancak kurulum anında taze ve depolanmış gönderi doğrularsa etkinleştiriyor; aksi halde timer/drop-in siliniyor ve okuma yalnız elle çalışıyor. Sunucuda `systemctl list-timers 'umraniye-osint-*'` ile X (`umraniye-osint-x-twscrape-deneme.timer`) ve Facebook zamanlayıcılarının etkin olduğu doğrulanmalı.

### A4 — Düşük — `x-shadow/test_shadow.py` eskimiş (v1 beklentileri)
- `test_old_reader_busy_is_only_deferred` v2'de kaldırılmış `deferred_existing_x_round` davranışını, `test_query_rotation…` eski plan biçimini bekliyor → 2 başarısız test. `worker.old_busy()` ve `worker.quoted()` kullanılmayan kod. Kurulumlar `test_coverage.py` kullanıyor; test dosyası güncellenmeli veya kaldırılmalı.

### A5 — Düşük — Depodaki Facebook servis birimi zaman aşımı çalışma bütçesinden kısa
- `facebook-shadow/umraniye-osint-facebook-fbgql-deneme.service` `TimeoutStartSec=100`; worker döngüsü 110 sn + adaptör (20 sn) çalışabiliyor. Kurulu sistemde drop-in `TimeoutStartSec=240` ile eziliyor; depo birimi tek başına kurulursa turlar öldürülür.

### A6 — Düşük — Gölge `posts` tabloları sınırsız büyüyor
- X `shadow.sqlite/posts` ve Facebook `posts` tablolarında saklama/silme yok (adaylar 72 saatte siliniyor, kabul edilenler değil). Yayımlayıcılar en yeni 2000 satırı okuyor; uzun vadede disk/yavaşlama.

### A7 — Düşük — Kilit hatası rapor yazmadan çöküyor
- `backup_publish.py:57`, `facebook-shadow/publish.py:64`, `facebook-shadow/worker.py:37`: `fcntl.flock(LOCK_NB)` `try` dışında; eşzamanlı elle çalıştırmada traceback ile çıkılır, `report.json` güncellenmez.

### A8 — Düşük — Facebook `author` alanı sayfa adı yerine sayfa URL'si
- `reader.normalized()` `post.page_name` kullanıyor; fbgql bunu `job.page` (URL) ile dolduruyor. Arka uç `sourceName`'i veritabanından aldığı için görünür etki sınırlı.

### A9 — Bilgi — Kurulum betiklerindeki base64 yükler artık eski
- `osint-x-kapsam-v2-kur.py`, `osint-facebook-yedek-kur.py` vb. tek seferlik ve `EXPECTED` özet kontrolüyle korunuyor; bu düzeltmelerden sonra yükleri eski sürümü içeriyor. Yeniden çalıştırılmamalı; sunucuya kurulum yeni bir kurulum adımıyla yapılmalı.

## Madde 6 — X verisinin geç görünmesi: bu alandaki gecikme zinciri

1. **Zamanlayıcı:** `collector.timer` `OnUnitInactiveSec=7min` + `RandomizedDelaySec=30` → bir önceki tur bittikten 7–7,5 dk sonra; tur süresi en çok ~2,5 dk → döngü ~7,5–10 dk. (Zamanlayıcının kurulu olduğu sunucuda doğrulanmalı — A3.)
2. **Hazırlık:** `prepare.py` (root) anlık görüntü + kural özet kontrolü. Uygulama kuralları değişince burada tamamen durur (A2).
3. **Okuma:** Tur başına ≤6 arama + 1 eski sayfa; 4×4 hesap (dönüşümlü), bir anahtar kelime grubu (gruplar dönüşümlü → her grup ancak N turda bir), her turda ilçe araması; sorgu başına 40 sonuç; 120 sn bütçe.
   - **Düzeltildi:** zaman aşımı/geçici hatada 6 saate kadar susma (D1); yoğun saatte taze boşluğun okunmaması (D2).
4. **Eleme:** `adapter.mjs` 60 dk tazelik + kurallar. **Açık:** eski X kural kopyaları canlı kabulden daha katı (A1).
5. **Yayımlama:** `ExecStartPost` ile publisher hemen tetiklenir; tur başına ≤20 gönderi, 60 dk penceresi; worker çıkış kodu 1 ise (snapshot/adaptör hatası) yayımlayıcı çalışmaz.
6. **Arka uç kabulü:** `browser-research.mjs` yine ≤60 dk ve güncel kurallarla kabul eder, `lab_items`'a yazar. Panel tarafında portal önbelleği (30 sn) ve istemci yenilemesi (60 sn) başka fork'ların kapsamında.

Tarama sıklığı, sorgu sayısı ve sonuç sınırları değiştirilmedi.

## 3. aşama için güvenlik bulguları (düzeltilmedi)

- **G1 — Yüksek — Root ön adımında sembolik bağlantı saldırısı:** `x-shadow/prepare.py:51-56` ve `facebook-shadow/prepare.py:20,25` (`ExecStartPre=+…`, root) servis kullanıcısının yazabildiği durum dizinine öngörülebilir adlarla (`snapshot.tmp`, `service-observation.json`, `social-source-context.tmp`) yazıyor; `os.chown` sembolik bağlantıyı izliyor. Güvenilmeyen uzak içeriği işleyen düşük yetkili okuyucu kullanıcısı ele geçirilirse bu dosyaları `/etc/...` hedefine bağlayarak root olarak dosya yazdırma/sahiplik değiştirme mümkün. Öneri: `O_NOFOLLOW|O_EXCL` ile dizin fd'si üzerinden yazma, `follow_symlinks=False`, ya da çıktıyı root'a ait dizine yazıp salt okunur bağlama.
- **G2 — Orta — Yayımlayıcılar root çalışıyor:** `development/x-supplement-bridge/publish.service`, `development/facebook-supplement-v2/publisher.service` `User=root` (`CAP_DAC_READ_SEARCH`). Anahtar ve ana veritabanını grup okumasıyla ayrı bir kullanıcıya vermek yeterli.
- **G3 — Orta — Tedarik zinciri:** `facebook-shadow/install.py:30-36` `get-pip.py`'yi özet doğrulaması olmadan indirip root kurulumunda çalıştırıyor; `requirements.lock` dosyaları `--require-hashes` olmadan kuruluyor (X dahil).
- **G4 — Düşük — Bütünlük denetimi yanlış dosyayı kontrol ediyor:** `prepare.py` uygulama dosyalarını doğruluyor, `adapter.mjs` doğrulanmayan `rules/` kopyalarını yüklüyor (A1 ile aynı kök).
- **G5 — Düşük — X oturum çerezleri düz metin:** `accounts.sqlite` (twscrape) `auth_token`/`ct0` saklıyor (0600, 0700 dizin). Disk/yedek şifrelemesi ve yedek kapsamı değerlendirilmeli.
- **G6 — Düşük — systemd sertleştirme eksikleri:** okuyucu birimlerinde `CapabilityBoundingSet=` (boş), `PrivateDevices`, `ProtectKernelTunables/Modules/Logs`, `ProtectControlGroups`, `RestrictNamespaces`, `LockPersonality`, `SystemCallFilter=@system-service` yok.
- **G7 — Düşük — Kullanılmayan vendor modülleri:** `vendor/fbgql/{mint,capture,cli,doctor}.py` (Selenium ile oturum/çerez kaydetme) okuyucu tarafından kullanılmıyor; dağıtımdan çıkarılabilir. `FBGQL_DOC_ID_*` ortam değişkenleri sorgu kimliklerini değiştirebilir (birim ortamı kontrol altında).
- Vendor kodunda `eval/exec/pickle/subprocess/shell` kullanımı yok; okuyucu anonim, çerezsiz, yalnız `https://(www.)facebook.com:443`, yönlendirmesiz ve vekilsiz istek yapıyor (doğrulandı).

## Çalıştırılan doğrulamalar

- `python3 -m py_compile` — değiştirilen tüm `.py` dosyaları.
- X: `test_coverage.py` 10/10 (yeni 2 test dahil; her ikisi eski kodda başarısız).
- Facebook: `test_reader.py` + `test_worker.py` + `test_publish.py` 18/18, soket bağlantısı engelli süreçte.
- Arka uç: `facebook-shadow/test_backend.mjs` uygulamanın geçici kopyasındaki `browser-research.mjs` ile PASS; `test_service_routes.mjs` PASS; X `test_publish.py` 4/4.
- `x-shadow/test_shadow.py`: twscrape yerelde kurulu değil (3 hata) + 2 eskimiş test (A4).

## Değişen dosyalar

`x-shadow/worker.py`, `x-shadow/coverage.py`, `x-shadow/test_coverage.py`,
`development/x-coverage-v2/{worker,coverage,test_coverage}.py`,
`facebook-shadow/reader.py`, `facebook-shadow/publish.py`, `facebook-shadow/test_worker.py`, `facebook-shadow/test_reader.py`,
`development/facebook-supplement-v2/{reader,publish,test_worker}.py`. Satır sonları (CRLF/LF) korundu. Commit yapılmadı.

## İncelenen kapsam

Satır satır: `x-shadow/*` (worker, coverage, prepare, session, backup_publish, adapter, testler, servis, README, config),
`facebook-shadow/*` (worker, reader, prepare, publish, install, adapter, testler, servis, README, test-report),
`facebook-shadow/vendor/fbgql/{__init__,scraper,runner,policy,errors,auth,parsing (gönderi ayrıştırma bölümü),models (Post/Result),config (başlık/doc_id),transport/base,transport/sync_http,engine/base,engine/__init__,progress}`; `mint/capture/cli/doctor` güvenlik taraması (grep + başlıklar); `engine/threaded`, `engine/asyncio_engine`, `transport/async_http`, `dates`, `payloads` yalnız posts-only yolunda kullanılmadıkları doğrulanarak tarandı.
`development/x-coverage-v2/*`, `development/facebook-supplement-v2/*`, `development/x-supplement-bridge/*` (kurulum betikleri, timer/servis/drop-in, testler, browser-research.next farkları), `development/reading-quality-v1/facebook/worker.py`, `development/*.md`, `development/*.json`.
