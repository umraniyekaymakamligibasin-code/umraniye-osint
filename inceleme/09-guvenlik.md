# 3. aşama: güvenlik incelemesi ve düzeltmeler

Kapsam: 1. aşama raporlarındaki tüm "3. aşama" bulguları (`inceleme/01`–`08`) ve tüm Git geçmişinin
sır taraması (PROJE-ACIKLAMASI madde 7 ve 13). Bu rapor gizli değer içermez.

## Sır taraması

**Yöntem:** Tüm dallar ve etiketlerdeki 61 commit'in 541 dosya sürümü (`git rev-list --all --objects`)
tarandı. Aranan türler:
- özel anahtar başlıkları; GitHub, AWS, Google, Slack ve Meta token'ları;
- Telegram bot token'ı, JWT, Gmail uygulama şifresi;
- X ve Facebook/Instagram oturum çerezleri (`auth_token`, `ct0`, `c_user`, `xs`, `sessionid`);
- `PASSWORD=`/`SECRET=` atamaları ve kullanıcı adı:şifre içeren URL'ler.

Değerler yazdırılmadı, yalnız tür, dosya ve satır incelendi.

**Sonuç: gerçek bir sır bulunmadı.** 119 eşleşmenin tamamı yanlış pozitif çıktı:

| Eşleşme | Neden yanlış pozitif |
| --- | --- |
| `legacy-application/worker/index.js:3`, `application/src/assets/briefing-pdf.js:434` | jsPDF ve gömülü yazı tipi/logo base64 verisi |
| `facebook-shadow/UPSTREAM-README.md:145` | Belgedeki örnek `user:pass@host` vekil adresi |
| `facebook-shadow/vendor/fbgql/*` | `c_user=session.c_user` gibi değişken adları |
| `ops/test_sync.py:12` | Eşitleyicinin sır yakalamasını sınayan sahte anahtar başlığı |
| `development/institution-coordination/verify-gmail.py` | Test verisi |

Geçmişte hassas adlı (cookie, session, auth, token, smtp, credentials) bir veri/JSON dosyası da yok.
Depodaki e-posta adresleri açık kaynak lisans başlıkları ve kurum e-postasını gönderen hesabın adresi.

**Bilgi sızıntısı (düzeltildi):** Kurulum belgelerinde ve iki betikte sunucunun iç ağ (Tailscale) IP
adresi ve geliştiricinin Windows kullanıcı yolu vardı. `<sunucu-ip>` / `<yerel-klasör>` ile
değiştirildi; betiklerde `OSINT_SSH_HOST` ortam değişkeni kullanılıyor. Adres Git geçmişinde kalıyor;
yalnız Tailscale ağı içinden erişilebildiği için geçmişi yeniden yazmak gerekmiyor.

**Kapsam dışı kalan:** Sunucudaki `.env` dosyaları, oturum profilleri ve veritabanları depoya hiç
gelmediği için taranamadı. Eşitleyici sınırlı bir uzantı listesi aldığından, sunucuda olup depoya
gelmeyen dosyalar da bu taramanın dışında.

## Düzeltilenler

| No | Önem | Konum | Bulgu | Düzeltme |
| --- | --- | --- | --- | --- |
| G-01 | Yüksek | `application/server/browser-login.mjs`, `news-thumbnails.mjs`, `content-retention.mjs`, `institution-coordination/server/gmail-sender.mjs` | Alt süreçlere tüm ortam değişkenleri geçiyordu. Yönetici parolası, Telegram ve YouTube anahtarları dış siteleri açan Chromium/Playwright sürecinin ortamına giriyordu. | Yeni `server/child-env.mjs`: yalnız `PATH`, dil/saat dilimi, vekil ve sertifika ayarları ile çağıranın açıkça verdiği değişkenler geçiyor. |
| G-02 | Yüksek | `ops/github_sync.py` | Bir koşul hatası yüzünden adı ne olursa olsun **tüm** `.json` dosyaları GitHub'a aktarılıyordu. Sır kalıpları dardı. | Adı oturum/kimlik/şifre/çerez/smtp/auth içeren kod dışı dosyalar aktarılmıyor. Yeni kalıplar: Google, Slack, JWT, PGP/şifreli özel anahtar, X/Facebook/Instagram çerez değerleri, JSON içindeki `"password": "…"` biçimi. Depodaki 450 dosyada sınandı: hiçbir dosya düşmüyor, yanlış alarm yok, örnek sırların hepsi yakalanıyor. |
| G-03 | Yüksek | `x-shadow/prepare.py`, `facebook-shadow/prepare.py` (+ geliştirme kopyaları) | Root olarak çalışan ön adım, servis kullanıcısının yazabildiği dizine öngörülebilir adlarla yazıp yola göre `chown` yapıyordu. Sembolik bağlantıyla root'a dosya yazdırılabilirdi. | Dizin `O_NOFOLLOW` ile açılıyor; dosyalar `O_EXCL\|O_NOFOLLOW` ile `dir_fd` içinde oluşturuluyor; sahiplik dosya tanıtıcısı üzerinden (`fchown`) veriliyor. Sembolik bağlantı testleri geçti. |
| G-04 | Yüksek | `legacy-application/server/http.mjs` | Oran sınırlayıcı normal trafikte giriş sayaçlarını siliyordu (25 deneme / 15 dk sınırı fiilen yoktu). Cloudflare IP başlığı doğrulamadan kabul ediliyordu. | `application`'daki ayrık süreli sınırlayıcı taşındı. IP başlığı yalnız yerel bağlantıdan ve geçerli IP ise kabul ediliyor. |
| G-05 | Orta | `application/server/http.mjs` | CSRF koruması rotalara dağınıktı; yalnız `Sec-Fetch-Site: cross-site` reddediliyordu. | Merkezi kural: tarayıcıdan gelen ve `Origin` başlığı site kökeninden farklı olan her POST 403. Sunucu içi servisler `Origin` göndermediği için etkilenmiyor. |
| G-06 | Orta | `application/worker/index.js`, `app.html`, `admin.html` | Ekip şifresi en az 6 karakterdi. | Yeni ve değiştirilen şifreler için en az 12 karakter. **Mevcut şifreler çalışmaya devam eder.** |
| G-07 | Orta | `application/worker/index.js` `teamLogin` | Deneme sınırı "IP + kullanıcı adı" anahtarlıydı; tek IP'den çok sayıda kullanıcı adı denenebiliyordu. | Ek IP sınırı: 15 dakikada 20 başarısız deneme. Yerelde 20. denemede 429 döndüğü doğrulandı. |
| G-08 | Orta | `application/worker/index.js` `identity()`, `/mcp`, `/api/automation/*` | Eski barındırma ortamından kalan kod `oai-authenticated-*` başlıklarına güvenip yönetici yetkisi verebiliyordu. Otomasyon talimatı dış bir platformun token kullanımını anlatıyordu. Canlıda `http.mjs` bunları etkisiz kılıyordu, ama worker başka bir önyüzle çalışırsa açık oluşurdu. | Başlığa dayalı kimlik kaldırıldı. `/mcp` ve `/api/automation/*` worker içinde de 404. |
| G-09 | Düşük | `application/worker/index.js` | Worker'ın kendi CSP'si sayfanın `chatgpt.com` içinde çerçevelenmesine izin veriyordu. | `frame-ancestors 'none'`. |
| G-10 | Orta | `application/server/content-moderation.mjs` | Kaldır/arşivle işleminde istemcinin gönderdiği kayıt (url, başlık, akış) olduğu gibi saklanıyordu. | Kayıt sunucunun kendi verisinden kimlikle bulunuyor; bulunamazsa 404. İstek biçimi değişmedi. |
| G-11 | Orta | `institution-credentials.mjs` | Hesap açma, onaylanmamış/taslak kurumlara da etkin hesap ve üyelik açıyordu. | Yalnız `approved` kurumlar; atlananlar raporlanıyor. |
| G-12 | Düşük | `institution-coordination.mjs`, `institution-recipients.mjs` | Kurumlar arası yönlendirme ve alıcı pasifleştirme denetim kaydı yazmıyordu. Denetim kaydındaki istek kimliği istemciden alınıyordu. Olmayan alıcı için de "tamam" dönülüyordu. | Denetim kayıtları eklendi; istek kimliği sunucuda üretiliyor; olmayan alıcı 404. |
| G-13 | Düşük | `admin.html` | Dış kaynaklı bağlantılar şema denetimi olmadan `href`'e yazılıyordu; bazı sayılar kaçışsız basılıyordu. | Yalnız `http:`/`https:` bağlantılar; sayılar `Number()` ile. |
| G-14 | Düşük | `instagram-api/publish_status.py` | Root olarak çalışırken sembolik bağlantı denetimi ile `chown` arasında yarış vardı. | `O_NOFOLLOW` + `dir_fd` + `fchown`. |
| G-15 | Düşük | `application/server/dha-collector.py`, `dha-preview.py` | `curl -L` yönlendirmeleri her protokole izliyordu. | `--proto =https --proto-redir =https --max-redirs 5`. |
| G-16 | Düşük | `facebook-shadow/*.service`, `x-shadow/service.saved` | systemd sertleştirmesi eksikti. | `PrivateDevices`, `ProtectKernel*`, `ProtectControlGroups`, `RestrictSUIDSGID`, `LockPersonality`, `RestrictNamespaces` eklendi. Node JIT nedeniyle `MemoryDenyWriteExecute` eklenmedi. |

## Kod sahibinin kararı gerekenler (düzeltilmedi)

Bunlar canlı ortamı bozabileceği veya bir politika kararı gerektirdiği için kodda değiştirilmedi.
Sorular ayrıca bir GitHub issue'sunda toplandı.

1. **Parolasız VNC (Yüksek):** `browser/login-native.py`, `login-session.py`, `login-browser.sh` içinde
   `x11vnc -nopw`. Sunucudaki her yerel süreç, sosyal medya hesaplarının açık olduğu tarayıcıyı
   yönetebilir. Öneri: `-unixsock` ile yalnız servis kullanıcısının okuyabildiği bir Unix soketi ve
   websockify'ın bu sokete bağlanması. Panelin tarayıcı vekiliyle (`browser-proxy.mjs`) birlikte
   denenmesi gerekiyor.
2. **Sahip parolası istisnası:** `owner-policy.mjs` belirli bir sahip adı için 9 karakterlik parolaya
   izin veriyor. Kaldırmak için canlı yönetici parolasının en az 12 karakter olması gerekiyor; aksi
   halde uygulama açılmaz.
3. **Kurumsal PIN 4 hane:** 15 dakikada 5 deneme sınırı var. 6 haneye çıkarılması önerilir.
4. **Şifre özeti PBKDF2 100.000 tur:** Güncel öneri 600.000. Özet biçimi değişeceği için girişte
   yeniden özetleme ile kademeli geçiş gerekir.
5. **Kurum şifresini gösterme:** Yeniden kimlik doğrulama istemiyor; şifreler geri çözülebilir saklanıyor.
6. **`TRUST_CLOUDFLARE`:** Canlıda `true` değilse herkes tek IP gibi görünür. Bir kişi yanlış şifreyle
   herkesin girişini 15 dakika kilitleyebilir.
7. **Legacy uygulama:** `/opt/umraniye-osint` hâlâ çalışıyorsa kapatılması saldırı yüzeyini küçültür.
8. **Root yayımlayıcılar:** `development/*/publish*.service` `User=root`.
9. **Tedarik zinciri:** `facebook-shadow/install.py`, `get-pip.py`'yi özet doğrulaması olmadan
   çalıştırıyor; `requirements.lock` dosyaları `--require-hashes` olmadan kuruluyor.
10. **Mevcut kısa ekip şifreleri:** Yeni kural yalnız yeni şifrelere uygulanıyor. Mevcut hesapların
    şifre yenilemeye zorlanması ayrı bir karar.

## Kurulum notları

- `ops/github_sync.py` değişikliği sunucudaki kurulu kopyaya
  (`~basin/.local/share/umraniye-github-sync/source-ops/`) ve cron'un çalıştırdığı betiğe ayrıca
  kurulmalı. Yeni kurallar daha çok dosya türünü sır sayabilir; kurulumdan sonra
  `status.json` içinde `"ok": true` olduğu kontrol edilmeli.
- systemd birim değişiklikleri için `systemctl daemon-reload` ve ilgili zamanlayıcının yeniden
  başlatılması gerekir.
- Yerelde doğrulandı: yabancı `Origin` ile POST 403; doğru köken ile giriş akışı çalışıyor;
  `/api/automation/instructions` 404; `oai-authenticated-*` başlığıyla `/yonetim` giriş sayfasına
  düşüyor; ekip girişinde IP sınırı 20. denemede 429; portal, sayfalama ve `/calisma` çalışıyor.
  Kurum doğrulama betikleri (7) ve X/Facebook testleri geçiyor. systemd birimleri bu makinede
  `systemd-analyze` olmadığı için doğrulanamadı.
