# Kurum koordinasyonu — çalışma mantığı ve görev sınırları

13 Kasım 2026. Tasarım ve yerel geliştirme raporu; canlı tamamlanma raporu değildir.

## Temel ayrım
Bir kurumun konu izni, o konudaki bütün haberleri otomatik olarak kuruma atamaz. Görüntüleme için aynı anda aktif hesap, aktif kurum üyeliği, etkin kurum, konu izni ve o kuruma oluşturulmuş olay kaydı gerekir. Genel gündem izni ayrıca verilir. Otomatik açılan kurum hesaplarına genel gündem izni verilmez.

## Olay değerlendirme sırası
1. Kaynağın yayın tarihini ve içeriğini koru; keşif tarihini yayın tarihi yerine kullanma.
2. Aynı olayı tek kimlik altında birleştir; yeni kaynak mevcut dosyaya eklensin.
3. Ümraniye bağlamı ile açık başka ilçe/şehir bilgisini değerlendir. Kaynak adı tek başına yeterli değildir.
4. Olayı konu, hizmet türü, varlık sahibi/işletmeci ve konuma göre değerlendir.
5. Birincil görevli kurum ile yalnız gerçekten ilgisi olan yardımcı kurumları ayır. Yardımcı kurumun erişimi de ayrı kayıt ve izin gerektirir.
6. Yetki belirsizse tüm kurumlara dağıtma. Merkezde tut; gerekçe kaydet. Bu işlem acil çağrı veya resmî ihbar yerine geçmez.
7. Her kurum için kişisel verileri azaltılmış ayrı görünüm oluştur. Çocuk, sağlık, yardım ve soruşturma ayrıntılarını genel kurum listelerine kopyalama.
8. Yalnız yeni atanan olay için e-posta kuyruğu oluştur. Boş dönem mesajı gönderme. Aynı kurum/olay/alıcıya ikinci ilk bildirim oluşturma.

## Doğrulanan sınır örnekleri
- AYEDAŞ: dağıtım arızaları ve genel aydınlatma. Elektrik satış/fatura konularını dağıtım arızası gibi yönlendirme. Kaynak: https://ayedas.com.tr/sss/musteri-iliskileri ve https://www.ayedas.com.tr/sayfa/sebeke-operasyonlari
- Ümraniye Belediyesi Temizlik İşleri: çöp konteyneri bakım/onarımı, temizlik ve ilgili atık toplama. Kaynak: https://umraniye.bel.tr/kurumsal/yonetim-semasi/mudurlukler/temizlik-isleri-mudurlugu/
- Yağmur suyu: yalnız su sözcüğüne göre İSKİ ataması yapılamaz. İBB yol bakımının sorumluluğundaki baca/ızgara ve yol drenajı görevleri ayrıca bulunur. Hat/varlık ve yol sorumluluğu gerekir. Kaynak: https://yolbakim.ibb.gov.tr/sayfa/yagmur-suyu ve İSKİ kamu hizmet envanteri: https://cdn.iski.istanbul/uploads/2023_SK_Hizmet_Envanteri_1e2db8b36d.pdf
- İGDAŞ: doğal gaz acil tehlikesi ile iç tesisat onarımı farklıdır. Gaz güvenliği ihbarı 187; onarım görevini her durumda aynı kurum işi gibi göstermeme. Kaynak: https://igdas.istanbul/ ve https://igdas.istanbul/musteri-hizmetleri/ic-tesisat/7-24-sertifikali-firmalar
- SHM: sosyal hizmet desteği ve uygun hizmet modeline yönlendirme. Maddi yardım, korunma, bakım ve çocuk güvenliği aynı kategori değildir. Kaynak: https://www.aile.gov.tr/sss/aile-ve-toplum-hizmetleri-genel-mudurlugu/sosyal-hizmet-merkezleri/
- Ümraniye SHM varlığı resmî kuruluş listesinden doğrulandı: https://aile.gov.tr/istanbul/resmi-kuruluslar/sosyal-hizmet-merkezleri/

Bu araştırma 24 kurumun bütün alt görevlerinin resmen doğrulandığı anlamına gelmez. Emniyet, MEM, SYDV, sağlık, ulaşım ve diğer kurumların ayrıntılı görev/varlık sınırları ayrıca doğrulanmalıdır. Önceki 54 eşleştirme kullanıcı talebine dayanan başlangıç izinleridir; resmî görev doğrulaması olarak sunulmamalıdır.

## Kurum hesapları
Her kurum için benzersiz kurum_... hesabı ve kriptografik rastgele şifre. Tekrar kurulum mevcut hesabı veya şifreyi değiştirmez; aynı kullanıcı adına rastlanırsa sahiplenmez. Giriş doğrulaması mevcut PBKDF2 biçimiyle uyumludur. Gösterilebilir şifre AES-256-GCM ile ayrı anahtarla saklanır; anahtar veritabanında bulunmaz. Yöneticiye özel POST işlemiyle gösterilir; erişim kayda alınır. Ekranda 30 saniye sonra ve sekme gizlenince temizlenir. Şifre değişikliği mevcut oturumları kapatır. Kullanıcı şifresini başka ekrandan değiştirirse kasadaki eski şifre gösterilmez.

Paylaşılan kurum hesabı kurum seviyesinde iz bırakır; işlemi yapan kişiyi ayırt etmek gerektiğinde mevcut bireysel kullanıcı ataması kullanılmalıdır.

## Mevcut gerçek durum
Yerel hesap modülü ve testleri hazır. Tekrar oluşturmama, hash uyumluluğu, şifreli saklama, şifre yenileme, oturum iptali ve eski şifre koruması geçti. Yönetici API/ekran bağlantıları yerel kodda hazır. Canlıya kurulmadı; tarayıcıda şifre işlemleri doğrulanmadı. Yeni kurulum paketi henüz hazırlanmadı. Otomatik olay yönlendirmesi ve gerçek e-posta gönderimi halen tamamlanmadı.

## Çok kurumlu olaylar — ek tasarım
Tek olay kimliği korunur. Kurumların her biri ayrı görev ve erişim görünümü alır; ortak olay kimliği diğer kurumun notlarını, kullanıcılarını veya yardım/soruşturma ayrıntılarını açmaz.

Örnek yönlendirme tasarımları (kesin görev tespiti için bağlam gerekir):
- Su borusu patlaması ve elektrik kesintisi aynı olayda: su altyapısı görevi İSKİ, açıkça bildirilen elektrik dağıtım arızası AYEDAŞ. Sadece yakında elektrik direği görülmesi ikinci atama nedeni değildir.
- Okulda yangın: yangın müdahalesi, okul hizmet sürekliliği, varsa açıkça belirtilen gaz/elektrik tehlikesi farklı görevlerdir. Öğrenci kimlikleri diğer kurumlara yayılmaz.
- Yardım ihtiyacı: maddi destek ile sosyal hizmet/bakım ihtiyacı ayrı kanıtlara dayanıyorsa SYDV ve SHM ayrı görevlerle ilgili olabilir. Her yardım sözcüğü ikisine birden dağıtılmaz.
- Trafik ve devrilen direk: elektrik altyapısı ile yol güvenliği ayrı görevlerdir. Yol bakım kurumu yolun sahibi/işletmecisine göre belirlenir; ilçe/büyükşehir varsayılmaz.

Kurallar iki durumu ayırır: birbirinden bağımsız görevler birlikte atanabilir; aynı görevin hangi kuruma ait olduğu belirsizse rakip kurumlara toplu erişim açılmaz. Aynı görev için ortak yetki ancak açıkça tanımlanmış ortak görev grubu ile kabul edilir. Birincil kurum rolü kuralda belirtilir; listedeki ilk kurum kendiliğinden birincil olmaz. Bir kurumun kapattığı iş diğer kurumun görevini kapatmaz.

Yerel uygulama: classifyForInstitutions ve projectMultiInstitutionEvent eklendi. Bağımsız görev, rakip yetki, yinelenen rota, başka ilçe ve onaysız kural kontrolleri geçti. Hassas konuların veri azaltma politikaları tamamlanmadığından bu geliştirme canlı otomatik yönlendirmeyi açmaz.
