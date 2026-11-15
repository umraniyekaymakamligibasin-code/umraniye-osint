# Facebook aynı profil oturum kurtarma — 15 Kasım 2026

Durum: hazır ve izole kontrolleri geçti; henüz canlıya kurulmadı veya gerçek giriş denenmedi.

Canlı günlüklerinde dört saat içinde 30 login_required gözlemi bulundu. Facebook ana okuyucusu aynı kalıcı profili kullanmasına rağmen oturum gerektiriyor. Anonim fbgql yolu bu açığı şu anda kapatmıyor; bir bilinen kaynak girişe yönlendiriyor. Bu, bütün kaynakların okunabileceği anlamına gelmez.

## Değişiklikler
- facebook_access_v63.py: iki kaynak gerçekten giriş istiyorsa ve başarılı kaynak yoksa bütün sayfaları yeniden denemek yerine sahip girişini bekle. HTTP 403 tek başına giriş hatası sayılmaz. 429 beklemesi yeni giriş neslinden etkilenmez.
- facebook_public_v5.py: aynı tarayıcı profilinde kaynaklar eş zamanlı iki sekme yerine sırayla okunur; iki giriş engelinden sonra kalan kaynaklar zorlanmaz. Kaynak sayısı, okuma bütçesi, filtreler ve tekilleştirme korunur.
- facebook-session-recovery.py: mevcut scanner profile_dir(account) ve browser-global/profile kilitleri kullanılır. Yeni profil veya Chromium kurulmaz. Kullanıcı girişini kendi yapar. Ana sayfa, gerçek oturum çifti, görünür akış/navigasyon ve görünür şifre alanının olmaması birlikte iki kez gözlenmeden doğrulandı denmez. Gizli çerez değerleri yazdırılmaz veya dosyaya aktarılmaz.
- Kurucu: etkin sıralı/tarayıcı timer durumlarını saklar, yeni turları bekletir, çalışanları zorla kapatmadan bitmesini bekler. Kaynak SHA256 değerlerini tekrar kontrol eder, root yedek alır, aynı profili açar. Sadece doğrulanmış giriş sonrası Facebook giriş neslini artırır ve sadece login/verification kaynak beklemelerini bırakır. 429 ve diğer kaynak hataları sıfırlanmaz. Site/Telegram yeniden başlatılmaz. SIGHUP/SIGTERM/SIGINT durumunda sahip olduğu giriş sürecini temizleyip eski timer durumlarını geri getirir.

## Uzak ekran
Windows CMD: ssh -t -o PubkeyAuthentication=no -o ExitOnForwardFailure=yes -L 127.0.0.1:16082:127.0.0.1:6080 basin@100.79.234.33 "sudo python3 /home/basin/osint-facebook-oturum-kurtar.py --apply --login"
Ekran hazır yazılınca: http://127.0.0.1:16082/vnc.html?autoconnect=1&resize=scale&path=websockify
VNC/WebSocket yalnız sunucunun loopback adresindedir; internet portu açılmaz. SSH penceresi açık kalmalıdır. Kullanıcı Facebook girişini ve gerekiyorsa platform doğrulamasını tamamlar. OTURUM DOGRULANDI yazınca uzak ekranın içindeki Chromium penceresini kapatır. Sadece dış noVNC sekmesini kapatmak yeterli değildir.

## Doğrulama sınırı
15 izole test Windows ve Ubuntu üzerinde geçti. Sahte iki login gate ile gerçek _collect akışı kalan dört kaynağı denemedi ve ikinci çağrıda tarayıcı bile başlatmadı. Süresi dolan çerezler, eksik çerez çifti, şifre alanı, farklı alan adı ve login/checkpoint sayfası doğrulamadan reddedildi. Kalıcı giriş beklemesi ve 429 korunması kontrol edildi. Testler canlı tarayıcı/API/Telegram kullanmadı.
Gerçek Facebook girişinin ve sonraki normal turdaki gönderi okumanın başarıyla tamamlandığı henüz gösterilmedi. Meta oturumu iptal edebilir veya yeniden doğrulama isteyebilir; tekrarının tamamen önleneceği iddia edilmez.

## Paket düzeltmesi
İlk kurulum gerçek dosya değişiminden değil, Windows ters eğik çizgili manifest anahtarlarının POSIX anahtarla aranmasından dolayı kurulmadan durdu. Manifest yolu normalize edildi; iki mevcut dosya için before hash değerleri artık boş değil. Gerçek canlı dosyaların geçici kopyasında ön kontrol geçti; kopyadaki beklenmeyen değişiklik reddedildi. Bu kontroller canlı dosya, servis ve veritabanını değiştirmedi.
