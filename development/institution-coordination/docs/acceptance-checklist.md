# Kurum modülü — kurulum öncesi kabul koşulları

Bu belge test sonucu değildir. Uygulama DENEME'de kurulmadan önce hangi güvenlik ve iş akışı davranışlarının doğrulanması gerektiğini listeler. Canlı sistemde henüz hiçbir koşul çalıştırılmadı.

## Kimlik ve tenant sınırı

- [ ] Kurum üyeliği olmayan kullanıcı kurumsal ana sayfa, liste, sayaç, arama, dışa aktarma ve detay verisi alamaz.
- [ ] Kurum A üyesi, Kurum B vakasının kimliğini bilse dahi detay, kaynak, not, geçmiş veya ek alana erişemez; yanıt yabancı ve bulunmayan vaka için aynı 404'tür.
- [ ] İstek gövdesine/query/path alanına farklı `institution_id` yazmak erişim kapsamını değiştirmez.
- [ ] Bir üyelik pasifleştirilince mevcut oturumla sonraki istekler anında reddedilir; eski önbellekten veri sunulmaz.
- [ ] Kurum veya kurum-konu izni pasif/onaysız/askıda olduğunda okuma, yazma, atama ve e-posta durur.
- [ ] Kurum kullanıcısı genel ekip `workspace` ve yönetim endpoint'lerinden kurumlar arası veri alamaz.
- [ ] Kurum yetkisi, görünür menü/HTML kontrolüyle değil API ve SQL kapsamıyla uygulanır.
- [ ] Kurumsal yanıtlar `no-store` kullanır; CDN ve paylaşımlı cache'te tutulmaz.

## Sınıflandırma ve otomatik atama

- [ ] Kaynak adı tek başına Ümraniye konumu veya kurum görevi kanıtı sayılmaz.
- [ ] Başka şehir/ilçe açıkça belirtilmişse kurum ataması yapılmaz.
- [ ] Mahalle, cadde ve kurum konu eşleşmesi farklı sinyaller olarak tutulur; belirsiz konum doğrulanmış gösterilmez.
- [ ] Kişisel sohbet, tanıtım, tebrik, bağışçı/şikâyetçi kimliği, özel mesaj ve doğrulanmamış iddia kurumsal vakaya dönüşmez.
- [ ] Bir olay iki kurumu ilgilendiriyorsa her kurum yalnız kendi asgari görünümünü alır; diğer atamalar ifşa edilmez.
- [ ] Düşük güven, hassas kategori veya çelişen kaynakta atama ve e-posta yapılmaz; otomasyon kararı iç audit'te gerekçesiyle tutulur.
- [ ] Benzer yayınlar aynı kaynak olay kimliğine bağlanır; her yeni kaynak yeni e-posta üretmez.

## E-posta kuyruğu

- [ ] Yeni uygun olay yokken, 3–4 gün sessizlikte veya tarama hatasında e-posta oluşmaz.
- [ ] Kurum, konu izni, kurum e-posta anahtarı, doğrulanmış etkin alıcı ve hassasiyet koşullarından biri kapalıysa worker gönderim yapmaz.
- [ ] Outbox worker gönderim anında kurum üyeliği/konu iznini tekrar doğrular; kuyrukta beklerken yetki iptal edilmişse iptal eder.
- [ ] Aynı olay-kurum-konu için tekrar denemeler tek e-posta idempotency anahtarını korur.
- [ ] E-posta içinde ham gönderi metni, mağdur/çocuk/ihbarcı adı, telefon, özel mesaj, gizli not veya bearer erişim bağlantısı bulunmaz.
- [ ] Alıcı adresi düz metin DB/log/audit'e yazılmaz; anahtar SQLite dışında tutulur.
- [ ] SMTP yokluğu, ret ve tekrar hataları e-posta döngüsü yaratmaz; en fazla belirlenmiş deneme sayısından sonra `dead` olur.

## Veri ve işletim

- [ ] Migration yalnız yeni `coord_*` tablolarını ekler; mevcut `case_records`, haber/sosyal akış, Telegram ve üretim DB'sine dokunmaz.
- [ ] Geri dönüş yalnız yeni modülü kapatır; OSINT kayıtlarını veya mevcut kullanıcı notlarını silmez.
- [ ] Audit kaydı yetki, kapsam, atama, durum ve e-posta girişimlerini kaydeder; token/şifre/adres/ham içerik içermez.
- [ ] Kurumsal kayıt saklama ve silme süresi idari kararla belirlenir; bu modül genel OSINT altı aylık saklama kuralını değiştirmez.
- [ ] Shadow modda gerçek kuruma görünüm veya e-posta açılmadan önce yanlış/eksik yönlendirme ve tekilleştirme davranışı karşılaştırılır.
- [ ] DENEME ve üretim dosya, DB, servis, SMTP ve Telegram hedefleri bağımsız olarak doğrulanır; ortak dosya varsa kurum modülü üretimden izole edilir.

