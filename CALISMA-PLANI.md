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

- [x] Madde 1: Bugün / bu hafta / bu ay geçişinde donma — kök neden istemcide: her kayıt için yeni
  `Intl.DateTimeFormat`, harita için 35 tam liste taraması, değişmeyen veride tam yeniden çizim
  (`inceleme/03`, F-01/F-02). Sahte DOM ölçümü 2000 kayıtla 4,9–8 sn → 7–11 ms.
- [x] Madde 3: Sekmelerde kasma — `app.html` tarafı Madde 1 ile aynı kök neden; portal tarafında sekme
  başına tüm kabuğun yeniden kurulması ve aynı listenin yeniden indirilmesi (`inceleme/00`, P7);
  görsel isteklerinin API bütçesini doldurup 429 üretmesi (P1).
- [x] Madde 8 ve 12: "Sonraki" — 429 kök nedeni (P1), yükleme durumu olmaması (P2), geçersiz sayfa (P3)
- [x] Madde 9: 60 saniyelik yenileme (P5, ayrıca `app.html` F-02, `social.html` S-05)
- [x] Madde 10: Önbellek yarışı (P4), `integrations.mjs` eşzamanlı analiz (S-02), konum analizi
  RegExp maliyeti (S-01: 2114 ms → 416 ms)
- [x] Madde 11: Sessiz hatalar (P5, F-03, F-05, W7, L-05)
- [x] Madde 5: Açılış yükü — logo 1,8 MB → 49 KB (P10), yinelenen açılış istekleri (P6)
- [x] Madde 6: X/Instagram gecikmesi — X okuyucusunun 6 saate kadar susması (D1), en yeni boşluğun
  okunmaması (D2), X bildirim okuyucusunun iptalde okuduklarını kaybetmesi (B1), Instagram'da 1 saatten
  geç bulunan gönderilerin atılması (B3), X kural kopyalarının eski olması (P15), acil bildirimin eski
  önbellekle üretilmesi (W1). Bilinçli tarama aralıkları (5–10 dk) değiştirilmedi.
- [x] Satır satır inceleme bulguları: `inceleme/` klasöründe alan bazında 9 rapor

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

Her bulgu: önem, dosya:satır, gözlem, kök neden, düzeltme, doğrulama. Ayrıntılar `inceleme/` altında:

| Rapor | Kapsam |
| --- | --- |
| `00-portal-ve-ortak.md` | Portal, istek bütçesi, giriş ekranı, logo, X kural kopyaları, manifestler |
| `01-worker.md` | `application/worker/index.js` |
| `02-src-js.md` | `application/src/*.js`, `workspace.html` (ölü kopyalar dahil) |
| `03-app-admin-html.md` | `app.html`, `admin.html`, moderasyon arayüzü |
| `04-sunucu-modulleri.md` | `application/server`, `scripts`, `deploy`, `drizzle` |
| `05-kurum-telegram-ops.md` | Kurum koordinasyonu, Telegram botu, eşitleyici |
| `06-browser-instagram.md` | Tarayıcı işçileri, Instagram API ve medya |
| `07-x-facebook.md` | X ve Facebook yedek okuyucuları |
| `08-legacy.md` | Önceki uygulama |

Öne çıkan kritik/yüksek düzeltmeler:

- Telegram botu ilk yeni uyarıda tanımsız değişken yüzünden çöküyordu; hiçbir uyarı gitmiyordu (05).
- `+0300` biçimindeki RSS tarihleri reddediliyordu; kayıtlar tarih filtrelerinden düşüyor, acil
  bildirim oluşmuyordu (02).
- Görsel istekleri IP başına API bütçesini doldurup "Sonraki" ve sekmeleri 429 ile bozuyordu (00).
- X okuyucusu zaman aşımında 6 saate kadar susuyordu (07); Facebook okuyucusu sayfa ortasında bütçe
  dolunca okuduklarını atıyordu (07).
- Telegram'da çift gönderim yarışı (05); kurum yönetimi hatalarının hep 500'e dönmesi (05).

1. aşamada düzeltilmeyen güvenlik bulguları raporlarda "3. aşama" başlığıyla duruyor.

Karar bekleyenler:

- Instagram tazelik penceresi 1 saatten 3 saate çıkarıldı (panelin kullandığı değer); kod sahibine
  issue #2 ile soruldu.

Karara bağlananlar:

- Haber saklama süresi **2 ay** olarak eşitlendi (`src/retention.js` 6 aydan 2 aya; worker zaten 2 ay).
- Kullanılmayan dosyalar silinmedi; issue #1 ile soruldu.
