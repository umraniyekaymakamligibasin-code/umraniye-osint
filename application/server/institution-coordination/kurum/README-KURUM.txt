KURUM YONLENDIRME ZAMANLAYICISI
================================
Calistirma            : node kurum-zamanlayici.mjs --rapor --sunucu /opt/umraniye-osint-deneme
Kuru deneme (yazmaz)  : node kurum-zamanlayici.mjs --kuru --sunucu /opt/umraniye-osint-deneme
Tek tur               : node kurum-zamanlayici.mjs --tek-sefer --sunucu /opt/umraniye-osint-deneme
E-posta da gonder     : node kurum-zamanlayici.mjs --tek-sefer --gonder --sunucu /opt/umraniye-osint-deneme
Baslik listesi denetimi: node kurum-zamanlayici.mjs --kontrol --sunucu /opt/umraniye-osint-deneme

Zamanlayicilar:
  umraniye-kurum-zamanlayici.timer  (5 dk)  case + outbox uretir, MAIL GONDERMEZ
  umraniye-kurum-gonderim.timer     (2 dk)  outbox'u bosaltir; smtp.json yoksa hic calismaz
Durum:
  systemctl list-timers 'umraniye-kurum-*'
  journalctl -u umraniye-kurum-zamanlayici.service -n 40 --no-pager

GUVENLIK NOTLARI
- Olay metni kuruma KOPYALANMAZ; yalnizca kategori basligi + mahalle gider.
- Hassas kategori, kisisel veri, dogrulanmamis konum ve onaysiz kurum/konu
  kaydi yonlendirilmez.
- Alici adresi AES-256-GCM sifreli saklanir; anahtar dosyasi yoksa gonderim
  atlanir ve YENI ANAHTAR URETILMEZ (aksi halde eski sifreler acilamaz).
- Belirsiz gonderim sonucu tekrar denenmez (delivery_outcome_unknown).
