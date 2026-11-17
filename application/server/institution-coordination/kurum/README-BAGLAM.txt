BAGLAM TABANLI KURUM YONLENDIRMESI (v5)
=======================================
Bu surum, "konu terimi gecti -> kuruma gonder" yaklasimini birakir. Bir olay
ancak asagidaki kapilardan GECERSE vakaya donusur:

  1) KONUM     : olay Umraniye olarak dogrulanmis olmali (ilce/mahalle).
                 Uzun haberlerde Umraniye'nin tesadufen gecmesi yetmez;
                 yalnizca baslik + ozet + ilk 250 karakter dikkate alinir.
  2) OLAY/Duyuru: acilis, toren, ziyaret, egitim, kutlama, dava/mahkeme,
                 ceza/ tahliye gibi duyuru icerigi vaka AC MAZ. Metinde
                 duyuru sinyali varsa baslikta olay sinyali aranir.
  3) HASSAS VERI: TC/kimlik, telefon, e-posta, kapi/daire, plaka,
                 catisma/ magdur kimligi gibi sinyaller varsa vaka ACILMAZ.
  4) GOREV ALANI: konu, kurumun DB'deki onayli grant'larindan uretilen
                 profilde olmali. Profil DB'den OTOMATIK uretilir;
                 `profiller.json` yalnizca ince ayar (haric/ baglam/ oncelik).
  5) BAGLAM    : park/cop/moloz gibi genel alan konulari guvenlik kurumuna
                 ancak kavga/silah/darp gibi olay sinyali varsa gider.
                 Guvenlik kurumu olmayan belediyeye "parkta kavga" gitmez.
  6) BASLIK    : tesis/hizmet erisimi, yangin ve trafik gibi konularda
                 konunun BASLIKTA gecmesi sarttir (uzun metinde tesaduf yok).
  7) ORTAK GOREV: ayni konu birden fazla kuruma yalnizca PAYLASIM listesinde
                 tanimli ise gider (ornek: yangin -> Itfaiye + Emniyet).
  8) GUVEN     : 0.64 + 0.07*hits(en fazla 3) + 0.06(mahalle) + 0.18(baslik)
                 esigi 0.88'dir. Altinda kalan rota acilmaz.

YAZMA
- Vaka basligi ve ozeti KATEGORI duzeyindedir; kaynak metin KOPYALANMAZ.
- (kurum, kaynak olay, konu) benzersizdir; ayni tur tekrar edilebilir.
- Mail kuyrugu VARSAYILAN KAPALIDIR. Acmak icin OSINT_ROUTING_OUTBOX=1 gerekir.
  Bu sunucuda SMTP yok; gercek e-posta gonderimi bilincli olarak kapalidir.

ORTAM DEGISKENLERI
- OSINT_ROUTING_CONTEXT=1   baglam motorunu acar (systemd drop-in ile acik)
- OSINT_ROUTING_LOCAL_SCOPE=1  scope='local' olaylari ilce duzeyinde dogrular
- OSINT_ROUTING_OUTBOX=1    vaka ile mail kuyrugu da yazar (VARSAYILAN KAPALI)

KOMUTLAR
  # Salt-okunur onizleme (hicbir sey yazmaz)
  cd /opt/umraniye-osint-deneme/server/institution-coordination/kurum
  OSINT_ROUTING_LOCAL_SCOPE=1 /opt/node-v24.22.1-linux-x64/bin/node \
    onizleme.mjs --sunucu /opt/umraniye-osint-deneme

  # Kuru tur (yazmaz)
  OSINT_ROUTING_CONTEXT=1 OSINT_ROUTING_LOCAL_SCOPE=1 \
    /opt/node-v24.22.1-linux-x64/bin/node kurum-zamanlayici.mjs \
    --kuru --limit 200 --sunucu /opt/umraniye-osint-deneme

  # Tek gercek tur (en fazla 25 YENI vaka)
  /root/kurum-tur.sh

  # Durum / dogrulama / geri alma
  /root/kurum-adim.sh durum
  /root/kurum-adim.sh dogrula
  /root/kurum-adim.sh geri-al /root/kurum-yedek-YYYYMMDD-HHMMSS --evet

GERI ALMA
- Dosya yedegi: /root/kurum-yedek-20261117-141657 (bu surum oncesi)
- DB yedegi  : /root/osint-yedek-20261117-141657.sqlite (integrity ok)
- `geri-al` dosyalari eski surume dondurur ve baglam drop-in'ini kaldirir.
- DB'de bu turda yazilan vakalar SILINMEZ (silme yasak). Gerekirse panelden
  durum degisikligi yapilir; kayit/denetim izi korunur.

BILINEN ESKI KAYITLAR (bu surum URETMEZ, silme yasagi nedeniyle durur)
- Eski Python zamanlayicisinin urettigi 17 fire_rescue Emniyet vakasi.
- Eski turun belediyeye yazdigi public_safety vakalari.
- Eski vakalarda baslik/ozet kaynak metninden kopyalanmis olabilir; yeni
  baglam turu bunlari degistirmez, yalnizca yeni kayitlarda temiz uretir.
