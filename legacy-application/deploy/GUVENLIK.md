# Güvenlik ve kabul durumu

## Uygulanan korumalar

- İlk bağlantıda kullanıcı adı/parola zorunlu. Haber, harita, brifing bileşeni, dışa aktarma ve yenileme API'leri oturum gerektirir. Üyeler yönetim API'sine erişemez.
- Parola değişiminde yönetici oturumları doğrudan geçersizleşir. HttpOnly/Secure/SameSite çerezler; yönetici 30 dakika, ekip 4 saat. Çıkış her iki tür oturumu iptal eder.
- Kişisel kayıtlar kullanıcı kimliğine bağlanır. Kaydetme/notlar veritabanında tutulur; haberler tarayıcı localStorage alanına yeni sürümde yazılmaz.
- POST isteklerinde aynı Origin ve cross-site Fetch Metadata kontrolü. SQL değerleri parametreli sorgulara bağlanır. Haber/not alanları HTML olarak çalıştırılmaz.
- Node sunucusu yalnız 127.0.0.1 dinler. İstemcinin platform kimliği ve proxy başlıkları silinir. Cloudflare IP'sine güvenme seçeneği yalnız aynı bilgisayardaki güvenilir tünel için açılır.
- Host denetimi, 16 KB başlık/64 KB gövde sınırı, bağlantı zaman aşımı, 240 istek/dakika/IP, 25 giriş isteği/15 dakika/IP. En fazla 4 eşzamanlı giriş, 80 etkin istek, 200 bağlantı. Uygulama ayrıca hatalı parola denemelerini sınırlıyor.
- Node yanıtlarında HTTPS HSTS, nosniff, no-referrer, iframe reddi ve betik hash'li CSP. Sites yayını mevcut platform uyumlu CSP'yi korur; betik hash'li sıkı politika Node sunucusuna aittir.
- Sabit yayıncı adresleri, izinli origin'e yönlendirme ve içerik boyutu/zaman sınırları. Kaynak metnindeki betikler çalıştırılmaz.
- Node sunucusunda platform MCP ve dış otomasyon uçları ağ üzerinden kapalıdır. İç tarayıcı rastgele hizmet anahtarını bellekte kullanır; kaynağa/günlüğe yazmaz.
- Parola özetlerini ve notları içeren aktarım dosyası yalnız yönetici ve aynı kaynaklı POST ile alınabilir. Tutarlı tablo batch'i; içe aktarma yalnız boş veritabanında, tek transaction ile yapılır. Oturumlar aktarılmaz.
- Kalıcı SQLite WAL, sürümlü/checksum kontrollü geçişler, tutarlı yedek API'si, Unix dosya izinleri ve kısıtlı systemd kullanıcısı.
- PDF bileşeni jsPDF 4.2.1 olarak sabitlenmiş ve npm SHA-512 bütünlüğü doğrulanmıştır. Bilinen eski sürüm açığı nedeniyle daha eski sürüm kullanılmaz. PDF üretimi düz metin API'sini kullanır; haber HTML'si render edilmez. Bileşen ve alt küme Türkçe fontlar siteden yüklenir; harici CDN çağrısı yoktur. Lisanslar src/vendor içindedir.

## Yerel doğrulama

`node scripts/run-tests.mjs --server` tüm fonksiyon ve güvenlik testlerini çalıştırır. Ayrı testler: yetkisiz erişim, kullanıcı izolasyonu, revizyon çakışması, CSRF, parola/oturum iptali, kalıcı yeniden açılış, gerçek SQLite yedeğini açma, aktarım, sahte Host/kimlik/IP, gövde/rate sınırları, çakışmayan tarama, günlük PDF tarihi/sayfalama/Türkçe karakterler. Gerçek gündemle hazırlanan PDF sayfaları görüntü olarak kontrol edilir.

## Hedef bilgisayarda tamamlanacaklar

Bu bir bağımsız sızma testi veya saldırı altında kapasite garantisi değildir. Hedef Linux donanımı, systemd, gerçek alan adı/HTTPS tüneli, işletim sistemi güvenlik güncellemeleri, fiziksel/disk güvenliği ve ayrı yedek diski bu çalışma ortamından doğrulanamaz.

Genel yönetici parola sınırı 12 karakterdir. Kullanıcının açık tercihi için yalnız basınadmin adlı tek sahipte ve ayrıca etkinleştirilen ortam bayrağıyla 9 karakter istisnası vardır; üye parolaları kullanıcının tercihiyle en az 6 karakterdir; üyeler Hesabım bölümünden mevcut şifrelerini doğrulayarak değiştirebilir. Daha uzun ve benzersiz parola tercih edilmelidir. Kaynakta örnek/varsayılan giriş şifresi yoktur; eksik veya kısa parola ile Node sunucusu açılmaz. Sites hesabı kullanıcının son belirttiği tek yönetici bilgilerine göre güncellenmiştir. İki faktörlü giriş henüz yoktur.

Tünel sağlayıcısının koruması uygulama oran sınırlarına ektir; WAF kuralı/hesap planı bu paketten yapılandırılmaz. Açık SSH'yi internete yönlendirmeyin; yerel ağ/VPN ile yönetin. İnternet ve yeniden açılış, iki gerçek 10 dakikalık tarama turu ve yedekten ayrı ortama dönüş kurulacağı gün kabul edilmelidir.

Yedekler otomatik olarak aynı diske yazılır; başka diske kopyalama ve saklama planı kurum tarafından kurulmalıdır. Kaynakların tamamına erişim veya anlık/eksiksiz haber yakalama garantisi verilmez. Kaynak erişim engelleri aşılmaz.
