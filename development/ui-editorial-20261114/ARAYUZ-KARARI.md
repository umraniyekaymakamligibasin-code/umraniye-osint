# Arayüz kararı — 14 Kasım 2026

Önerilen düzen: açık renkli, kırmızı vurgulu kurumsal haber portalı.

PR #6'nın okunabilir içerik yoğunluğu ve mevcut portalın kart yapısı esas alındı. #7'nin koyu komuta paneli ve #8'in klasik gazete görünümü kurum personelinin günlük tarama ihtiyacı için seçilmedi. Üç tasarımın da gizlediği müdürlük/platform başlıkları görünür bırakıldı. Değişiklikler sıfırdan yazılan, mevcut bileşenlere kapsamlı bir CSS katmanı olarak uygulanıyor; mevcut üç PR doğrudan birleştirilmiyor.

- Kurum logosu ve dört ayrı kurumsal metin korunuyor.
- Haberler kart olarak açılıyor; mevcut liste seçimi çalışıyor.
- Görseli bulunmayan kayıtların alanı küçültüldü, açıklaması korundu.
- Arama, tarih, öncelik ve ek filtreler mobilde de görünür/kullanılabilir.
- Masaüstünde sol menü, haber alanı ve sağ gelişmeler sütunu var. Dar ekranda tek sütun ve açılır menü korunuyor.
- Haber ve sosyal medya ayrımı, brifing bağlantısı, olay dosyası ve alt bilgi korunuyor.
- Yeni paket veya sunucu tarayıcısı kurulmadı. Toplama, yetki, Telegram ve veritabanı mantığı değişmedi.

Değişen üç dosya:

1. application/src/assets/portal-editorial.css
2. application/src/portal.html — yalnız tema niteliği ve CSS bağlantısı
3. application/server/portal-shell.mjs — yalnız yeni CSS varlığının sunulması

## Doğrulama

Yerel, ayrı profilli headless Chrome ile 320, 390, 768, 1024, 1440 ve 1920 piksel genişlikleri kontrol edildi. Yatay taşma yok. Kurumsal metinler görünür. Kart/liste geçişi, haber/sosyal medya gezinmesi, platform filtresi, olay dosyası aç/kapat ve mobil menü kontrolleri geçti. JavaScript çalışma hatası yakalanmadı.

Ekran görüntüleri açıkça belirtilmiş arayüz test kayıtları içerir; canlı haber görüntüsü değildir. Test girdileri hiçbir OSINT veritabanına yazılmadı. Bu kontrol, canlı veri veya sunucu yetki denetiminin doğrulaması değildir. Yetki mantığı değiştirilmedi.

Canlı görünüm değiştirilmedi. Ayrı kurulum betiği sürüm özeti denetimi, üç dosyanın yedeği ve geri alma içerir. Kurulursa yalnız mevcut uygulama kısa süreli yeniden başlatılır; zamanlayıcılara dokunulmaz.

## Önceki paketin kurulum sonucu

Kullanıcının ilettiği çıktı `reviewed_pr_fixes_installed`: 70 dosya kurulmuş, 3001/3000 kontrolleri geçmiş, ağ geçidi ve Telegram servisi yeniden başlatılmamış. Altı aylık saklama korunmuş. `externalBrowserVerified` ve `newLiveSocialPostVerified` false; bunlar doğrulanmış sayılmaz. Yedek: `/var/backups/umraniye-osint-reviewed/reviewed-pr-release-20261114T194648Z`.
