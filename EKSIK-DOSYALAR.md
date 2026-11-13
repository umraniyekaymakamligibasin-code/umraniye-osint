# Depoda eksik olanlar ve istenmesi gerekenler

Kontrol tarihi: 13 Kasım 2026, kontrol edilen commit: `4a872de` (`yedek/orijinal-2026-11-13`).

## Kısa cevap: kod yarım mı?

**Uygulamanın kendi kodu tam görünüyor, kurulum için gereken parçalar eksik.**

- `application/` içindeki tüm `import` ve `new URL(..., import.meta.url)` referansları çözülüyor.
  Eksik olan tek çalışma zamanı parçası `image-tools/bin/python` sanal ortamı (eşitleyici `image-tools`
  dizinini bilerek atlıyor).
- `legacy-application/` kendi içinde tam (yalnız Node yerleşik modüllerini kullanıyor).
- Uygulama bu depodan yerel makinede **ancak elle tablo oluşturulduktan sonra** başlatılabildi.
  Temiz kurulumda `no such table: common_keyword_state` hatasıyla açılmıyor.
- `development/*.next.mjs` dosyalarındaki çözülmeyen import'lar beklenen durum: bunlar
  `application/server/` içine kopyalanmak üzere hazırlanmış dosyalar.

Kasıtlı olarak depoya alınmayanlar (sırlar, `.env`, veritabanı, oturumlar, çerezler, günlükler,
yedekler) zaten depoda olmamalı; aşağıdaki listede **istenmemelidir**.

## İstenecekler

Değerler (şifre, token, çerez) **istemeyin**; yalnız aşağıdaki yapısal bilgileri isteyin.

### 1. Veritabanı şeması ve ilk kurulum aktarımı (en önemlisi)

Kod şu tabloları kullanıyor ama depoda bunları oluşturan hiçbir geçiş veya betik yok:

| Tablo | Kullanan yer |
| --- | --- |
| `common_keyword_state`, `common_keyword_groups`, `common_keyword_members` | `application/server/central-keywords.mjs` (`loadCentralKeywords` açılışta çağrılıyor) |
| `facebook_keywords`, `facebook_posts`, `facebook_sources`, `facebook_post_matches`, `facebook_scan_runs` | `application/server/facebook-manager.mjs`, `central-keywords.mjs` |
| `lab_telegram_baseline` | `application/worker/index.js` / `server/` |

`migrateCentralKeywords()` fonksiyonu tanımlı ama depoda onu çağıran kod yok; canlıda ayrı bir
betikle bir kez çalıştırılmış olmalı.

**İstenecek:**
- Veri içermeyen şema çıktısı: `sqlite3 /var/lib/umraniye-osint-deneme/osint.sqlite .schema`
- Ortak kelime aktarımını yapan betik (`migrateCentralKeywords` çağrısı) ve `facebook_*` tablolarını
  oluşturan betik/geçiş.

### 2. `package.json` içinde tanımlı ama depoda olmayan betikler

`application/package.json` şu dosyalara işaret ediyor, hiçbiri depoda yok:

- `scripts/build.mjs` (`npm run build`)
- `scripts/validate-trial.mjs` (`npm run validate`)
- `scripts/run-tests.mjs` (`npm test`, `npm run test:all`)
- `scripts/preview-integrations.mjs` (`npm run dev`)
- `scripts/check-sources.mjs` (`npm run check:sources`)
- `scripts/test-server.mjs` (`npm run test:server`)

Eşitleyici `scripts/` altındaki `.py` dosyalarını aldığına göre bu `.mjs` dosyaları sunucudaki
`/opt/umraniye-osint-deneme/scripts/` dizininde de yok; geliştiricinin kendi bilgisayarında olabilir.
Testler olmadan değişiklikleri otomatik doğrulamak mümkün değil.

### 3. Servis ve zamanlayıcı tanımları (systemd, cron)

Kodda/belgelerde adı geçen ama depoda tanımı olmayan birimler:

- `umraniye-osint-instagram-api.service` / `.timer`
- `umraniye-osint-browser-x.service` / `.timer`
- `umraniye-osint-browser-facebook.service`
- `umraniye-osint-sirali.service` / `.timer`
- `umraniye-osint-x-twscrape-deneme.timer` (servisin kendisi `x-shadow/service.saved` olarak var)
- `umraniye-osint-facebook-fbgql-deneme.timer`
- `umraniye-telegram.service`
- Instagram medya tarayıcısı (`instagram-media/scanner.py`) için hiçbir birim adı geçmiyor
- `basin` kullanıcısının eşitleme cron satırı

**İstenecek:** `systemctl cat 'umraniye*'` çıktısı ve `crontab -l` (basin kullanıcısı).

Depoda üreten betiği olanlar (istemeye gerek yok): `umraniye-osint.service`,
`umraniye-osint-deneme.service`, `umraniye-osint-browser.service` / `.timer`.

### 4. Python ve Node bağımlılık listeleri

| Bileşen | Kullandığı dış paketler | Depoda bağımlılık dosyası |
| --- | --- | --- |
| `browser/` | `playwright`, `dateparser` | yok |
| `instagram-media/` | `instagrapi` | yok |
| `application/server/thumbnail.py` (`image-tools` venv) | `Pillow` | yok |
| `x-shadow/` | `twscrape` | `requirements.lock` var |
| `facebook-shadow/` | `httpx`, `requests`, `click`, `selenium` | `requirements.lock` var |

**İstenecek:** Her sanal ortam için `venv/bin/pip freeze` çıktısı
(`/opt/umraniye-osint-browser/venv`, `/opt/umraniye-osint-igmedia/venv`,
`/opt/umraniye-osint-deneme/image-tools`), ayrıca sunucudaki `node --version`.

### 5. Ortam değişkeni şablonu (değerler olmadan)

Kodun okuduğu değişkenler: `PUBLIC_ORIGIN`, `PORT`, `DATA_DIR`, `BACKUP_DIR`,
`OSINT_ADMIN_USERNAME`, `OSINT_ADMIN_PASSWORD`, `OSINT_ADMIN_EMAIL`, `OSINT_ADMIN_SESSION_VERSION`,
`OSINT_ALLOW_SHORT_OWNER_PASSWORD`, `COLLECTOR_ENABLED`, `OSINT_NEWS_COVERAGE_ENABLED`,
`OSINT_LAB_ENABLED`, `OSINT_LAB_ALLOWED_HOSTS`, `OSINT_BROWSER_ENABLED`, `OSINT_BROWSER_DATA`,
`OSINT_REDIRECT_HOST`, `TRUST_CLOUDFLARE`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_MODE`,
`YOUTUBE_API_KEY`, `TWS_HTTP_BACKEND`, `TWS_LOG_LEVEL`, `CREDENTIALS_DIRECTORY`, `STATE_DIRECTORY`.

**İstenecek:** Sunucudaki env dosyalarının yalnız anahtar adları, örneğin
`sed 's/=.*/=/' /etc/umraniye-osint-deneme.env`. Böylece depoya değer içermeyen bir
`.env.example` eklenebilir.

### 6. Ağ önündeki yapılandırma

Kod Cloudflare arkasında çalıştığını varsayıyor (`TRUST_CLOUDFLARE`, `CF-Connecting-IP`,
`OSINT_REDIRECT_HOST`). Cloudflare Tunnel (`cloudflared` `config.yml`) veya nginx yapılandırması
depoda yok. **İstenecek:** sırsız yapılandırma dosyası (tünel kimlik bilgisi dosyası hariç).

### 7. Eşitleyicinin filtresine takılmış olabilecek dosyalar

`ops/github_sync.py` yalnız belirli uzantıları alıyor ve şunları atlıyor: uzantısız dosyalar
(ör. `Makefile`, uzantısız çalıştırılabilir betikler), `.cfg`, nokta ile başlayan dosyalar
(`.env.example` dahil), adında `backup` geçen dizinler, `dist`, `data`, `logs`, `sessions`,
`profiles` dizinleri. Bu yüzden sunucuda olup depoya hiç gelmeyen kaynak dosyalar olabilir.

**İstenecek:** Sunucuda şu komutun çıktısı (yalnız dosya adları listelenir, içerik okunmaz):

```sh
for d in /opt/umraniye-osint-deneme /opt/umraniye-osint /opt/umraniye-osint-browser \
         /opt/umraniye-osint-instagram-api /opt/umraniye-osint-igmedia \
         /opt/umraniye-osint-x-twscrape-deneme /opt/umraniye-osint-facebook-fbgql-deneme \
         /opt/umraniye-telegram; do
  find "$d" -type f \
    -not -path '*/venv/*' -not -path '*/node_modules/*' -not -path '*/image-tools/*' \
    -not -path '*/browsers/*' -not -path '*/__pycache__/*' -not -path '*/data/*' \
    -not -path '*/logs/*' -not -path '*/sessions/*' -not -path '*/profiles/*' \
    -not -path '*/credentials/*' -not -name '*.env' -not -name '*.sqlite*'
done | sort
```

Bu liste depodaki dosya listesiyle karşılaştırılıp gerçekten eksik kaynak dosyası olup olmadığı kesinleşir.

### 8. Küçük eksikler

- `facebook-shadow/install.py`, `/opt/umraniye-osint-deneme/AGENTS.md` dosyasına başvuruyor; depoda
  `application/AGENTS.md` yok.
- `application/src/server.js` (74 KB) hiçbir dosyadan içe aktarılmıyor; `worker/index.js` ile benzer
  eski bir kopya gibi duruyor. Kullanılıp kullanılmadığı sorulmalı; kullanılmıyorsa silinebilir.
