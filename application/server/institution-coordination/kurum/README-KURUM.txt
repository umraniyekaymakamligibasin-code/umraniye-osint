KURUM YONLENDIRME ZAMANLAYICISI
================================
Surum: kurum-politikasi-v5 + baglam motoru (OSINT_ROUTING_CONTEXT=1)

Calistirma            : node kurum-zamanlayici.mjs --rapor --sunucu /opt/umraniye-osint-deneme
Kuru deneme (yazmaz)  : node kurum-zamanlayici.mjs --kuru --sunucu /opt/umraniye-osint-deneme
Tek tur               : node kurum-zamanlayici.mjs --tek-sefer --sunucu /opt/umraniye-osint-deneme
E-posta da gonder     : node kurum-zamanlayici.mjs --tek-sefer --gonder --sunucu /opt/umraniye-osint-deneme
Baslik listesi denetimi: node kurum-zamanlayici.mjs --kontrol --sunucu /opt/umraniye-osint-deneme
Baglam onizleme       : OSINT_ROUTING_LOCAL_SCOPE=1 node onizleme.mjs --sunucu /opt/umraniye-osint-deneme

Zamanlayicilar:
  umraniye-kurum-zamanlayici.timer  (5 dk)  case uretir, MAIL GONDERMEZ
  umraniye-kurum-gonderim.timer     (2 dk)  outbox'u bosaltir; smtp.json yoksa hic calismaz
Durum:
  systemctl list-timers 'umraniye-kurum-*'
  journalctl -u umraniye-kurum-zamanlayici.service -n 40 --no-pager

BAGLAM MOTORU (v5)
- Kurum gorev alanlari DB grant'larindan OTOMATIK uretilir (profil-uret.mjs).
  `profiller.json` yalnizca ince ayar: haric konular, baglam sarti, oncelik.
- Olay; konum, duyuru/olay, kisisel veri, gorev alani, baglam, baslik ve
  guven esiklerinden gecer. Ayrinti: README-BAGLAM.txt
- Acma/kapama: /etc/systemd/system/umraniye-kurum-zamanlayici.service.d/zz-baglam.conf
  (Environment=OSINT_ROUTING_CONTEXT=1). Kaldirilirsa eski davranis.
- Mail kuyrugu VARSAYILAN KAPALI (OSINT_ROUTING_OUTBOX=0).

GUVENLIK NOTLARI
- Olay metni kuruma KOPYALANMAZ; yalnizca kategori basligi + mahalle gider.
- Hassas kategori, kisisel veri, dogrulanmamis konum ve onaysiz kurum/konu
  kaydi yonlendirilmez.
- Alici adresi AES-256-GCM sifreli saklanir; anahtar dosyasi yoksa gonderim
  atlanir ve YENI ANAHTAR URETILMEZ (aksi halde eski sifreler acilamaz).
- Belirsiz gonderim sonucu tekrar denenmez (delivery_outcome_unknown).
- DB silme/toplu temizleme/migration yapilmaz; eski kayitlar korunur.
