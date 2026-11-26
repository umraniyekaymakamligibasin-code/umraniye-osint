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
export const institutionServiceRules=groups.flatMap(([prefix,institution,subcategory,rows])=>rows.map(([title,patterns],index)=>({code:'CIT-SERVICE-'+prefix+'-'+(index+1),title,family:'Kurum hizmetleri',subcategory,patterns,panelCandidates:[institution],serviceAuthority:subcategory,sensitivity:'ordinary',risk:'normal',mandateVerified:false,taskSummary:title+' konusunda kaynak bildirimi. İlgili kurumun incelemesine sunulmuştur.'})));
