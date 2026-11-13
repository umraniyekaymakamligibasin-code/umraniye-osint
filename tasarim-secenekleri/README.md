# Arayüz seçenekleri (2. aşama)

Ana ekran (Ümraniye Dijital Gündem Merkezi) için üç seçenek ve karşılaştırma için mevcut tasarım.
Görüntüler bu daldaki kodla, yerel makinede gömülü örnek veriyle alındı; küçük resim üreticisi
yerelde olmadığı için haber görselleri "görsel yok" kutusu olarak görünüyor (canlıda görseller gelir).

| Dosya öneki | Seçenek |
| --- | --- |
| `mevcut-` | Şu anki tasarım (1. aşama düzeltmeleriyle) |
| `a-` | A · Yoğun haber akışı: ince başlık, "İlçe Gündemi" şeridi yok, tek satır sayaçlar, haberler küçük görselli liste |
| `b-` | B · Komuta paneli: lacivert menü, ince kırmızı gündem şeridi, renk kodlu sayaçlar, kart ızgarası |
| `c-` | C · Gazete: ortalanmış künye, serif başlıklar, manşet ve sütunlar, sade tipografi |

Her seçenek için `ana-sayfa`, `haber-gundemi` (masaüstü 1440 px) ve `mobil` (390 px) görüntüsü var.

Canlı denemek için (bu dal sunucuya kurulduktan sonra): adrese `?tasarim=a`, `?tasarim=b`,
`?tasarim=c` veya `?tasarim=mevcut` ekleyin. Seçim tarayıcıda hatırlanır ve sağ altta bir geçiş
anahtarı çıkar. Parametre kullanılmadıkça kullanıcılar mevcut tasarımı görür.

Seçim yapıldıktan sonra seçilen tasarım varsayılan olacak, diğer seçenekler, anahtar ve bu klasör
silinecek.
