# Bağımsız X gölge okuyucusu

Bu paket çalışan X okuyucusuna bağlanmaz. Üretime aktarım ve Telegram gönderimi yoktur. Yeni servis elle başlatılan tek turdur; zamanlayıcı ve otomatik başlangıç yoktur. Tarayıcı kurulmaz/açılmaz. `twscrape==0.21.0` ve tüm alt bağımlılıklar `requirements.lock` içinde sabittir. Yalnız yeni sanal ortama kurulur.

## Kurulum

Windows CMD'de üst dizindeki `OSINT-X-GOLGE-KUR.cmd` çalıştırılır. Bu işlem dosyaları SSH ile aktarır, sudo ile **yalnız yeni bileşeni** kurar, gerçek merkezi sözlüğü salt okunur alır ve ağ isteği yapmadan sorgu planını doğrular. Mevcut servislerde durdurma/yeniden başlatma/etkinleştirme komutu yoktur. Yeni servis de başlatılmaz.

Sunucuya erişim bu sohbetten doğrulanamadı (SSH anahtarı kabul edilmedi). Kurulumun ve Linux systemd sandbox'ının çalıştığı henüz doğrulanmış değildir. Güncel sunucu filtrelerinin hash'leri incelenen sürümden farklıysa kurulum **değişiklik yapmadan durur**; filtreleri tahmin ederek değiştirmez.

Kurulum dizini `/opt/umraniye-osint-x-twscrape-deneme`; kullanıcı `osintxshadow`; durum dizini `/var/lib/umraniye-osint-x-twscrape-deneme`. Hesap SQLite'ı ve gölge kayıt SQLite'ı birbirinden ve mevcut sistemden ayrıdır. Çerezler mevcut OSINT profilinden kopyalanmaz.

## Ayrı oturum

Mevcut OSINT hesabından farklı, size ait bağımsız X oturumunu kullanın. Sohbete çerez veya parola göndermeyin. Sunucuda:

```sh
sudo -u osintxshadow /opt/umraniye-osint-x-twscrape-deneme/venv/bin/python /opt/umraniye-osint-x-twscrape-deneme/session.py
```

Araç önce ayrı hesap onayını, ardından o oturumun `auth_token` ve `ct0` değerlerini gizli terminal girişinde alır. Hesap parolası alınmaz. Alanlar görünmez; Windows Terminal'de sağ tıkla veya Ctrl+Shift+V ile yapıştırılabilir. Yalnız X'in kendi çerezleri kullanılmalı; herhangi bir üçüncü taraf çerez hizmetine gönderilmemeli. Var olan yeni hesap deposunun üzerine otomatik yazılmaz. Tek hesap desteklenir; hesap döndürme ve otomatik giriş yoktur. Ayrı hesap beyanı kullanıcıya aittir; çerezin hangi kurumsal profilden alındığı program tarafından kanıtlanamaz.

## Tek düşük hacimli deneme

```sh
sudo systemctl start umraniye-osint-x-twscrape-deneme.service
sudo cat /var/lib/umraniye-osint-x-twscrape-deneme/report.json
```

En fazla iki sorgu, sorgu başına on gönderi, okuma süresi en fazla 90 saniyedir. Bunlar twscrape'in kendi oturum hazırlama/yeniden deneme HTTP istek sayısı için bir garanti değildir. Merkezi sözlükten X etkin üyelikleri ve gerçek etkin hesaplar alınır. Bir kelime grubu ve bir hesap grubu dönüşümlü taranır; `Latest` kullanılır. Hesap veya kelime uydurulmaz. Bu sürümde ayrı X listesi yapılandırılmaz; ikinci okuma türü gerçek hesapların `from:` sorgularıdır.

`config.example.json` aynı zamanda çalışan güvenli ayardır; bütçeler aşağı çekilebilir. Üst sınır, 60 dakika tazelik, shadow ve gönderim kapalı koşulları kodla korunur. Sözlük burada düzenlenmez; her servis başlangıcında mevcut merkezi sözlükten yeniden alınır. Kaynak/kelime yönetimi mevcut panelde kalır. İncelenmiş ortak modüllerin bağımsız kopyaları kullanılır; mevcut modüller canlı süreç içine alınmaz. Metin güvenilir/doğrulanmış konum ilan edilmez. Ek gölge koruması başka ildeki “Ümraniye Caddesi” eşleşmesini eler.

Eski X veya sıralı toplayıcı çalışıyorsa yeni tur ertelenir. Okuma sırasında da iki saniyede bir kontrol edilir; eski tur başlarsa yeni okuma iptal edilir. Eski sistem asla durdurulmaz. 45 saniyelik eski tarama döngüsü nedeniyle gölge tur sık ertelenebilir; bu ilk güvenli deneme için kasıtlıdır. İki saniyelik gözlem aralığı sıfır çakışma garantisi değildir; yeni okuyucuda yoğun Chromium işi bulunmaz.

Hata sonrası 10 dakikadan 6 saate artan bekleme uygulanır. Yeni servis kendiliğinden tekrar denemez. Manuel tekrar başlatma beklemeyi aşmaz. Eksik oturum, erişim hatası, boş sonuç, hız sınırı/uygun hesap yokluğu ve zaman aşımı ayrı raporlanır. Kısıtlar aşılmaz. Yeni oturum bozulursa kullanıcı doğrulaması gerekir; kesintisiz/eksiksiz X erişimi vaat edilmez.

## Rapor ve kayıtlar

`shadow.sqlite`: yalnız filtrelenen gölge gönderiler; kimlikler metin, tam metin, UTC yayın/toplama, Türkiye saati, sorgular, kelimeler, kategori, konum kanıtı. Aynı kimlik yeniden gelirse güncellenir; sorgu geçmişi korunur. Ümraniyespor futbol içerikleri burada sonuç listesine alınmaz. Tarihsiz kayıtlar kabul edilmez. `report.json`: son tur, hata sınıfı, adetler, süre/CPU/RSS (Linux), servis durumlarının önce/sonra gözlemi. Ham upstream hata metni ve çerezler loglanmaz.

Mevcut `lab_items` yalnız `mode=ro`, `query_only` ve tek okuma işlemi içinde karşılaştırma kimlikleri için okunur. Üretim kuyruğu okunmaz/yazılmaz. Son 60 dakikadaki kimlik kesişimi raporlanır. Sorgu kapsamları aynı olduğu kanıtlanmadığından yalnız bir okuyucuda bulunmak “diğeri kaçırdı” sayılmaz. Mevcut kayıtlar eski anlık görüntüye dayanır; anlık keşif gecikmeleri sonucu etkileyebilir. Eski servisin yeni turunu tamamladığı otomatik kanıtlanmış sayılmaz (`normalOldRoundObserved:false`).

## Durdurma / geri alma

```sh
sudo systemctl stop umraniye-osint-x-twscrape-deneme.service
```

Bu komut yalnız yeni okuyucuyu durdurur. Servis etkinleştirilmediği için ayrıca timer veya eski servis işlemi gerekmez. Veriler inceleme için korunur. Tam kaldırmak istersen yalnız yeni birim dosyası/dizinleri kaldırılır; mevcut X profilleri, servisleri ve DB'leri kapsam dışıdır. Kurulum mevcut dosyaların üzerine yazmadığından eski sisteme dosya geri yüklemesi gerekmez. `service.saved` kurulan yeni birimin kopyasıdır.

## Doğrulama sınırı

Yerel testler ayrı sahte test nesneleriyle çalışır, OSINT'e veri yazmaz. Python 3.15 / Node 24 üzerinde 16 test geçti; gerçek twscrape 0.21.0 imzaları ve boş hesap deposuyla kontrollü çıkış kontrol edildi. Ubuntu kurulumu, gerçek ayrı oturumla gönderi okuması ve canlı eski servis gözlemi henüz yapılmadı. Test sonucu canlı erişim sonucu değildir. `test-report.json` ve `research.md` ayrıntıları içerir.
