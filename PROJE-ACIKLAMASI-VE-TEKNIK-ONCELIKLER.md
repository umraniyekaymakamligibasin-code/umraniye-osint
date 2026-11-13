# Ümraniye OSINT: proje açıklaması ve teknik iyileştirme planı

**Durum:** İncelenecek ve çözülecek konuların kapsamı  
**Öncelik:** Kullanıcı deneyimi, hız, veri güncelliği ve güvenlik  
**Kapsam:** Ümraniye Dijital Gündem Merkezi, haber akışları ve sosyal medya kaynaklarının uygulama kodu

## Proje ne yapıyor?

Ümraniye OSINT, haber ve açık sosyal medya kaynaklarından elde edilen içerikleri tek bir dijital gündem merkezinde toplamayı, incelemeyi ve ilgili ekranlarda göstermeyi amaçlar. Depoda ana uygulamanın sunucu, arayüz ve işçi kodları; haber ve sosyal içerik işleme bileşenleri; X ve Facebook için yardımcı tarama kodları; Instagram bileşenleri ve dağıtım belgeleri bulunur.

Uygulamanın temel akışı kaynakların belirlenmesi, içeriklerin alınması, saklanması ve işlenmesi, ardından kullanıcı arayüzünde filtrelenerek gösterilmesidir. Herhangi bir performans sorunu bu zincirin tek bir noktasından veya birden çok aşamanın birleşiminden kaynaklanabilir. Bu nedenle iyileştirmeler ölçüme ve tekrarlanabilir testlere dayanmalıdır.

## Çalışma ilkeleri

- Önce mevcut davranış ve süre ölçülür; ardından değişiklik yapılır ve aynı ölçüm tekrar edilir.
- Bir sorunun muhtemel sebebi, kanıt elde edilene kadar kesin teşhis olarak yazılmaz.
- Haber ve sosyal medya verisinin yeniden kullanılması mümkünse aynı içerik tekrar indirilmez veya aynı işlem yeniden yapılmaz.
- Kaynak tarama işlemleri ile ekranda gezinme birbirinden ayrılır. Sekme değiştirmek, tarih filtresini değiştirmek veya sayfalamak gereksiz ağ çağrılarını tetiklememelidir.
- Değişiklikler doğru görünüm, yetki ve veri bütünlüğünü korumalıdır. Önbellek kullanımı bayat veya yanlış içeriği sessizce göstermemelidir.
- Kimlik bilgileri, oturumlar ve kişisel erişim verileri koddan ayrı tutulur; güvenlik incelemesi kod, yapılandırma, Git geçmişi ve dağıtım ayarlarını kapsar.

## Bildirilen sorunlar ve çözüm planı

### 1. Bugün, bu hafta ve bu ay filtreleri arasında geçişte donma

**Gözlem:** Tarih aralığı değiştirildiğinde arayüz bekliyor veya donmuş gibi görünüyor. Haberlerin her geçişte yeniden çekiliyor olması ihtimaller arasında.

**Araştırma:** Tarayıcı ağ kayıtlarında her filtre geçişinde hangi isteklerin gönderildiği; isteklerin aynı veriyi yeniden indirip indirmediği; sunucu ve veritabanında sorgu sayısı, yanıt boyutu ve gecikme ölçülür. İstemcide filtre değişiminde tüm ekranın yeniden çizilip çizilmediği, yinelenen istekler, uzun ana iş parçacığı görevleri ve aynı anda çalışan eski istekler incelenir. Sunucuda tarih filtresinin doğru sorguya taşınıp taşınmadığı kontrol edilir.

**Düzeltme hedefi:** Tarih aralığı seçimi yalnızca gerekli veriyi ve görünümü güncellesin. Aynı veri tekrar tekrar indirilmesin veya hesaplanmasın; uygun yerde kontrollü önbellek ve istek birleştirme kullanılsın. Kullanıcı yeni seçim yaptığında eski yanıtın yeni görünümü ezmesi engellensin. Önbellek geçerlilik süresi ve yenileme davranışı açıkça belirlensin.

**Tamamlanma ölçütü:** Bugün, bu hafta ve bu ay arasında art arda geçişlerde ekran yanıt vermeye devam eder; ağ kaydı gereksiz tam indirmeyi veya yinelenen isteği göstermez; sonuçlar seçilen tarih aralığıyla tutarlıdır.

### 2. Ekranı kaplayan “Son Dakika” yazısı

**Gözlem ve tercih:** Kullanıcıya göre bu alan ekranı gereksiz yere kaplıyor; haber listesi zaten bulunduğundan aynı alanın katkısı düşük.

**Araştırma:** Bu bölümün hangi ekranlarda göründüğü, hangi veriyi veya eylemi sunduğu ve başka bir bileşende zaten tekrarlanıp tekrarlanmadığı incelenir. Masaüstü ve dar mobil ekranlardaki kapladığı alan değerlendirilir.

**Düzeltme hedefi:** Tekrarlanan ve kullanıcıya değer katmayan geniş alanı kaldırmak veya belirgin biçimde küçültmek; haberlerin asıl listesini ve önemli uyarıları korumak. Görsel hiyerarşi ve klavye/mobil kullanımı kontrol edilir.

**Tamamlanma ölçütü:** Haber listesi daha fazla kullanılabilir ekran alanı kazanır; gerekli son dakika bilgileri kaybolmaz veya başka bir yerde gereksiz tekrar oluşturmaz.

### 3. “Haber Gündemi”, “Ulusal Gündem” ve diğer sekmelerde kasma

**Gözlem:** Sekmeler arasında geçiş yavaş veya takılarak gerçekleşiyor.

**Araştırma:** Her sekmenin başlatma ve geçiş süresi; yaptığı API çağrıları; DOM üzerinde eklediği öğe sayısı; çizim ve JavaScript çalışma süresi ölçülür. Sekmenin her seçilişinde yeniden veri çekip çekmediği, bileşenlerin gereksiz yere kaldırılıp kurulduğu, pahalı sıralama/filtreleme işlemlerinin ana iş parçacığında çalıştığı ve görsel/font dosyalarının yükü incelenir.

**Düzeltme hedefi:** Sekme içeriğini ihtiyaç anında yüklemek, yalnız değişen alanı yenilemek, yinelenen çağrıları önlemek ve büyük listelerde verimli çizim/sayfalama uygulamak. Önce yavaşlığı oluşturan somut çağrı veya işlem belirlenir; gereksiz gecikme ve tüm ekranı yeniden oluşturma azaltılır.

**Tamamlanma ölçütü:** Sekmeler arası tekrarlı geçişlerde ağ ve performans kayıtlarında gereksiz istek/çizim görülmez; masaüstü ve mobilde etkileşim akıcı kalır.

### 4. Kodların ayrıntılı hata ve kalite incelemesi

**Araştırma:** Uygulama arayüzü, sunucu rotaları, veri erişimi, zamanlanmış işler, haber işleme, X/Instagram/Facebook entegrasyonları ve dağıtım kodu ayrı ayrı incelenir. Hata kayıtları, sessizce yutulan istisnalar, başarısız isteklerde tekrar davranışı, zaman aşımı, yarış koşulları, yinelenen kayıtlar, tarih/saat sınırları, kullanıcı girdisi doğrulaması, erişim kontrolleri ve kaynak kullanım sınırları değerlendirilir. Kurulu sürüm ile depodaki kaynakların eşleşmesi de kontrol edilir.

**Düzeltme hedefi:** Bulgular önem derecesi, etkilenen dosya/akış, yeniden üretim adımı ve önerilen çözümle kaydedilir. Önce veri kaybı, güvenlik açığı, yanlış içerik ve temel ekranı engelleyen hatalar; ardından performans ve bakım sorunları giderilir. Her düzeltme için ilgili otomatik veya elle tekrarlanabilir doğrulama tanımlanır.

**Tamamlanma ölçütü:** İncelenen alanlar, bulunan sorunlar ve açık kalan riskler yazılı bir raporda yer alır; yüksek öncelikli bulgular için düzeltme ve doğrulama kanıtı bulunur.

### 5. Ümraniye Dijital Gündem Merkezi’nin yavaş açılması

**Araştırma:** İlk HTML yanıtı, sunucu tarafı hazırlık, veritabanı sorguları, kimlik/yetki kontrolleri, yüklenen JavaScript/CSS/font/görseller ve ilk içerik çizimi ayrı ayrı ölçülür. İstek sayısı ve toplam indirme boyutu; soğuk ve sıcak açılışlar; mobil ağ koşulları karşılaştırılır. Büyük başlangıç sorgusu, gereksiz başlangıç verisi, bloklayan varlık veya yavaş entegrasyon olup olmadığı incelenir.

**Düzeltme hedefi:** Kritik ilk görünümü önce sunmak; gerekli olmayan veriyi ve bileşenleri gerektiğinde yüklemek; sorgu ve varlık yükünü küçültmek; güvenli önbellek ve sıkıştırmayı doğru kullanmak. Dış sosyal platformun yanıtı ana sayfanın açılmasını bekletmemelidir.

**Tamamlanma ölçütü:** İlk anlamlı içerik görünene kadar geçen süre önce/sonra ölçülür ve belirlenen hedefe göre iyileşme kaydedilir. Ekran doğru veri ve yetki davranışını korur.

### 6. X ve Instagram’dan alınan verinin ekrana geç gelmesi

**Gözlem:** Sosyal platformlardan çekilen içerik ekranda geç beliriyor.

**Araştırma:** Gecikmenin tarama zamanlamasında mı, platform yanıtında mı, kuyrukta mı, kayıt/işleme aşamasında mı, API yanıtında mı yoksa arayüzün yenileme biçiminde mi oluştuğu zaman damgalarıyla ayrıştırılır. Kaynak başına tarama süresi, son başarılı tarama, bekleyen iş sayısı, yeniden denemeler, istek başına süre ve içeriklerin veritabanına yazılmasından görünmesine kadar geçen süre incelenir. Platform sınırları ve erişim hataları ayrıca kaydedilir.

**Düzeltme hedefi:** Kaynağı daha sık veya daha ağır sorgulayarak erişim sınırlarını zorlamak yerine, gecikmenin oluştuğu aşama düzeltilir. İş kuyruğu ve yeniden deneme politikası dengelenir; kayıt sonrası arayüz güncellemesi hızlandırılır; farklı kaynakların birbirini beklemesi önlenir. Hata ve bekleme durumları kullanıcıya doğru gösterilir.

**Tamamlanma ölçütü:** Kaynaktan alınma, kaydedilme ve ekranda görünme zamanları karşılaştırılabilir; gecikme kaynağı giderilir ve iyileşme ölçülür. Erişim kısıtları ve veri doğruluğu korunur.

### 7. Kod ve yapılandırmalarda şifre/anahtar bulunması

**Araştırma:** Yalnızca mevcut dosyalarda metin araması yapmak yeterli değildir. Kaynak kod, örnek yapılandırmalar, dağıtım betikleri, yapılandırma dosyaları, Git geçmişi ve kullanılan bağımlılık/anahtar işleme biçimi incelenir. Olası bulgular doğrulanır; gerçek değerler rapor veya yeni commit içine kopyalanmaz. Parola, API anahtarı, bot token’ı, özel anahtar, oturum çerezi ve sunucu sırları ayrı sınıflandırılır.

**Düzeltme hedefi:** Gerçek sırlar koddan çıkarılır ve uygun sunucu ortamı ya da güvenli kasa üzerinden okunur. Bir sır Git geçmişine girdiyse dosyayı silmek tek başına yeterli sayılmaz; etkilenen sırın iptali/yenilenmesi ve geçmişe maruziyet planı değerlendirilir. Depo erişimi ve otomatik aktarım anahtarının kapsamı kontrol edilir. Tarama yanlış pozitifleri elle doğrulanır.

**Tamamlanma ölçütü:** İncelenen kapsam, kullanılan kontrol yöntemi, doğrulanan bulgular ve alınan düzeltici adımlar gizli değerleri açığa çıkarmadan belgelenir. “Bulgu yok” sonucu, yalnızca gerçekten taranmış kapsam için verilir.

### 8. Sonraki düğmesinin sayfayı değiştirmemesi

**Gözlem:** “Sonraki” düğmesine basıldığında beklenen sayfa açılmıyor veya içerik değişmiyor.

**Araştırma:** Düğmenin olay dinleyicisi, sayfalama durumu ve sayfa sınırları; API isteği, yanıt kodu ve yanıt biçimi; çizilen kayıtlar ve filtrelerle etkileşimi incelenir. Hatanın yalnızca son sayfada, belirli filtrede, dar ekranda veya oturum süresince oluşup oluşmadığı belirlenir. Konsol ve sunucu hataları eşleştirilir.

**Düzeltme hedefi:** Düğme geçerli sayfa varsa sonraki sonuçları göstermeli; yükleme sırasında yinelenen tıklamayı yönetmeli; sonuç yoksa anlaşılır biçimde pasif olmalı. Filtre/sıralama değişince sayfa konumu doğru sıfırlanmalı veya tutarlı biçimde korunmalıdır. Sunucu sayfalaması kullanılıyorsa toplam kayıt ve imleç/offset davranışı arayüzle eşleşmelidir.

**Tamamlanma ölçütü:** İlk sayfa, ara sayfa, son sayfa, boş sonuç ve değişen filtre senaryolarında beklenen kayıtlar görüntülenir; hata olduğunda düğme ve kullanıcı geri bildirimi tutarlı kalır.

## Kod incelemesinde görülen ek işler

Aşağıdaki maddeler depo içindeki kod akışından görülen somut davranışlardır. Bunlar önemli inceleme ipuçlarıdır; canlı tarayıcı ve sunucu ölçümü yapılmadan tek başına kullanıcının bildirdiği her yavaşlığın kök nedeni sayılmaz.

### 9. Otomatik yenileme açık sayfanın içeriğini baştan çiziyor

**Kod bulgusu:** `application/src/assets/portal.js` içindeki `refreshPortal()` her 60 saniyede özet isteği gönderiyor. Ana sayfada formda odak veya filtre yoksa `#content` öğesini yeniden `home()` çıktısıyla değiştiriyor; diğer sayfalarda form etkileşimi yoksa `loadList()` çağırıyor. Sekme/filtre gezintisiyle aynı zamanda gerçekleşirse kullanıcının okuduğu içerik, sayfa konumu veya geçiş sırasında oluşturulan DOM yenilenebilir. Her yenileme tam veri çekiyor demek değildir: `/api/portal/summary` sunucu tarafında önbellek kullanıyor, liste de ayrıca istek yapıyor. İstemci yenilemesinin bu davranışı yine de gereksiz ağ ve çizim yükü oluşturabilir.

**Çözülecek:** Yenileme sadece değişen sayaçları ve gerçekten yeni kayıt özetini güncellesin; değişmemiş listeyi veya tüm ana sayfa DOM'unu tekrar oluşturmasın. Form, sayfalama, sekme değişimi, iletişim kutusu ve kaydırma durumu korunmalı. Aynı anda devam eden gezinmeyle çakışma önlenmeli.

### 10. Portal önbelleği zaman aşımında tam veri kümesini yeniden hazırlıyor

**Kod bulgusu:** `application/server/portal-api.mjs` içindeki portal veri hazırlama akışı süresi dolmuş önbellekte `/api/config` üzerinden haber listesini alıp sıralıyor; sosyal kayıtları grupluyor, tüm listeyi yeniden sıralıyor ve moderasyon görünürlüğünü yeniden uyguluyor. Canlı modda önbellek süresi 30 saniye olarak tanımlı. `application/src/assets/portal.js` ise özet yenilemesini 60 saniyede bir çağırıyor. Bu zamanlamalar, farklı oturumların veya isteklerin önbellek yenilemesini üst üste getirmesi halinde pahalı hazırlama işinin tekrarlanmasına yol açabilir; kodda mevcut eşzamanlı yenileme koruması ve canlı sistemde bunun sıklığı ölçülmelidir.

**Çözülecek:** Önbellek sona ererken eşzamanlı isteklerin tek hazırlama işini paylaşması sağlansın; gerekirse son geçerli sonuç kısa bir kontrollü sürede sunulurken yenileme arka planda yapılsın. Gruplama/sıralama maliyeti ve liste boyutu ölçülsün; sık erişilen sonuçlar gereksiz yere baştan hesaplanmasın. Önbellek geçerliliği, moderasyon değişikliği ve veri güncelliğiyle birlikte doğrulansın.

### 11. Bazı istemci ve iş akışı hataları sessizce yutuluyor

**Kod bulgusu:** `application/src/assets/portal.js` içinde `refreshPortal()` başarısızlığında boş `catch` bulunuyor. `application/src/app.html` içinde `loadAgenda()` hatası da sessizce yakalanıp yalnızca yenileme durumu temizleniyor. Bazı yönetim ekranlarında oturum kontrolü başarısızlığı da kullanıcıya görünür bir durum üretmiyor. Bu örnekler geçici ağ/API hatasının gerçek sebebini kullanıcıdan ve destek incelemesinden saklayabilir. Her boş `catch` hatalı değildir; bazıları isteğe bağlı resim veya bozuk yerel veri gibi tolere edilebilir durum içindir ve ayrı değerlendirilmelidir.

**Çözülecek:** Sessiz yakalamalar tek tek sınıflandırılsın. Kullanıcıya etkisi olan hata için tekrar deneme olanağı ve kısa, anlaşılır durum mesajı sunulsun; teknik kayıtlar sır, oturum veya kişisel içerik yazmadan olay adı, istek türü ve hata sınıfını içersin. Beklenen isteğe bağlı hatalar arayüzü kilitlemeden kontrollü biçimde ele alınsın.

### 12. Sayfalama istemcisi ve sunucusu için sınır senaryoları doğrulanmalı

**Kod bulgusu:** `application/src/assets/portal.js` sayfalama düğmelerini sunucudan gelen `page` ve `pages` değerlerine göre oluşturuyor; sonraki düğmesi son sayfada devre dışı bırakılıyor. `application/server/portal-api.mjs` sayfa değerini üst sınırla sınırlıyor, sayfa başına en çok 50 kayıt alıyor ve sonuçları bellekteki diziden `slice()` ile seçiyor. Bu kodda “Sonraki” düğmesinin her durumda arızalı olduğuna dair doğrudan kanıt yok. Ancak boş liste, filtre sonrası geçersiz sayfa numarası, son sayfada silinen/elenen kayıtlar ve birden fazla yenileme yanıtının yarışması gibi durumlar arayüzün boş sayfada kalmasına veya kayıtların atlanmış görünmesine neden olabilir.

**Çözülecek:** Kullanıcı bildirimini gerçek tarayıcıda yeniden üretip URL parametreleri, yanıtın `page/pages/total` değerleri ve çizilen kayıtları aynı zaman çizelgesinde izleyin. Sunucu geçersiz sayfayı geçerli son sayfaya yöneltsin veya tutarlı boş sonuç dönsün; filtre ve veri değişikliğiyle istemci sayfa numarası senkron kalsın. Hata yalnızca arayüz olayı ya da yanıt yarışıysa onu düzeltin; mevcut kanıt olmadan sayfalama kodunu gelişigüzel değiştirmeyin.

### 13. Kod deposundaki gizli bilgiler için tam kapsamlı tarama

**Kod bulgusu:** Otomatik eşitleyici belirli dosyalarda bazı yüksek güvenli sır kalıplarını yakalayınca aktarımı durduruyor; bu bir Git geçmişi taraması veya tüm sır türlerini kapsayan güvenlik incelemesi değildir. Ayrıca uygulama dışındaki bileşenler ve yapılandırmalar da erişim anahtarı taşıyabilir.

**Çözülecek:** Kullanıcının istediği güvenlik çalışmasında tüm izlenen dizinler, dağıtım dosyaları, geçmiş commit'ler ve sırların çalışma anında nereden yüklendiği ayrı taransın. Eşitleyicinin atladığı dosya/dizin kapsamı belgelenip yanlışlıkla anahtar aktarabilecek örüntüler azaltılsın. Her olası bulgu gizli değeri göstermeden doğrulansın; gerçek bir maruziyet bulunursa anahtarı yenileme ve geçmişi temizleme gereksinimi değerlendirilsin.

## Uygulama sırası

1. **Başlangıç ölçümü ve yeniden üretim:** Her sorunu üretmek için adımlar yazılır; tarayıcı ağı/performansı, sunucu süreleri ve uygulama kayıtları karşılaştırılır.
2. **Güvenlik ve çalışmayı engelleyen sorunlar:** Doğrulanmış sır maruziyeti ve sayfalama gibi temel etkileşim hataları ele alınır; mevcut erişim kontrolü korunur.
3. **Gereksiz iş ve donma:** Tarih/sekme geçişlerinde yinelenen veri çağrıları, dakika başı tam arayüz yenilemesi, çakışan önbellek hazırlıkları ve ana iş parçacığını kilitleyen işler düzeltilir.
4. **Hata görünürlüğü:** Kullanıcıya etki eden sessiz hatalar anlaşılır geri bildirim ve güvenli teknik kayıtlarla izlenebilir hale getirilir.
5. **Açılış ve sosyal veri gecikmesi:** Ölçümde yavaş çıkan sunucu, veri kuyruğu, ağ veya çizim aşaması hedeflenir.
6. **Arayüz düzenlemesi:** “Son Dakika” alanı kullanım alanı ve bilgi tekrarı değerlendirilerek sadeleştirilir.
7. **Son doğrulama:** Masaüstü/mobil; bugün/hafta/ay; gündem sekmeleri; sonraki/önceki sayfa; yavaş ağ ve geçici kaynak hatası senaryoları tekrar denenir. Ölçüm sonuçları ve açık kalan konular raporlanır.

## Sonuçların belgelenmesi

Her bulgu için şu bilgiler kaydedilmelidir: kısa başlık ve önem derecesi; etkilenen bileşen; yeniden üretme adımları; gözlenen davranış; ölçüm veya kayıt kanıtı; doğrulanmış kök neden; uygulanan düzeltme; ilgili doğrulama sonucu; açık risk veya takip işi. Varsayımlar kök neden gibi sunulmamalıdır.

## Depo ve canlı sistem ilişkisi

Bu depo canlı OSINT sunucusundan otomatik olarak eşitlenen kaynak kod aynasıdır. Sunucuda kurulu kaynak dosyalarındaki değişiklikler otomatik eşitlemeyle `main` dalına gönderilir. GitHub’da yapılan değişiklikler ise kendiliğinden canlı sunucuya kurulmaz; canlıya alma ayrı test ve dağıtım adımı gerektirir. Bu belge yapılacak inceleme ve iyileştirmeleri tanımlar; tek başına sorunların düzeltildiği anlamına gelmez.
