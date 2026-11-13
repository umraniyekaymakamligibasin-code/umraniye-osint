# Bağımsız Facebook GitHub okuyucusu — deneme

Seçilen kaynak: [bsho5/fbgql](https://github.com/bsho5/fbgql), MIT; sürüm 0.1.0, sabit commit `28e03ae84012be44d37a67014fcfcfcc420c9ee9`. Kod, bağımsız `vendor/fbgql` dizinine sabitlendi. Başka depoların çerez/örnek HTML dosyaları kopyalanmadı. Bu resmî Meta API'si değildir; Facebook'un web arayüzünün GraphQL sorgularını kullanan küçük bir topluluk projesidir. Canlıda çalışması gelecekte de aynı kalacağı anlamına gelmez; otomatik güncelleme yoktur.

## Bizim sistem için seçim

`kevinzg/facebook-scraper` PyPI sürümü 2022 tarihli; boş sonuç ve JS sayfa yükleme hataları açık. Onu mevcut okuyucunun yerine koymak için yeterli kanıt yoktu. `yt-dlp` video bağlantısı bilgileri için yararlı olabilir, ancak genel sayfa metin akışının yerine geçmez. `fbgql` tarafında ise üç gerçek kullanıcı kaynağından tarayıcısız/çerezsiz okuma görüldü. Bu nedenle **mevcut Facebook'a dokunmayan ayrı gölge deneme** seçildi. Canlı ana sisteme aktarım bu aşamada yoktur.

## Hazır olanlar

Yeni dizin `/opt/umraniye-osint-facebook-fbgql-deneme`, yeni venv, yeni kullanıcı `osintfbshadow`, ayrı SQLite/rapor dizini `/var/lib/umraniye-osint-facebook-fbgql-deneme`. Bütün bağımlılıklar sabitlenir. Yeni servis `umraniye-osint-facebook-fbgql-deneme.service`. Varsayılan otomatik başlangıç/timer yoktur.

Her elle başlatılan tur yalnız mevcut panelde **etkin** bir Facebook kaynağını dönüşümlü seçer. En fazla üç gönderi, altı HTTP isteği ve 35 saniyelik ağ bütçesi. Çocuk okuma süreci 45 saniyede sonlandırılır. Yorumlar, yanıtlar, medya indirme, çerezler, browser profilleri, proxy, hesap döndürme, giriş ve challenge çözme kapalıdır. 401/403/429 veya doğrulama sayfasında durur. Engel sonrası bir saat yeni deneme yapılmaz. Mevcut Facebook hizmeti o sırada çalışıyorsa yeni tur ertelenir; eski hizmet durdurulmaz.

Güncel merkezi sözlük ve gerçek kaynak listesi mevcut SQLite'tan salt okunur, tutarlı işlemle alınır. Kuralların incelenmiş kaynak hash'leri eşleşmezse kurulum durur. Ayrı kurallar kopyası aynı merkezi Facebook üyeliklerini, konum, kalite, tarih, Ümraniyespor ve diğer il güvenlik kurallarını uygular. 60 dakikadan eski yayın yeni keşfedildi diye güncel sayılmaz. Metni olmayan Reels için içerik uydurulmaz; `text_missing` olarak ayrılır. Video/ses çözümlemesi ve hikâyeler desteklenmez. Kamuya açık ilk birkaç gönderi örneği tüm akış kapsamı anlamına gelmez.

Sonuçlar yalnız ayrı `shadow.sqlite` ve `report.json` dosyasındadır. Üretim DB/kuyruğuna ve Telegram'a yazılmaz. Ana Facebook kaynak sağlık durumları güncellenmez. Ham HTML, oturum bilgisi ve kişi yorumları depolanmaz.

## Kurulum ve kullanım

Windows CMD'de üst dizindeki `OSINT-FACEBOOK-GITHUB-KUR.cmd` dosyasını çalıştırın. Kurulum eski hizmetleri durdurmaz veya yeniden başlatmaz; yeni servisi de otomatik başlatmaz. Sadece yeni birimi kaydeder, çevrimdışı testleri ve ağsız planı çalıştırır.

Kurulumdan sonra tek tur:

```sh
sudo systemctl start umraniye-osint-facebook-fbgql-deneme.service
sudo cat /var/lib/umraniye-osint-facebook-fbgql-deneme/report.json
```

Durdurmak için yalnız:

```sh
sudo systemctl stop umraniye-osint-facebook-fbgql-deneme.service
```

Mevcut okuyuculara dosya geri yüklemek gerekmez; onlar değiştirilmez. Yeni bileşen yolunun üzerine kurulum yapılmaz. Yeni dizin tam paket kopyasını ve yeni birim tanımını içerir. Aktarım/kurulum hatası halinde gerçek adım ve hata çıktısı alınır; yarım kalan dizinler silinmez, önce incelenir.

## Gerçek doğrulama sınırı

12 Kasım 2026'daki **bu bilgisayardan** canlı denemeler: Asayişberkemal tarihli/linkli gönderiler okundu (2 istek); `profile.php?id=100091870376627` üç tarihli/linkli gönderi (1 istek); `umraniyehaberlerii` üç tarihli/linkli gönderi (2 istek). Reels URL'leri görüldü. Bu kayıtların yeni Ümraniye olayı olduğu veya panelde görüntülendiği iddia edilmez. Başka il/eskilik filtrelerinden elenebilirler.

Sunucuya anahtarlı SSH denemesi reddedildi. Dolayısıyla sunucuda kurulum, sunucunun IP'sinden Facebook erişimi ve Linux hizmetinin canlı okuması henüz doğrulanmadı. Kullanıcı giriş onayını sonraya bıraktı; hiçbir X hesabına giriş yapılmadı. Bu Facebook denemesi anonimdir, mevcut Facebook hesabının oturumuna ihtiyaç duymaz.
