# Kurum koordinasyonu — 13 Kasım 2026

Durum: Yerel geliştirme sürümü. Canlıya kurulmadı; kuruluma hazır değildir.

Bu sürümde düzeltilenler:
- Kullanıcı onayının zorunlu alanları ve güncelleme zamanları.
- Olay kaydının benzersiz anahtarı ve tekrar işleme koruması.
- Birden fazla alıcı için ayrı e-posta kuyruğu satırları.
- E-posta şablonu, gönderim anahtarı, yeniden deneme durumu ve işlem kilidi sürelerinin şema uyumu.
- Geçmiş kayıtların e-posta üretmemesi.
- Konu onayı kaldırıldığında okuma/yazma erişiminin kesilmesi.
- Durum değişikliği ile inceleme geçmişinin aynı işlemde yazılması.
- Devre dışı kurum/konu izinlerinin kaldırılabilmesi; yeni izinler için onay kontrolü.

Doğrulama: `node verify.mjs` geçti. SQLite üzerinde kurumlar arası liste/detay/yazma reddi, yönetim erişimi, kullanıcı onayı, çift olay, çoklu alıcı, tekrar gönderim, geçmiş gönderim engeli ve izin kaldırma sınandı. Test verileri yalnız bellek içi veritabanındadır.

Kalan zorunlu işler:
- Mevcut gerçek oturum sistemiyle sunucu adaptörü ve genel portal onay kapısının tüm veri yollarına bağlanması.
- Merkez yetkilisinin tüm kurum incelemelerini görebileceği ekran ve izin yönetimi.
- Emniyet, sosyal yardım ve diğer hassas konuların yetkili kuruma uygun veri azaltma politikası. Mevcut sürüm bu konuları otomatik yönlendirmiyor.
- Gerçek e-posta sağlayıcısı ve doğrulanmış kurum alıcıları.
- Ayrı ortam kurulum/geri alma paketi ve gerçek tarayıcı doğrulaması.

Canlı dosyalar, servisler, kayıtlar ve Telegram bu çalışmada değiştirilmedi. Başarı sonucu yalnız yerel kontrolleri ifade eder.


Son geliştirme:
- Kurum/konu onayı, konu izin kutuları, kurum üyeliği, genel gündem erişimi ve inceleme geçmişi yönetim ekranı eklendi.
- En dış yönlendirici için gerçek oturum adaptörü kabul eden kurum erişim kapısı eklendi. Kurum kullanıcısı genel API/veri varlıklarına erişemez.
- Kullanıcı paneline durum güncelleme ve çoklu kurum seçimi eklendi.
- verify-host.mjs: genel portal erişim reddi, sahte kimlik başlığı reddi, genel gündem onayı ve anlık geri alma geçti.
- Sunucuya kurulum yapılmadı. Kurulumdan önce gerçek iç servis kimlik denetimi, mevcut oturum API bağlantısı ve giriş/çıkış yolları sunucunun güncel koduyla doğrulanmalı.
- Yönetim ekranı HTML/JS olarak hazır; gerçek tarayıcı üzerinden doğrulanmadı.
