# OSINT PR incelemesi ve kontrollü sürüm paketi — 14 Kasım 2026

## Sonuç ve kapsam

CALISMA-RAPORU.md, PR #3, #6, #7, #8, #10 kaynakları ve sunucudaki gerçek servis bağlantıları incelendi. Mevcut main ile PR #10'un (#3 dahil) değişiklikleri çatışmasız bir izole adayda birleştirildi. Canlı kaynak dosyaları henüz değiştirilmedi; PR'lar GitHub'da birleştirilmedi/kapatılmadı.

Canlı dağıtım için `osint-pr-inceleme-kur.py` hazırdır. Varsayılan çalışması yalnız ön kontroldür; `--apply` kurar. Paket kaynak özetlerini tekrar denetler, değişiklik varsa kurmaz. Mevcut tarayıcı turunun bitmesini bekler, etkin zamanlayıcıların önceki durumunu geri getirir, kod ve tutarlı SQLite yedeği alır. Yalnız mevcut 3001 uygulamasını kısa süreli yeniden başlatır. Sağlık kontrolü başarısızsa kodu geri alır. Yeni kayıtları kaybetmemek için veritabanını otomatik eskiye döndürmez.

Bu işlemde 3001 canlıdır. Kısa uygulama yeniden başlatması sırasında dışarıda geçici 502 görülebilir. Yerel başarılı HTTP kontrolü, dış tarayıcı veya yeni sosyal gönderi kazanımı doğrulaması sayılmaz.

## Doğrulanan gerçek yapı

- `umraniye-osint-deneme.service`: canlı uygulama, 3001. Adındaki DENEME ifadesi izolasyon sağlamıyor.
- `umraniye-osint.service`: aktif 3000 ağ geçidi. Eski uygulama sanılıp durdurulamaz.
- `umraniye-telegram.service`: kapalı. Geçerli yapılandırmada eski haber köprüsü; rapordaki restart komutu uygulanmaz. Asıl gönderim mevcut uygulamadadır.
- `TRUST_CLOUDFLARE=true`: çalışan uygulamanın etkin ortamından, yalnız bu değer alınarak doğrulandı. Gizli değerler aktarılmadı.
- Şema: 77 nesne, veri satırı dışa aktarılmadı. Önceden uygulanmış 13 geçiş dosyasının özetleri birebir korunuyor.

## Bulup düzelttiğim ek eksikler

1. PR #3'ün iki aylık saklama değişikliği, bu sohbetteki altı aylık talimatla çelişiyordu. Performans iyileştirmesi korunarak altı ay geri getirildi.
2. Temiz kurulumda ortak kelime ve Facebook temel tabloları eksikti. Gerçek şemadan dokuz tablo için yalnız eklemeli, tekrar çalıştırılabilir `0013_runtime_foundation.sql` eklendi. Sahte kayıt eklenmez; eski geçiş dosyaları değiştirilmez.
3. package.json'un çağırdığı altı betik depoda yoktu. Derleme/sözdizimi kontrolü, test, izole sunucu testi, deneme doğrulama, kaynak biçim kontrolü ve izole önizleme betikleri eklendi. Önizleme yeni geçici veri dizini ve boş port kullanır; canlı ortam sırlarını devralmaz.
4. X testleri önceki davranışı bekliyordu: bağımsız hesabın eski tarayıcı meşgulken çalışması artık doğru davranış. Dönen arama planı ve lab_config fikstürleri güncellendi. Üretim davranışı test geçsin diye değiştirilmedi.
5. Eşitleyici testi, depodaki yerine kurulu sunucu betiğini içe aktarıyordu. Testin aday dosyayı sınaması düzeltildi.
6. Gerçek kurulu bağımlılık sürümleri ayrı gözlem dosyalarına yazıldı. Bu dosyalar kilit/hashes güvencesi değildir; kurulum otomatik paket yükseltmez.
7. Güncel main'deki Instagram tarih kanıtı düzeltmesi korunarak PR değişiklikleri alındı.

## Tamamlanan izole kontroller

| Kontrol | Sonuç |
|---|---|
| JavaScript kaynak sözdizimi | 106 dosya geçti |
| HTML içindeki JavaScript sözdizimi | 21 betik geçti |
| Temiz SQLite ile gerçek uygulama açılışı | Geçti; ayrı geçici dizin/port |
| Yönetici giriş/oturum, yabancı Origin engeli | Geçti |
| Eski barındırma MCP yolunun kapatılması | Geçti |
| X okuyucu/kapsam testleri | 26 test geçti |
| Facebook okuyucu/işçi/yayıncı | 9 + 5 + 4 test geçti |
| Instagram okuma kalitesi/tarih kanıtı | 29 + 18 test geçti |
| İç servis anahtarları ve diğer yönetim yolları | Geçti; eksik/yanlış anahtar reddedildi |
| Gerçek backend aday kabulü, tekilleştirme ve zamanlar | Geçti |
| Kurum üyeliği/veri ayrımı/yetki iptali | Geçti |
| Kurum parola yenileme/şifreli saklama | Geçti |
| E-posta alıcılarının kuruma sınırlandırılması | Geçti; gerçek e-posta gönderilmedi |
| Eşitleyici yerel depo ve sır engeli fikstürü | Geçti; GitHub'a test push'u yapılmadı |
| Yeni sır tarayıcısının mevcut kaynaklara uygulanması | Geçti; 447 dosya |
| X/Facebook kuralları ve uygulama manifestleri | Her birinde 14 dosya, uyuşmazlık yok |
| Eski migration checksum denetimi | 13/13 aynı |

Python testleri toplam 91'dir. Node test takımları bu sayıya dahil değildir. Hiçbiri yeni canlı sosyal gönderi bulunduğu anlamına gelmez. Testler boş/geçici veritabanı ve yapay test girdileri kullanır; kullanıcı ekranına sahte haber yüklenmez.

## Arayüz PR'ları

#6/#7/#8 birlikte uygulanmamalı. Üçünün ortak CSS'i kurumsal alt başlığı ve platform açıklamasını gizliyor. A ayrıca kart görünümünü listeye çeviriyor; bu, önceki kart varsayılanı talebiyle çelişiyor. Bu nedenle tasarım seçeneği bu hata/güvenlik paketine eklenmedi. Mevcut renkler, kurumsal metinler, kart varsayılanı, görselsiz kayıt açıklaması ve işlevler korunuyor. Tasarım PR'ları kapatılmadı. Tasarımların masaüstü/mobil gerçek tarayıcı doğrulaması yapılmadı.

## Güvenlik ve issue yanıtları için doğrulanmış kararlar

Issue yorumlarına erişim sağlanamadı; aşağıdakiler rapordaki sorulara yönelik teknik kararlardır, GitHub'a yorum olarak gönderilmedi.

- Kullanılmayan dosyalar: import/servis bağımlılığı kanıtlanmadan silinmez. Legacy uygulama ile aktif ağ geçidi aynı şey değildir.
- Üç saatlik Instagram değerlendirme aralığı: içerik yakalama ile sesli acil bildirim ayrı tutulur. Sesli bildirimde mevcut 60 dakika, uygunluk ve ilçe bağlamı şartları korunur. Ulusal Telegram yeniden açılmaz.
- VNC: x11vnc loopback ve isteğe bağlıdır; incelemede 5900/6080 dinleyicisi açık değildi. Web proxy yönetici kilidi ve websocket Origin denetimi kullanıyor. Yerel süreç tehdidi devam eder. Sadece VNC ayağını Unix soketine almak, websockify TCP ayağı kalırsa sorunu tamamen çözmez. Çalışan giriş akışı doğrulanmadan değiştirilmedi.
- Sahip hesabı kısa parola istisnası: mevcut girişi bozacak şekilde kaldırılmadı; kontrollü parola yenileme gerekir.
- Kurum PIN'i ve PBKDF2: uyumlu geçiş ve ölçüm olmadan topluca değiştirilmedi.
- Parola gösterme: mevcut kullanıcı talebi nedeniyle körlemesine kaldırılmadı; yeniden kimlik doğrulama ve denetim izi ayrı geliştirme gerektirir.
- Root yardımcılar: PR'ın güvenli dosya yazma ve sır aktarımını sınırlama düzeltmeleri alındı; servis kullanıcısı değişimi aynı pakete zorla eklenmedi.
- X/Facebook systemd ek sertleştirme ayarları ve eşitleyici işletim değişikliği: kaynakları incelendi/test edildi; bu dağıtım paketi etkin servis birimlerini veya eşitleyicinin yürütücü dosyasını değiştirmez. Bunlar uygulanmış sayılmamalıdır.

## Dağıtım dışında tutulanlar

Legacy uygulama ve eski Telegram bot dosyaları, ops/eşitleyici yürütücüsü, systemd servis değişiklikleri, tasarım seçenekleri ve geliştirme fikstürleri canlıya kopyalanmaz. Eksik dependency betikleri kurulurken mevcut venv/profil/anahtar dizinlerine dokunulmaz.

Meta erişim hataları, hesap kısıtları ve üçüncü tarafların hiç yayımlamadığı/erişilemeyen içerikler bu kod paketiyle çözülmüş sayılmaz. Bütün haberleri yakalama veya sıfır hata garantisi verilemez. Gerçek kullanıcı oturumunda dış site ve yeni gönderi teslimi kurulum sonrasında ayrıca gözlenmelidir.

## Erişim ve geri dönüş

Tek komut, Windows CMD:

```cmd
ssh -t -o PubkeyAuthentication=no basin@100.79.234.33 "sudo python3 /home/basin/osint-pr-inceleme-kur.py --apply"
```

Kurulum sonucu gerçek yedek dizinini ve `geri-al.py` komutunu yazdırır. Anahtar veya parola raporlanmaz. Yedek veritabanı yalnız sunucuda kalır. Geri alma kodu geri döndürür; canlıda sonradan gelen haberleri silmemek için veritabanını otomatik geri yüklemez.

**Mevcut durum: izole aday ve kurulum paketi doğrulandı; canlı kurulum ve dış tarayıcı doğrulaması bekliyor.**
