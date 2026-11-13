# Ümraniye OSINT

Canlı sunucudaki OSINT kaynak kodunun özel GitHub deposu.

## Dizinler

- `application`: `/opt/umraniye-osint-deneme` — etkin panel ve sunucu.
- `legacy-application`: `/opt/umraniye-osint` — önceki uygulama.
- `browser`: sosyal platform tarayıcı işçileri.
- `instagram-api`, `instagram-media`: Instagram bileşenleri.
- `x-shadow`, `facebook-shadow`: yardımcı tarama bileşenleri.
- `telegram`: Telegram uygulama kodu.
- `ops`: kaynak kod eşitleme aracı.

## Otomatik eşitleme

Sunucudaki `basin` kullanıcısının cron görevi her dakika eşitleyiciyi başlatır.
Eşitleyici 50 saniyelik çalışma aralığında 3 saniyede bir kaynakları kontrol eder;
iki ardışık kontrolde aynı kalan değişikliği commit ederek `main` dalına gönderir.
Normal koşullarda değişiklikler yaklaşık 6–20 saniyede görünür; ağ ve GitHub
gecikmeleri bu süreyi uzatabilir. Bilgisayarın açık olması gerekmez.

Kaynak sunucudur: bu depodaki değişiklikler otomatik olarak canlıya kurulmaz.
İzlenen dizinlerde yalnız GitHub'da yapılan düzenlemeler sonraki eşitlemede
sunucu sürümüyle değiştirilebilir. Geliştirme değişikliklerini önce test edin,
sunucuya kurun; eşitleyici kurulan kaynak kodunu otomatik kaydeder.

`.env`, kimlik bilgileri, oturum profilleri, veritabanları, günlükler, sanal
ortamlar ve yedekler aktarılmaz. Bu depo çalışma verilerinin yedeği değildir.
Kaynak kodda anahtar/şifre kalıbı veya okuma hatası bulunursa aktarım durur.
Git geçmişi çatışırsa zorla gönderim yapılmaz; hata düzeltilmelidir.

Sunucuda durum:

```sh
cat ~/.local/share/umraniye-github-sync/status.json
crontab -l
```

Devre dışı bırakmak için `crontab -e` ile `umraniye-github-sync` etiketli
satırı kaldırın. Devam eden işlem en geç yaklaşık 50 saniye içinde biter
(ağ isteği zaman aşımı ayrıca beklenebilir).

Eşitleme anahtarı yalnız bu depoya yazabilen bir GitHub deploy key'dir;
özel anahtar sunucuda kalır. Uygulama servisleri ve veritabanları eşitleme
tarafından değiştirilmez. Yeni bağımsız bileşen dizinlerini eklemek için
`ops/github_sync.py` içindeki `ROOTS` eşlemesini ve sunucudaki kurulu betiği
birlikte güncelleyin.
