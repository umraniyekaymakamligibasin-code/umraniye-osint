# Ümraniye OSINT — sosyal medya tarayıcı otomasyonu

2 Kasım 2026. **Paket hazır; Linux sunucuda henüz kurulmadı.** SSH anahtarıyla bağlantı `Permission denied` verdi. Aşağıdaki komutları sunucunuza bağlı kendi terminalinizde çalıştırabilirsiniz. Canlı ana site ve veritabanı korunur; kurulum ayrı deneme içindir.

## Ne yapacak?

X, Facebook ve Instagram için ücretli sosyal ağ API'si veya sosyal hesap şifresi alınmaz. Linux üzerinde gerçek Chromium tarayıcısı açılır. İlk girişleri hesabın sahibi platformun kendi ekranında yapar. Sonra Linux zamanlayıcısı 10 dakikada bir tek tur çalıştırır; aynı tur üst üste açılmaz. Her hesap için bir anahtar kelime seçilir, sonraki turda sıradakine geçilir. Üç ifade varsa aynı ifade yaklaşık 30 dakikada bir kontrol edilir.

X ve Facebook arama sayfaları; Instagram ise etiket sayfaları üzerinden sınırlı taranır. Turda hesap başına en fazla 20 kayıt alınır; 3 kaydırma ve gerekirse 5 paylaşım açma sınırı vardır. Paylaşımın kendi yayın tarihi okunamazsa içeriği eklemez. Giriş, CAPTCHA ve doğrulama engellerini aşmaz; panelde işlem gerektiğini gösterir. Gizli mesajlar açılmaz, paylaşım/beğeni/takip işlemi yapılmaz.

Bu sürüm genel bir insan araştırmacı veya ChatGPT'nin sürekli açık oturumu değildir; belirlenmiş sayfaları gezen sınırlı tarayıcı servisidir. Platform tasarımı, oturum ve erişim engelleri nedeniyle tüm içerikleri bulacağı garanti edilmez. Gerçek hesaplarla Linux kabulü henüz yapılmadı.

## 1. Paketi Windows'tan sunucuya gönderin

Tailscale açık kalsın. Yeni **Windows PowerShell** penceresinde yalnız şu komutu yazın:

```powershell
scp "<yerel-klasör>\Umraniye_OSINT_Deneme_2026-11-02.zip" basin@<sunucu-ip>:/home/basin/
```

Linux şifresini kendi terminalinizde girin. %100 olmasını bekleyin. Ardından:

```powershell
ssh basin@<sunucu-ip>
```

## 2. Linux'ta paketi açın ve ayrı denemeyi kurun

```bash
mkdir -p /home/basin/osint-deneme-2026-11-02
unzip /home/basin/Umraniye_OSINT_Deneme_2026-11-02.zip -d /home/basin/osint-deneme-2026-11-02
cd /home/basin/osint-deneme-2026-11-02/umraniye-osint-deneme
sha256sum --check SHA256SUMS
```

Bütün satırlar OK olmalı. Var olan dosyanın üzerine yazılsın mı sorusu çıkarsa mevcut kaynak klasörünü değiştirmeden önce inceleyin. Sonraki kurulum **deploy/DENEME_KURULUM.md adım 3–6** içindir: ayrı deneme env, yeni deneme parolası, port 3001, ayrı Cloudflare deneme rotası. Ana `/opt/umraniye-osint` ve ana port 3000 kullanılmaz.

`/opt/umraniye-osint-deneme` zaten kurulmuşsa kurucu bilerek durur; eski veri dizinini silmeyin. Bu paket ilk ayrı deneme kurulumudur.

## 3. Tarayıcıyı kurun

Ayrı deneme çalışırken, az önce açtığınız paket klasöründe:

```bash
sudo bash deploy/install-browser.sh
```

Python sanal ortamı, Playwright 1.64.1, Chromium ve ilk giriş için yerel görüntüleme araçları kurulur. İndirme birkaç dakika sürebilir. Yalnız deneme servisi yeniden başlatılır. Ana canlı servise dokunulmaz. Kurucu mevcut tarayıcı hedefi varsa durur. Zamanlayıcı henüz açılmaz. Chromium kendi sandbox'ı açık çalışır; Ubuntu AppArmor için yalnız bu Chromium binary'sine userns izni tanımlanır. Genel güvenlik ayarları veya güvenlik duvarı kapatılmaz.

## 4. Panelde hesapları ekleyin

Ayrı deneme adresinde yönetici girişi → Entegrasyonlar → Sosyal medya / tarayıcıyla araştırma.

- Platform seçin: X, Facebook veya Instagram.
- Hesap adı: örneğin Kurum X hesabı.
- Profil bağlantısı: hesabınızın gerçek profil URL'si. Bu şifre veya API anahtarı değildir.
- Listeye ekleyin; aranacak ifadeleri her satıra bir tane yazın.
- Hesapları ve ifadeleri kaydet düğmesine basın.

Bu aşamada otomatik araştırma kutusu kapalı kalsın. Aynı profil bağlantısını değiştirmek, otomasyonun ayrı bir oturum klasörü açmasına neden olur. Her profil için sunucu tarayıcısında ayrı giriş yapılır. Windows'ta daha önce giriş yapmış olmanız yeterli değildir.

## 5. Sunucu tarayıcısında ilk giriş

Panelde eklenen ilk hesap için Linux SSH terminalinde:

```bash
sudo bash /opt/umraniye-osint-browser/login-browser.sh 1
```

Terminal açık kalsın. İkinci hesabın sırası 2, üçüncünün 3 olur. Hesap sırası panelde de yazılır. Bu komut otomasyon zamanlayıcısını durdurur ve yalnız localhost'a bağlı geçici bir giriş ekranı açar.

Windows'ta **ikinci bir PowerShell** açın:

```powershell
ssh -N -L 6080:127.0.0.1:6080 basin@<sunucu-ip>
```

Şifreyi girince pencerenin sessiz kalması normaldir; bağlantı tüneli açık durur. Sonra Windows tarayıcısına şu adresi yazın:

```text
http://127.0.0.1:6080/vnc.html?autoconnect=1&resize=scale
```

Gördüğünüz pencere Windows'taki kendi tarayıcınız değil, **Linux sunucunun Chromium penceresidir**. Platformun kendi giriş düğmesinden kullanıcı adı ve şifrenizle girin. İki aşamalı doğrulamayı siz tamamlayın. Şifreyi OSINT'e veya sohbete yazmayın. İş bitince Chromium penceresini kapatın; oturum profilde saklanır ve geçici görüntüleme servisi kapanır. Diğer hesaplar için Linux terminalinde aynı komutu 2 veya 3 ile tekrarlayın. Giriş görüntülemesi internete açılmaz; 6080/5901 için UFW kuralı eklemeyin.

Tarayıcı sandbox / AppArmor hatası olursa sandbox'ı kapatmayın. Çıktıyı paylaşın; kurulum profili ve Linux ortamı ayrıca kontrol edilmelidir. Bu Linux kurulumu bu bilgisayarda henüz doğrulanmadı.

## 6. Otomasyonu açın ve ilk turu kontrol edin

Panelde **Sunucuda otomatik sosyal medya araştırmasını aç** kutusunu işaretleyip hesapları kaydedin. Ardından Linux'ta:

```bash
sudo systemctl enable --now umraniye-osint-browser.timer
sudo systemctl start umraniye-osint-browser.service
sudo systemctl status umraniye-osint-browser.timer --no-pager
sudo journalctl -u umraniye-osint-browser.service -n 30 --no-pager
```

İlk tur 1–8 dakika sürebilir. Panelde Durumu yenile düğmesine basın. Kurulu olması, sonucun başarılı olduğu anlamına gelmez; **son tur saati ve her hesabın durumu** incelenmelidir. `login_required` yeniden giriş; `challenge_required` hesap sahibi doğrulaması; `date_missing` yayın tarihi okunamadı; `browser_error` tarayıcı/sayfa hatası demektir. 20 dakika yeni tur gelmezse panelde uyarı gösterilir.

Sunucu tarayıcısı açık profil üzerinde aynı anda çalışamaz. Giriş ekranından çıktıktan sonra zamanlayıcıyı yeniden açmayı unutmayın. İlk tur başarısızken çalışıyor kabul etmeyin. Instagram etiket sonuçları ve Facebook tarih okuyucusu gerçek hesaplarda ayrıca kontrol edilmelidir.

## 7. Telegram

Panelde Telegram kartına BotFather anahtarı ve grup kimliği girilir. Telegram bot bildirimleri ücretsiz Bot API ile gider; bu sosyal ağlarda ücretli API kullanımından farklıdır. Önce bağlantı kontrolü, sonra onaylı gerçek test mesajı kullanılır. Son olarak kritik bildirim kuyruğu açılıp kaydedilir. Henüz gerçek bir Telegram mesajı gönderilmedi.

## 8. Gerçek sunucuda kabul

- En az iki gerçek turda saatlerin ilerlemesi ve doğru kaynak bağlantıları.
- Eksik tarihin uydurulmaması; iki aydan eski içeriğin gündeme dönmemesi.
- Aynı paylaşımın ikinci kaydı oluşturmaması.
- Oturum kapalı / doğrulama gereken hesabın sağlıklı gösterilmemesi.
- Tarayıcı kapalıyken devam; fiziksel yeniden açılıştan sonra timer'ın başlaması.
- 4 GB RAM için gerçek yük kontrolü: `free -h`, `systemctl show umraniye-osint-browser -p MemoryPeak`.

Tarayıcı servisi 1000 MB bellek sınırı ve 8 dakika süre sınırıyla ayrı çalışır; fiziksel 4 GB makinedeki yük henüz ölçülmedi. Gerekirse hesap sayısı ve sıklık azaltılır.

Durdurmak için:

```bash
sudo systemctl disable --now umraniye-osint-browser.timer
sudo systemctl stop umraniye-osint-browser.service
```

## 9. Yedekler ve gizli oturumlar

`accounts.key`, şifreli Telegram anahtarını çözmek için gereklidir. SQLite yedeğini bu anahtarla birlikte güvenli, yalnız yöneticinin eriştiği hedefte yedekleyin; anahtarı kaybetmeyin. `browser-profiles` sosyal hesapların oturumlarını içerir ve parolayla aynı hassasiyette tutulmalıdır. Bunları ZIP'e, sohbete veya herkese açık dosya alanına koymayın. Klasörler 0700, dosya oluşturma maskesi 0077 kullanır. Sunucuda yetkili/root olan kişi bu oturumlara erişebilir. Tarayıcı profilleri uygulamanın SQLite yedeğine dahil değildir; gerekirse platformda yeniden giriş yapılır. `browser-service.key` yalnız yerel servis köprüsü içindir.
