const groups=[
 ['SPORT','UMR_ILCE_GENCLIK_SPOR','Gençlik ve spor',[
 ['Spor faaliyetleri ve müsabakalar',['spor faaliyeti','spor etkinliği','spor turnuvası','spor müsabakası','spor yarışması','spor organizasyonu','spor şenliği','spor festivali','sporcu başarısı','sporcularımız','sporcularimiz','gençlik ve spor']],
 ['Spor salonu ve tesis şikâyetleri',['spor salonu','spor tesisi','yüzme havuzu','futbol sahası','basketbol sahası','fitness salonu','antrenman salonu']],
 ['Spor kursu, kayıt ve hizmet talepleri',['spor kursu','yüzme kursu','basketbol kursu','futbol kursu','voleybol kursu','spor okulu','sporcu lisansı','antrenör talebi','spor malzemesi talebi','spor salonu talebi']],
 ['Gençlik merkezi ve gençlik faaliyetleri',['gençlik merkezi','gençlik kampı','gençlik faaliyeti','gençlik etkinliği','gençlik projesi','gençlik merkezinde']]]],
 ['NUFUS','UMR_ILCE_NUFUS','Nüfus hizmetleri',[
 ['Kimlik, pasaport ve sürücü belgesi işlemleri',['nüfus müdürlüğü','kimlik kartı başvurusu','kimlik yenileme','pasaport başvurusu','pasaport randevusu','ehliyet yenileme','sürücü belgesi başvurusu']],
 ['Nüfus randevu, adres ve kayıt talepleri',['nüfus randevusu','nüfustan randevu','adres değişikliği bildirimi','adres tescil','nüfus kayıt örneği','doğum tescili','nüfus işlemleri']]]],
 ['MUFTU','UMR_ILCE_MUFTULUK','Müftülük hizmetleri',[
 ['Cami ve din hizmetleri',['müftülük','cami hizmeti','cami görevlisi','imam talebi','imam şikayeti','cami bakım','cami tadilat','cami çatısı','cami tuvaleti','cami hoparlörü','ezan sesi']],
 ['Kur’an kursları ve eğitim talepleri',["kur'an kursu",'kuran kursu','kur’an kursu','hafızlık kursu','yaz kuran kursu','din eğitimi talebi']],
 ['Hac, umre ve manevi danışmanlık hizmetleri',['hac kaydı','hac başvurusu','umre kaydı','umre başvurusu','manevi danışmanlık','aile dini rehberlik']]]]
];
const serviceCoverage=[
 ['UMR_KAYMAKAMLIK','Kaymakamlık hizmet ve koordinasyon talepleri',['kaymakamlığa başvuru','kaymakamlık hizmeti','kurumlar arası koordinasyon talebi']],
 ['UMR_EMNIYET','Emniyet hizmetleri ve güvenlik bildirimi',['polis müdahalesi talebi','emniyete şikayet','trafik denetimi talebi']],
 ['UMR_ILCE_MEM','Eğitim hizmetleri ve okul talepleri',['okul kayıt sorunu','öğretmen eksikliği','okul servis şikayeti','okulda bakım talebi']],
 ['UMR_ILCE_SAGLIK','Sağlık hizmetine erişim ve tesis sorunları',['aile sağlığı merkezi kapalı','sağlık ocağı randevu sorunu','sağlık hizmeti talebi']],
 ['UMR_BELEDIYE','Belediye hizmet şikâyet ve talepleri',['çöp toplanmıyor','kaldırım onarım talebi','park bakım talebi','belediye hizmet şikayeti']],
 ['IBB_ALTYAPI','Büyükşehir altyapı ve ana yol hizmetleri',['ibb yol bakım','ibb altyapı arızası','ana arter bakım talebi']],
 ['ISTANBUL_ITFAIYE','İtfaiye ve kurtarma hizmet talepleri',['itfaiye müdahalesi talebi','yangın güvenliği denetimi talebi','kurtarma ekibi talebi']],
 ['IETT','Otobüs seferleri ve durak şikâyetleri',['otobüs seferi','otobüs durağı','iett şikayet','otobüs hattı talebi','otobüs gelmiyor']],
 ['METRO_ISTANBUL','Metro seferleri ve istasyon sorunları',['metro seferi','metro istasyonu','metro arızası','metro asansörü','metro yürüyen merdiveni']],
 ['ISKI_UMR','Su ve kanalizasyon hizmet talepleri',['su kaçağı','su kesintisi','kanalizasyon taşması','iski şikayet','su bağlantı talebi']],
 ['AYEDAS_UMR','Elektrik dağıtımı ve ekipman sorunları',['elektrik kesintisi','elektrik direği devrildi','elektrik kablosu koptu','ayedaş şikayet']],
 ['IGDAS_UMR','Doğalgaz hizmet talepleri',['doğalgaz kaçağı','doğalgaz kesintisi','igdaş şikayet','doğalgaz bağlantı talebi']],
 ['TURK_TELEKOM_UMR','Türk Telekom altyapı şikâyetleri',['türk telekom arızası','türk telekom kablosu','türk telekom internet kesintisi']],
 ['TELEKOM_OPERATOR_UMR','Operatör hizmet sorunu — sağlayıcı teyidi gerekli',['mobil şebeke kesintisi','telefon çekmiyor','operatör altyapı arızası']],
 ['UMR_ILCE_NUFUS','Nüfus işlem ve randevu sorunları',['nüfus müdürlüğü randevu','kimlik teslim gecikmesi','pasaport teslim gecikmesi']],
 ['UMR_TAPU','Tapu hizmetleri ve başvuru sorunları',['tapu randevusu','tapu başvurusu','tapu işlemi gecikti','tapu hizmet şikayeti']],
 ['UMR_SGK','Sosyal güvenlik başvuru ve hizmet sorunları',['sgk başvurusu','emeklilik işlemi gecikti','sigorta tescil sorunu','sgk hizmet şikayeti']],
 ['UMR_ISKUR','İstihdam ve mesleki eğitim talepleri',['işkur başvurusu','işkur kursu','işsizlik ödeneği başvurusu','mesleki eğitim talebi']],
 ['UMR_ILCE_TARIM','Gıda denetimi ve tarım hizmet talepleri',['gıda denetimi talebi','gıda hijyen şikayeti','tarım müdürlüğü başvurusu','hayvan sağlığı bildirimi']],
 ['IBB_ATIK','Büyükşehir atık hizmet talepleri',['ibb atık toplama','ibb atık tesisi','büyükşehir atık şikayeti']],
 ['UMR_SYDV','Sosyal yardım hizmetine erişim',['sosyal yardım başvurusu','gıda yardımı talebi','yakacak yardımı talebi','barınma yardımı talebi']],
 ['UMR_SHM','Sosyal hizmet ve danışmanlık talepleri',['sosyal hizmet başvurusu','aile danışmanlığı talebi','engelli bakım hizmeti talebi','yaşlı bakım hizmeti talebi']],
 ['UMR_AFET','Afet koordinasyonu ve hazırlık talepleri',['afet koordinasyon talebi','toplanma alanı sorunu','afet eğitimi talebi']],
 ['UMR_MUHTARLIK','Muhtarlık ve mahalle hizmet talepleri',['muhtarlık hizmeti','muhtarlığa başvuru','muhtarlık kapalı','mahalle muhtarına talep']]
];
for(const [institution,title,patterns] of serviceCoverage)groups.push(['COVER-'+institution,institution,title,[[title,patterns]]]);
export const institutionServiceRules=groups.flatMap(([prefix,institution,subcategory,rows])=>rows.map(([title,patterns],index)=>({code:'CIT-SERVICE-'+prefix+'-'+(index+1),title,family:'Kurum hizmetleri',subcategory,patterns,panelCandidates:[institution],serviceAuthority:subcategory,sensitivity:'ordinary',risk:'normal',mandateVerified:false,taskSummary:title+' konusunda kaynak bildirimi. İlgili kurumun incelemesine sunulmuştur.'})));
