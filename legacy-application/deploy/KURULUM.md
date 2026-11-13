# Ümraniye OSINT · Linux sunucu kurulumu

Bu paket Node.js 24 üzerinde yerel olarak test edilmiştir. Hedef Linux bilgisayarına henüz kurulmamıştır. Linux üzerinde servis, ağ, gerçek zamanlayıcı ve yedekten dönüş kabul testleri yapılmadan geçiş tamamlanmış sayılmaz. Mevcut yayın bu işlemler sırasında açık tutulmalıdır.

## 4 GB bilgisayar için yapılandırma

Hedef: eski Intel i5 (64 bit), 4 GB RAM, 256 GB SSD ve kablolu internet. Grafik arayüzsüz Ubuntu Server LTS kullanın. Sistem tek Node işlemi ve SQLite ile çalışır; Redis, Docker, masaüstü ve ayrı veritabanı servisi gerektirmez. Serviste JavaScript heap sınırı 512 MB, yumuşak bellek eşiği 768 MB, kesin sınır 1536 MB olarak ayarlanmıştır. Bunlar ayrılmış bellek değildir; süreç ihtiyacı kadar kullanır. Gerçek eşzamanlı kullanıcı ve tüm kaynak tarama yükü hedef bilgisayarda ölçülmelidir. Test verisiyle ölçülen değer kapasite garantisi değildir. SSD üzerinde en az 20 GB boş alanı ve ikinci diskte yedeği koruyun.

## 1. Ön koşullar

- Güncel Ubuntu Server LTS, Ethernet, otomatik saat eşitlemesi.
- Node.js 24 LTS'nin güncel güvenlik sürümü: https://nodejs.org/en/download . Resmî indirme ve doğrulama yönergelerini kullanın. `node --version` ile kontrol edin. Çalıştırma için npm veya harici Node paketi gerekmiyor.
- Kontrolünüzdeki HTTPS alan adı ve yerel Cloudflare Tunnel. https://developers.cloudflare.com/tunnel/get-started/
- Tam disk ve mevcut site yedeği; ayrı diskte ikinci yedek kopyası.

## 2. Mevcut kayıtları alın

Mevcut sitede yönetici girişi → **Giriş güvenliği** → **Sunucu aktarım yedeğini indir**. Dosya hesap parola özetleri ve özel notlar içerir. Herkese açık paylaşmayın. Aktarım sırasında kullanıcıların kayıt değiştirmesini durdurun; son yedeği kesim anında tekrar alın. İndirme tek veritabanı batch işlemiyle tutarlı tablo görüntüsü alır. Açık oturumlar, tarama kilitleri ve giriş deneme sayaçları taşınmaz. Yönetici şifresi dosyaya dahil değildir.

## 3. Uygulamayı yerleştirin

Paketin kökünde `server/`, `worker/` ve `drizzle/` bulunmalıdır. Bunları `/opt/umraniye-osint` dizinine açın. Örnek komutlar temiz hedef içindir; mevcut kurulumun üzerine doğrudan yazmayın.

```bash
sudo useradd --system --home /var/lib/umraniye-osint --shell /usr/sbin/nologin umraniyeosint
sudo install -d -m 0755 /opt/umraniye-osint
sudo install -d -o umraniyeosint -g umraniyeosint -m 0700 /var/lib/umraniye-osint
```

Uygulama dosyaları root sahipliğinde, servis kullanıcısı tarafından yalnız okunabilir olsun. `node` çalıştırılabilir dosyasının tam yolunu `command -v node` ile bulun; servis dosyasındaki `/usr/local/bin/node` farklıysa düzeltin. Kullanıcının ev dizinindeki nvm kurulumu `ProtectHome=true` nedeniyle uygun değildir; sistem genelinde erişilebilir Node kullanın.

Yeni ve boş hedefte isteğe bağlı kurulum yardımcısı: `sudo bash deploy/install-linux.sh`. İlk çalıştırma boş gizli ayar dosyasını üretip durur. Ayarlar doldurulunca tekrar çalıştırılır; Node yolunu bulur, dosya izinlerini ayarlar ve açılışta çalışmayı etkinleştirir. Veri aktarılmadan servisi başlatmaz. Mevcut kuruluma yazmayı reddeder.

## 4. Gizli ayarlar

`.env.example` içeriğini `/etc/umraniye-osint.env` olarak kopyalayın. Dosyayı root sahibi ve `0600` izniyle tutun. `sudoedit` ile gerçek alan adınızı, yönetici adınızı ve en az 12 karakterli ayrı bir yönetici şifresini girin. Şifreyi komut satırı argümanında veya mesajda paylaşmayın. `PUBLIC_ORIGIN` gerçek HTTPS kök adresi olmalı; yol içermemelidir. `DATA_DIR=/var/lib/umraniye-osint` kalsın. `COLLECTOR_ENABLED=false` aktarım boyunca kapalı kalsın.

## 5. Aktarımı servis başlamadan yapın

Özel aktarım JSON dosyasını `/var/lib/umraniye-osint/transfer.json` yoluna güvenli biçimde taşıyıp servis kullanıcısına okuma yetkisi verin. Ardından:

```bash
cd /opt/umraniye-osint
sudo -u umraniyeosint env DATA_DIR=/var/lib/umraniye-osint /usr/local/bin/node server/import.mjs /var/lib/umraniye-osint/transfer.json
```

Node yolu farklıysa düzeltin. İçe aktarma yalnız boş veritabanında çalışır, tamamı tek transaction içindedir. İkinci kez üzerine yazmaz. Aktarım dosyasını doğrulamadan silmeyin; sonrasında korumalı harici arşive taşıyın. Kullanıcılar eski kullanıcı adı ve şifreleriyle yeniden giriş yapar. Yönetici yeni ortam dosyasındaki bilgilerle giriş yapar.

## 6. Servis ve HTTPS

```bash
sudo cp deploy/umraniye-osint.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now umraniye-osint
sudo systemctl status umraniye-osint
curl --fail http://127.0.0.1:3000/health
```

Cloudflare Tunnel yayın rotasını `http://127.0.0.1:3000` adresine bağlayın. Uygulama yalnız loopback dinler. Modemde 3000, 80, 443 veya 3389 portu açmanız gerekmez. SSH erişimini yerel ağ/VPN ile sınırlandırın. Tünel bilgisayarda yerel servis olarak çalışıyorsa `TRUST_CLOUDFLARE=true` yapın; başka proxy eklenirse önce güven zincirini inceleyin. HTTPS çerezleri nedeniyle kullanıcı girişi gerçek HTTPS adresinden denenmelidir.

## 7. Otomatik tarama

Hesap, haber, not ve tasarım seçimi doğrulandıktan sonra ortam dosyasında `COLLECTOR_ENABLED=true` yapın:

```bash
sudo systemctl restart umraniye-osint
sudo journalctl -u umraniye-osint -f
```

İlk tarama yaklaşık 5 saniye sonra başlatılır; sonraki tetikler 10 dakika aralıklıdır. Bir tur bitmeden ikinci tur başlamaz. Kaynaklar sırayla beşli gruplarla taranır. Uzun tur varsa 10 dakikalık hedef aşılabilir. `collection_completed` kaydını ve ikinci zamanlanmış turun gerçekleştiğini görün. Harici sitelere erişim garanti edilemez; sistem kısmi başarısızlığı kaydeder.

## 8. Yedekleme ve geri dönüş

Uygulama açılışta, her 24 saatte ve düzgün kapanışta SQLite yedek API'siyle tutarlı yedek üretir. Yedekler `DATA_DIR/backups` içindedir. Bunlar aynı disk üzerindedir; her gün ikinci bir diske/kurumsal depoya kopyalayın. Bu sürüm yedekleri otomatik silmez; disk kullanımını izleyin ve kurumun saklama planını uygulayın.

Manuel yedek: `sudo -u umraniyeosint env DATA_DIR=/var/lib/umraniye-osint /usr/local/bin/node server/backup.mjs`.

Geri yüklemede önce servisi durdurun, mevcut data dizinini ayrı bir arşive taşıyın, doğrulanmış SQLite yedeğini temiz data dizininde `osint.sqlite` adıyla yerleştirin ve sahiplik/izinleri düzeltin. Eski `-wal`/`-shm` dosyalarını yeni yedeğin yanında bırakmayın. Canlı veritabanının üzerine çalışırken kopyalamayın. Servisi açıp hesap ve notları doğrulayın.

## 9. Yayına geçiş kontrolü

- Mobil internetten HTTPS erişimi ve kullanıcı/yönetici girişi.
- Kaydetme/not ekleme, servisi yeniden başlatma, kayıtların korunması.
- Yetkisiz kişinin yönetici, ortak dosya ve aktarım API'sine erişememesi.
- Tarayıcı kapalıyken iki otomatik tarama turu.
- Tünel/internet kesilip gelince yeniden erişim.
- Bilgisayar yeniden başladıktan sonra kullanıcı oturumu açmadan hizmet.
- Yedekten ayrı deneme dizinine geri yükleme.

Bu kontroller geçmeden mevcut siteyi kapatmayın ve eski DNS kaydını kaldırmayın. Yeni alana geçişte eski siteyi salt okunur tutarak iki ayrı yerde not girilmesini önleyin. Aynı sunucuda güvenilir olmayan başka uygulama çalıştırmayın. Güvenlik duvarı, OS/Node/cloudflared güncellemeleri, fiziksel disk güvenliği ve ayrı yedek hedefi kurulacağı gün doğrulanmalıdır.

## Tek yönetici hesabı

Son kullanıcı kararıyla yönetici adı `basınadmin` olarak belirlenmiştir. Şifre yalnız gizli ortam dosyasına girilir, pakete yazılmaz. Bu sahibi için kullanıcının seçtiği 9 karakterli şifre kullanılacaksa `OSINT_ALLOW_SHORT_OWNER_PASSWORD=true` açıkça ayarlanmalıdır. Bu bayrak başka yönetici adına uygulanmaz; diğer adlarda 12 karakter sınırı ve üye hesaplarında kullanıcının tercihiyle en az 6 karakter kuralı uygulanır. Yönetici şifre politikası korunur. Yeni üyelikleri yalnız bu yönetici açar; yönetici adı üyelere verilemez.

## Otomatik kabul kontrolü

Linux kurulduktan, HTTPS tüneli çalıştıktan ve tarayıcı kapalıyken iki gerçek tarama turu tamamlandıktan sonra:

```bash
cd /opt/umraniye-osint
sudo bash deploy/verify-linux.sh
```

Bu komut servis etkinliğini, HTTP sağlığını, SQLite bütünlüğünü, gerçek yedekten ayrı dizine dönüşü, hesap/not eşleşmesini, HTTPS giriş sayfasını ve bu açılıştaki iki zamanlanmış taramayı kontrol eder. Canlı veritabanını değiştirmez. Yeni sistemde ikinci tur için en az 10–20 dakika gerekebilir; kaynak gecikmesi süreyi uzatabilir.

Bakım aralığında otomatik hata kurtarmayı sınamak için `sudo bash deploy/verify-linux.sh --exercise-recovery` kullanın. Bu açık seçenek uygulamayı SIGKILL ile kapatır; systemd yeniden başlatana kadar aktif istekler kesilir. Farklı PID ve artan yeniden başlatma sayısı doğrulanır; işletim sistemi yeniden başlatılmaz. Ardından gerçek kullanıcıyla kaydedilen haberi ve notu ayrıca açın.

Son fiziksel kabul: bilgisayarı yeniden başlatın, Linux masaüstünde kullanıcı oturumu açmadan mobil internetten giriş deneyin; iki tarama turunu ve aynı kontrol komutunu tekrar doğrulayın. BIOS içindeki elektrik geri gelince otomatik açılma ayarı modele bağlıdır ve bilgisayarın başında kontrol edilmelidir. Tünelin de `systemctl is-enabled cloudflared` ve `systemctl is-active cloudflared` kontrollerini geçmesi gerekir. Tünel henüz kurulmadıysa HTTPS kontrolünün geçmesi beklenmez.

Yerel geliştirme testi: `node scripts/run-tests.mjs --server`. Süreklilik testi gerçek Node alt işlemini açar; dış yayınlar yerine RSS test verisi ve hızlandırılmış saat kullanır. Tarayıcısız iki tur, zorla kapanma sonrası aynı veritabanıyla açılış, yedek üretimi ve ayrı veritabanından açılan sunucuda hesap/kaydetme/not kontrolünü yapar. Bu test Linux systemd, gerçek 10 dakikalık bekleme, elektrik kesintisi, donanım veya gerçek internet kapasitesi testi değildir.

Kaynak dayanakları: [Ubuntu Server sistem gereksinimleri](https://ubuntu.com/server/docs/installation/), [systemd bellek sınırları](https://freedesktop.org/software/systemd/man/latest/systemd.resource-control.html), [systemd yeniden başlatma davranışı](https://www.freedesktop.org/software/systemd/man/255/systemd.service.html).
