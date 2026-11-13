# Facebook GitHub okuyucusu değerlendirmesi — 13 Kasım 2026

## Kurulu bileşen
Sunucuda /opt/umraniye-osint-facebook-fbgql-deneme içinde bsho5/fbgql 0.1.0, commit 28e03ae84012be44d37a67014fcfcfcc420c9ee9 sabitlenmiş durumda. README ve bağımlılık kilidi SSH üzerinden okundu. Servis loaded/inactive; otomatik timer yok. Şu anda kullanıcı paneline veya Telegram'a aktarım yapmayan ayrı gölge okuyucu. Yerel yapılandırma her tur bir etkin kaynak / en çok 3 gönderi ile sınırlı. Anahtar, çerez ve özel hesap verileri okunmadı. Araştırma sırasında servis başlatılmadı.

Önceki kullanıcının ilettiği 12 Kasım sunucu raporu: tek kaynakta 3 gönderi okundu; 2 text_missing ve 1 outside_fresh_window, kabul 0. Bu rapor taze yerel haber kazanımının kanıtı değildir. Paket README'sindeki eski 'sunucuya SSH erişilemedi' ifadesi artık güncel değildir; güncel okuma erişimi var, sudo yok.

## Karşılaştırma
| Proje | Birincil kaynak bulgusu | Bu proje için değerlendirme |
|---|---|---|
| bsho5/fbgql | README kamuya açık sayfa/profil/grup, tek gönderi ve reel URL'si için anonim GraphQL okuması anlatıyor. GitHub API pushed_at 2026-10-04. 14 commit, küçük topluluk. Açık issue #1 yazar ismi eksikliğiyle ilgili. | İlk aday mevcut kurulu bileşen; yazar/kaynak eşleştirmesi ve güncel haber başarımı gerçek sayfalarda doğrulanmalı. README iddiaları çalışma garantisi değildir. |
| kevinzg/facebook-scraper | GitHub API son push 2024-06-22; açık #1130 örnek okumanın boş sonuç verdiğini bildiriyor. | Doğrulanmış bir iyileşme olmadan geçiş için yeterli kanıt yok. Issue tek başına tüm sayfaların bozuk olduğunu kanıtlamaz. |
| moda20/facebook-scraper | Son push 2024-06-14; açık #75 ve #73 mbasic sorununu, #69 kesilmiş metni bildiriyor. | Aynı erişim/metin sorunlarını tekrar yaşama riski nedeniyle öncelikli aday değil. |
| wael-sudo2/facebook-page-info-scraper | Son push 2026-10-12; README esasen sayfa adı, iletişim bilgisi, kategori ve adres çıkarıyor. | Güncel haber gönderi akışı için doğrudan karşılık değil; bu amaçla yeni bağımlılık eklemeye gerek yok. |
| yt-dlp/yt-dlp | Facebook extractor ve video/reel desteği var; genel amaç ses/video aracı. | Bilinen video bağlantısının teknik bilgileri için yardımcı olabilir. Sayfa haber keşfi veya video içeriğinin olay analizini tek başına çözmez. |

## Önerilen sonraki iş
Mevcut fbgql bileşenini geliştirmek en uygun ilk seçenek olarak değerlendirildi. Önce panelde etkin sayfalarla sınırlı karşılaştırma: tarih, permalink, tam metin, sayfa/yazar kimliği, reel açıklaması ve tekrarlar ölçülmeli. Sayfa sıralaması en yeni olmayabilir; ilk birkaç sonuç tüm sayfayı temsil etmez. Kaynakları döndürme, istek/süre bütçesi, kalıcı içerik kontrol noktası, erişim kısıtında bekleme korunmalı. Yeni içerik eski keşif tarihiyle karıştırılmamalı; paylaşımın görüntüsü/sesi okunmuş gibi davranılmamalı.

Gerçek güncel yerel gönderi okuması ve ortak kabul kuralları doğrulanırsa ana tarayıcı yanında yedek olarak bağlanabilir. Bu araştırmada entegrasyon, kurulum veya otomatik tarama etkinleştirilmedi. Yorumlar, özel gruplar, hesabı döndürme veya erişim engelini aşma planlanmadı.

## Birincil kaynaklar
- https://github.com/bsho5/fbgql
- https://github.com/bsho5/fbgql/issues/1
- https://api.github.com/repos/bsho5/fbgql
- https://github.com/kevinzg/facebook-scraper/issues/1130
- https://api.github.com/repos/kevinzg/facebook-scraper
- https://github.com/moda20/facebook-scraper/issues/75
- https://github.com/moda20/facebook-scraper/issues/69
- https://api.github.com/repos/moda20/facebook-scraper
- https://github.com/wael-sudo2/facebook-page-info-scraper
- https://api.github.com/repos/wael-sudo2/facebook-page-info-scraper
- https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/facebook.py
