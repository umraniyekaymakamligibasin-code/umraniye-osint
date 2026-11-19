# Dağıtım yapılandırması (sunucu anlık görüntüsü)

Bu klasör, canlı sunucudaki (`basinserver`) **dağıtım yapılandırmasının** salt-referans kopyasıdır.
19 Kasım 2026'da sunucudan alındı. Uygulama kodu değildir ve otomatik eşitlenmez.

## Neden burada?

`ops/github_sync.py` eşitleyicisi yalnız `/opt/...` altındaki belirli uzantılı **uygulama kaynağını**
GitHub'a taşıyor. systemd birimleri (`/etc/systemd/system/`), orkestratör betiği (`/usr/local/libexec/`)
ve ortam şablonu bu kapsamın dışında kalıyordu; yani depoda hiç yoktu. Depo bu yüzden "tam" değildi.
Bu klasör o boşluğu kapatıyor. `deploy-config/` hiçbir eşitlenen dizinin altında olmadığı için
eşitleyici ona dokunmaz; GitHub'da kalıcı olarak durur.

## Doğrulama (19 Kasım 2026)

GitHub `origin/main`, sunucudaki eşitlenen uygulama kaynağıyla **birebir aynı** bulundu: 592 dosya,
0 fark (sunucuda `github_sync.snapshot()` çıktısının SHA-256'ları ile `origin/main` karşılaştırıldı).
Yani uygulama kodu tarafında GitHub güncel. Eksik olan yalnız buradaki dağıtım dosyalarıydı.

## İçerik

| Klasör | Ne |
| --- | --- |
| `systemd/` | Tüm `umraniye-*.service` ve `.timer` birimleri, `.service.d`/`.timer.d` ayar katmanları. |
| `libexec/umraniye-osint-sirali.py` | Sıralı toplama orkestratörü (`/usr/local/libexec/`). Her 180 sn'de bir çalışır; sırayla X → Instagram → Instagram medya → Facebook servislerini tetikler. Depoda hiç yoktu. |
| `etc/umraniye-osint-sirali.json` | Orkestratörün iş sırası yapılandırması (`/etc/umraniye-osint-sirali.json`). |
| `env/.env.deneme.example` | Ortam değişkeni şablonu. **Değerler boştur**; gerçek `.env` sunucuda kalır, buraya hiç kopyalanmaz. |
| `vendor-licenses/` | Eşitleyicinin uzantısı olmadığı için atladığı üçüncü taraf lisans dosyaları. |

## Zamanlayıcı aralıkları (özet)

| Birim | Aralık |
| --- | --- |
| `umraniye-osint-sirali.timer` | 180 sn (ana toplama turu) |
| `umraniye-osint-browser.timer` | 10 dk |
| `umraniye-kurum-zamanlayici.timer` | 5 dk (kurum vakası üretir, mail göndermez) |
| `umraniye-kurum-gonderim.timer` | 2 dk (mail kuyruğunu boşaltır; `smtp.json` yoksa çalışmaz) |
| `umraniye-osint-instagram-akilli.timer` | açılıştan 2 dk sonra |
| `umraniye-medya-status.timer` | 90 sn |
| `umraniye-osint-instagram-medya.timer` | 180 sn |

## Etkin ortam anahtarları (sunucudan, 19 Kasım)

- `OSINT_ROUTING_CONTEXT=1` — kurum yönlendirme bağlam motoru açık.
- `OSINT_ROUTING_OUTBOX=1` — kurum e-posta **kuyruğu açık**, ama `smtp.json` olmadığı için gönderim yok.
- `OSINT_NEWS_COVERAGE_ENABLED=true` — haber kapsamı açık.
- `TRUST_CLOUDFLARE=true`.

## Önemli not

Bu dosyalar **belge/referanstır**. Sunucudaki birimleri değiştirmek için bunları düzenleyip GitHub'a
göndermek yetmez; değişiklik sunucuda `/etc/systemd/system/` altına kurulup `systemctl daemon-reload`
yapılmalıdır. Uygulama kodu aksine `/opt/...` altında değişir ve eşitleyici tarafından GitHub'a taşınır.
