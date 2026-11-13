# Haber okuma kalitesi — aşama A ve kaynak sırası düzeltmesi

Bu paket 100 puan planının tamamlandığı anlamına gelmez. Kaynak sırası, kalıcı keşif zamanı ve sayım doğruluğundaki kanıtlanmış hataları giderir. Canlı kurulum için sudo gerekir.

## Değişiklikler

- Facebook: beş istekten az bütçe kalan sayfaya başlanmaz; kaynak sıradaki turun başına bırakılır, erişim hatası veya 600 saniyelik bekleme yazılmaz. Kaynak kendi sekiz isteklik sınırına tekrar tekrar takılırsa diğerlerini aç bırakmamak için ikinci denemeden sonra sırada ilerlenir. Erişim kısıtı beklemeleri korunur.
- Facebook: yeni kimlik, tekrar okuma, kaynaktan içerik alınması ve bütçe ertelemesi ayrı ölçülür. Boş/yerleşimi belirsiz yanıt başarılı içerik okuması sayılmaz.
- Instagram: beklemedeki kaynak üç gerçek okuma yuvasından birini tüketmez. Uygun kaynaklar son denemeye göre adil sırayla okunur; aynı toplam tur bütçesi korunur.
- Instagram: eksik metin sonradan tamamlanınca ilk keşif zamanı korunur. API sayfalarındaki aynı medya kimliği bir turda bir kez sayılır. İlk keşif gönderiye de eklenir.
- Instagram: geç başlayan teslim, servis süresini aşarak kuyruk işini yarım bırakmasın diye toplam süreye göre sonraki normal tura ertelenir. Açık teslim onayı zorunluluğu, eski kayıt koruması ve beklemeler korunur.
- Salt okunur denetim: mevcut günlüklerden dört kanalın gerçek okuma turlarını ve özel kuyruklardan yalnız toplu karar sayılarını raporlar. API çağrısı, mesaj, tarama veya veri tabanı yazımı yapmaz. Ham haber metni/anahtar çıkarmaz. Ölçülmemiş yakalama oranı ve puanı boş kalır.

## Kurulum davranışı

Sürüm karmaları uyuşmadan kurulmaz. İzole 26 kontrol önce çalışır. İki mevcut toplayıcının zamanlayıcısı önceki etkinlik durumu korunarak kısa süreli bekletilir; çalışan tur bitmeden dosya değişmez. Özel kuyrukların SQLite yedeği ve kod geri dönüşü alınır. Dosyalar atomik değiştirilir; zamanlayıcılar eski durumuna döner. Site, üretim servisi, X, Telegram, ana veri tabanı ve toplayıcı aralıkları değiştirilmez. Yeni tarama veya zamanlayıcı oluşturulmaz.

Geri dönüş kodu geri yükler; kurulumdan sonra gelen kayıtları silmez. Otomatik değerlendirme kuralları bu pakette genişletilmez; olaylar topluca onaylanmaz.

## Doğrulama

- İzole verilerle kuyruk devamı, tekrar onayı, eski kayıtların gönderilmemesi, keşif zamanı, kaynak açlığı ve rapor gizliliği kontrol edilir.
- Linux sunucuda ayrı staging dizininde çalıştırılır; gerçek kolektör veya API çağrılmaz.
- Kurulum sonrasında tek salt okunur rapor alınır. Yeni gönderi yakalama ve yetkili panel görünürlüğü ayrıca doğal turlarda ölçülür.

## Açık işler

Instagram inceleme nedenlerinin güncel dağılımına göre ortak sınıflandırma iyileştirmesi; metinsiz medya için kaynak ve izin değerlendirmesi; Facebook yönlendiren sayfaların güvenli adres incelemesi; X bildirim kapsamının etiketli örneklerle karşılaştırılması; ortak olay tekilleştirme referans kümesi ve yetkili panel kontrolü; 48 saatlik kurulum sonrası doğal gözlem. Bu başlıklar tamamlandı veya 100 puan oldu diye raporlanmaz.

Denetim komutu:

```sh
sudo python3 /opt/umraniye-osint-deneme/scripts/osint-reading-audit.py
```
