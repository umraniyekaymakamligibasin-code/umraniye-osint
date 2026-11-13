# Olay bazlı kurumsal e-posta politikası

## Gönderme koşulu

E-posta yalnız yeni ve otomatik yönlendirmeye uygun bir kurumsal vaka oluşturulduğunda gönderim kuyruğuna alınır. 3–4 gün yeni olay olmaması, tarama sağlığı veya günlük özet gerekçesiyle e-posta yoktur.

Olay aşağıdaki koşulların tümünü sağlamalıdır:

1. Kurum aktif, resmî kapsam/aktarımı onaylanmış.
2. Kurum için ilgili konu yetkisi açık.
3. Olay Ümraniye bağlamına ilişkin yeterli kanıta sahip.
4. Sınıflandırma yeterli güven puanını geçmiş ve konum çelişkisi yok.
5. İçerik hassasiyet kuralı e-posta aktarımına izin veriyor.
6. Kurumsal olay projeksiyonu başarıyla transaction içinde kaydedilmiş.
7. Doğrulanmış en az bir etkin alıcı var ve `email_enabled=1`.

Herhangi biri sağlanmazsa vaka e-postası tutulmaz veya `held` olur; hiçbir heartbeat gönderilmez.

## İçerik

- Konu: `[Ümraniye OSINT] Yeni hizmet bildirimi · {kurum kodu} · {vaka kısa kodu}`.
- Gövde: olay başlığı, redakte kısa özet, yaklaşık mahalle/konum, yayın/tespit zamanı, öncelik ve kurumsal panele güvenli giriş bağlantısı.
- Gövdeye kullanıcı/mağdur/çocuk/ihbarcı adı, telefon, özel mesaj, ham sosyal medya metni veya başka kurumun notu konmaz.
- E-posta linki bearer-token değildir; kullanıcı oturum açmak zorundadır. E-posta içindeki vaka kodu tek başına erişim vermez.

## Tekilleştirme ve retry

- Tek vaka oluşturma anahtarı: `institution_id + source_event_id + topic_id`.
- Tek ilk e-posta anahtarı: `institution_id + coord_case_id + template_code + 'initial-assignment'`.
- `coord_mail_outbox.dedupe_key` unique olmalıdır; aynı event'in yeni platform paylaşımı ikinci maili oluşturmaz.
- İşçi en fazla 5 kez exponential backoff ile dener; ardından `dead` durumuna alıp merkez yöneticiye yalnız yönetim panelinde hata gösterir. Hata raporu e-posta yağmuruna dönüşmez.
- İçerik/öncelik güncellemesi varsayılan olarak yeni e-posta göndermez. Ayrı açık politika ve aynı idempotency yaklaşımı gerekir.

## Alıcı güvenliği

Alıcı adresleri yalnız merkezi yönetici tarafından kurum temsilcisi doğrulandıktan sonra kaydedilir. E-posta gönderimi özelliği ve her kurumun alıcı listesi varsayılan kapalıdır. Alıcı değişikliği audit ve yeniden doğrulama ister. Kurumsal e-posta altyapısı, gönderici doğrulaması ve veri işleme onayı olmadan outbox `held` kalır.
