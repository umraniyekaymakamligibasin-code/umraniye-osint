# Ümraniye OSINT — haber okuma için 100 puan hedef planı

Hazırlanma: 13 Kasım 2026, Türkiye saati.
Durum: PLANLANDI. Bu belge kurulum, tarama veya canlı değişiklik yapmaz.

## Amaç ve sınır

Haber siteleri, X, Facebook ve Instagram için kapsama, gecikme, doğru ilçe/olay değerlendirmesi, içerik bütünlüğü, tekilleştirme ve güvenilir teslimi ölçülebilir hâle getirmek.

Önceki 70/100 puan mühendislik değerlendirmesiydi. Aşağıdaki puanlar ancak ölçüm ve kabul kontrolleri tamamlanınca verilir. 100 puan, önceden belirlenen kapsam ve kabul ölçütlerinin geçilmesidir; platformlardaki bütün içeriklere sınırsız erişim ya da hiçbir haberin hiçbir koşulda kaçmayacağı sözü değildir.

Etkin kaynaklar başarı puanını yükseltmek için sessizce kaldırılmaz. Erişilemeyen kaynak ve desteklenmeyen içerik türü açıkça raporlanır. Hedeflerin hiçbiri şu anda ölçülmüş başarı gibi sunulmaz.

## Korunacak çalışma kuralları

- Mevcut canlı çalışan X, Facebook ve Instagram akışları korunur; yeni yöntemler önce ayrı değerlendirilir.
- Haber Gündemi ve Sosyal Medya ayrı kalır. Ulusal gündem ayrı kalır; ulusal haber Telegram'a gönderilmez.
- Normal yerel haber sessiz; yalnız mevcut uygun, taze P1/P2 politikası bildirimli çalışır. Emniyet önceliği ilçe kapsamıyla sınırlıdır.
- Aynı olayın başka kaynaktan gelmesi ikinci Telegram mesajı oluşturmaz.
- Kaynak yayın zamanı, olay zamanı ve sistemin ilk keşfi ayrı alanlardır. Gösterim Europe/Istanbul kullanır. Eksik saat/tarih uydurulmaz.
- Mevcut ortak coğrafi sözlük ve kelime tercihleri tek yerden kullanılır. Cadde veya kaynak adı tek başına kesin ilçe kanıtı sayılmaz.
- Son 60 dakika yeni/güncel kabul ve bildirim değerlendirmesi için korunur. Kesinti sonrası kurtarılan eski içerik yalnız uygun arşiv yoluna gider; geçmiş alarm yeniden oynatılmaz.
- Seçimli 72 saatlik brifing ve mevcut altı aylık içerik saklama politikası korunur.
- Yeni ücretli servis, hesap/proxy döndürme veya doğrulama engelini aşan yöntem kurulmaz.
- Toplu test mesajı/e-posta gönderilmez. Gizli anahtarlar, çerezler, veritabanları ve kişi içerikleri GitHub'a yüklenmez.
- Kurum yetkileri ve kurumlar arası veri ayrımı hiçbir optimizasyon için gevşetilmez.

## Her kanal için ortak puan cetveli

Her kanal ayrı ayrı 100 üzerinden puanlanır. Genel puan dört kanalın eşit ağırlıklı ortalamasıdır. Bir kanalın yüksek puanı başka kanalın açığını gizlemez.

| Ölçüt | Ağırlık | Tam puan için kabul ölçütü |
|---|---:|---|
| Kaynak kapsamı ve yakalama | 25 | Etkin kaynakların tamamının okuma/erişim durumu görünür; erişilebilir referans içeriklerde yakalama en az %98; önceden seçilen kritik olumlu örneklerde sıfır kaçırma. Aktif fakat okunamayan kaynak varken kapsam tam sayılmaz. |
| Gecikme | 15 | Öncelikli yerel kaynakların p95 yayın→ilk keşif süresi en çok 10 dakika; diğer kaynakların p95 süresi en çok 30 dakika. İlk keşif→kalıcı kayıt p95 en çok 60 saniye. Kaynak bazında ayrıca izlenir. |
| Yer ve haber değeri | 20 | Etiketli referans kümesinde kabul edilenlerin doğruluğu en az %98, ilgili haberleri yakalama en az %98. Başka ilçedeki asayiş olayına ilçe P1/Emniyet alarmı verilmez. |
| Metin ve tarih bütünlüğü | 10 | Metni erişilebilir örneklerde en az %98 doğru ana metin ve kaynak zamanı; eksik/çıkarılmış bilgiler açıkça etiketli. Tarihsiz içeriğe kesin saat verilmez. |
| Aynı yayını/olayı birleştirme | 10 | Sabit kimlik/URL tekrarlarında sıfır çift kayıt; referans olay eşleştirmelerinde en az %98 doğruluk. Belirlenmiş farklı olay örneklerinde sıfır yanlış birleşme. |
| Kalıcı aktarım ve görünürlük | 10 | Referans teslimlerin tamamında okuma→kabul→kalıcı kayıt→yetkili panel zinciri doğrulanır. Başarısız ve belirsiz teslimlerde kayıt kaybı olmaz; tekrar denemesinde ikinci olay/bildirim oluşmaz. |
| Kararlılık ve toparlanma | 10 | 48 saat doğal çalışma gözleminde uygulama kullanılabilirliği en az %99,5; planlanan erişilebilir kaynak kontrollerinin en az %99'u tamamlanır veya kayıpsız yeniden planlanır. Kontrollü yeniden başlatmada kayıp yoktur; kaynak limitleri aşılmaz. |
| **Toplam** | **100** | Bütün maddeler kanıtla kapanır. |

Bu eşikler önerilen ürün hedefleridir. Platform sınırları bir hedefi uygulanamaz yaparsa hedef sessizce değiştirilmez; ölçüm ve sınır raporlanır.

Puanlama: her ölçütün testleri önceden numaralanır. Ölçüt puanı = ağırlık × geçen test sayısı / o ölçütteki test sayısı. İlgili eşik testi başarısızsa ölçüt tam puan alamaz. Ölçülmeyen test GEÇTİ sayılmaz; bekliyor olarak kalır. Referans kümesi ve eşikler düzeltme öncesinde dondurulur. Güvenlik barajı başarısızsa toplam puan yüksek olsa da canlıya geçiş yapılmaz.

## 1. Ortak ölçüm ve kaynak envanteri

Önce yeni taramalar eklemek yerine mevcut çıktılardan ortak görünürlük oluşturulur.

Her etkin kaynak için şu alanlar tutulur:

- platform, kaynak kimliği ve panelde etkin/pasif tercihi;
- son deneme, son gerçekten içerik okuma, son yeni kayıt ve sıradaki hedef;
- erişim durumu: okunuyor / yeni içerik yok / bütçe nedeniyle ertelendi / erişim kısıtlı / kaynak adresi değişmiş / desteklenmeyen hesap türü / geçici ağ hatası;
- okunan benzersiz yayın sayısı, yeni kimlik sayısı, mevcut kayıt güncellemesi;
- kabul/eleme nedeni, teslim onayı, panel görünürlüğü ve ölçülen gecikme;
- son ulaşılan içerik sınırı ve kapanmamış okuma aralığı.

Bir sürecin success veya completed dönmesi içerik okuduğu anlamına gelmez. Aynı 75 eski yayının yeniden okunması 75 yeni haber diye sayılmaz. İstek bütçesinin dolması erişim engeli diye işaretlenmez.

Günlük özet yöneticiye sunulur. Ana sayfayı açan kullanıcıların sayısı yeni toplama işi başlatmaz. Önbellek ve istek birleştirme kullanıcı/kurum yetki sınırlarını aşmaz.

Kabul: kaynak başına durum ve gecikme raporu elde edilir; sayıların anlamı açık ve tutarlıdır. Ölçüm için yeni tarayıcı veya ziyaretçi başına tarama oluşturulmaz.

## 2. Instagram: 55 → hedef 100

En öncelikli iş, okunan içeriğin doğru otomatik değerlendirilmesidir.

1. İnceleme kategorisindeki 77 kaydı nedenlerine göre ayır: gerçekten belirsiz konum, eksik açıklama, yalnız görsel/video, düşük haber değeri, gerçek ilgili olay, teknik aktarım hatası. Bunların hepsini otomatik onaylama.
2. Kayıtlı yerel kaynak + mevcut mahalle + olay bağlamı kuralını tek ortak modülde uygula. Açık başka ilçe/il bilgisi kaynak bağlamını geçersiz kılsın. Çıkarım bağımsız doğrulama gibi gösterilmesin.
3. API'nin okuyamadığı hesaplarda kullanıcı adı değişikliği, hesap türü ve erişim sınırını ayır. Code 110/subcode 2207013 için sonsuz yeniden deneme yapılmasın. Erişilemeyen aktif kaynak görünür kalsın.
4. Dönüşümlü kaynak okumasını son erişim zamanı ve önceliğe göre sırala. Tek bir hatalı kaynak diğerlerini bekletmesin.
5. Açıklama, kalıcı bağlantı, kaynak zamanı ve varsa güvenilir medya bilgilerini tamamla. API'nin sunmadığı hikâye/kanal/veri akışı varmış gibi davranma.
6. Metinsiz medya için önce mevcut yerel araçları ve donanımı incele. Yalnız erişimine izin verilen medyada, ayrı sınırlı iş kuyruğuyla OCR ve gerekirse ses çözümlemesi değerlendir. Medya kimliğiyle önbellekle; aynı videoyu yeniden çözümleme. Yeni model/paket kurulumu ancak kaynak ve kalite ölçümü sonrası yapılır.
7. Çözümlenen metin türetilmiş kanıt olarak etiketlensin. Konum/tarih yeterli değilse P3 ve düşük güvenle işlenebilsin; belirsizlik kritik alarmı açmasın. Personel incelemesi normal akışı durduran zorunlu adım olmasın.
8. API kuyruğu ancak mevcut kayıt veya kalıcı ret kararı doğrulandıktan sonra onaylansın. Kaybolan içerik teknik hata yüzünden onaylanmış sayılmasın.

Özel kabul: bilinen Namık Kemal/Köşk Sokak örneği dahil ilgili yerel olaylar doğru işlenir; kişisel sohbet/reklam/ilçe dışı benzer adlar elenir. Geçmiş örnekler izole regresyonda değerlendirilir; geçmiş Telegram gönderimi yapılmaz. Canlı yakalama ayrıca yeni gerçek örneklerle sınanır.

## 3. Facebook: 70 → hedef 100

1. Yeni fbgql okuyucusunun doğal turlarını ölç. İlk 96 gönderilik tur bütün kaynakların kararlılığına kanıt sayılmaz.
2. İstek bütçesi sonuna kalan sayfa, bir sonraki turda öncelik kazansın. Yetersiz bütçeyle sayfaya başlayıp onu erişim hatası/beklemeye düşürme davranışını düzelt.
3. Mahallemiz Ümraniye Çakmak ve yönlendiren kaynak gerçek adresiyle doğrulansın. Yönlendirme yalnız izin verilen Facebook alan adları ve kamuya açık hedef için incelensin; giriş/doğrulama atlanmasın.
4. Önemli yerel sayfalara daha kısa tekrar ziyaret hedefi ver; genel İstanbul/ulusal kaynaklar diğerlerini aç bırakmasın. Toplam istek ve süre bütçesi korunsun.
5. Sabitlenmiş eski gönderi yüzünden tarama erken bitmesin. Bilinen içerik sınırına ulaşma, yeni kimlikler ve açık aralıklar kaydedilsin. Aynı ilk 12 kaydı döndürmek kapsam başarısı sayılmasın.
6. Metinsiz veya kesilmiş gönderide mevcut bütçe içinde kalıcı bağlantı okuyucusu kullanılsın. Açıklama yoksa görüntü/ses okunmuş gibi içerik üretilmesin; izinli yerel medya kuyruğuna bağlanması ayrıca ölçülsün.
7. Sayfa kimliği, gönderi kimliği, pfbid ve paylaşım bağlantıları ortak yayına bağlansın. Ana okuyucu ve yedek aynı yayını iki kez oluşturmasın.
8. Kaynak sağlık durumu ile anonim yedeğin durumu ayrı gösterilsin. Yedeğin çalışması ana hesabın doğrulandığı anlamına gelmesin.

Özel kabul: etkin kaynakların tam dolaşım raporu çıkar; bütçeden ertelenen sayfa atlanmaz; kaynak adı/konumu tek başına alarm açmaz. Gerçek yeni gönderiler hem depoda hem yetkili ekranda doğrulanır.

## 4. X: 75 → hedef 100

1. Ana okuyucu ve twscrape yedeğinin ortak kaynak kapsamını çıkar. Yalnız farklı okuyucuda bulunmayı doğrudan diğerinin kaçırdığı haber diye sayma; aynı kapsam ve zaman aralığını karşılaştır.
2. Bildirim akışındaki no_dated_posts durumunu ayır: gerçekten boş akış, gönderi kartı olmayan bildirim, seçici hatası, dil farklılığı, yüklenmeyen sayfa veya erişim sorunu. Boş akışta sonsuz kaydırma yapılmasın.
3. Kritik hesapları doğrudan ve dönüşümlü oku. Sorgu başına kalıcı ilerleme ve eksik sayfa aralıklarını koru; yeni üst akış önce okunsun.
4. Kaydedilmiş aramalar etkin merkezi kelimelerden üretilsin. Tek bir dar kelime grubuyla bütün olaylar temsil edilmiş sayılmasın; kaynak hesabı ve ilçe araması birlikte kullanılsın.
5. Yanıt/alıntı/yeniden paylaşımın özgün metni, yazarı ve kaynak zamanı karıştırılmasın. Uzun gönderinin tam metni alınsın; sınırlı/erişilemeyen bölüm açıkça belirtilsin.
6. Yedek kuyruğundaki onay ve tekrar davranışını gerçek teslim kayıtlarıyla denetle. Belirsiz POST sonucu hemen başarı sayılmasın; normal yeniden deneme kimlikle tekilleşsin.
7. Hesap kısıtında bekle, operatöre tek açıklayıcı durum ver; hesap/proxy döndürerek kısıt aşmaya çalışma.

Özel kabul: daha önce verilen İlçe MEM örnekleri dahil aynı olayın X yayını ayrı kaynak olarak bulunur; olay kartı bir kalır. Bildirim ekranı boşken doğrudan kaynak/aramanın çalışması sürdürülebilir; kapsam açıkça raporlanır.

## 5. Haber siteleri: 80 → hedef 100

1. RSS/Atom ile sayfa okuyucusunu URL ve yayın kimliği üzerinden ilişkilendir. HTML kırıntısı veya menü metni haber özeti olarak kullanılmasın.
2. Kaynak bazında yayın zamanı, ana metin, görsel ve kalıcı bağlantı doğrulansın. İlk keşif zamanı korunurken son güncelleme ayrı tutulsun.
3. Bozuk RSS, HTML yerleşim değişikliği, erişim engeli ve gerçekten yeni haber olmaması ayrı raporlansın.
4. Öncelikli yerel kaynakların tekrar ziyaret hedefleri ölçülsün. Koşullu HTTP ve uygun önbellek destekleniyorsa kullanılsın; her kullanıcı ziyareti kaynak taraması başlatmasın.
5. Ümraniye / ulusal / ilçe dışı ayrımı mevcut ortak konum motoruyla yapılsın. Sakarya Karasu ve benzer sokak adı örnekleri negatif regresyon olarak tutulsun.
6. Haber güncellemesi ve farklı yayıncı başlıkları aynı olay kimliği altında toplansın. Aynı mahallede başka saatte olan farklı olaylar birleştirilmesin.
7. Güvenilir yerel kaynakta çıkan önemli haberin kaynak listesi, tarama, eleme ve kabul kararları açıklanabilsin. Gerekiyorsa yeni kaynak önce doğrulansın; rastgele kaynak sayısı artırılmasın.

Özel kabul: gerçek yerel haberler güncel ana metin/tarihle gelir; menü/sosyal paylaşım düğmeleri özete karışmaz; ilçe dışı olay yerel alarm oluşturmaz.

## 6. Ortak olay ve kalıcı aktarım

İlişkilendirme iki aşamalıdır:

1. Aynı yayın: platform kimliği, canonical URL ve kaynak kaydı.
2. Aynı olay: olay türü + gerçek konum + olay/yayın zaman aralığı + kişi/kurum ve ayırt edici ayrıntılar.

Sadece aynı başlık veya tek ortak kelime yeterli değildir. Yaralı/ölü sayısı güncellense de aynı olay sürer. Kesin ilişki bulunmayan iki olay zorla birleştirilmez. Manuel ayırmalar korunur. Haber ve sosyal akışın ayrı görünümü korunurken ortak olay dosyasında doğrulanmış kaynak ilişkileri gösterilir.

Teslim adımları: keşfedildi → ham kayıt kalıcı → değerlendirildi → kalıcı kabul/ret → mevcut sistemden teslim onayı → panel görünürlüğü. Her aşamanın nedeni ve zamanı izlenir. Yeniden başlatmada onaylanmamış iş kalır. Kesinti sırasında ilk keşif zamanı yeniden yazılmaz.

Telegram mevcut olay kimliğini kullanır. Eski/güncellenen kaydın kuyruğa tekrar girmesi ikinci mesaj oluşturmaz. Testler sahte haberi canlı akışa veya gerçek kanala sokmaz.

## 7. Doğrulama paketi

- Her kanal için en az 30 etiketli referans içerik: ilgili, ilgisiz, eski, farklı ilçe/aynı sokak, kişisel sohbet, reklam, tekrar, güncellenen aynı olay ve ayrı benzer olay örnekleri.
- Tarihsel regresyon kümesi ile canlı yakalama kümesi ayrı tutulur. Tarihsel örnek, yeni taramada yakalama başarısının yerine geçmez.
- Referans seti geliştirmeden önce sabitlenir. Beklenen karar ve gerekçesi yazılır; sonuçlara göre zor örnekler kümeden çıkarılmaz.
- 48 saat normal çalışma; ek agresif tarama ve sürekli sentetik test yok. Kaynakların gerçek doğal yayınları karşılaştırılır. Yeterli gerçek kritik örnek yoksa kritik yakalama doğrulaması bekliyor kalır.
- Kontrollü bağlantı kesilmesi/yeniden başlatma, kuyruk onayı, çift teslim ve kaynak limiti denemeleri izole ortamda yapılır.
- Yetkili masaüstü ve mobil tarayıcıda gerçek kayıtların açıldığı, kaynak/tarih/metnin doğru olduğu kontrol edilir.
- Yetkisiz kullanıcı ve başka kurum hesabı, kayıt kimliği değiştirerek içerik veya sayaç sızdıramaz. Ortak cache yetkiler arasında paylaşılmaz.
- Kaynak metnine eklenmiş komut veya HTML çalıştırılmaz. İzinli alan adı dışına medya/HTTP isteği yapılmaz; gizli bilgiler loglara düşmez.

Güvenlik barajları: yetkisiz veri görünmesi, ilçe dışı kritik alarm, geçmiş alarmı yeniden oynatma veya gerçek çift bildirim görülürse ilgili değişiklik yayımlanmaz; kurulmuşsa o değişiklik geri alınır.

## 8. Uygulama sırası ve teslimler

| Aşama | İş | Teslim / çıkış koşulu |
|---|---|---|
| A | Ölçüm ve referans seti | Kaynak envanteri, uçtan uca sayaçlar, dondurulmuş beklenen kararlar ve başlangıç ölçümü. |
| B | Instagram otomatik değerlendirme | İnceleme nedenleri, ilgili örneklerin doğru otomatik akışı, desteklenmeyen kaynakların açık durumu. |
| C | Facebook kapsam ve erteleme | Bütçe/erişim ayrımı, kapanan açık aralıklar, gerçek kaynak tekrar ziyaret raporu. |
| D | X bildirim ve kaynak kapsamı | Boş ekran/okuyucu hatası ayrımı, hesap/aramanın birlikte kapsaması, onaylı kalıcı teslim. |
| E | Haber metni ve ortak olay kimliği | Tam metin, doğru ilçe ayrımı, farklı başlıkların güvenli birleşmesi ve yanlış birleşmelerin engellenmesi. |
| F | Doğal çalışma ve kabul | 48 saat raporu, gerçek tarayıcı kontrolü, her kanalın kanıtlı puanı ve kalan eksikleri. |

Her aşama: güncel canlı sürüm doğrulama → ilgili kod ve gerekli veri yedeği → izole anlamlı kontroller → tek sınırlı kurulum → doğal akıştan doğrulama → rapor → GitHub sürümü.

Kurulumlar birleştirilebilir; hata nedeni belirsizken çok sayıda politika aynı anda değiştirilmez. Çalışan sistem korunur. Sunucu yönetici yetkisi gerektiren adımlar için hazır, sürüm kontrollü tek kurulum hazırlanır; parola/anahtar sohbete istenmez. Gereksiz servis yeniden başlatma, yeni timer ve tarayıcı çoğaltma yoktur.

## Tamamlanma raporu

Her kanal için: etkin/erişilebilir/okunamayan kaynaklar; benzersiz keşif, kabul, ret ve nedenler; yeni kayıt ve güncelleme; p50/p95 gecikme; referans kümesindeki doğru/yanlış kararlar; kritik kaçırmalar; çift yayın/yanlış olay birleşmeleri; kayıpsız teslim ve görünürlük; hata/toparlanma; kaynak tüketimi; GitHub commit ve geri alma yolu.

Bir maddede kanıt yoksa DURUM BEKLİYOR yazılır. Dört kanaldaki kabul maddeleri geçmeden 'hepsi 100 oldu' denmez.
