# Kod inceleme ve iyileştirme çalışması: ne yaptım, siz ne yapmalısınız

> **Bu dosyayı bir yapay zekâ ajanına okutuyorsanız:** Lütfen önce bu dosyanın tamamını okuyun.
> "Kod sahibine sorulacaklar" bölümündeki soruları cevaplanmadan varsayımla geçmeyin; kod sahibine
> sorun ve cevaba göre devam edin. Canlı sunucuya bir şey kurmadan önce kod sahibinden açık onay alın.
> `main` dalına doğrudan kod göndermeyin, force push yapmayın (nedeni aşağıda).

Son güncelleme: 13 Kasım 2026 · Durum: 1. aşama PR'da, 2. aşama seçim bekliyor, 3. aşama başlamadı.

---

## Merhaba

Bu depodaki kodu satır satır inceledim. `PROJE-ACIKLAMASI-VE-TEKNIK-ONCELIKLER.md` belgesindeki
şikâyetleri ve incelemede bulduğum hataları düzelttim. İş üç aşamada ilerliyor:

| Aşama | İçerik | Durum |
| --- | --- | --- |
| 1 | Hatalar ve bildirilen sorunlar (donma, "Sonraki" düğmesi, yavaşlık, sessiz hatalar, X/Instagram gecikmesi...) | **PR #3** inceleme ve birleştirme bekliyor |
| 2 | Arayüz: üç tasarım seçeneği, birini siz seçiyorsunuz | **Issue #4** ve **PR #6 / #7 / #8**, seçim bekliyor |
| 3 | Güvenlik açıklarının kapatılması | Bulgular raporlandı (`inceleme/` klasörü, PR #3), düzeltme PR'ı daha açılmadı |

Hiçbir şeyi canlı sunucuya kurmadım, `main` dalındaki kodu değiştirmedim. Yaptığım her şey ayrı
dallarda ve PR'larda; siz inceleyip onaylayınca devreye giriyor. Bu dosya, `main` dalında yalnız
bilgilendirme amaçlı duruyor ve her aşamada güncellenecek.

---

## 1. En önemli uyarı: `main` dalına neden PR açmıyorum?

Sunucudaki eşitleyici (`ops/github_sync.py`, `basin` kullanıcısının cron görevi) **her dakika**
sunucudaki `/opt/...` dizinlerinin kopyasını alıp `main` dalına yazıyor. Yani:

- GitHub'da `main` dalına birleştirilen bir kod değişikliği, sunucuya kurulmamışsa en geç bir dakika
  içinde sunucudaki eski hâliyle **geri yazılır**.
- Değişiklik yalnız sunucuya kurulunca kalıcı olur; eşitleyici kurulan kodu kendisi `main` dalına taşır.

Bu yüzden:

- PR'ların hedefi **`gelistirme`** dalı. Birleştirdikten sonra kodu sunucuya kurmanız gerekiyor
  (aşağıda adım adım yazdım). Kurulumdan sonra `main` kendiliğinden güncellenir.
- Depo kökündeki `.md` dosyaları (bu dosya gibi) eşitleyicinin izlediği dizinlerin dışında kalıyor,
  o yüzden `main` dalında silinmeden duruyor.

---

## 2. Dallar

| Dal | Ne için |
| --- | --- |
| `main` | Canlı sunucunun aynası. Elle kod gönderilmez. |
| `yedek/orijinal-2026-11-13` | Çalışmaya başlamadan önceki `main` (commit `4a872de`). **Dokunmayın**; her şeyin geri dönülebilir noktası. |
| `gelistirme` | PR'ların birleştirildiği dal. Sunucuya buradan kurulur. |
| `asama-1/hata-duzeltmeleri` | 1. aşama (PR #3). |
| `asama-2/tasarim-a`, `-b`, `-c` | Üç tasarım seçeneği (PR #6, #7, #8). |
| `asama-2/arayuz` | Yalnız tasarım ekran görüntülerini barındırıyor (PR #5 kapatıldı). Seçim yapılana kadar silmeyin; görseller buradan gösteriliyor. |

---

## 3. Açık PR'lar ve issue'lar

| No | Tür | Konu | Sizden beklenen |
| --- | --- | --- | --- |
| #3 | PR | 1. aşama: kod incelemesi ve hata düzeltmeleri | İnceleyin, `gelistirme` dalına birleştirin, sunucuya kurun |
| #6 | PR | Tasarım A · Yoğun haber akışı | Seçtiyseniz birleştirin, seçmediyseniz kapatın |
| #7 | PR | Tasarım B · Komuta paneli | Aynı |
| #8 | PR | Tasarım C · Gazete | Aynı |
| #1 | Issue | Kullanılmayan dosyalar (`src/server.js` vb.) silinsin mi? | Kod sahibi cevaplasın |
| #2 | Issue | Instagram tazelik süresi 1 saat mi 3 saat mi? | Kod sahibi cevaplasın |
| #4 | Issue | Arayüz seçimi (ekran görüntüleri burada) | Seçiminizi yazın |

---

## 4. 1. aşamada ne yaptım ve neden (PR #3)

Kodu 8 alana bölüp her dosyayı okudum. Toplam yaklaşık 80 hata düzelttim (95 dosya). Değişiklikleri
iki ayrı inceleme turundan geçirdim; ikinci turda bulunan 9 sorunu da düzelttim. Her bulgunun yeri,
nedeni ve nasıl doğrulandığı [`inceleme/`](https://github.com/umraniyekaymakamligibasin-code/umraniye-osint/tree/asama-1/hata-duzeltmeleri/inceleme) klasöründe alan alan yazılı.

### Kullanıcıların şikâyet ettiği sorunlar

| Şikâyet | Bulduğum neden | Ne yaptım |
| --- | --- | --- |
| "Sonraki" düğmesi sayfayı değiştirmiyor, sekmeler takılıyor | Haber görselleri, IP başına dakikada 240 isteklik sınırı dolduruyordu. Sunucu "çok fazla istek" (429) döndürüyordu. Kurumda herkes aynı dış IP'den çıkıyorsa bu sınır herkes için ortak. Yerelde aynı hatayı ürettim. | Görsel ve statik dosya istekleri ayrı bir sınıra (1200/dk) alındı. API sınırı aynı kaldı. Yükleme sırasında düğmeler kilitleniyor, son sayfadan sonrası istenirse son sayfa gösteriliyor. |
| Bugün / Bu hafta / Bu ay arasında geçişte donma | Her haber için tarih biçimleyici sıfırdan kuruluyordu. Harita her nokta için tüm listeyi baştan tarıyordu. Veri değişmese de ekran baştan çiziliyordu. | Ölçüm (2000 kayıt): 5–8 saniye → 10 ms altı. |
| Haber Gündemi / Ulusal Gündem sekmelerinde kasma | Yukarıdaki iki neden, ayrıca her sekmede tüm sayfa yeniden kuruluyor ve aynı liste yeniden indiriliyordu. | Yalnız liste yenileniyor; 30 saniyelik istemci önbelleği eklendi. |
| Dakikada bir sayfa kendiliğinden yenilenip okunan yer kayboluyor | Otomatik yenileme veri değişmese de sayfayı baştan çiziyordu. | Yalnız değişen veri çiziliyor; kullanıcı arama veya filtre kullanıyorsa dokunulmuyor. |
| Sistem yavaş açılıyor | 1,8 MB'lık logo (ekranda 36–95 piksel görünüyor) her sayfada iniyordu. Açılışta aynı veri 2–3 kez isteniyordu. | Logo 49 KB'a indi (görünüm aynı). Yinelenen istekler kaldırıldı. |
| X ve Instagram verisi geç geliyor | X okuyucusu bir hatadan sonra 6 saate kadar susuyordu. X bildirim okuyucusu süresi dolunca okuduklarını kaybediyordu. Instagram'da yayından 1 saat sonra bulunan gönderiler atılıyordu. X'in filtre kopyaları uygulamadan eskiydi. | Dördü de düzeltildi. Tarama sıklığı artırılmadı (platform sınırlarına yüklenmemek için). |
| Hatalar sessizce yutuluyor | Yenileme ve yükleme hataları kullanıcıya hiçbir şey göstermiyordu. | Kısa açıklama ve "Yeniden dene" düğmesi eklendi. |

### Kimsenin fark etmemiş olabileceği ciddi hatalar

- **Telegram botu hiç uyarı göndermiyordu.** İlk yeni uyarıda tanımsız bir değişken yüzünden
  çöküyordu. Düzeltildi. Ayrıca çakışan turlarda aynı uyarının iki kez gitmesi engellendi. Bot
  düzelince birikmiş eski uyarıları topluca göndermesin diye 3 saatten eski uyarılar atlanıyor.
- **"+0300" saat dilimli RSS tarihleri reddediliyordu.** Bu haberler tarih filtrelerinden düşüyor,
  acil bildirim oluşmuyordu.
- **Giriş ekranında logo ve yazı tipi yüklenmiyordu.** Bu dosyalar da oturum istiyordu.
- **Yöneticide `/calisma` sayfasının üst kısmı** kurum çubuğunun altında kalıyordu.
- **Facebook okuyucusu** sayfa ortasında süresi dolunca o ana kadar okuduklarını atıyordu.
- **Kurum yönetimi ekranındaki her hata** genel "500" hatasına dönüşüyordu.

### Kullanıcı kararıyla yapılanlar

- Haber saklama süresi her yerde **2 ay** oldu (bir dosyada 6 ay yazıyordu).
- Kullanılmayan eski dosyalar **silinmedi**; issue #1 ile soruldu.

---

## 5. 2. aşama: arayüz (Issue #4, PR #6 / #7 / #8)

Ana ekranda haberler masaüstünde ancak ~650 piksel aşağıda başlıyordu, mobilde ilk ekranda hiç haber
görünmüyordu. Başlık, "İlçe Gündemi" şeridi, büyük sayfa başlığı ve dört büyük sayaç kartı ilk ekranı
kaplıyordu (PROJE-ACIKLAMASI madde 2). Üç seçenek hazırladım; üçü de bu alanı küçültüyor:

- **A · Yoğun haber akışı (PR #6):** sade, en çok haberi gösteren liste düzeni.
- **B · Komuta paneli (PR #7):** lacivert menü, renkli sayaçlar, kart ızgarası.
- **C · Gazete (PR #8):** serif başlıklar, gazete sayfası düzeni.

Ekran görüntüleri issue #4'te ve her PR'ın açıklamasında. Her tasarım yalnız kendi stil dosyasını
ekliyor; mevcut stil dosyalarına, JavaScript'e veya sunucu mantığına dokunmuyor.

**Nasıl seçilir:** #3 birleştirildikten sonra beğenilen PR'ın tabanını `gelistirme` yapın, birleştirin,
diğer ikisini kapatın. Karma bir istek ("A ama renkler B gibi") varsa issue #4'e yazın.

---

## 6. 3. aşama: güvenlik (henüz yapılmadı)

Güvenlik bulgularını 1. aşamada bilerek düzeltmedim; ayrı PR ile ele alınacak. Ayrıntılar
[`inceleme/`](https://github.com/umraniyekaymakamligibasin-code/umraniye-osint/tree/asama-1/hata-duzeltmeleri/inceleme) dosyalarında "3. aşama" başlıklarında. Öne çıkanlar:

- Tarayıcı oturumu için **parolasız VNC** (`x11vnc -nopw`). Sunucudaki her yerel süreç, sosyal medya
  hesaplarının açık olduğu tarayıcıyı yönetebilir.
- Root olarak çalışan `prepare.py`, servis kullanıcısının yazabildiği dizinde sembolik bağlantı
  izleyebiliyor (yetki yükseltme riski). Yayımlayıcı servisler root olarak çalışıyor.
- Alt süreçlere tüm ortam değişkenleri geçiyor: yönetici parolası ve Telegram anahtarı, dış siteleri
  açan tarayıcı sürecine ulaşıyor.
- Eşitleyicideki bir koşul hatası, **tüm `.json` dosyalarını** GitHub'a aktarıyor (oturum ve ayar
  dosyaları dahil olabilir). Sır kalıpları dar.
- Ekip şifresi en az 6 karakter; deneme sınırları farklı kullanıcı adlarıyla aşılabiliyor; kurumsal
  PIN 4 haneli.
- Kurum e-posta şifreleri geri çözülebilir saklanıyor.

3. aşamada ayrıca **tüm Git geçmişi** sır taraması yapılacak (değerler rapora yazılmayacak).

---

## 7. Sizden istediğim eksik dosyalar

Ayrıntılı liste ve komutlar: **[`EKSIK-DOSYALAR.md`](https://github.com/umraniyekaymakamligibasin-code/umraniye-osint/blob/asama-1/hata-duzeltmeleri/EKSIK-DOSYALAR.md)**. Kısaca:

1. **Veritabanı şeması (en önemlisi).** Kod `common_keyword_*`, `facebook_*` ve
   `lab_telegram_baseline` tablolarını kullanıyor ama bunları oluşturan kod depoda yok. Depodan
   temiz kurulum "no such table" hatasıyla açılmıyor. İstenen:
   `sqlite3 /var/lib/umraniye-osint-deneme/osint.sqlite .schema` çıktısı (veri içermez) ve
   anahtar kelime aktarımını yapan betik.
2. `package.json` içindeki betikler: `scripts/build.mjs`, `run-tests.mjs`, `validate-trial.mjs`,
   `preview-integrations.mjs`, `check-sources.mjs`, `test-server.mjs`. Testler olmadan değişiklikleri
   otomatik doğrulamak zor.
3. `systemctl cat 'umraniye*'` çıktısı ve `crontab -l` (basin kullanıcısı).
4. Python sanal ortamları için `pip freeze` çıktıları (browser, igmedia, image-tools).
5. Env dosyalarının **yalnız anahtar adları** (`sed 's/=.*/=/' /etc/umraniye-osint-deneme.env`).
   **Değerleri göndermeyin.**
6. Cloudflare Tunnel / nginx yapılandırması (kimlik bilgisi dosyası hariç).
7. `EKSIK-DOSYALAR.md` içindeki 7. maddedeki `find` komutunun çıktısı (yalnız dosya adları).

---

## 8. Kod sahibine sorulacaklar

Ajan kullanıyorsanız bu soruları kod sahibine sorun, cevaplara göre devam edin:

1. **Issue #1:** `src/server.js`, `account.js`, `workspace.js` ve benzeri kullanılmayan dosyalar bir
   derleme adımında kullanılıyor mu? Kullanılmıyorsa silinebilir mi?
2. **Issue #2:** Instagram'da "1 saatten eski gönderiyi hiç gösterme" kuralı bilinçli miydi? Panel
   3 saat kullanıyor; okuyucuyu da 3 saate çıkardım.
3. **Issue #4:** Hangi tasarım? (A, B, C veya mevcut)
4. Canlıda `TRUST_CLOUDFLARE=true` mi? Değilse tüm kullanıcılar tek IP gibi görünür, istek sınırını
   ve 25 hakkı olan giriş deneme sınırını paylaşır. Bir kişi yanlış şifreyle herkesi kilitleyebilir.
5. `legacy-application` (`/opt/umraniye-osint`, `umraniye-osint.service`) hâlâ çalışıyor mu,
   kullanılıyor mu? Kullanılmıyorsa kapatılması güvenlik açısından iyi olur.
6. Deneme sunucusu (`deneme.umraniyeosint.com`, port 3001) ile asıl panel aynı dizinden mi
   (`/opt/umraniye-osint-deneme`) çalışıyor? Kurulumdan önce önce denemede denemek mümkün mü?

---

## 9. PR'ı inceleme ve birleştirme (adım adım)

GitHub web arayüzünden:

1. https://github.com/umraniyekaymakamligibasin-code/umraniye-osint/pull/3 adresini açın.
2. **Files changed** sekmesinde değişikliklere bakın. 12 commit konu konu ayrılmış; **Commits**
   sekmesinden tek tek de bakabilirsiniz.
3. Uygunsa **Merge pull request** → **Create a merge commit** seçin. (Squash yapmayın; konu konu commit
   geçmişi geri almayı kolaylaştırıyor.)
4. Hedef dalın `gelistirme` olduğundan emin olun (sayfanın üstünde "into gelistirme" yazar).

Komut satırından (GitHub CLI kuruluysa):

```sh
gh pr view 3 --repo umraniyekaymakamligibasin-code/umraniye-osint
gh pr diff 3 --repo umraniyekaymakamligibasin-code/umraniye-osint | less
gh pr merge 3 --repo umraniyekaymakamligibasin-code/umraniye-osint --merge
```

Tasarım için: #3 birleştikten sonra seçilen PR'da (ör. #6) **Edit** → base: `gelistirme` → kaydet →
**Merge**. Diğer iki tasarım PR'ını **Close pull request** ile kapatın.

---

## 10. Sunucuya kurulum (adım adım)

Bu adımlar depodaki `application/deploy/update-social-panel.sh` betiğinin kullandığı yöntemi izliyor:
servisleri durdur, yedekle, kopyala, başlat. **Mümkünse önce deneme ortamında yapın.** Komutlar sunucuda
`sudo` yetkisiyle çalıştırılır.

### 10.1 Kodu sunucuya alın

Seçenek A: GitHub'da `gelistirme` dalını seçip **Code → Download ZIP** ile indirin, sunucuya kopyalayıp
açın (ör. `/home/basin/osint-gelistirme`).

Seçenek B: Sunucuda (eşitleyicinin deposuna dokunmadan, ayrı bir klasöre):

```sh
cd /home/basin
git clone --branch gelistirme https://github.com/umraniyekaymakamligibasin-code/umraniye-osint.git osint-gelistirme
```

(Depo özel olduğu için okuma yetkili bir token veya SSH anahtarı gerekebilir.)

Aşağıda kaynak klasörü `SRC=/home/basin/osint-gelistirme` olarak geçiyor.

### 10.2 Yedek alın (atlamayın)

```sh
SRC=/home/basin/osint-gelistirme
YEDEK=/root/osint-yedek-$(date +%Y%m%d-%H%M)
sudo install -d -m 0700 "$YEDEK"
for d in /opt/umraniye-osint-deneme /opt/umraniye-osint-browser /opt/umraniye-osint-instagram-api \
         /opt/umraniye-osint-igmedia /opt/umraniye-osint-x-twscrape-deneme \
         /opt/umraniye-osint-facebook-fbgql-deneme /opt/umraniye-telegram /opt/umraniye-osint; do
  sudo cp -a "$d" "$YEDEK/" 2>/dev/null || echo "atlandı: $d"
done
sudo systemctl stop umraniye-osint-deneme.service
sudo cp -a /var/lib/umraniye-osint-deneme/osint.sqlite* "$YEDEK/"
```

### 10.3 Dosyaları kopyalayın

Depodaki klasör ile sunucudaki dizin eşleşmesi (`ops/github_sync.py` içindeki `ROOTS`):

| Depo | Sunucu |
| --- | --- |
| `application` | `/opt/umraniye-osint-deneme` |
| `browser` | `/opt/umraniye-osint-browser` |
| `instagram-api` | `/opt/umraniye-osint-instagram-api` |
| `instagram-media` | `/opt/umraniye-osint-igmedia` |
| `x-shadow` | `/opt/umraniye-osint-x-twscrape-deneme` |
| `facebook-shadow` | `/opt/umraniye-osint-facebook-fbgql-deneme` |
| `telegram` | `/opt/umraniye-telegram` |
| `legacy-application` | `/opt/umraniye-osint` |

`development/` ve kök `.md` dosyaları sunucuya kurulmaz.

```sh
# Ana uygulama (yalnız kod klasörleri; data, venv, image-tools gibi dizinlere dokunulmaz)
for f in server worker drizzle deploy src scripts; do sudo cp -R "$SRC/application/$f/." "/opt/umraniye-osint-deneme/$f/"; done

# X ve Facebook okuyucuları: kurallar ve manifest UYGULAMAYLA BİRLİKTE kurulmalı
sudo cp -R "$SRC/x-shadow/." /opt/umraniye-osint-x-twscrape-deneme/
sudo cp -R "$SRC/facebook-shadow/." /opt/umraniye-osint-facebook-fbgql-deneme/

# Diğer bileşenler
sudo cp "$SRC/browser/collector.py" "$SRC/browser/x_reader_v1.py" /opt/umraniye-osint-browser/
sudo cp "$SRC/instagram-api/worker.py" /opt/umraniye-osint-instagram-api/
sudo cp "$SRC/instagram-media/scanner.py" /opt/umraniye-osint-igmedia/
sudo cp "$SRC/telegram/bot.mjs" "$SRC/telegram/bot-v2.mjs" /opt/umraniye-telegram/
sudo cp "$SRC/legacy-application/worker/index.js" /opt/umraniye-osint/worker/index.js   # legacy kullanılıyorsa
```

`cp` mevcut dosyaların sahibini ve izinlerini korur. Yeni eklenen tek dosya
`x-shadow/rules/server/social-source-context.mjs`; sahibini aynı klasördeki diğer dosyalarla aynı yapın
(`ls -l` ile kontrol edin).

**Neden birlikte?** X ve Facebook okuyucuları, uygulamadaki filtre dosyalarının özetini
(`rules-manifest.json`) kontrol ediyor. Uygulama güncellenip okuyucu güncellenmezse (veya tersi)
okuyucular `reviewed_filter_version_changed` hatasıyla durur.

### 10.4 Servisleri başlatın

```sh
sudo systemctl start umraniye-osint-deneme.service
sudo systemctl restart umraniye-telegram.service
sudo systemctl restart umraniye-osint.service          # legacy kullanılıyorsa
systemctl list-timers 'umraniye-osint-*'              # zamanlayıcılar etkin mi?
```

Veritabanı geçişi yok. Yalnız sosyal medya modülü ilk çalışmada `facebook_posts` tablosuna bir indeks
ekler (birkaç saniye).

### 10.5 Kontrol listesi

- [ ] `systemctl is-active umraniye-osint-deneme` → `active`
- [ ] `journalctl -u umraniye-osint-deneme -n 50` içinde `server_started` var, hata yok.
- [ ] Giriş ekranında logo görünüyor.
- [ ] Ana sayfa açılıyor; Haber Gündemi'nde sekmeler hızlı; "Sonraki" 2. sayfaya geçiyor.
- [ ] `/calisma` sayfasında Bugün / Bu hafta / Bu ay geçişleri donmuyor.
- [ ] Birkaç dakika sonra `journalctl -u umraniye-osint-x-twscrape-deneme -n 30` içinde
      `reviewed_filter_version_changed` **yok**.
- [ ] Telegram: `journalctl -u umraniye-telegram -n 30` hatasız; "Eski uyarilar gonderilmeden
      atlandi" satırı bir kez görülebilir (beklenen).
- [ ] Bir dakika sonra GitHub'da `main` dalında yeni bir "Sync live OSINT source" commit'i oluştu
      (eşitleyici kurulan kodu aldı).

---

## 11. Bir şey ters giderse: geri alma

### Sunucuda (en hızlı yol)

```sh
YEDEK=/root/osint-yedek-....          # 10.2'de oluşturulan klasör
sudo systemctl stop umraniye-osint-deneme.service
sudo cp -a "$YEDEK/umraniye-osint-deneme/." /opt/umraniye-osint-deneme/
sudo cp -a "$YEDEK/umraniye-osint-x-twscrape-deneme/." /opt/umraniye-osint-x-twscrape-deneme/
sudo cp -a "$YEDEK/umraniye-osint-facebook-fbgql-deneme/." /opt/umraniye-osint-facebook-fbgql-deneme/
# diğer bileşenler için de aynı şekilde
sudo systemctl start umraniye-osint-deneme.service
sudo systemctl restart umraniye-telegram.service
```

Veritabanını geri yüklemek **genelde gerekmez** (bu değişiklik şema değiştirmiyor). Gerekirse servis
durdurulmuşken `$YEDEK/osint.sqlite*` dosyalarını `/var/lib/umraniye-osint-deneme/` altına geri kopyalayın.
Bu, yedekten sonra gelen haberleri siler.

Yeni dosyalar (`social-source-context.mjs`, tasarım CSS dosyası) eski koda zarar vermez, bırakılabilir.

### GitHub'da

- Birleştirilmiş bir PR'ı geri almak için PR sayfasındaki **Revert** düğmesi yeni bir "geri alma" PR'ı
  açar; onu `gelistirme`ye birleştirin.
- Belirli bir konuyu geri almak için (ör. yalnız Telegram):
  `git revert <commit>` (commit listesi PR #3'ün **Commits** sekmesinde).
- Her şeyin başlangıç hâli `yedek/orijinal-2026-11-13` dalında duruyor.

### Eşitleyici durursa

Bir değişiklik `main` dalına, eşitleyicinin çekme ve gönderme adımlarının arasında düşerse eşitleyici
güvenlik için durur. Belirtisi: `cat ~/.local/share/umraniye-github-sync/status.json` çıktısında
`"ok": false` ve "fast-forward" hatası. Çözüm (`basin` kullanıcısıyla; yalnız sunucudaki gönderilmemiş
anlık kopyayı atar, GitHub geçmişine dokunmaz):

```sh
cd ~/.local/share/umraniye-github-sync/repository
git fetch origin && git reset --hard origin/main
```

Bir sonraki dakikada eşitleme kendiliğinden devam eder.

---

## 12. Dosya rehberi

Aşağıdaki belgeler PR #3 ile gelir; birleştirilene kadar `asama-1/hata-duzeltmeleri` dalında,
birleştirildikten sonra `gelistirme` dalındadır (dal silinirse bağlantılardaki dal adını `gelistirme` yapın).
`main` dalına yalnız sunucuya kurulan kod eşitlendiği için bu belgeler `main`'de görünmez.

| Dosya | İçerik |
| --- | --- |
| `CALISMA-RAPORU.md` (bu dosya, `main`) | Özet, yapılacaklar, kurulum ve geri alma |
| [`CALISMA-PLANI.md`](https://github.com/umraniyekaymakamligibasin-code/umraniye-osint/blob/asama-1/hata-duzeltmeleri/CALISMA-PLANI.md) | Yol haritası ve madde madde ilerleme |
| [`EKSIK-DOSYALAR.md`](https://github.com/umraniyekaymakamligibasin-code/umraniye-osint/blob/asama-1/hata-duzeltmeleri/EKSIK-DOSYALAR.md) | Depoda eksik olan kurulum parçaları ve nasıl isteneceği |
| [`inceleme/`](https://github.com/umraniyekaymakamligibasin-code/umraniye-osint/tree/asama-1/hata-duzeltmeleri/inceleme) | Alan alan ayrıntılı bulgular: dosya:satır, neden, düzeltme, doğrulama, güvenlik notları |
| `PROJE-ACIKLAMASI-VE-TEKNIK-ONCELIKLER.md` | Sizin özgün sorun listeniz |

Sorunuz olursa ilgili PR veya issue'ya yorum yazın.
