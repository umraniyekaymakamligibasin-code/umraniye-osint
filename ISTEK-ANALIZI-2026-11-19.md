# Beş isteğin incelemesi ve çözüm önerileri

19 Kasım 2026. İnceleme `main` dalındaki güncel koda göre yapıldı (canlıya kurulan 14–18 Kasım paketleri
dahil). Canlı sunucuda yalnız okuma yapıldı (servis durumu ve günlükler); diğer canlı gözlemler için `development/reading-remediation-20261114`,
`development/provider-health-20261115` ve `kurum/README-KURUM.txt` notları kullanıldı.

> **Ajan kullanıyorsanız:** Her başlığın sonundaki "Kod sahibine sorulacak" maddelerini cevap almadan
> varsayımla uygulamayın. Canlıya kurulum için kod sahibinden açık onay alın.

## Özet

| # | İstek | Kök neden | Önerilen çözüm | Zorluk |
| --- | --- | --- | --- | --- |
| 1 | Kurum menüsüne haber tam gelmiyor | Bilinçli kural: "Olay metni kuruma kopyalanmaz; yalnız kategori başlığı + mahalle gider." | Metni kopyalamadan, vakanın bağlı olduğu ana haberi yetkili kuruma ana ekrandaki gibi göstermek | Orta |
| 2 | SMTP kurulumu | Gönderici kodu ve zamanlayıcı hazır, ama `smtp.json`/`smtp.key` yok, e-posta kuyruğu kapalı, panelde açma düğmesi yok | Kurum e-postası veya ayrı bir Gmail hesabı + uygulama şifresi; şifreyi mühürleyen kurulum betiği; panele açma/kapama | Kolay–orta |
| 3 | X/Facebook doğrulama istiyor, tam otomatik olsun | Platformlar giriş yapmış otomasyonu bilinçli olarak doğrulamaya düşürüyor | Doğrulamayı aşmaya çalışmak yerine: anında Telegram uyarısı + tek tıkla panelden giriş, okuma yükünü azaltma, ücretsiz resmî kanallara kaydırma | Orta |
| 4 | Reels/hikâyelerde açıklama yok, haber kaçıyor | Medya hiç indirilmiyor; videodaki ses ve yazı okunmuyor; açıklamasız gönderi atılıyor | Sunucuda yerel çalışan ses dökümü (Whisper) + ekrandaki yazıyı okuma (OCR) hattı | Orta–yüksek |
| 5 | Instagram API'yi anlık hale getir | Turda 13 hesaptan yalnız 3'ü okunuyor (her hesap ~21 dk'da bir); her ziyarette 75 gönderi yeniden okunuyor, %99,5'i zaten bilinen | Her turda tüm hesapları tek kısa sayfayla okumak (her hesap ~5 dk'da bir), bilinen gönderiye gelince durmak | Kolay |

Gerçekçi beklenti: **hiçbir ücretsiz yöntem X/Facebook/Instagram'dan "tam otomatik, hiç doğrulama istemeyen,
anlık" okuma garanti etmez.** Aşağıdaki öneriler kesintiyi azaltır ve kesinti olduğunda dakikalar içinde
fark edilip giderilmesini sağlar.

---

## 1. Kurum menüsüne haberlerin tam içerikle gelmesi

### Bulgular

- `kurum/README-KURUM.txt` ve `kurum/projeksiyon.mjs`: "Baslik ve ozet yalnizca kategori duzeyinde
  uretilir; kaynak metin KOPYALANMAZ (kisisel veri tasinmaz)." Kurum vakasının başlığı "Su kaçağı
  bildirimi" gibi bir kategori adı, özeti tek cümlelik bir şablon.
- Bu, ilk tasarımda bilinçli alınmış bir **veri azaltma** kararı (`routing-policy.md`: "Kurumlar yalnız
  kuruma özel, en aza indirilmiş olay görünümünü alır"). İstek bu kararın değiştirilmesi anlamına geliyor.
- Vaka tablosunda tam metin, görsel ve ana bağlantı sütunu yok. Kaynaklar ayrı tabloda; kaynak bağlantısı
  temizlenirken `?` sonrası siliniyor, bu yüzden `?id=` veya `story_fbid` içeren Facebook bağlantıları
  bozuluyor.
- Olumlu nokta: vaka satırı ana olayın kimliğini tutuyor (`coord_cases.source_event_id`).

### Önerilen çözüm (metni kopyalamadan)

1. Yeni bir kurum API ucu: `GET /api/institution/cases/{id}/event`.
   - Yalnız o vakanın sahibi kurumun üyesi çağırabilir (mevcut kurum yetki kontrolü kullanılır).
   - Sunucu, vakanın `source_event_id` değeriyle ana haber kaydını bulur ve ana ekrandaki olay dosyasıyla
     aynı alanları döner: gerçek başlık, tam metin, görsel, tüm kaynaklar ve bağlantıları, yayın ve ilk
     tespit zamanı, konum etiketi.
2. Kurum ekranında (`web/institution.js`) vaka detayına "Haberin tamamı" bölümü: tam metin, görsel,
   kaynak listesi, "Özgün yayını aç".
3. Kaynak bağlantı temizliğinin Facebook/Instagram kimlik parametrelerini (`id`, `story_fbid`, `v`)
   koruması.

**Neden kopyalamak yerine bu yol?** Metin tek yerde kalır. Haber güncellenir, gruplanır veya saklama
süresi dolar ise kurum ekranı da kendiliğinden güncel olur. Kişisel veri ikinci bir tabloya çoğaltılmaz.
Silme ve saklama kuralları tek yerden işler.

**Alternatif:** Yeni bir geçişle vaka tablosuna `full_text`, `image_url`, `source_url` sütunları
eklenip yönlendirme anında kopyalanır. Daha basit ama veri çoğalır ve haber güncellenince kurumdaki kopya
eskir.

### Kod sahibine sorulacak

- Tam metnin kurumlarla paylaşılmasına onay var mı? KVKK açısından çocuk, sağlık, yardım ve soruşturma
  gibi hassas konularda metin yine gizlensin mi? Mevcut kod bu konuları ayırabiliyor.
- Tam içerik yalnız yeni vakalarda mı, eski vakalarda da mı görünsün? Önerilen yöntemde ikisinde de
  kendiliğinden görünür.

---

## 2. SMTP (e-posta) kurulumu

### Bulgular

- Gönderim kodu hazır: `server/gmail-sender.mjs` + `server/gmail-smtp.py`. `smtp.gmail.com:587`,
  STARTTLS, oturum açarak gönderiyor.
- Ayarları bir klasördeki `smtp.json` ve `smtp.key` dosyalarından okuyor. Şifre AES-256-GCM ile
  mühürlü saklanıyor; dosyalar 0600 olmalı. **Bu iki dosyayı üreten bir betik yok.**
- Gönderici adres kodun içine sabit yazılmış (bir Gmail adresi).
- `umraniye-kurum-gonderim.timer` 2 dakikada bir kuyruğu boşaltacak ama `smtp.json` olmadığı için hiç
  çalışmıyor. Kuyruğa yazma da varsayılan olarak kapalı (`OSINT_ROUTING_OUTBOX=0`).
- Kurumun e-postasını açan API ucu var ama yönetim ekranında bunu çağıran bir düğme yok. Kurum onayı her
  değiştiğinde e-posta yeniden kapanıyor.
- E-posta gövdesi yalnız genel bir uyarı ve panel bağlantısı içeriyor; konu satırı sabit.

### Gönderici hesap seçimi

| Seçenek | Günlük sınır | Not |
| --- | --- | --- |
| Kaymakamlığın kurumsal e-postası (bilgi işlemin verdiği SMTP) | Kuruma göre | **Önerilen.** Resmî adresten gider, istenmeyen klasörüne düşme riski düşük. Bilgi işlemden SMTP sunucusu, port ve hesap istenmeli. |
| Ayrı bir Gmail hesabı + uygulama şifresi | Yaklaşık 500 e-posta/gün, ileti başına 100 alıcı | Hızlı başlangıç. İki adımlı doğrulama açılıp bir "uygulama şifresi" üretilir; normal Gmail şifresi kullanılmaz. Sınır aşılırsa gönderim 24 saate kadar durabilir. |
| Google Workspace | 2.000/gün | Kurumda Workspace varsa. |

Bu sınırlar üçüncü taraf kaynaklardan; kurulumdan önce Google'ın kendi belgesinden doğrulanmalı.

### Yapılacaklar

1. `smtp-kur.py` betiği: sunucuda çalışır. Gönderici adresi ve uygulama şifresini terminalden gizli
   olarak sorar, 32 baytlık anahtarı üretir, şifreyi mühürler, iki dosyayı doğru sahiplik ve 0600
   izinle yazar. Şifre ekrana, günlüğe veya Git'e hiç yazılmaz.
2. Gönderici adres, SMTP sunucusu ve port koddan alınıp `smtp.json`'a taşınır (kurumsal SMTP de
   kullanılabilsin diye).
3. Yönetim ekranına kurum başına "E-posta bildirimi açık/kapalı" düğmesi ve alıcı doğrulama durumu.
4. Önce yalnız kendi adresinize test gönderimi, sonra `OSINT_ROUTING_OUTBOX=1`.
5. E-posta içeriği 1. maddedeki karara göre: kısa özet + panel bağlantısı, ya da başlık ve özet.

### Kod sahibine sorulacak

- Hangi adresten gidecek? Kaymakamlığın kurumsal e-postası mümkün mü?
- E-postada haberin metni olsun mu, yoksa yalnız "yeni vaka var, panele girin" mi?

---

## 3. X, Facebook ve Instagram'da doğrulama kesintileri

### Bulgular

- **X:** İki yol var. Tarayıcı okuyucusu (giriş yapılmış kalıcı Chromium profili) ve `x-shadow` (açık
  kaynak [twscrape](https://github.com/vladkens/twscrape), tek hesabın çerezleriyle). twscrape 2026'da da
  bakımı süren bir proje, ama hesap kilitlenmesi ve askıya alınması kullanıcıların bildirdiği olağan bir
  risk.
- **Facebook:** Tarayıcı okuyucusu son gözlemlerde sık sık `login_required` alıyor (4 saatte 30 kez).
  Anonim yedek okuyucu (fbgql) birçok sayfada giriş sayfasına yönlendiriliyor. Arkadaşınızın hazırladığı
  oturum kurtarma paketi (`development/facebook-session-recovery-20261115`) henüz kurulmamış.
- **Algılama var, uyarı yok:** Sistem `login_required` ve `challenge_required` durumlarını doğru algılıyor
  ve panelde "Doğrulama bekliyor" yazıyor. Ama **Telegram'a veya başka bir kanala anlık uyarı gitmiyor.**
  Kimse panele bakmazsa okuma saatlerce durabiliyor.
- Kod, doğrulamayı aşmaya çalışmıyor. Bu doğru bir tasarım: çözülmeye çalışılan her CAPTCHA hesabı daha
  hızlı kapattırır.

### "Tam otomatik" ile ilgili gerçekçi değerlendirme

X ve Meta, giriş yapmış otomatik okumayı tespit edip doğrulama istemek için özel olarak çalışıyor.
GitHub'da doğrulamayı veya CAPTCHA'yı otomatik aşmayı vaat eden araçlar var. Bunları **önermiyorum**:
platform kurallarını açıkça ihlal ediyorlar, kısa sürede çalışmaz hale geliyorlar ve hesapların kalıcı
kapatılmasına yol açıyorlar. Bir kamu kurumunun hesabı için bu risk kabul edilemez. Aynı gerekçeyle
çok sayıda hesap/proxy döndürmek de projenin kendi ilkelerinde reddedilmiş
(`development/OSINT-100-PUAN-HEDEF-PLANI.md`).

Değerlendirdiğim açık kaynak alternatifler:
- [twikit](https://github.com/d60/twikit): twscrape'e benzer, aynı hesap riski.
- [RSSHub](https://github.com/DIYgod/RSSHub): X/Instagram için yine giriş çerezi istiyor.
- [facebook-scraper](https://github.com/kevinzg/facebook-scraper) ve çatalları: 2024'ten beri büyük ölçüde
  bozuk.

Hiçbiri mevcut yapıya göre doğrulama sorununu ortadan kaldırmıyor; yalnız başka bir katman ekliyor.
Mevcut araçlar (twscrape, Playwright, Graph API) bu iş için uygun seçimler.

### Önerilen çözüm: kesintiyi azalt, olunca hemen fark et ve çöz

1. **Anında uyarı (en büyük kazanç):** Bir hesap `login_required`, `challenge_required` veya
   `verification_paused` durumuna geçtiği anda yöneticiye Telegram mesajı gitsin: "Facebook hesabı
   doğrulama istiyor. Giriş: [panel bağlantısı]". Aynı durum için en fazla saatte bir hatırlatma.
   Mevcut Telegram altyapısı kullanılır, ücretsizdir.
2. **Tek tıkla çözüm:** Panelde zaten "Hesaba giriş yap" (noVNC) akışı var. Uyarıdaki bağlantı doğrudan
   oraya götürsün. Doğrulama telefondan da yapılabilsin diye her hesaba **kimlik doğrulama uygulaması
   (TOTP)** tanımlansın; SMS beklemesi ortadan kalkar.
3. **Facebook oturum kurtarma paketinin kurulması:** Aynı profilde iki sekme yerine sırayla okuma ve
   giriş isteyen kaynaklarda boşuna yeniden denememe, doğrulama tetiklenmesini azaltır.
4. **Okuma yükünü azaltmak:** Her turda daha az sayfa açmak, sabit IP'den okumak (sunucu zaten öyle),
   aralıkları hafifçe rastgeleleştirmek, gereksiz tekrar okumaları kaldırmak (örnek: `integrations.mjs`
   köprüye gelen her GET'te Facebook taraması tetikliyor).
5. **Mümkün olan kaynakları resmî ve ücretsiz kanala kaydırmak:**
   - Instagram'da işletme/üretici hesapları zaten ücretsiz Graph API ile okunuyor (5. madde). Yerel
     haber hesaplarının çoğu bu türde. Tarayıcıyla okunan Instagram hesapları buraya taşınabilir.
   - Haber sitelerinin RSS akışları doğrulama sorunu yaşamıyor; sosyal medya paylaşımı olan sitelerin
     RSS'i varsa öncelik oraya verilebilir.
6. **İsteğe bağlı, ücretli ama ucuz:** X'in resmî API'si 2026'da kullanım başına ücretlendiriliyor
   (gönderi okuma başına yaklaşık 0,005 $). Ayda 3.000 gönderi okumak yaklaşık 15 $ eder ve doğrulama
   sorunu tamamen ortadan kalkar. "Ücret ödemeden" isteğine ters düştüğü için yalnız seçenek olarak
   yazıyorum.

### Kod sahibine sorulacak

- Uyarılar hangi Telegram sohbetine gitsin (ayrı bir yönetici sohbeti önerilir)?
- X için ayda birkaç on dolarlık resmî API bütçesi değerlendirilebilir mi?

---

## 4. Açıklaması olmayan reels ve hikâyeler

### Bulgular

- Graph API (Business Discovery) başka hesapların gönderilerini ve reels'larını açıklamasıyla veriyor,
  **hikâyeleri vermiyor**. Resmî API hikâyeleri yalnız kendi hesabınız için sunuyor.
- `instagram-media/scanner.py` (instagrapi, kişisel hesapla) hikâye ve reels okuyor, ama **medyayı hiç
  indirmiyor**. Hikâyeden yalnız etiket bilgisi (konum, hashtag, anket sorusu) alınıyor ve her hikâye
  elle inceleme kuyruğuna gidiyor.
- Açıklaması boş gönderi `caption_missing` olarak işaretleniyor ve bir daha hiç değerlendirilmiyor.
  8 karakterden kısa açıklamalar da metinsiz sayılıyor. Tarayıcı okuyucusu açıklamasız gönderiyi
  sessizce atıyor.
- Depoda OCR veya ses dökümü yok (yalnız planda geçiyor).

### Önerilen çözüm: "medyadan metin çıkarma" hattı

Tamamen sunucuda, yerel çalışır. Veri dışarı gönderilmez, ücret yoktur.

1. Açıklaması boş veya kısa olan reels ve hikâye **atılmaz**, çıkarma kuyruğuna alınır.
2. Medya indirilir: instagrapi video/görsel adresini veriyor; Graph API reels için `media_url` veriyor
   (paylaşan indirmeyi kapattıysa vermez).
3. **Ses → metin:** `ffmpeg` ile ses ayrılır,
   [faster-whisper](https://github.com/SYSTRAN/faster-whisper) ile Türkçe döküm alınır. CPU'da `small`
   veya `medium` model, int8. Reels en çok 90 saniye; süre sunucuda ölçülmeli. Türkçe için ince ayarlı
   modeller de var.
4. **Görüntüdeki yazı → metin:** Saniyede bir kare veya sahne değişimlerinde kare alınıp
   [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) ile okunur. Türkçe OCR karşılaştırmasında
   (OCRTurk, 2026) PaddleOCR güçlü sonuç vermiş. EasyOCR daha yavaş ve daha zayıf.
5. Çıkan metin `derivedText` alanına "otomatik çıkarım (ses/görüntü)" etiketiyle yazılır. Mevcut anahtar
   kelime ve konum filtrelerinden geçer. Panelde "metin videodan otomatik çıkarıldı" diye gösterilir.
6. Hikâyeler 24 saatte kaybolduğu için çıkarma hikâye okunduğu turda yapılır. Yalnız metin ve küçük bir
   önizleme saklanır, video saklanmaz (saklama süresi kurallarına uyulur).

**Kaynak kullanımı:** Ayrı, düşük öncelikli bir servis olarak çalışmalı; uygulamanın bellek sınırını
etkilememeli. Önce sunucunun CPU ve RAM'inde 10–20 örnek reels ile süre ölçülmeli.

**Not:** instagrapi kişisel hesapla resmî olmayan bir API kullanıyor. Meta bu kullanımı kısıtlayabilir;
son gözlemlerde iki saatte 148 kez `ClientThrottledError` alınmış. Hikâye okumanın bu kırılganlığı
çıkarma hattından bağımsız olarak sürecek.

### Kod sahibine sorulacak

- Sunucunun CPU çekirdek sayısı ve boş RAM'i nedir? (`nproc`, `free -h`)
- Videodan çıkarılan metinle tetiklenen haberler acil Telegram bildirimi alsın mı, yoksa yalnız
  panelde mi görünsün? Önerim: önce yalnız panel.

---

## 5. Instagram API nasıl çalışıyor, nasıl "anlık" hale gelir

### Şu anki çalışma

- `instagram-api/worker.py`, Instagram Graph API'nin **Business Discovery** ucunu kullanıyor: sizin
  işletme hesabınızın token'ıyla başka bir işletme/üretici hesabının son gönderilerini kullanıcı adından
  okuyor. Ücretsiz.
- Hedef listesi panelden yönetiliyor; 13 etkin hesap var.
- Her turda yalnız **3 hesap** okunuyor ve her hesapta 25'lik 3 sayfa (75 gönderi) yeniden çekiliyor.
  Zamanlayıcı yaklaşık 5 dakikada bir çalışıyorsa bir hesap ancak **~25 dakikada bir** okunuyor.
- Okunanlar tur sonunda panele gönderiliyor. 3 saatten eski gönderiler alınmıyor.
- Token elle yenileniyor (bitime 7 gün kala panelde uyarı çıkıyor).
- **Canlı ölçüm (19 Kasım, son 6 saat, sunucu günlüğünden):** 15 Kasım'daki Meta erişim hatası
  (`200 / 5258005`) giderilmiş, kaynaklar okunuyor. 6 saatte 70 tur (≈5 dakikada bir), her turda 3 kaynak;
  bir kaynak ortalama **21 dakikada bir** okunuyor. Toplam **15.354** gönderi okunmuş, bunların
  **15.281'i** zaten biliniyordu, yalnız **4'ü** yeniydi. Okumaların %99,5'i gereksiz.

### Anlık bildirim mümkün mü?

Meta'nın webhook'ları yalnız **kendi hesabınızla ilgili** olaylar için var (yorum, mention, mesaj).
Başka hesapların yeni gönderisi için webhook yok. Tek yol düzenli sorgulama (polling). "Takip edilen
hesaplar" listesi de API'den alınamıyor; hedefler panelde tek tek tanımlanmalı.

### Önerilen değişiklikler

1. **Erişim hatası tekrar ederse:** 15 Kasım'daki `5258005` hatası bir yetki/erişim hatasıydı ve şu an
   görülmüyor. Tekrar ederse Meta geliştirici panelinde uygulamanın "Live" modda olduğu, izinlerin
   verildiği ve token sahibi işletme hesabının bir Facebook sayfasına bağlı olduğu kontrol edilmeli.
2. **Kalıcı token:** Business Manager'da bir "System User" oluşturup süresi dolmayan token kullanmak.
   Elle yenileme ve 60 günlük kesinti riski ortadan kalkar.
3. **Her turda tüm hesaplar, tek sayfa:** Hesap başına 1 istek, son 10 gönderi. Daha önce görülen
   gönderiye gelince durulur. 13 hesap × 12 tur/saat = saatte 156 istek; yaygın belirtilen 200 istek/saat
   sınırının altında. Sonuç: her hesap **~5 dakikada bir** okunur (şu an ~25 dk). Kota kullanımı da 3 kat
   azalır.
4. **Öncelik grupları:** Haber yoğun hesaplar her turda, diğerleri iki-üç turda bir. Kota artarsa ilk
   bunlar korunur.
5. **Hemen teslim:** Gönderi okunduğu anda panele gönderilsin, tur sonu beklenmesin.
6. **Hata davranışı:** Hız sınırında tüm hesapları 1 saat durdurmak yerine `Retry-After`'a ve gerçek
   kalan kotaya (`X-App-Usage` başlığı) göre beklemek.
7. Hikâyeler bu yolla gelmez (4. maddeye bakın).

### Kod sahibine sorulacak

- Meta uygulamasının yöneticisi kim? Token yenileme ve System User için uygulama paneline erişim gerekiyor.
- Business Manager'da System User oluşturma yetkisi var mı?

---

## Önerilen uygulama sırası

1. Instagram API'de tüm hesapları her turda kısa sayfayla okuma (5): hızlı kazanım, ücretsiz, kotayı azaltır.
2. Doğrulama durumları için anında Telegram uyarısı (3.1): kesinti süresini en çok kısaltan iş.
3. SMTP kurulum betiği ve panel düğmesi (2).
4. Kurum ekranında tam haber içeriği (1): KVKK kararı alındıktan sonra.
5. Reels/hikâye metin çıkarma hattı (4): önce sunucuda performans ölçümü.

Her madde ayrı PR olarak hazırlanır. Canlıya kurulum, sizin önceki paketlerinizdeki gibi ön kontrol,
yedek ve geri alma içeren bir kurulum betiğiyle yapılır.

## Kaynaklar

- Instagram Platform belgeleri, webhook'lar: https://developers.facebook.com/docs/instagram-platform/webhooks
- Instagram IG User Media (başka hesap medyası ve `media_url` kısıtı): https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/
- Instagram IG Media (`media_product_type`): https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/
- Graph API yeni gönderi webhook'u olmadığına dair tartışma: https://github.com/orgs/community/discussions/113223
- Instagram API sınırları (üçüncü taraf özet): https://www.getphyllo.com/post/instagram-api-guide
- Meta Content Library (yalnız araştırma kurumları; operasyonel izleme için uygun değil): https://transparency.meta.com/researchtools/meta-content-library
- twscrape 2026 durumu: https://twitterapi.io/blog/twscrape
- twikit 2026 durumu: https://twitterapi.io/blog/twikit
- X/Twitter araçları karşılaştırması 2026: https://dev.to/ashish_soni08/comprehensive-guide-to-twitterx-scraping-frameworks-and-tools-in-2026-37p2
- X API kullanım başına fiyatlandırma 2026: https://www.outstand.so/blog/x-api-pricing
- Facebook scraper projelerinin durumu: https://thunderbit.com/blog/facebook-scraper-github-guide
- Gmail SMTP sınırları 2026: https://serversmtp.com/limits-of-gmail-smtp-server/
- Türkçe OCR karşılaştırması (OCRTurk): https://arxiv.org/html/2602.03693v1
- Türkçe Whisper modeli (faster-whisper uyumlu): https://huggingface.co/selimc/whisper-large-v3-turbo-turkish

## Ek: 19 Kasım sunucu gözlemleri (yalnız okuma)

- Sunucu: 4 çekirdek, 7,2 GB RAM (4 GB boş), 175 GB boş disk. Medyadan metin çıkarma hattı (4. madde)
  için `small`/`medium` Whisper modeli ve PaddleOCR bu kaynaklarla çalışabilir; yine de önce ölçülmeli.
- `umraniye-osint-dha-deneme.service` her turda "failed" görünüyor. Neden: `dha-collector.py`, yeni yerel
  haber bulamadığında `RuntimeError("Guncel yerel haber bulunamadi")` ile çıkıyor. "Yeni haber yok"
  bir hata değil; çıkış kodu 0 olmalı. Aksi halde gerçek arızalar gözden kaçar.
- `umraniye-medya-trash.service` (depoda olmayan Docker tabanlı medya arşivi) her turda aynı öğeyi
  silemiyor (`failed: [1 kayıt]`).
- X ek okuyucusu (`x-twscrape`) çalışıyor; son turda yeni canlı gönderi doğrulandı. Facebook ek okuyucusu
  kaynakların bir kısmını okuyor, bir kaynakta `public_access_blocked`.
