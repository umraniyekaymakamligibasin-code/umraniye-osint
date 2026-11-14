# İçerik okuma eksikleri ve uygulama planı

14 Kasım 2026 · Türkiye saati. Kaynak: gerçek sunucu günlüklerinden yalnız toplu ölçümler, güncel kaynak kodu ve GitHub PR notları. Yeni toplama turu veya test mesajı başlatılmadı.

## Öncelikli sonuç

Sorun yalnız tarama sıklığı değildir. Haber toplayıcısının iç yolu bir güvenlik değişikliğiyle kapatılmış; Facebook'un iki okuma yolu da erişim/ayrıştırma sorunları yaşıyor; Instagram API kaynakları beklemeye alınmış ve yardımcı okuyucu kısıtlama hatasını doğru sınıflandırmıyor. Servisin çalışması, içeriğin okunduğu veya panelde göründüğü anlamına gelmiyor.

Önce veri girişini ve doğru durum raporlamasını düzeltmek gerekiyor. Hatalı erişimi daha sık denemek çözüm değildir.

## Doğrulanmış bulgular

| Bileşen | Gerçek bulgu | Etki / öncelik |
|---|---|---|
| Haber toplayıcısı | Kurulumdan sonra art arda beş turda 0 başarılı / 15 başarısız **grup**. `collector.mjs`, `/api/automation/refresh` çağırıyor; güvenlik PR'ı bu yolu koşulsuz 404 yapmış. | Yeni haber girişini kesen kod uyumsuzluğu. P0. |
| X tarayıcı okuyucusu | Son iki saatlik pencerede 21 tamamlanan tur, toplam 4 kabul. Bildirim boş durumları ve konum elemeleri var. | Çalışıyor; kapsam ve doğru eleme oranı ölçülmüş değil. P1. |
| X ek okuyucu | Son 48 saatlik günlük penceresinde 151 okuma turu ve 68 boş sonuç; kurulum sonrasında hem dolu hem boş turlar var. İki yayıncı turu `published`. | Tek başına durmuş değil. Boş sonuç ile eski adayların yeniden değerlendirilmesi ayrı raporlanmalı. P1. |
| Facebook tarayıcı okuyucusu | Son iki saatte 8 tur, 0 kabul; `shared_login_required` nedeniyle erişim beklemeleri görülüyor. | Geçerli oturumdan okuma doğrulanmalı. P0. |
| Facebook ek okuyucu | Kurulumdan sonraki gözlenen 8 turun tamamı `no_readable_sources`; kaynaklarda `empty_or_layout_changed` ve `redirect_requires_review`. | Anonim yedek, ana yolun açığını şu anda kapatmıyor. P0. |
| Instagram API | Son durum: 13 kaynağın tamamı beklemede, `sources=[]`, `pending=0`, buna rağmen `status=completed`. | Yeşil/başarılı durum yanıltıcı. P0. |
| Instagram API erişimi | Günlüklerde kaynak düzeyinde 99 adet `200 / 5258005`, bir adet `110 / 2207013` hata gözlemi. | Tam neden yalnız koddan çıkarılamaz; Meta yetki/erişim ve hedef hesabın erişilebilirliği doğrulanmalı. Beklemeyi körlemesine sıfırlamamak gerekir. P0. |
| Instagram yardımcı medya okuyucu | Son iki saatte 148 `ClientThrottledError`, 37 başarısız tur. Cooldown eşleştiricisi `throttled` adını içermiyor. | Durması gereken yerde başka hesapları da deneyip yük oluşturabiliyor. P0. |
| Zamanlama | Instagram medya zamanlayıcısı kapalı olsa da sıralı denetleyici bu işi kendi planından başlatabiliyor. | Yalnız timer kapatmak ilgili işi durdurmaya yetmiyor. Tek etkin çalışma planı gerekli. P1. |
| Ölçüm betiği | Yetki engelli dizinde `is_file()` false sonucu “dosya yok” diye raporlanabiliyor. Haber günlüklerindeki başarılı/başarısız değerler kaynak değil grup sayısı. | Yanlış teşhis riski. P0/P1. |

DHA ayrı bileşeninde son iki saatlik günlük penceresinde kayıt görülmedi. Bu tek başına arıza kanıtı değildir; etkin zamanlama, son tetikleme ve son gerçek kaynak sonucu ayrıca doğrulanmalıdır. DHA'nın yalnız haber akışına katılması ve Telegram/diğer sağlayıcılardan ayrı kimliği korunur.

Zaman sınırı: son Instagram örneği 14 Kasım 23:28 TSİ civarındadır. Sonraki normal turlar durumu değiştirebilir. Hata gözlemleri tekil gönderi veya tekil kaynak sayısı değildir.

## Hazırlanan acil düzeltmeler

1. **Zamanlanmış haber yolu:** yalnız tam `/api/automation/refresh` yolu mevcut `serviceUpdate` doğrulayıcısına geri bağlanıyor. POST, rastgele iç anahtarın sabit süreli karşılaştırması ve grup sınırı korunuyor. MCP ve diğer eski otomasyon yolları kapalı kalıyor. Sahte kullanıcı başlıkları yetki vermiyor.
2. **Instagram kısıtlama koruması:** `ClientThrottledError`/`TooManyRequests` sınıf adları cooldown'a dahil ediliyor. İlk kısıtlama hatasında hesap turu duruyor; mevcut bir saatlik bekleme ve ilerleme kaydı korunuyor. Yeni oturum veya giriş denemesi yapılmıyor.
3. **Doğru ölçüm:** erişim engeli “permission_denied”, gerçekten bulunmayan dosya “not_present” olarak ayrılıyor. Haber ölçümleri kaynak sayısı diye etiketlenmiyor.
4. **Ana sayfa:** kullanıcının istemediği dört göstergeyi üreten işlev ve çağrı kaldırılıyor. Bildirim simgesi, haber akışı ve yetki kontrolleri korunuyor.

İzole kontroller:

- Gerçek `createCollector → worker → feed reader` zinciri, boş test RSS'leriyle **15 başarılı / 0 başarısız grup** üretti. 164 kaynak/robots isteği ağ yerine test yanıtlayıcısına yönlendirildi; dış istek yok, canlı veritabanına yazma yok.
- Eksik/yanlış iç anahtar reddedildi; GET ve geçersiz grup reddedildi; eski MCP kapalı kaldı.
- `ClientThrottledError` testinde yalnız ilk hesap denendi ve cooldown diske yazıldı.
- Korumalı veritabanı “yok” diye raporlanmadı.
- Gösterge kutularının DOM'da oluşmadığı ve altı ekran genişliğinde mevcut arayüz kontrollerinin geçtiği doğrulandı.

Bu düzeltmeler **kurulum paketi olarak hazırlanmıştır**. Yeni canlı haber kazanımı henüz bunlarla doğrulanmış değildir. Kurulum için sudo parolasını kullanıcının girmesi gerekir.

## Aşama 1 — Erişim ve operasyonu düzelt

### Facebook

- Tarayıcı oturumunu aynı kalıcı profilde bir kez doğrula; okuyucu ile giriş penceresinin profil kilidini doğru devrettiğini kontrol et.
- Oturum gerekli, insan doğrulaması, geçersiz kaynak yönlendirmesi, boş sayfa ve yerleşim değişikliğini ayrı durumlara ayır.
- Anonim fbgql ayrıştırıcısını gerçek, erişime açık kaynaklardan alınmış hassas veri içermeyen yapısal örneklerle doğrula. Boş sonucu başarılı okuma sayma.
- Bir kaynakta erişim engeli varsa sık tekrar denemek yerine o kaynak için bekleme uygula. Diğer okunabilir kaynakların rotasyonu devam etsin.
- Başarı ölçütü: en az üç etkin kaynaktan tarihli/bağlantılı gönderi; bir yeni uygun gönderinin mevcut panel deposunda doğrulanması. Toplam “okundu” sayısı yeterli değildir.

### Instagram API

- 200/5258005 hatasının tam Meta yanıtını yalnız sunucuda, tokenı dışarı çıkarmadan sınıflandır: hesap bağlantısı, uygulama/izin düzeyi, token kapsamı ve kaynak hesabın API'ye uygunluğu.
- Daha önce okunabildiği kanıtlanan iki hedefte tek kontrollü erişim kontrolü yeterli; 13 hedefe peş peşe yeniden istek gönderme.
- Tüm kaynaklar bekliyorsa `completed` yerine kaynak beklemesi göster; sıradaki deneme ve son **gerçek içerik okuma** zamanını ayır.
- Paneldeki etkin/pasif kaynak listesiyle API'nin güvenli hedef listesini eşitle. Şu anda global panel açma/kapama kontrolü var; hedefler kimlik bilgisi paketinden ayrıca yükleniyor. Her hedefteki pasifleştirmenin gerçekten taramayı durdurduğu kanıtlanmalı.
- Erişim engelinde API anahtarı değiştirme, yeni hesapla tekrar deneme veya cooldown silme otomatik çözüm olarak kullanılmaz.
- Başarı ölçütü: en az üç etkin hedefte tarih/bağlantı/metin kanıtı ve bir yeni kaydın API kuyruğundan panel kaydına doğrulanmış aktarımı.

### X

- Bildirim ekranı yardımcı kaynak olsun; hesap gönderileri ve uygun anahtar kelime sorguları bağımsız kapsam sağlasın.
- Planlanan sorgu sayısı, `plans[:6]` sınırı, 120 saniyelik süre ve hesap grupları birlikte ölçülsün. Yapılandırmada yazan üst sınır gerçek tur kapsamı olarak gösterilmesin.
- Her sorgunun checkpoint'i ve bekleyen aday yaşı raporlansın. Panel kaydı doğrulanmadan kuyruk onaylanmasın.
- Konum elemesinden rastgele örnekler değerlendirilmeden konum filtresi gevşetilmesin. 703 eleme gözlemi, 703 yanlış eleme demek değildir; bazı sayaçlar tur içinde kümülatiftir.
- Başarı ölçütü: takipli hesaplardan seçilmiş gerçek referans gönderilerin tamamının okuma/kabul/eleme nedenine kadar izlenebilmesi.

## Aşama 2 — İçerik kaybını ölçülebilir kıl

Her kaynak ve gönderi için tek iz:

`kaynak planlandı → denendi → kimlik/tarih/metin okundu → filtre kararı → kalıcı kuyruk → backend kabulü → gerçek depoda doğrulama → panel görünürlüğü → uygun ise Telegram teslimi`

Her aşama ayrı sayılmalı. Yeniden değerlendirilen eski adaylar yeni okunan içerik sayılmamalı. Sağlık göstergesi servis çıkış kodundan üretilmemeli.

- Yayın zamanı, ilk keşif, son okuma ve teslim zamanları ayrı korunur.
- UTC saklama / Europe-Istanbul gösterim sürer.
- Kısa canlı bildirim penceresi ile geçmişi panelde tamamlama penceresi ayrılır. Gecikmiş eski içerik sesli alarm veya toplu Telegram tekrarı üretmez.
- Her eleme için kararlı neden kodu; izin hatası ile konum/önem/tarih hatası karıştırılmaz.
- Başlık/özet kırpılmasında en dolu kaynak metni korunur. Reels başlığı, açıklama, görsel yazısı ve ses çözümü ayrı kanıt alanlarıdır.
- Videodan içerik çıkarma tek bekleyen iş kuyruğunda, öncelikli yerel adaylardan başlar. OCR/ASR sonucu kesin konum veya doğrulanmış haber kabul edilmez.

## Aşama 3 — Kalite ve kapsam

- Her kanal için etkin kaynaklardan tarihli, bağımsız doğrulanmış referans kümesi oluştur. Erişilemeyen içerikleri ayrıca raporla.
- Yakalama oranını bu sabit kümeye göre ölç; platformdaki tüm haberler için oran uydurma.
- Yanlış ilçe, gündelik kişisel konuşma, yinelenen olay ve yanlış acil öncelik için ayrı hata kümesi tut.
- Aynı gönderi kimliği farklı okuma yollarında tek kayıt; aynı olay farklı kaynaklarda tek olay grubu olsun. Kaynak yayın zamanları kaybolmasın. Haber ve sosyal medya ekran ayrımı korunsun.
- Kaynak hesabının adı tek başına konum kanıtı olmasın. Yerel kaynak + mahalle + olay bağlamı, açık başka ilçe bilgisiyle çelişmiyorsa mevcut çıkarım kurallarına göre değerlendirilsin.
- Aynı olayı Telegram'a yeniden göndermek yerine mevcut olayın kaynaklarını birleştir. Sessiz/öncelikli ve yalnız ilçe politikası değişmesin.

## Aşama 4 — Zamanlama ve kapasite

- Tek etkin zamanlama planı; timer ile sıralı denetleyici birbirini etkisiz bırakmasın veya aynı işi iki yerden başlatmasın.
- Aynı profil/hesapta eşzamanlı iki oturum çalışmasın. Farklı sağlayıcıların ayrı kuyrukları korunsun.
- Aralık, yalnız turun bekleme süresi değildir: tam kaynak rotasyonu = kaynak grubu sayısı × (tur süresi + bekleme). Kaynak başına gerçek en uzun deneme aralığı gösterilsin.
- 13 Instagram hedefi / turda 3 hedef için en az 5 tur gerekir. Beş dakikalık bekleme, her hedefin beş dakikada bir okunduğu anlamına gelmez.
- İstek bütçeleri, rate limit beklemesi ve kuyruk yaşı birlikte yönetilsin. Kritik yerel kaynaklar daha sık, genel/az üreten kaynaklar daha seyrek kontrol edilsin; platform sınırları aşılmasın.
- Hedefler: izinli ve erişilebilir kaynaklarda gecikme dağılımı ölçülerek iyileştirilir. Kaynak erişimi kapalıyken düşük gecikme hedefi başarılı gösterilemez.

## GitHub notlarından kalanlar

İncelenen son ref'lerde PR #3 ve #10 değişmemiştir; #5/#6/#7/#8 arayüz seçenekleridir. Özel issue #9 API erişimi 404 verdi; issue yorumları okunmuş gibi raporlanmıyor. Aşağıdakiler sürümlenmiş raporlar ve koddan çıkarılmıştır:

1. Güvenlik PR'ının iç toplayıcı yolu regresyonu: bu raporda somut olarak bulundu; acil düzeltme ve çalışan zincir testi hazır.
2. Testlerin kapsamı: temiz açılış, sözdizimi ve mock kabul testleri tek başına çalışan toplayıcıyı korumamış. Bundan sonra gerçek iç rotadan okuyucuya giden regresyon kontrolü zorunlu olmalı.
3. Eksik kurulum parçaları: önceki pakette altı betik ve eklemeli şema tamamlandı. Yeni bir makinede tekrarlanabilir tam kurulum, bağımlılık hash'leri ve servis yapılandırmasının kurulabilirliği hâlâ ayrı doğrulama gerektiriyor.
4. İki aylık saklama önerisi uygulanmadı; altı ay korunuyor.
5. Eski Telegram bot dosyalarındaki düzeltme, etkin gönderici doğrulanmadan çözüm sayılmaz. Eski servis kapalı kalıyor; aktif gönderici mevcut uygulama.
6. systemd sertleştirmesi ve eşitleyici yürütücüsünün yeni sürümü canlıya uygulanmış değil. İşletim uyumluluğu ve sır tarayıcısının mevcut kaynaklar üzerinde başarısı ayrı kontrol edilerek alınmalı.
7. VNC'nin sadece bir ayağını Unix soketine geçirmek yeterli tasarım değil. Uzak girişin iki bağlantı ayağı ve oturum yetkisi birlikte ele alınmalı.
8. Sahip kısa parola istisnası, kurum PIN'i, PBKDF2 yükseltmesi ve parola gösterirken yeniden doğrulama için uyumlu geçiş gerekiyor. Mevcut hesaplar rastgele geçersizleştirilmemeli.
9. Üç arayüz PR'ının kurumsal başlıkları gizleme ve kart davranışı sorunları ayrı adayda giderildi; canlı arayüz hâlâ ayrı kurulum gerektiriyor. İstenmeyen dört sayaç bu acil pakette ayrıca kaldırılıyor.
10. Kurumlar arası veri ayrımı, sunucu tarafı yetki iptali, kullanıcı/kurum atamaları ve e-posta alıcıları canlı rol testleriyle sınanmalı; yalnız ön yüzde menü gizlemek güvenlik değildir.

## Kabul ölçütleri ve bitiş tanımı

- Haber iç toplayıcı yolu çalışıyor; doğru/yanlış anahtar sınırları korunuyor.
- Her sağlayıcıda en az bir **yeni gerçek** uygun gönderi, okuyucudan panel deposuna kadar doğrulanıyor.
- Kaynak bazında son gerçek okuma ve hata nedeni görünür; boş/engelli tur başarılı görünmüyor.
- Yaşlanan kuyruk, kayıp onay ve tekrarlı Telegram gönderimi yok; geçmiş gönderim tekrarı başlatılmıyor.
- Donmuş referans kümesinde yakalama ve doğruluk ölçülüyor; sonuç olmadan 100/100 puan verilmiyor.
- En az 48 saat normal çalışma gözleniyor. Kısa kurulum testiyle süreklilik doğrulanmış sayılmıyor.
- GitHub'a yalnız incelenmiş kaynak/plan aktarılıyor; sırlar, ham günlükler, gerçek kullanıcı kayıtları, kuyruk/veritabanı ve yedekler aktarılmıyor.

**Durum:** gerçek sorunlar ve kök nedenler tespit edildi; acil kaynak düzeltmeleri izole testleri geçti. Canlı kurulum, Meta erişiminin düzelmesi ve uçtan uca yeni içerik doğrulaması henüz tamamlanmış sayılmaz.
