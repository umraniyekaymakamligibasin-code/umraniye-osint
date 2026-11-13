# Sosyal medya v2 — mevcut denemeyi güncelleme

2 Kasım 2026. Bu güncelleme `deneme.umraniyeosint.com` içindir. Ana `umraniyeosint.com` ve ana veritabanı değiştirilmez. Linux'ta daha önce ayrı deneme ve tarayıcı kurulmuş olmalıdır.

## 1. Windows'ta yeni paketi gönderin

Windows PowerShell / Komut İstemi içinde:

```powershell
scp "<yerel-klasör>\Umraniye_OSINT_Sosyal_V2_2026-11-02.zip" basin@<sunucu-ip>:/home/basin/
```

%100 olmasını bekleyin. Sonra Linux'a bağlanın:

```powershell
ssh basin@<sunucu-ip>
```

## 2. Linux'ta açın

Komutları tek tek çalıştırın:

```bash
mkdir -p /home/basin/osint-sosyal-v2-20261102
unzip /home/basin/Umraniye_OSINT_Sosyal_V2_2026-11-02.zip -d /home/basin/osint-sosyal-v2-20261102
cd /home/basin/osint-sosyal-v2-20261102/umraniye-osint-deneme
sha256sum --check SHA256SUMS
```

Tüm dosyalar OK olmalı. Var olan dosya üzerine yazma veya hata mesajı çıkarsa devam etmeden çıktıyı inceleyin.

## 3. Güncellemeyi çalıştırın

```bash
sudo bash deploy/update-social-panel.sh
```

Kurucu önce yalnız deneme tarayıcı zamanlayıcısını ve deneme servisini durdurur. Kod, veri, ayar ve gizli anahtarları root erişimli `/var/backups/umraniye-osint-deneme/social-...` klasörüne yedekler. Deneme kodunu ve tarayıcı işleyicisini günceller, servisi başlatıp localhost 3001 sağlık yanıtını kontrol eder. Kod güncellemesi/sağlık kontrolü başarısızsa önceki deneme koduna geri döner. Ana site durdurulmaz. Mevcut şifreler ve oturum klasörleri korunur.

Zamanlayıcı yeniden açılır ve açılışta başlama etkinleştirilir. Hesapların paneldeki takip anahtarı kapalıysa tarama yapılmaz. Başlangıç hatası/yardımcı yazılım hatası hâlâ gerçek Linux ortamında görülebilir; bu kurucu yerel Windows testinde çalıştırılmadı.

Başarı mesajından sonra:

```bash
sudo systemctl status umraniye-osint-deneme --no-pager -l
sudo systemctl status umraniye-osint-browser.timer --no-pager
curl --fail http://127.0.0.1:3001/health
```

## 4. Yeni panelde hesaplara giriş

https://deneme.umraniyeosint.com/yonetim/entegrasyonlar

Sayfayı Ctrl+F5 ile yenileyin. Başlık altında **Sosyal medya v2** görünür. Profil bağlantısı alanı kaldırılmıştır. X, Facebook ve Instagram'ın ayrı kartları vardır.

1. İlgili kartta **Hesaba giriş yap** düğmesine basın.
2. Panel içinde sunucu tarayıcısı hazırlanır. İlk açılış birkaç saniye sürebilir; ekran gelmezse **Giriş ekranını yenile** düğmesini kullanın.
3. Platformun kendi gerçek giriş ekranına kullanıcı adı, şifre ve doğrulama kodunuzu girin. Bunlar OSINT formunda saklanmaz. Şifrenin göründüğü ekran görüntüsünü paylaşmayın.
4. Bitince **Giriş penceresini kapat ve oturumu koru** düğmesine basın. Aynı anda yalnız bir sunucu tarayıcısı çalışır; diğer tarama/giriş devam ediyorsa bekleyin.
5. **Oturumu kontrol et** ile sunucuda kontrol başlatın; biraz sonra **Durumu yenile** ile sonucu görün. Sayfanın açılması tek başına kimlik doğrulaması değildir. Hesap adı okunamazsa “Platformdan henüz okunmadı” / doğrulanamadı gösterilir.
6. **Takibi başlat** ile hesabı 10 dakikalık zamanlayıcıya dahil edin. **Şimdi araştır** yalnız seçilen platformun açık takip hesaplarında elle tur başlatır. Turda bir ifade aranır; ifadeler sırayla döner. **Takibi durdur** sonraki taramaları kapatır.
7. **Hesaptan çıkış yap**, giriş penceresi kapalıyken o platformun sunucuda saklanan oturumunu siler. Profil başka bir tarayıcı tarafından kilitliyse işlem hata verir; otomatik zorlamaz.

Panel içi girişte ayrıca Windows SSH görüntüleme tüneli gerekmiyor. noVNC yalnız localhost'ta çalışır; görüntü ve WebSocket yalnız geçerli yönetici oturumuyla site üzerinden aktarılır. Yönetici oturumu iptal edilirse açık WebSocket en geç 10 saniyede kesilir. Yeni 5902 veya 6080 UFW/internet kuralı açmayın. Eski `login-browser.sh` aracı ile panel içi giriş ekranını aynı anda açmayın.

## 5. Ayrı sosyal medya gündemi

https://deneme.umraniyeosint.com/sosyal-medya

Giriş yapan kullanıcılar ayrı akışı görebilir; hesap yönetimi yalnız yöneticidedir. Haber akışına sosyal kayıt eklenmez.

- En son **ilk defa bulunan** paylaşım üsttedir.
- Yayın tarihi/saati ve ilk bulunma tarihi/saati ayrı, Türkiye saatinde görünür.
- Yeniden bulunan aynı URL / X status kimliği listenin başına taşınmaz.
- Bugün / bu hafta / bu ay / son iki ay ile platform ve metin filtresi bulunur. Zaman menüsü ilk bulunma zamanını süzer. İki ay saklama sınırı ise asıl yayın tarihine dayanır.
- İki aydan eski sosyal kayıtlar veri tabanından da temizlenir. Yeni bulunan eski haber, yeni tarih verilerek geri getirilmez.

## 6. Kapsam

Sosyal medya yalnız Ümraniye Kaymakamı ve Kaymakamlık ile ilgili olmalıdır. Haber sözlüğünün Kaymakam/Kaymakamlık grubu kullanılır; `tc_umraniye`, `yukselcelikmia`, `@tc_umraniye`, `@yukselcelikmia`, `#tc_umraniye`, `#yukselcelikmia` eklenmiştir. Genel Ümraniye / belediye haberi tek başına kabul edilmez. Aynı isimli başka kişiler için kaymakam/Ümraniye bağlamı aranır. Ortak haber ayarlarındaki dışlama ifadeleri otomatik sosyal alımında da uygulanır. Genel haber taramasının sözlüğü değiştirilmez.

Instagram mevcut tarayıcı okuyucusunda etiket sayfalarıyla sınırlıdır. CAPTCHA/iki adımlı doğrulama aşılmaz, yayın saati uydurulmaz. Gerçek platformlarda görünürlük, oturum, tarih alanı ve hesap adı okuma Linux üzerinde kabul testi ister. Site tasarımı değişirse DOM okuyucusu yeniden uyarlanabilir.

## 7. Kontrol ve sorun bildirimi

Bir hesabı bağladıktan sonra iki turda saatlerin ilerlemesini ve kaynağın gerçekten doğru paylaşım olmasını kontrol edin. `login_required` yeniden giriş; `challenge_required` hesap sahibi doğrulaması; `date_missing` yayın tarihi okunamadı; `browser_error` tarayıcı/sayfa açılış hatasıdır. `session_unverified` ile başarı varsaymayın.

```bash
sudo journalctl -u umraniye-osint-browser.service -n 30 --no-pager
sudo journalctl -u umraniye-osint-deneme.service -n 30 --no-pager
free -h
```

Gerçek Linux Chrome/noVNC girişini bu bilgisayardan anahtarsız SSH ile çalıştıramadığım için burada tamamlandığını iddia etmiyorum. Kurulum ve gerçek hesap testi yapılmadan 7/24 çalışıyor sayılmamalıdır. Yerel testler kontrollü API/WebSocket ve kurgusal veridir; gerçek mesaj veya gerçek sosyal hesap kullanılmadı.
