# Portal (Dijital Gündem Merkezi), istek bütçesi ve ortak düzeltmeler

Kapsam: `application/src/assets/portal.js`, `portal.css`, `application/src/portal.html`,
`application/server/portal-api.mjs`, `portal-shell.mjs`, `http.mjs` (oran sınırı çağrısı),
`request-budget.mjs`, `institution-coordination/server/institution-host.mjs` (giriş varlıkları),
logo dosyası, X kural kopyaları ve `rules-manifest.json` dosyaları.

Doğrulama ortamı: uygulama bu depodan yerel makinede (Node 25, boş veritabanı + gömülü örnek veri)
HTTPS vekil sunucu arkasında çalıştırıldı ve Playwright/Chromium ile gezildi. Canlı sunucuda ölçüm
yapılmadı.

## Bulgular

### P1 · Yüksek · Görsel istekleri API bütçesini tüketiyor; "Sonraki" ve sekmeler 429 alıyor (Madde 3, 8)

- **Konum:** `application/server/http.mjs:28`, `application/server/request-budget.mjs`.
- **Gözlem:** IP başına dakikada 240 isteklik tek bütçe statik dosyaları ve
  `/api/portal/thumbnail` isteklerini de sayıyor. Bir liste görünümü 20–40 küçük resim isteği üretiyor.
- **Yeniden üretim:** Ana sayfa → Haber Gündemi → 5 sekme geçişi → Sonraki akışı aynı dakika içinde
  ikinci kez çalıştırıldığında sunucu 429 döndü; "Sonraki" tıklaması "Liste yüklenemedi" ile bitti.
  Kurumda personel aynı dış IP'yi paylaşıyorsa bu sınır herkes için ortaktır.
- **Düzeltme:** Statik dosyalar, favicon ve küçük resim GET istekleri ayrı bir "medya" bütçesine
  (dakikada 1200) alındı. API/sayfa bütçesi (240) ve giriş bütçesi (15 dakikada 25) aynen korunuyor.
- **Doğrulama:** Birim testi (medya 1000 istek sonrası API hâlâ 240 istek kabul ediyor, giriş 25'te
  kesiliyor); aynı tarayıcı akışı art arda 4 kez çalıştırıldı, hiç 429 oluşmadı.
- **Açık risk:** `TRUST_CLOUDFLARE=true` değilse tüm kullanıcılar Cloudflare tünelinin yerel adresi
  olarak görünür ve bütçeyi paylaşır. Canlı env dosyasında kontrol edilmeli.

### P2 · Orta · "Sonraki" yüklenirken geri bildirim yok, tekrar tıklama önceki isteği iptal ediyor (Madde 8)

- **Konum:** `portal.js` sayfalama tıklama işleyicisi ve `loadList()`.
- **Gözlem:** İstek sürerken eski sayfa aynen kalıyor, düğme etkin kalıyor. Her yeni tıklama aynı
  sayfa numarasıyla önceki isteği iptal edip yeniden başlatıyor; yavaş yanıtta sayfa hiç değişmiyor
  gibi görünüyor.
- **Düzeltme:** Yükleme sırasında liste soluklaşıyor ve tıklamaya kapanıyor, sayfalama düğmeleri
  devre dışı kalıyor; kaydırma yalnız istek başarıyla bitince yapılıyor.

### P3 · Orta · Geçersiz sayfa numarası boş sayfa döndürüyor (Madde 12)

- **Konum:** `portal-api.mjs` `list` rotası.
- **Gözlem:** Filtre değişip liste kısaldığında veya kayıtlar süresi dolup silindiğinde
  `page > pages` isteği boş liste döndürüyordu. Ondalıklı sayfa değerleri de kabul ediliyordu.
- **Düzeltme:** Sayfa son geçerli sayfaya çekiliyor, değerler tam sayıya yuvarlanıyor; istemci
  sunucunun döndürdüğü sayfa numarasıyla eşitleniyor.

### P4 · Orta · Önbellek temizlenirken süren hazırlık eski veriyi yeniden önbelleğe yazıyor (Madde 10)

- **Konum:** `portal-api.mjs` `snapshot()` / `invalidate()`.
- **Gözlem:** Eşzamanlı istekler zaten tek hazırlığı paylaşıyordu. Ancak içerik kaldırma gibi bir
  yönetici işleminden sonra `invalidate()` çağrıldığında, işlemden önce başlamış hazırlık bitince
  eski veriyi 30 saniye boyunca önbelleğe yazıyordu; kaldırılan kayıt görünmeye devam ediyordu.
- **Düzeltme:** Nesil sayacı eklendi; geçersiz kılmadan önce başlamış hazırlık önbelleğe yazılmıyor ve
  yeni isteklerle paylaşılmıyor.

### P5 · Orta · 60 saniyelik yenileme açık sayfayı baştan çiziyor, hatası sessiz (Madde 9, 11)

- **Konum:** `portal.js` `refreshPortal()`.
- **Düzeltme:** Sayaçlar ve metinler her turda güncelleniyor. Ana sayfa yalnız özet verisi gerçekten
  değiştiyse ve kullanıcı arama/filtre/menü kullanmıyorsa yeniden çiziliyor (kaydırma konumu
  korunuyor). Liste sayfalarında arka plan isteği kullanıcının başlattığı yüklemeyi kesmiyor; gelen
  sayfa aynıysa DOM'a dokunulmuyor. Hata olursa üst bilgi satırında kısa açıklama, verinin tarihi ve
  "Yeniden dene" düğmesi çıkıyor; konsola yalnız olay adı ve hata sınıfı yazılıyor.

### P6 · Orta · Açılışta aynı veri birden çok kez isteniyor (Madde 5)

- **Gözlem:** Açılışta `/api/portal/summary` iki kez (biri yalnız yönetici menüsü için) ve
  `/api/account` ayrıca çağrılıyordu.
- **Düzeltme:** Hesap bilgisi tek özet isteğinden paylaşılıyor. Ölçüm: açılışta API çağrısı 4'ten 2'ye.

### P7 · Orta · Sekme geçişi tüm sayfa kabuğunu yeniden kuruyor ve aynı listeyi yeniden indiriyor (Madde 3)

- **Düzeltme:** Sekme tıklamasında yalnız sekme durumu ve liste güncelleniyor; arama formu yerinde
  kalıyor. Liste yanıtları 30 saniye istemcide tutuluyor (inceleme kaydı ve 60 saniyelik yenilemede
  temizleniyor). Ölçüm: 3 farklı sekme arasında 5 geçiş 5 yerine 2 istek gönderdi.

### P8 · Düşük · Sayaç kartına tıklama listeyi iki kez yüklüyor

- "Bugünkü Haberler" kartı önce filtresiz listeyi yükleyip sonra "bugün" filtresiyle yeniden
  yüklüyordu. Artık tek yükleme.

### P9 · Düşük · Tarayıcı geri düğmesi uygulamadan çıkıyor

- Sayfa geçişleri `replaceState` ile yapıldığı için geçmiş oluşmuyordu. Menü geçişleri artık geçmişe
  ekleniyor, geri/ileri düğmeleri çalışıyor.

### P10 · Orta · 1563×1563 piksel, 1,8 MB logo her sayfada iniyor (Madde 5)

- Logo ekranda en çok 95 piksel gösteriliyor ve favicon olarak da kullanılıyor. 512 piksele
  küçültülüp 256 renge indirildi: 1,8 MB → 49 KB. Saydamlık korundu; ortalama piksel farkı 0,8/255.
  PDF brifing logosu için 512 piksel yeterli.

### P11 · Orta · Giriş ekranında logo, yazı tipi ve stil yüklenmiyor

- **Konum:** `institution-coordination/server/institution-host.mjs` (iki kopya).
- **Gözlem:** Oturumsuz her istek `/giris`'e yönlendiriliyordu; giriş sayfasının kendi
  `admin-portal.css`, `/favicon.png` ve `InterVariable.woff2` dosyaları da. Giriş ekranında logo kırık
  görünüyor, düğme yazısı Times'a düşüyordu (ekran görüntüsüyle doğrulandı).
- **Düzeltme:** Yalnız bu dört sabit dosyaya oturumsuz GET/HEAD izni verildi.

### P12 · Düşük · Giriş ekranında telif satırı iki kez basılıyor

- `portal-shell.mjs` her HTML yanıtına alt bilgi ekliyordu; sayfada zaten varsa artık eklenmiyor.

### P13 · Düşük · İnceleme kaydında bozuk JSON 503 döndürüyor

- `portal-api.mjs` `review` rotası; artık 400 ve açıklayıcı mesaj.

### P14 · Düşük · `DATA_DIR` tanımsızsa portal başlangıçta çöküyor

- `portal-api.mjs` `join(process.env.DATA_DIR, …)` çağrısı `start.mjs` ile aynı varsayılana
  (`./data`) bağlandı.

### P15 · Orta · X yedek okuyucusunun kural kopyaları uygulamadan eski (Madde 6)

- `x-shadow/rules/server/local-scope-policy.mjs` ve `social-quality.mjs` uygulamadaki sürümün
  gerisindeydi (`social-source-context.mjs` desteği yok). Uygulamanın kabul ettiği mahalle
  kaynaklı gönderiler X yedek okumasında eleniyordu. Facebook kopyasında olduğu gibi uygulamadaki
  sürümle eşitlendi (`development/x-coverage-v2` kopyası dahil).
- Dört `rules-manifest.json` dosyası değişen `server/geo-dictionary.mjs` ve `src/intelligence.js`
  hash'leriyle güncellendi. **Uygulama, kural kopyaları ve manifestler birlikte kurulmalı;** aksi
  halde X/Facebook okuyucuları `reviewed_filter_version_changed` hatasıyla durur.
- Doğrulama: `x-shadow` testleri 10/10; adaptör örnek anlık görüntüyle yerel yangın gönderisini kabul
  ediyor.

### P17 · Orta · Yönetici hesabında `/calisma` başlığı kurum çubuğunun altında kalıyor

- **Konum:** `application/src/app.html` (`.shell`), çubuğu ekleyen `institution-host.mjs`.
- **Gözlem:** Yöneticilere her sayfanın en üstüne 49 piksellik "Gündem · Kurum Yönetimi · Kurum
  Olayları" çubuğu ekleniyor. Masaüstünde arama kutusu, tarih, bildirim ve "Kişisel araçlar"
  `position:absolute; top:25px` ile belgeye göre konumlandığı için çubuğun altında kalıyordu
  (ekran görüntüsüyle doğrulandı).
- **Düzeltme:** `.shell` kapsayıcısına `position:relative` verildi; başlık öğeleri artık kapsayıcıya
  göre konumlanıyor. Çubuk olmayan kullanıcılarda görünüm değişmiyor.

### P18 · Düşük · "Kişisel araçlar" düğmesi kırmızı bant üzerinde okunmuyor

- Masaüstü medya sorgusunda arama, tarih ve bildirim düğmesi açık renge çekilmiş, bu düğme
  unutulmuştu (koyu gri yazı kırmızı zemin üzerinde). Aynı sorguya beyaz yazı rengi eklendi; mobilde
  beyaz başlık zemini nedeniyle kural yalnız masaüstüne uygulanıyor.

### P16 · Yüksek (kurulum) · Depodan temiz kurulum açılmıyor

- `common_keyword_*`, `facebook_*` ve `lab_telegram_baseline` tablolarını oluşturan kod depoda yok;
  ayrıntı ve istenecekler `EKSIK-DOSYALAR.md` içinde.

## Açık kalanlar

- Canlı tarayıcı ve sunucu ölçümü (Madde 1, 3, 5'in önce/sonra süreleri) canlı ortamda tekrarlanmalı.
- Yerelde küçük resim üretici (`image-tools`) olmadığı için görsel akışı yalnız 404 durumunda denendi.
- Haber saklama süresi tutarsız: worker yaklaşık 2 ay, `src/retention.js` 6 ay (politika kararı).
- "Son dakika"/"İlçe Gündemi" alanı ve ilk ekranın yerleşimi 2. aşamada (arayüz) ele alınacak.
