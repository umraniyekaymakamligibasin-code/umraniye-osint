# X kapsam genişletme V2

Mevcut twscrape 0.21.0 sürümü ve ayrı hesap deposu korunur. Yeni tarayıcı veya ücretli API eklenmez.

- Turda en çok dört hesap grubu, grup başına dört etkin hesap; bir merkezi kelime grubu ve bir ilçe araması.
- Sorgu başına en çok 40 sonuç; bekleyen eski sayfa için en çok bir ek sorgu. Toplam en çok 7 arama / 280 sonuç, 120 saniye okuma bütçesi. Bunlar kütüphanenin oturum hazırlama HTTP isteklerinin sayısı değildir.
- Sorgu bazında since_id, kalıcı eksik sayfa aralığı, her tur yeni gönderileri önce okuma.
- Son 72 saatlik alınabilen ham adaylar ayrı gölge deposunda saklanır; eski adaylar silinir. Mevcut 60 dakika tazelik ve yer/kalite kuralları kabul aşamasında korunur.
- İlk keşif saati korunur. İstek yarıda kesilse de alınmış adaylar saklanır; başarısız sorgunun ilerleme sınırı onaylanmaz.
- Eski tarayıcı turunun başlaması bu ayrı hesaplı okuyucuyu sürekli iptal etmez. Mevcut hesap profili kopyalanmaz.
- Erişim hatasında 10 dakika–6 saat bekleme korunur. Hesap, proxy veya CAPTCHA döndürme yoktur.

Bu bileşen halen GÖLGE modundadır. Ana DB ve Telegram'a yazmaz. Kurulum tek gerçek turu sadece ayrı oturum varsa ister. Gerçek okuma, ortak kabul ve uygulama aktarımı doğrulanmadan yedek okuyucu etkinleştirilmiş sayılmaz; backupPromotionReady false kalır. Oturum eksikse kullanıcı kendi terminalinde session.py ile ayrı oturum eklemelidir. Çerezleri sohbete göndermeyin.

Kurulum mevcut siteyi ve eski X/Facebook/Instagram servislerini yeniden başlatmaz; otomatik zamanlayıcı oluşturmaz. İstenen aşama: kapsamı geliştir, gerçek sonuçlara göre daha sonra yedek rolüne geçir. Otomatik canlı aktarım bu pakette kapalıdır.
