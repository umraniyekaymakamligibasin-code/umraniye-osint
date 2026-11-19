# Kurum e-postası (SMTP) kurulumu

Kurum koordinasyon modülü, onaylı kurumlara "yeni kayıt var" e-postası gönderebilir. Gönderim kodu
(`server/gmail-sender.mjs` + `server/gmail-smtp.py`) ve zamanlayıcı (`umraniye-kurum-gonderim.timer`,
2 dakikada bir) **hazır ve bağlı.** Tek eksik, Gmail kimlik dosyalarıydı (`smtp.json` + `smtp.key`).
Bu betik onları üretir.

## Nasıl çalışır (özet)

1. `umraniye-kurum-zamanlayici.timer` (5 dk) uygun olayları kurum vakasına çevirir ve e-posta
   kuyruğuna yazar (`OSINT_ROUTING_OUTBOX=1` açıkken — sunucuda açık).
2. `umraniye-kurum-gonderim.timer` (2 dk) kuyruğu boşaltır: her bekleyen bildirim için
   `gmail-sender.mjs` → `gmail-smtp.py` ile Gmail üzerinden gönderir.
3. Gönderim için 2 şart: (a) `smtp.json`/`smtp.key` var ve `enabled:true`; (b) kurumun e-postası
   panelden açık ve o kurumda **doğrulanmış etkin bir alıcı** var.

E-posta yalnız kategori düzeyinde kısa bir özet ve panel bağlantısı içerir; ham sosyal medya metni
gönderilmez (veri azaltma politikası).

## Gönderen hesap

Gönderen adres kodda sabittir: **umraniyekaymakamligibasin@gmail.com** (`gmail-sender.mjs` ve
`gmail-smtp.py` bunu doğrular). Bu hesabın **uygulama şifresi** gerekir — normal Gmail şifresi değil.

### Gmail uygulama şifresi nasıl alınır

1. Bu Gmail hesabında **iki adımlı doğrulama** açık olmalı (myaccount.google.com > Güvenlik).
2. myaccount.google.com/apppasswords adresinden yeni bir **uygulama şifresi** üretin (16 harf).
3. Bu 16 harfi aşağıdaki kuruluma gireceksiniz. Normal hesap şifresi kullanılmaz.

> Uyarı: Kişisel Gmail günde ~500 e-posta/alıcı sınırına sahiptir. Kurumsal e-posta altyapısı
> (bilgi işlem) varsa ileride ona geçmek daha sağlıklı olur; bu betik Gmail içindir.

## Kurulum (sunucuda)

Gönderim servisi `osintdeneme` kullanıcısıyla ve `DATA_DIR=/var/lib/umraniye-osint-deneme` ile
çalışıyor. Dosyalar o dizine, o kullanıcının sahipliğinde, 0600 izinle yazılmalı.

```sh
sudo -u osintdeneme /opt/node-v24.22.1-linux-x64/bin/node \
  /opt/umraniye-osint-deneme/server/institution-coordination/kurum/smtp-kur.mjs \
  --data-dir /var/lib/umraniye-osint-deneme
```

Betik uygulama şifresini iki kez gizli olarak sorar (ekranda görünmez), 32 baytlık anahtar üretir,
şifreyi AES-256-GCM ile mühürler ve iki dosyayı yazar. Şifre ekrana, günlüğe veya diske düz yazılmaz.

Durumu görmek için:
```sh
sudo -u osintdeneme node .../smtp-kur.mjs --data-dir /var/lib/umraniye-osint-deneme --durum
```
Kapatmak için (anahtar korunur):
```sh
sudo -u osintdeneme node .../smtp-kur.mjs --data-dir /var/lib/umraniye-osint-deneme --kapat
```

## Panelde açma

1. Kurum Yönetimi > ilgili kurum > **E-posta** sekmesi.
2. Kurumdan aldığınız adresi girip "Adresi kaydet" (doğrulama kutusunu işaretleyerek).
3. Aynı sekmedeki **"Otomatik gönderimi aç"** düğmesiyle o kurum için e-postayı açın. (Düğme bu
   güncellemeyle eklendi; doğrulanmış etkin alıcı yoksa sunucu açmayı reddeder.)

## Test

1. Kendi adresinizi tek alıcı olarak ekleyip o kurumda e-postayı açın.
2. En çok 5 dakika (vaka üretimi) + 2 dakika (gönderim) içinde bir e-posta gelmeli.
3. Gelmezse: `journalctl -u umraniye-kurum-gonderim -n 40`. Sık nedenler: Gmail uygulama şifresi
   yanlış (`sender_refused`/login hatası), alıcı doğrulanmamış, kuyrukta uygun kayıt yok.

## Güvenlik notu

- `smtp.key` 32 baytlık ham anahtardır; `smtp.json` içinde yalnız şifrelenmiş (`sealed`) parola durur.
  İkisi de 0600 ve `osintdeneme` sahipliğinde olmalı. Eşitleyici bu dosyaları GitHub'a taşımaz
  (`/var/lib` altında, kaynak dizininde değil).
- Uygulama şifresini değiştirmek için betiği yeniden çalıştırın; eski `sealed` üzerine yazılır.
