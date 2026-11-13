# Ümraniye OSINT — canlıyı koruyarak sunucuda deneme

Hazırlama: 2 Kasım 2026. Bu paket henüz Linux sunucunuza kurulmadı. Önce yerel testleri tamamlandı; fiziksel Linux kabulü aşağıdaki adımlarla yapılacak.

## Ayrı tutulan parçalar

| | Mevcut canlı | Yeni deneme |
|---|---|---|
| Adres | umraniyeosint.com | deneme.umraniyeosint.com |
| Kod | /opt/umraniye-osint | /opt/umraniye-osint-deneme |
| Veri | /var/lib/umraniye-osint | /var/lib/umraniye-osint-deneme |
| Ayar | /etc/umraniye-osint.env | /etc/umraniye-osint-deneme.env |
| Servis | umraniye-osint | umraniye-osint-deneme |
| Yerel port | 3000 | 3001 |

Bu denemede canlı servisi durdurmayın, canlı veri klasörünü kopyalama hedefi olarak kullanmayın. Cloudflare'daki ana adres rotasını değiştirmeyin. Bu paket Sites'a yayınlanmaz ve eski chatgpt.site yayınına dokunmaz.

## 1. Windows'tan ZIP'i gönderin

Tailscale Windows'ta bağlı kalsın. **Yeni Windows PowerShell** açın; Linux'a bağlı pencereyi açık bırakın. Aşağıdaki komut Windows'ta çalışır:

```powershell
scp "C:\Users\haaka\Documents\Codex\2026-10-23\bu\outputs\Umraniye_OSINT_Deneme_2026-11-02.zip" basin@100.79.234.33:/home/basin/
```

ZIP'i başka konuma taşıdıysanız komuttaki kaynak yolunu değiştirin. Linux şifresini yalnız kendi terminalinizde girin. %100 olmasını bekleyin.

## 2. Linux'ta açın ve doğrulayın

Linux terminalinde sırayla:

```bash
cd /home/basin
unzip Umraniye_OSINT_Deneme_2026-11-02.zip
cd /home/basin/umraniye-osint-deneme
sha256sum --check SHA256SUMS
```

Her dosyada OK görünmeli. Dosya zaten varsa üzerine yazma sorusunu gelişigüzel onaylamayın; ilk kuruluma özel paket bu.

## 3. Yalnız deneme kurucusunu çalıştırın

```bash
sudo bash deploy/install-deneme.sh
```

İlk seferde ayrı env dosyasını oluşturup bilerek durur. Düzenlemek için:

```bash
sudo nano /etc/umraniye-osint-deneme.env
```

`OSINT_ADMIN_PASSWORD=` satırına **deneme için en az 12 karakterlik bir parola** yazın. Paket parola içermez. İsterseniz mevcut hesap adını `basınadmin` olarak bırakın. `OSINT_ALLOW_SHORT_OWNER_PASSWORD=false` kalsın. Gerçek şifreyi sohbete yazmayın.

İlk kurulumda şu değerler aynen kalsın:

```text
PUBLIC_ORIGIN=https://deneme.umraniyeosint.com
DATA_DIR=/var/lib/umraniye-osint-deneme
PORT=3001
OSINT_LAB_ENABLED=true
COLLECTOR_ENABLED=false
TELEGRAM_MODE=dry-run
```

Ctrl+O, Enter, Ctrl+X ile kaydedip çıkın. Ardından:

```bash
sudo bash deploy/install-deneme.sh
```

Kurucu eski canlı klasöre yazmaz. Port 3001 veya deneme hedefi kullanımdaysa durur. Deneme servisini etkinleştirir fakat henüz başlatmaz.

## 4. Hesap ve notlar hakkında

En güvenli ilk deneme **boş deneme veritabanıyla**, yalnız yeni deneme yöneticisi ve birkaç test üyeyle başlamaktır. Canlı üyeler veya notlar otomatik taşınmaz. Mevcut üyelerin gündelik işlerini canlıda sürdürün.

Eski hesap/notların denemede de görünmesini özellikle istiyorsanız ilk servis başlatılmadan önce yeni bir aktarım yedeği alın. JSON'u genel paylaşmayın. Aşağıdaki aktarım yalnız ayrı deneme veritabanına gider ve veritabanı boş değilse reddedilir:

```bash
sudo install -o osintdeneme -g osintdeneme -m 0600 /home/basin/umraniye-osint-transfer.json /var/lib/umraniye-osint-deneme/transfer.json
cd /opt/umraniye-osint-deneme
sudo -u osintdeneme env DATA_DIR=/var/lib/umraniye-osint-deneme /usr/local/bin/node server/import.mjs /var/lib/umraniye-osint-deneme/transfer.json
```

Bu komut için dosyanın Linux'a önceden gönderilmiş olması gerekir. Eski 27 Ekim yedeği en güncel notları içermez. Aktarım yaptıysanız denemedeki not değişiklikleri canlıya geri yazılmaz. Yeni entegrasyon ayarları/kuyruğu eski v1 JSON aktarımına dahil değildir; deneme SQLite yedeği bunları içerir.

## 5. Denemeyi başlatın

```bash
sudo systemctl start umraniye-osint-deneme
systemctl is-active umraniye-osint-deneme
curl --fail http://127.0.0.1:3001/health
systemctl is-active umraniye-osint
```

Her iki servis active olmalı; health yanıtında ok:true beklenir. 3001 portunu modemde veya UFW'de açmayın; yalnız loopback dinlenir.

## 6. Cloudflare'a yalnız yeni rota ekleyin

Mevcut `umraniye-osint` tünelini açın. Routes → Add route → Published application:

- Subdomain: `deneme`
- Domain: `umraniyeosint.com`
- Path: boş
- Service URL: `http://127.0.0.1:3001`

Mevcut ana alan adı ve www kayıtlarını silmeyin. Yeni deneme hostname için DNS oluşturulamıyorsa yalnız `deneme` kaydının çakışmasını inceleyin; ana A/CNAME kaydını değiştirmeyin. 421 hatasında bu rotanın HTTP Host Header değerini `deneme.umraniyeosint.com` yapın.

`https://deneme.umraniyeosint.com` adresini gizli pencerede açın ve **deneme env dosyasındaki** yönetici hesabıyla giriş yapın. Yönetici panelinden **Deneme entegrasyonları** bağlantısını açın. Doğrudan adres: `/yonetim/entegrasyonlar`.

## 7. Ek akışları tanımlayın

Kaynak ekleme yalnız yöneticiye açıktır. Önce env dosyasındaki `OSINT_LAB_ALLOWED_HOSTS` alanına gerçekten onayladığınız alan adlarını virgülle ayırarak yazın. Alt alan adı ayrı eklenir; joker karakter kullanmayın. Örnek yalnız biçim gösterir:

```text
OSINT_LAB_ALLOWED_HOSTS=www.youtube.com,mastodon.social,yayincinin-gercek-alan-adi.com
```

Env değişikliği sonrası yalnız deneme servisini yeniden başlatın:

```bash
sudo systemctl restart umraniye-osint-deneme
```

Panelde kaynak adı, RSS/Atom URL'si, türü ve izin/kullanım dayanağını girin. Ayarları kaydedin, Ek akışları kontrol et düğmesine basın. Yenile düğmesinden kaynak durumuna bakın. Robots engeli, bağlantı hatası veya boş akış başarılı haber alımı sayılmaz. Eski başarılı yayın hata olduğunda hemen silinmez.

`rss` haber akışı; `social` açık sosyal RSS/Atom akışıdır. Mastodon'da yayıncı profillerinin RSS bağlantıları kullanılabilir; sunucunun erişim koşulları ayrıca kontrol edilir. Facebook/Instagram/X sayfalarını RSS kutusuna yapıştırmak onları bağlamaz. Oturum/CAPTCHA/abonelik engeli aşılmaz.

## 8. YouTube: resmî API bağlantısı

YouTube'un robots.txt dosyası `/feeds/videos.xml` yolunu engelliyor. Bu paket bu engeli aşmaz; YouTube kaynağında resmî Data API kullanılır.

Google Cloud'da kurumun yönettiği projede YouTube Data API v3 etkinleştirilmiş ve kısıtlanmış API anahtarı gerekir. Anahtarı yalnız deneme env dosyasındaki `YOUTUBE_API_KEY=` satırına girin. API'yi yalnız YouTube Data API ile kısıtlayın; IP kısıtı kullanacaksanız gerçek çıkış adresini ve değişim durumunu göz önünde bulundurun. Anahtarı sohbete/panele yazmayın.

Panelde YouTube resmî API türünü seçin ve kanalın `https://www.youtube.com/channel/UC...` adresini ekleyin. Kullanıcı adı/handle yerine 24 karakterlik UC kanal kimliği gerekir. Kendi kanal kimliğini bilmeden örnek kimlik eklemeyin.

channels.list ile uploads listesi alınır; playlistItems.list ile en son 25 video okunur. **Videonun yayın zamanı** kullanılır; oynatma listesine eklenme tarihi haber tarihi sayılmaz. API anahtarı yoksa credential_missing, izin/kota sorunu varsa quota_or_permission gösterilir. Kota ve kullanım koşulları Google Cloud projesinde doğrulanmalı. Ücretli kota yükseltmesi otomatik yapılmaz.

## 9. Telegram'ı önce gönderimsiz deneyin

TELEGRAM_MODE=dry-run kalsın. Panelde kritik haber kuyruğunu etkinleştirip kaydedin. Varsayılan yalnız P1; isterseniz P2 de eklenebilir. Güncel uygun kayıt geldiğinde kuyrukta dry-run yazmalı. **Bu, mesajın gönderildiği anlamına gelmez.**

Gerçek bağlantı için Telegram BotFather üzerinden kuruma ait bot, hedef sohbet/grup kimliği ve botun o hedefe mesaj gönderme yetkisi gerekir. Özel sohbette kullanıcı botu başlatmalı; grupta bot hedef gruba eklenmiş olmalı. Tokenı paylaşmayın. Son aşamada env dosyasındaki `TELEGRAM_BOT_TOKEN` ve `TELEGRAM_CHAT_ID` değerlerini sunucuda girin. Deneme tamamlandıktan ve hedef doğrulandıktan sonra TELEGRAM_MODE=live yapıp yalnız deneme servisini yeniden başlatın.

Panelde kuyruğun da etkin olması gerekir. Eski dry-run kayıtları live'a geçince topluca gönderilmez. Yalnız sonraki uygun yayınlar kuyruğa girer. Öncelik önerisi resmî olay teyidi değildir; mesajda bu belirtilir. Kişisel/ortak notlar veya hesap bilgileri Telegram'a aktarılmaz.

429 kota hataları sınırlı aralıkla yeniden denenir. Ağ kesintisi/zaman aşımı gibi teslimin belirsiz olduğu durumlar unknown olarak tutulur; mükerrer mesaj riski nedeniyle otomatik yeniden gönderilmez. Bu sürümde unknown için panelden yeniden gönder düğmesi yok; yetkili incelemesi gerekir. Telegram tam bir exactly-once teslim garantisi sağlamaz.

## 10. Sürekli taramayı açın

Deneme env dosyasında COLLECTOR_ENABLED=true yapın. Sonra:

```bash
sudo systemctl restart umraniye-osint-deneme
sudo journalctl -u umraniye-osint-deneme -f
```

Tarayıcıları kapatın. İlk turdan sonra en az 10 dakika bekleyip ikinci turu doğrulayın. `collection_completed` temel haber taramasıdır; `lab_collection_completed` ek kaynak/bildirim turudur. Kaynak hataları varsa panelde ayrı görünür. Kaynaklar yavaşsa süre uzar; turlar üst üste bindirilmez.

4 GB RAM'de canlı ve deneme aynı anda iki kere tarama yapacağından yükü gözlemleyin. Deneme için 768 MB servis sınırı, Node için 256 MB heap vardır. Bellek sınırı aşılırsa servisin yeniden açılması mümkün; gerçek tam kaynak yükünü bir gün izleyin. Deneme taramasını yoğun saatlerde kapalı tutabilir, manuel ek akış kontrolünü kullanabilirsiniz.

## 11. Kabul testleri

- Mobil internetten deneme adresi açılıyor; ana canlı adres aynı şekilde çalışıyor.
- Yönetici/üye erişim ayrımı ve kullanıcı oluşturma çalışıyor.
- Yeni haberler ana akışta ve P1–P4 gerekçeleri entegrasyon panelinde görünüyor.
- Geçersiz veya saat dilimi eksik tarih yeni saat uydurmuyor; date-only yayın saat belirtmiyor.
- Kaynak kapatılınca ek akıştan gelen kayıtlar görünmüyor; diğer mevcut kaynaklar korunuyor.
- Telegram dry-run sırasında gerçek mesaj yok; live yalnız hedef doğrulanınca açılıyor.
- Aynı URL tekrar geldiğinde bildirim tekrarlanmıyor; unknown teslim otomatik yeniden gönderilmiyor.
- Gerçek kaynaklarla tarayıcı kapalı iki tur, servis yeniden başlatma ve fiziksel bilgisayar yeniden açılışı kontrol ediliyor.

Denemeyi yedeklemek ve izole geri dönüşü kontrol etmek için:

```bash
cd /opt/umraniye-osint-deneme
sudo -u osintdeneme env DATA_DIR=/var/lib/umraniye-osint-deneme /usr/local/bin/node server/backup.mjs
sudo /usr/local/bin/node --env-file=/etc/umraniye-osint-deneme.env server/verify.mjs --restore-test --https
```

Yedeklerin başka fiziksel hedefe kopyası ayrıca düzenlenmeli. Canlı veri dosyasının üstüne deneme yedeği kopyalamayın.

İki gerçek tur tamamlanınca `sudo bash deploy/verify-deneme.sh` komutu servis, HTTPS, yedekten izole dönüş ve günlüklerdeki iki temel/ek tarama turunu birlikte kontrol eder. Bu kontrol veri kaynağının doğru haber verdiğini tek başına kanıtlamaz.

## 12. Denemeyi kapatmak / geri dönüş

```bash
sudo systemctl disable --now umraniye-osint-deneme
```

Cloudflare'dan yalnız deneme rotasını kaldırabilirsiniz. Kod/veri dizinlerini silmeyin; inceleme veya yeniden deneme için kalabilir. Ana servis, ana veritabanı ve ana hostname değiştirilmediğinden eski sürüme geçiş gerekmiyor: zaten çalışmaya devam ediyor.

Canlıya yükseltme bu pakette otomatik yapılmaz. Deneme kabulünden sonra güncel yedek, kontrollü göç ve ayrı yayın planı gerekir.

## 13. Sosyal hesaplar ve tarayıcı otomasyonu

X/Facebook/Instagram için ücretli API alanı yoktur. Sunucuda ayrı tarayıcı kurmak için **TARAYICI_OTOMASYONU_KURULUM.md** rehberine geçin. Bu adım otomatik tamamlanmış değildir. Telegram bot anahtarı artık yönetici panelinden şifreli saklanabilir. accounts.key ve SQLite birlikte güvenli yedeklenmeli.
