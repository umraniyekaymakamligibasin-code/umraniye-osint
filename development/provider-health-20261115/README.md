# Okuyucu durum takibi — 15 Kasım 2026

## Canlıda doğrulanan
- Önceki dört dosyalık acil onarım kullanıcı tarafından kuruldu. 15 Kasım 07:14–08:14 UTC arasında gözlenen yedi haber turunda her tur 15 başarılı / 0 başarısız grup bildirdi. Bu, tüm kaynakların ve haberlerin eksiksiz yakalandığı anlamına gelmez.
- Instagram medya yardımcı okuyucusu kısıtlama sonrasında bir saat bekliyor; bir sonraki denemede yalnız ilk kısıtlanan hesapta duruyor. Medya okuma erişimi hâlâ doğrulanmadı.
- Facebook umraniyehaberlerii adresine tek, çerezsiz ve yönlendirme takip etmeyen istek 302 /login/ döndürdü. Bu örnekte engel kaydırma değil erişimdir. Diğer sayfaların aynı nedenle başarısız olduğu varsayılmaz.
- Instagram API son gözleminde 13 kaynak beklemede ve sıfır okuma var. Meta 200/5258005 hatasının kesin nedeni yalnız sayısal koddan belirlenemez. Beklemeler sıfırlanmadı; yeni API taraması zorlanmadı.

## Canlıya kuruldu ve kaynak sürümleri doğrulandı
Beş dosyalık sürüm kilitli paket: osint-saglayici-durum-duzelt.py.
- Bekleyen, boş sonuç veren, erişim hatası yaşayan ve gerçekten içerik okuyan Instagram turları ayrılır.
- Kaynak bazında yeniden deneme zamanı, sayısal hata kodu ve son gerçek içerik okuma zamanı yöneticiye gösterilir. Token ve ham hata metni yayımlanmaz.
- Facebook giriş/doğrulama yönlendirmeleri gerçek erişim engeli olarak sınıflanır. Yönlendirme takip edilmez ve doğrulama aşılmaz.
- Tarama aralıkları, kaynak seçimleri, mevcut kuyruklar, ilk keşif/yayın tarihleri, Telegram politikası ve altı aylık saklama değişmez.

## Doğrulama
Yedi izole Python testi, backend durum dönüşümü kontrolleri, mevcut dokuz Facebook okuyucu testi ve 106 JavaScript / 21 gömülü script derleme kontrolü geçti. Test içerikleri yalnız geçici dosya/veritabanlarında kullanıldı; gerçek API ve mesaj gönderimi yapılmadı.
Kurucu dosya SHA256 değerlerini tekrar doğrular, yedek alır, aktif tarama turunun bitmesini bekler, yalnız uygulama servisini yeniden başlatır ve önceki zamanlayıcı durumlarını geri getirir. Ağ geçidi/Telegram servisini yeniden başlatmaz. Kurulumdan sonra mevcut durum dosyasından güvenli panel özeti yeniden oluşturulur; Graph çağrısı yapılmaz.

## Açık işler
1. Instagram izin/hesap erişiminin yetkili hesap üzerinden doğrulanması; bekleme sürerken tekrar tekrar deneme yapılmaması.
2. Facebook mevcut tarayıcı profilinin oturum geçerliliği; anonim yedekte gerçek yeni ve taze gönderi kazanımının ölçülmesi.
3. Paneldeki etkin/pasif kaynak tercihleri ile API hedef listesinin tek yetkili kaynaktan beslenmesi.
4. X kapsamı, yanlış konum elemeleri ve uçtan uca teslim gecikmesi için referans gönderilerle ölçüm. Boş tur tek başına arıza değildir.
5. DHA etkin çalışma planının ayrıca doğrulanması ve güncel GitHub notlarındaki kalan maddeler.
6. Arayüz tasarım adayı ayrı taslaktır; bu paket tasarımı canlıya taşımaz.

Kullanıcı 15 Kasım 08:42:45 UTC tarihinde beş dosyalık paketi kurdu. Beş canlı dosyanın sürüm kilidi, GitHub aynası ve origin/main eşitliği doğrulandı; yerel 3001/3000 kurulum kontrolü geçti. Yedek: /var/backups/umraniye-osint-reviewed/provider-health-20261115T084245Z. Kullanıcı ekran görüntüsü yeni bekleme ve son gerçek okuma alanlarını gösteriyor; dış tarayıcı etkileşimleri ajan tarafından henüz sınanmadı. Hiçbir bileşen için yüzde 100 kapsam iddiası yoktur.
