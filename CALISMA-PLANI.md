# Çalışma planı: kod inceleme, hata düzeltme, arayüz ve güvenlik

Bu dosya inceleme ve düzeltme çalışmasının yol haritasıdır. Her aşama ayrı bir dalda
yürür ve ayrı bir PR ile `gelistirme` dalına önerilir. İlerledikçe güncellenir.

## Dal düzeni

| Dal | Amaç |
| --- | --- |
| `yedek/orijinal-2026-11-13` | Çalışma başlamadan önceki `main` (commit `4a872de`). Dokunulmaz. |
| `gelistirme` | PR'ların birleştirildiği entegrasyon dalı. |
| `asama-1/hata-duzeltmeleri` | 1. aşama: hatalar ve `PROJE-ACIKLAMASI...` maddeleri. |
| `asama-2/arayuz` | 2. aşama: arayüz seçenekleri (ekran görüntüleriyle, seçim kullanıcıda). |
| `asama-3/guvenlik` | 3. aşama: güvenlik açıkları. |

**Neden PR'lar `main` yerine `gelistirme` dalına açılıyor?** `ops/github_sync.py` canlı
sunucudaki dosyaları her dakika `main` dalına yazıyor (`git merge --ff-only` sonrası izlenen
dizinleri sunucu kopyasıyla değiştirip push ediyor). `main` dalına birleştirilen ve sunucuya
kurulmamış bir değişiklik bir sonraki eşitlemede geri alınır. Bu yüzden düzeltmeler önce
`gelistirme` dalında toplanır, sunucuya kurulur, eşitleyici de kurulu sürümü `main` dalına taşır.

## Kapsam

İzlenen bileşenler: `application` (etkin panel), `legacy-application`, `browser`,
`instagram-api`, `instagram-media`, `x-shadow`, `facebook-shadow`, `telegram`, `ops`,
`development`. Aynı içerikli kopyalar (örn. `*/rules/server/*.mjs`, `development/*` altındaki
kopyalar) bir kez incelenir, düzeltme tüm kopyalara uygulanır. `facebook-shadow/vendor` üçüncü
taraf koddur; yalnız güvenlik açısından incelenir.

## 1. aşama: hatalar ve bildirilen sorunlar

Önce `PROJE-ACIKLAMASI-VE-TEKNIK-ONCELIKLER.md` maddeleri, sonra satır satır inceleme bulguları.

- [ ] Madde 1: Bugün / bu hafta / bu ay geçişinde donma (yinelenen istek, eski yanıtın yeni görünümü ezmesi)
- [ ] Madde 3: Haber Gündemi / Ulusal Gündem sekmelerinde kasma (sekme başına yeniden çekme ve tam yeniden çizim)
- [ ] Madde 8 ve 12: "Sonraki" düğmesi ve sayfalama sınır durumları
- [ ] Madde 9: 60 saniyelik otomatik yenilemenin açık sayfayı baştan çizmesi
- [ ] Madde 10: Portal önbelleği süresi dolunca eşzamanlı tam hazırlama (istek birleştirme, bayat-sun-arka planda-yenile)
- [ ] Madde 11: Sessizce yutulan hatalar (kullanıcıya etkili olanlar görünür ve yeniden denenebilir hale gelir)
- [ ] Madde 5: Açılış yükü (gereksiz başlangıç verisi, büyük varlıklar, bloklayan dosyalar)
- [ ] Madde 6: X/Instagram verisinin geç görünmesi (kodda görülen kuyruk/zamanlama gecikmeleri)
- [ ] Satır satır inceleme bulguları (önem sırasıyla, aşağıdaki bulgu kaydında)

## 2. aşama: arayüz

- [ ] Madde 2: "Son Dakika" alanını küçültme veya kaldırma
- [ ] En az iki farklı arayüz tasarımı hazırlanır, yerel olarak çalıştırılır, ekran görüntüleri paylaşılır
- [ ] Seçilen tasarım uygulanır; masaüstü ve mobil genişlikte kontrol edilir

## 3. aşama: güvenlik

- [ ] Madde 7 ve 13: Kod, yapılandırma ve tüm Git geçmişinde sır taraması (değerler rapora yazılmaz)
- [ ] Kimlik doğrulama, oturum, yetki, CSRF, XSS, SSRF, girdi doğrulama, dosya yolu, komut çalıştırma incelemesi
- [ ] Dağıtım betikleri ve systemd servisleri (yetki, dosya izinleri, ağ erişimi)
- [ ] Eşitleyicinin sır kalıpları ve atladığı kapsam

## Doğrulama yaklaşımı

- Her düzeltmeden sonra `node --check` / `python3 -m py_compile` ile sözdizimi kontrolü.
- Depoda bulunan testler (`*/test_*.py`, `test*.mjs`) çalıştırılabildiği ölçüde çalıştırılır.
- Canlı sunucu ve gerçek tarayıcı ölçümü bu ortamda yapılamaz. Canlı ölçüm gerektiren maddelerde
  koddaki doğrulanmış neden düzeltilir, ölçüm adımı PR açıklamasında takip işi olarak yazılır.

## Bulgu kaydı

Her bulgu: önem, dosya:satır, gözlem, kök neden, düzeltme, doğrulama.

_(İnceleme ilerledikçe doldurulacak.)_
