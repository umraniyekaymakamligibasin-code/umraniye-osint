# Otomatik kurum yönlendirme — karar politikası taslağı

Bu politika personel inceleme kuyruğu gerektirmeyen, ancak belirsizliği sessizce kuruma yaymayan bir otomasyon tanımlar. Kurumlar yalnız kuruma özel, en aza indirilmiş olay görünümünü alır.

## Otomatik yönlendirme için bütün şartlar

Bir olayın kuruma açılması için sistem aynı anda şunları doğrular:

1. Olay genel OSINT akışında mevcut ve aynı olay grubu için tekilleştirilmiş olmalı.
2. İlçe konumu coğrafi sözlükte veya içerikteki açık Ümraniye bağlamında desteklenmeli. Kaynağın adı tek başına konum kanıtı değildir.
3. Mahalle/yol eşleşmesi varsa ilçe bağlamı ve yazım belirsizliği kontrol edilmeli. Salt benzer cadde adı yeterli değildir.
4. Olay sınıfı etkin kurum-konu izniyle eşleşmeli. Her kurum için açık izin yoksa yönlendirme yoktur.
5. Başlık, metin, yer ve kaynak arasında başka ilçe/il ile çelişki bulunmamalı.
6. Hassasiyet kuralı kurumsal görünüm ve e-postaya izin vermeli.
7. Kayıt, kaynak URL'si ve eşleşme gerekçesiyle idempotent biçimde saklanmalı.

Herhangi bir şart belirsizse otomatik yönlendirme yapılmaz ve e-posta gönderilmez. Kayıt genel akıştaki mevcut politika kapsamında kalır; bu modül yeni bir manuel inceleme kuyruğu yaratmaz.

## Sinyal önceliği

- **Açık ilçe ifadesi:** “Ümraniye”, tanımlı mahalle/yol adıyla birlikte kullanıldığında güçlü yerel sinyaldir.
- **Kaynak bağlamı + yer:** bilinen Ümraniye odaklı yayın + Ümraniye mahalle sözlüğündeki yer eşleşmesi birlikte destek sağlar; tek başına yeterli olmaz.
- **Kaynak bağlamı tek başına:** yeterli değildir.
- **Türkiye/İstanbul geneli veya başka ilçeye açık atıf:** Ümraniye’ye özgü daha güçlü kanıt olmadıkça dışlar.
- **Kurum adı/etiketi:** görev alanını belirlemeye yardımcı olur; olayın konumunu veya gerçekliğini tek başına kanıtlamaz.
- **İçerik yalnız kişisel görüş, tanıtım, tebrik veya gündelik sohbetse:** hizmet olayı değildir; kurumsal olaya dönüşmez.

## Birden fazla kurum

Bir olay birden fazla hizmet alanını etkileyebilir. Her kuruma ayrı vaka projeksiyonu üretilir; kurumlar birbirlerinin atanmış olduğunu, vaka sayısını, notunu veya durumunu görmez. Örneğin devrilmiş elektrik direği AYEDAŞ kapsamına aday olabilir; yol kapanması/yaralanma gibi ayrı ve doğrulanmış hizmet etkisi varsa ilgili başka kurum için ayrıca projeksiyon oluşturulabilir. “Tüm kurumlara gönder” veya genel dağıtım grubu yoktur.

## Otomatik modun sınırı

İnsan incelemesi gerektirmeyen tasarım, her girdiyi zorla kuruma atamak demek değildir. Doğrulanmış eşikler ve onaylı kapsam yoksa sistem güvenli şekilde atlamalıdır. Eşikler mevcut gerçek olaylarla kapalı shadow modda kalibre edilmeden açılmaz; modelin tek bir güven puanı hiçbir zaman erişim iznini geçersiz kılamaz.

## Yaşam döngüsü ve e-posta

- Aynı olay + kurum + konu bir vaka oluşturur; başka hesap/platformdan gelen benzer yayın aynı vakaya bağlanır.
- Yalnız ilk geçerli atamada, kurum e-posta ayarı ve etkin/doğrulanmış alıcısı açıksa tek e-posta kuyruğa alınır.
- Sonradan gelen kaynaklar aynı vakayı zenginleştirir, yeni e-posta üretmez.
- Vaka çözülünce arşiv görünümüne taşınır; kurumsal saklama süresi ve silme işlemi ayrıca yönetici ayarı ve audit gerektirir. Kaynak OSINT saklama politikasına dokunulmaz.
