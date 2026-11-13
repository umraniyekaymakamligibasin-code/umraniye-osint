# OSINT haber okuma değerlendirmesi — 13 Kasım 2026

Bu değerlendirme o gün yaklaşık 20:55–21:00 TSİ civarındaki systemd ve son iki saatlik yapılandırılmış journal kayıtlarının salt okunur incelemesine dayanır. Yeni tarama veya test mesajı başlatılmadı. Veritabanı dizinleri mevcut SSH kullanıcısına kapalı olduğundan bütün kayıtlar yeniden sorgulanmadı; tarayıcı görünümü doğrulanmadı.

## Mühendislik puanı: 70/100

Bu bir ölçülmüş yakalama oranı değildir. Dört içerik kanalına eşit ağırlıkla verilen öznel mühendislik puanlarının ortalamasıdır: (80 + 75 + 70 + 55) / 4 = 70. Başarı değerlendirmesinde gerçek okuma, mevcut depoya aktarım, kapsam, gecikme ve henüz doğrulanmamış alanlar dikkate alındı. Okunan içeriklerin hepsi yeni, ilçe ile ilgili veya haber değeri taşıyan kayıtlar değildir; düşük kabul sayısı tek başına sorun kanıtı değildir.

| Kanal | Puan | Kanıt ve sınır |
|---|---:|---|
| Haber siteleri | 80 | Son üç tam toplama turunda başarılı=15, failed=0, stopped=false. 20:55 civarı kurulumla aynı zamanda stopped=true görüldü; kesintisiz uzun süreli performans henüz ölçülmedi. Bunlar yeni haber sayısı değildir. |
| X | 75 | Yedek okuyucu 109, 51, 43 ve 41 farklı gönderi okuyan turlar tamamladı. Publisher iki turda 1 ve 2 gönderinin mevcut depoda olduğunu doğruladı. Sonraki iki tur yeni aktarım beklemiyordu. Eski bildirim okuyucusunda no_dated_posts devam ediyor; sayfa/arama okumaları çalışsa da bildirim kanalı eksik. |
| Facebook | 70 | İlk yeni tur 10 kaynak denedi; sekiz kaynakta toplam 96 gönderi okundu. Bir güncel uygun gönderi mevcut depoya aktarıldı. 85 eski, 6 Ümraniyespor, 1 başka konum, 3 kelime eşleşmesi eksik aday elendi. Bir yönlendirme ve bir bütçe sınırı var. Yalnız ilk canlı tur, bütün sayfaların veya uzun süreli kararlılığın kanıtı değildir. |
| Instagram | 55 | API son tur completed; 13 etkin yapılandırılmış kaynak, turda üç kaynak. Son turda üç kaynakta 75'er kayıt dönmüş; bu 225 yeni haber değildir. Önceki bir kaynakta code 110/subcode 2207013 görüldü. Akıllı değerlendirme son raporunda autoCandidates=0, autoInserted=0, autoTotal=4, review=77, archive=53. Bu sayıların kapsamları farklıdır; birleştirilerek tek toplam yapılmadı. İnceleme kategorisindekilerin kaçının önemli haber olduğu henüz doğrulanmadı. |

## Öncelikli eksikler

1. Instagram'da okunan paylaşımın otomatik haber kabulüne dönüşmesi: gerçek önemli olay örnekleriyle inceleme kategorisini ve video/metinsiz içerik durumunu ölçmek. Sırf kabul sayısını artırmak için konum/kalite korumaları gevşetilmemeli.
2. Facebook kaynaklarının tam tur gecikmesini ölçmek; bütçe sınırını gerçek erişim hatasından ayırmak. Bir saatte hangi etkin sayfaların gerçekten okunduğu raporlanmalı.
3. X bildirim okumasındaki no_dated_posts durumunu sayfa/arama okuyucusundan ayrı değerlendirmek.
4. En az 24 saatlik doğal çalışma ve seçilmiş gerçek olaylar üzerinden okuma → kabul → depolama → görünür kart → uygun gönderim zincirini izlemek. Bilinen bütün gönderilerin listesini tutmadan eksiksizlik yüzdesi hesaplanamaz.

Kurulum sırasındaki geçici URLError ve stopped=true kayıtları ile platform kaynaklı sürekli hatalar aynı sınıfa konmamalıdır. API completed ve systemd success yalnız işlem tamamlanmasını kanıtlar; yeni haberin panelde görünmesini tek başına kanıtlamaz.
