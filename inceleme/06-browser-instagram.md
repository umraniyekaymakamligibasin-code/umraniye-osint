# 06 — browser, instagram-api, instagram-media, development/reading-quality-v1, development/instagram-date-lineage

İnceleme: 1. aşama (hata). Güvenlik bulguları düzeltilmedi, 3. aşama için listelendi.
Doğrulama ortamı: Python 3.11, ağ yok, tarayıcı/scraper çalıştırılmadı. Sahte sayfa/istemci ile izole testler
yerel geçici test dizini altında.

Önemli not: `browser/collector.py`, `browser/x_reader_v1.py`, `browser/social_reader_repair.py` ve bazı diğer browser dosyaları
**CRLF** satır sonu kullanıyor. Düzenlemelerde CRLF korundu (diff yalnız değişen satırları gösteriyor).

## Düzeltilen bulgular

### B1 — Yüksek — X bildirim okuyucusu 30 sn'de iptal edilince tüm işi kayboluyor
- **Dosya:** `browser/collector.py:702-707`, `browser/x_reader_v1.py:42-48, 77, 95, 132`
- **Gözlem:** `read_x_notifications()` iç bütçesi 60 sn kaydırma + 90 sn toplam olarak yazılmış (en az 20 kaydırma, 4 kart açma,
  8 ayrıntı okuma). Çağıran taraf ise `asyncio.wait_for(..., timeout=30)` ile 30 sn'de iptal ediyor.
- **Hata senaryosu:** Okuyucu 30 sn'yi aştığında (20 kaydırma + kart açma tipik olarak 25–55 sn) iptal edilir: o ana kadar okunan
  gönderiler (`posts` yerel sözlüğü) döndürülmez, `pending/frontier/seenCards` durum dosyası hiç yazılmaz. Sonraki tur aynı işi
  baştan yapar ve yine iptal edilir. Bildirim kaynaklı X içerikleri (mention/yanıt) panele hiç ya da çok geç ulaşır. Günlükte
  `x_notifications_budget_reached` olayı olarak görünür.
- **Değişiklik:** Okuyucuya isteğe bağlı `deadline` (monotonic) parametresi eklendi. Kaydırma, kart açma ve ayrıntı okuma bu
  sınıra göre erken biter; durum her durumda kaydedilir ve okunan gönderiler döndürülür. Toplayıcı yine 30 sn yumuşak bütçe
  veriyor (X turunun kalan süresine göre kısalabilir); sert `wait_for` sınırı yalnız yarıda kalmış tek sayfa işlemi için +20 sn
  ve mevcut 150 sn X tur bütçesinin içinde kalacak şekilde hesaplanıyor. Tarama sıklığı ve platforma giden istek türleri
  değişmedi.
- **Doğrulama:** `f06/test_xreader.py` (sahte Page): deadline ile çağrı birkaç saniyede bitiyor, durum dosyası yazılıyor.

### B2 — Yüksek — X bildirim bekleyen bağlantı kuyruğu dolunca yeni bağlantılar hiç girmiyor
- **Dosya:** `browser/x_reader_v1.py:126-127, 140-143`
- **Gözlem:** `pending = existing | fresh[:2000-len(existing)]`. Kuyrukta 2000 kayıt varsa yeni bağlantı eklenmiyordu.
  Okunamayan bağlantılar (silinmiş/korumalı gönderi) 3 denemeden sonra 15 dk ertelenip sonsuza kadar yeniden deneniyordu;
  kuyruktan hiç çıkmıyordu.
- **Hata senaryosu:** Kalıcı okunamayan bağlantılar birikip kuyruğu 2000'e doldurur → yeni bildirim bağlantıları kalıcı olarak
  dışarıda kalır, her tur yalnız eski bağlantılar denenir (kuyruk takılması, Madde 6).
- **Değişiklik:** Kapasite aşıldığında en yeni 2000 bağlantı tutuluyor (kimliğe göre sıralı, eskiler düşüyor). 6 başarısız
  denemeden sonra bağlantı bırakılıyor (`done` kümesine alınıyor; günlükte `detailReadAbandoned`).
- **Doğrulama:** `f06/test_xreader.py`: 2000 eski kayıtlı kuyrukta yeni bağlantılar giriyor; 6. hatada bağlantı çıkıyor.
  Aynı test orijinal dosyada `AssertionError: new links must enter a full queue` ile kalıyor.

### B3 — Yüksek — Instagram Graph API işçisi 1 saatten geç bulunan gönderiyi kalıcı olarak atıyor
- **Dosya:** `instagram-api/worker.py:19-22, 199, 209` (aynısı `development/reading-quality-v1/instagram/worker.py`)
- **Gözlem:** `remember()` keşif anında 1 saatten eski gönderiyi `stale` işaretliyor, `drain()` de 1 saati geçen bekleyeni
  `stale` yapıyor; `stale` hiç gönderilmiyor. Oysa panel Instagram için 3 saatlik pencere kullanıyor:
  `application/server/integrations.mjs:242` (Instagram bildirimi 10 800 000 ms), `:107` (onaylı Instagram için 3 saat),
  `application/scripts/instagram-intelligence-v1.py` (`older_than_3h_no_replay`), `instagram-media/scanner.py MAX_AGE=3*3600`,
  tarayıcı Instagram okuyucusunun penceresi en az 3 saat.
- **Hata senaryosu:** İşçi her turda 13 etkin kaynaktan yalnız 3'ünü okuyor; bir kaynak ancak birkaç turda bir okunuyor
  (ayrıca hatalı kaynaklar geri çekiliyor). Yayından 1–3 saat sonra bulunan gönderi panele hiç gelmiyor. Kullanıcıya
  "Instagram verisi geç/hiç gelmiyor" olarak yansır.
- **Değişiklik:** `FRESH_SECONDS = 3 * 3600` sabiti eklendi ve iki yerde kullanıldı. Taban çizgisi (`enabledSince`),
  açık onay zorunluluğu ve 3 saatten eski içeriği göndermeme koruması korunuyor.
- **Not (inceleyene):** Bu bir pencere değişikliğidir. Gerekçe panelin kendi 3 saatlik Instagram kuralıyla hizalanmasıdır.
  1 saat bilinçli bir ürün kararıysa yalnız sabitin değeri geri alınabilir.
- **Doğrulama:** `tests/test_quality.py` güncellendi: eski içerik testi pencereye bağlandı, `test_post_discovered_two_hours_late_is_still_delivered`
  eklendi. 29/29 test geçiyor; yeni test orijinal işçide başarısız.

### B4 — Orta — Meta API hız sınırı beklemesinde zaten okunmuş gönderiler de panele gönderilmiyor
- **Dosya:** `instagram-api/worker.py:266-272` (ve kopyası)
- **Gözlem:** Global API beklemesi (kod 4/17/32/613, 1 saat) sırasında `run()` erken dönüyor ve `drain()` hiç çağrılmıyor.
  `drain()` Meta'ya değil yalnız yerel panel köprüsüne istek atar.
- **Hata senaryosu:** Önceki turda okunan ama köprü geçici kapalı olduğu için teslim edilemeyen gönderiler, Meta beklemesi
  bitene kadar (1 saat) bekler; eski 1 saatlik pencereyle bu süre içinde `stale` olup kaybolurdu.
- **Değişiklik:** Hız sınırı beklemesinde bir kez `drain()` çağrılıyor (Meta isteği yok). Belirteç yenileme
  (`authRequired`) durumunda davranış değişmedi; panelde `login_required` durumu korunuyor.
- **Doğrulama:** `test_meta_rate_limit_pause_still_delivers_read_posts` (API çağrılmıyor, gönderi `acknowledged`),
  `test_token_pause_keeps_login_status_without_delivery`. İlki orijinal işçide başarısız.

### B5 — Orta — instagram-media tarayıcısı geri çekilmede sıradaki hesapları atlıyor
- **Dosya:** `instagram-media/scanner.py:232-233, 251, 316-318`
- **Gözlem:** `choose_accounts()` imleci 4 hesap ileri alıyor; tarama ilk hesaplarda hız sınırı/challenge görürse döngü
  `break` ediyor ve imleç yine 4 ileri kaydediliyor.
- **Hata senaryosu:** 2. hesapta hız sınırı → 3. ve 4. hesaplar hiç okunmadan bir tam döngü (+1 saat bekleme) sonrasına kalıyor.
- **Değişiklik:** İmleç her hesaptan sonra yalnız denenen hesabın ötesine kaydediliyor.
- **Doğrulama:** `f06/test_scanner.py`: 6 hesap, 2.'de `RateLimitError` → imleç 2 (orijinalde 4).

### B6 — Düşük/Orta — Ortak inceleme dosyası kilitsiz yazılıyor (kayıp güncelleme)
- **Dosya:** `instagram-media/scanner.py:146-173`
- **Gözlem:** `/var/lib/umraniye-osint-deneme/instagram-review.json` dosyasını tarayıcı okuyucusu
  (`social_reader_repair.review`) ve `review_retention.py` `instagram-review.lock` kilidiyle yazıyor; scanner kilitsiz
  oku-değiştir-yaz yapıyordu.
- **Hata senaryosu:** Eşzamanlı yazımda bir tarafın eklediği inceleme kaydı sessizce kaybolur ya da temizlenen kayıt geri gelir.
- **Değişiklik:** Aynı kilit dosyası `O_NOFOLLOW` ile açılıp `flock` altında yazılıyor.
- **Doğrulama:** `f06/test_scanner.py`: 40 eşzamanlı yazımda 40 kayıt korunuyor. `scanner.py selftest` geçiyor.

## Madde 6 — gecikme zinciri (koddan çıkarılan)

### X (tarayıcı toplayıcı, `umraniye-osint-browser.timer`)
| Aşama | Kod | Gecikme kaynağı |
| --- | --- | --- |
| T0 yayın | — | — |
| T1 tur başlangıcı | `application/deploy/install-browser.sh`, `update-stability.sh` | Zamanlayıcı 5 dk (`OnUnitActiveSec=5min`). Tek `collector.py` çağrısı tüm sağlayıcıları **sırayla** okur (X ≤150 sn, Facebook ≤100 sn, Instagram ≤80 sn, toplam 260 sn). `browser-global` kilidi nedeniyle panelden tetiklenen tarama veya giriş ekranı (en çok 20 dk) bu turu bekletir/atlatır. |
| T2 okuma | `social_reader_repair.source_plans` | Turda 2 doğrudan X kaynağı (imleçle döner), 1 arama, bildirimler. N kaynak varsa bir kaynak ~⌈N/2⌉×5 dk'da bir okunur. 429 → 15 dk–6 sa, geçici hata → 1–10 dk soğuma (`Health`). |
| T3 bildirimler | `x_reader_v1.read_x_notifications` | **B1/B2 düzeltildi** (iptalle iş kaybı, dolu kuyruk). |
| T4 ön filtre + kuyruk | `collector.cleaned`, `x_search_queue` | Yerel bağlam/anahtar kelime filtresi; kuyruk turda en çok 20 gönderi, 58 KB yük sınırı (uzun gönderilerde daha az). |
| T5 teslim | `collector.run` sonu | X sonuçları **turun sonunda**, Facebook ve Instagram okumaları bittikten sonra tek POST ile gönderilir (1,5–4 dk ek bekleme). Onaylanmayan sonraki tura (+5 dk) kalır. **Açık:** sağlayıcı başına teslim önerisi aşağıda. |
| T6 sunucu | `application/server/browser-research.mjs ingest` | Kapsam/kalite filtresi, `deliveryRefresh`, portal önbelleği (başka fork). |

### Instagram (üretimde Graph API işçisi)
| Aşama | Kod | Gecikme kaynağı |
| --- | --- | --- |
| T1 tur | `instagram-api/worker.py run` | Turda 3 kaynak (en uzun süredir denenmeyen önce). 13 kaynakla bir kaynak ~5 turda bir okunur. Zamanlayıcı birimi depoda yok; gerçek aralık sunucuda ölçülmeli. 110/2207013 alan kaynak 24 sa bekler. |
| T2 kayıt | `remember` | **B3 düzeltildi**: 1–3 saat geç bulunan gönderi atılıyordu. |
| T3 teslim | `drain` | Aynı turun sonunda, ≤20 gönderi/≤50 KB, en çok 4 gönderim, 185 sn sınırı. **B4 düzeltildi**: Meta beklemesinde teslim duruyordu. Belirteç süresi dolunca teslim hâlâ durur (panel durumunu korumak için bilinçli). |
| T4 sunucu | aynı | — |

### Instagram (tarayıcı yedeği ve instagram-media)
- Tarayıcı Instagram okuyucusu turun en sonunda çalışır; X+Facebook 260 sn bütçeyi doldurursa `remaining<=5` ile hiç
  çalışmaz (`collector.py:833-835`). Turda en çok 1–2 profil, profil başına 4 gönderi, 37 sn.
- instagram-media: turda 4 hesap; **B5/B6 düzeltildi**.

### Açık öneriler (ölçüm gerektirir, bu PR'da yapılmadı)
1. `collector.run()`: X/Instagram sonucunu kendi okuması bitince ayrı POST ile teslim etmek (sunucu `ingest` sonuçları
   hesap bazında işliyor). X içerikleri 1,5–4 dk erken görünür. Tur raporu ve makbuz işleme yeniden düzenlenmeli; canlı
   doğrulama gerektirir.
2. Bildirim okuyucusuna 30 sn yerine X turunun kalan süresini vermek (ürün kararı; okuma yükünü artırır).
3. `x_search_queue` bekleyen sözlüğü sınırsız ve yaşlandırma yok; giriş akışı çıkıştan büyükse eski adaylar FIFO
   yuvalarını kullanır. Pratikte yerel filtre nedeniyle düşük risk; ölçülmeli.
4. Instagram API zamanlayıcı aralığı ve kaynak başı tekrar okuma süresi canlıda ölçülmeli (`source_progress.last_attempt`).

## Açık kalan / bilgi notları (düzeltilmedi)

| Önem | Dosya:satır | Not |
| --- | --- | --- |
| Düşük | `browser/collector.py:593-595, 643-679, 719-770` | `collect()` Facebook'u `facebook_public_v5`'e yönlendiriyor; Facebook dalları ve `facebook_click_reader.py` (dateparser bağımlılığıyla) erişilemez ölü kod. |
| Düşük | `browser/social_reader_repair.py:894-1014` | `read_instagram` içinde `return` sonrası erişilemez kod; tanımsız `ig_v56_allowed` kullanıyor (çalışsa `NameError`). |
| Düşük | `browser/facebook_live_v4.py:254-303` | `collect_facebook` (v4) kullanılmıyor; v5 kullanılıyor. |
| Düşük | `browser/facebook_public_v5.py:40-41` | `context.route()` hata verirse açılan Chromium bağlamı kapatılmaz (try dışında). Çok nadir. |
| Düşük | `browser/scan_pacing.py:10-12`, `source_checkpoints.py:10-12` | Bozuk durum dosyası `ValueError` ile kalıcı hata verir (bilinçli "fail closed"); dosyalar atomik yazıldığı için düşük olasılık. |
| Bilgi | `development/reading-quality-v1/osint-okuma-kalite-kur.py:5` | Kurulu (2026-11-13) tek seferlik kurucu; gömülü BUNDLE eski Instagram işçisini içerir. Yeniden çalıştırılırsa sürüm karması uyuşmadığı için kurmayı reddeder (güvenli). |
| Bilgi | `development/instagram-date-lineage/intelligence.py` | `application/scripts/instagram-intelligence-v1.py` + `date_evidence.py` (gömülü) + `--date-audit` + `_historicalDateRecovery` reddi. Henüz canlıya kurulmamış (`verification.json: liveInstalled=false`). Kalan fark yok. |
| Düşük | `development/instagram-date-lineage/intelligence.py:164-168` (ve `application/scripts/instagram-intelligence-v1.py`, başka fork) | `status_write` atomik değil (`O_TRUNC`); okuyucu yarım JSON görebilir. |

### Başka fork'ların dosyalarında görülenler
- `application/server/integrations.mjs:316`: köprüye gelen **her GET** `facebook.scan()` tetikliyor. Instagram API işçisi bir
  turda birden çok GET yapıyor (`panel_enabled`, her `submit`). `facebook.scan()` kendi içinde sınırlamıyorsa gereksiz tarama.
- `application/deploy/install-browser.sh:66`: zamanlayıcı açıklaması "every ten minutes", değer 5 dk.
- `application/scripts/instagram-intelligence-v1.py`: `status_write` atomik değil (yukarıda).
- Instagram API ve instagram-media için systemd servis/zamanlayıcı dosyaları depoda yok; gerçek çalışma aralığı doğrulanamadı.

## 3. aşama — güvenlik bulguları (düzeltilmedi)

| Önem | Dosya:satır | Bulgu | Öneri |
| --- | --- | --- | --- |
| Yüksek | `browser/login-native.py:34-35`, `login-session.py:23-24`, `login-browser.sh:15-16` | `x11vnc -nopw` (parolasız) 127.0.0.1:5901/5902 ve websockify 127.0.0.1:6080. Sunucudaki herhangi bir yerel süreç/kullanıcı, oturum açık sosyal medya tarayıcısını izleyip kontrol edebilir. | `-rfbauth`/`-unixsock` + izinli Unix soketi; websockify'ı Unix sokete bağlamak; panel vekilinin yetki kontrolünü doğrulamak (`application/server/browser-proxy.mjs`). |
| Düşük | `browser/login-browser.sh:17` | Depoda iç ağ (Tailscale) IP adresi ve SSH kullanıcı adı. | Belgeye/ortam değişkenine taşımak. |
| Orta | `instagram-media/scanner.py:179-204` | Resmî olmayan özel API (instagrapi) ile kişisel hesap parolası etkileşimli giriliyor; oturum ayarları (`session.json`, oturum çerezleri) diskte. 0600 ve atomik yazılıyor; parola anahtarları temizleniyor. Hesap kapatma/hizmet şartı riski. | Kullanım politikası kararı; dosya dizini izinlerini kurulumda zorlamak. |
| Düşük | `browser/collector.py:578-590` | `network_guard` DNS kontrolü ile Chromium'un kendi çözümlemesi arasında DNS yeniden bağlama (TOCTOU) penceresi. Alan adı izin listesi riski büyük ölçüde sınırlıyor. | Bilgi notu. |
| Düşük | `instagram-api/publish_status.py:20-28` | Root olarak çalışır; `DEST.parent` sembolik bağ kontrolü ile `chown` arasında yarış. Dizin `/var/lib` altında, servis kullanıcısı yazamıyorsa sömürülemez. | `os.open(..., O_NOFOLLOW|O_DIRECTORY)` + `fchown`. |
| Bilgi | `browser/social_reader_repair.py:43-45`, `instagram-media/scanner.py:163` | İnceleme dosyalarında gönderi tam metni (kişisel veri olabilir) saklanıyor; `review_retention.py` temizliği var. | KVKK saklama süresinin belgelenmesi. |
| Bilgi | `instagram-api/worker.py:87, 45` | Belirteç URL yerine `Authorization` başlığında; Meta hata mesajı dosyaya yazılmıyor. Olumlu. | — |

## İncelenen kapsam

Satır satır okundu: `browser/` altındaki 22 dosyanın tamamı (collector, social_reader_repair, x_reader_v1, x_search_queue,
scan_pacing, source_checkpoints, session_recovery, reader_resources, public_dns, bridge_payload, loopback_bridge,
facebook_public_v5, facebook_live_v4, facebook-media-v6, facebook_access_v63, facebook_reels_normalize,
facebook_click_reader (ölü kod, Python kısmı ve JS özeti), instagram_publication, ig_allowlist_v60, review_retention,
login-native, login-session, login-browser.sh); `instagram-api/worker.py`, `publish_status.py`;
`instagram-media/scanner.py`; `development/reading-quality-v1/` (instagram/worker.py, reading_audit.py,
osint-instagram-tarih-kaybi-incele.py, tests/test_quality.py, README, verification.json; kurucunun gömülü BUNDLE'ı
açılıp dosya karmaları depo dosyalarıyla karşılaştırıldı); `development/instagram-date-lineage/` (tümü; kurucu BUNDLE'ı
içerik olarak açılmadı, kod akışı okundu). `development/reading-quality-v1/facebook/worker.py` başka fork'a ait, yalnız test
için yüklendi.

Değişen dosyalar: `browser/collector.py`, `browser/x_reader_v1.py`, `instagram-api/worker.py`,
`development/reading-quality-v1/instagram/worker.py`, `development/reading-quality-v1/tests/test_quality.py`,
`instagram-media/scanner.py`. Commit yapılmadı.

Çalıştırılan doğrulamalar: tüm sahip olunan `.py` dosyaları için `py_compile`, `bash -n login-browser.sh`,
`test_quality.py` (29/29), `test_dates.py` (18/18), `intelligence.py --selftest`, `scanner.py selftest`,
`f06/test_xreader.py`, `f06/test_scanner.py` (ikisi de orijinal kodda başarısız, yeni kodda başarılı).
