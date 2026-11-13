export const historicalDuties=[
 ['UMR_EMNIYET','public_safety','Asayiş olayı','silahli saldiri|silahli olay|bicakli saldiri|cinayet|hirsizlik|gozalti|uyusturucu operasyon'],
 ['UMR_EMNIYET','traffic_safety','Trafik güvenliği','trafik kazasi|zincirleme kaza|yol trafige kapali|serit trafige kapali'],
 ['ISTANBUL_ITFAIYE','fire_rescue','Yangın ve kurtarma','yangin|alev aldi|mahsur kal|kurtarma calismasi'],
 ['UMR_ILCE_MEM','school_facility','Eğitim hizmetleri','okul|ogrenci|ogretmen|milli egitim|lise'],
 ['ISKI_UMR','water_leak','Su altyapısı','su borusu|su kacagi|sebeke suyu'],
 ['ISKI_UMR','water_outage','Su kesintisi','su kesintisi|sular kesik|sular kesildi'],
 ['ISKI_UMR','sewer_overflow','Kanalizasyon','kanalizasyon|atik su|rogar tasti'],
 ['AYEDAS_UMR','power_outage','Elektrik dağıtımı','elektrik kesintisi|elektrikler kesildi|elektrik arizasi'],
 ['AYEDAS_UMR','fallen_power_equipment','Elektrik altyapısı','elektrik diregi|elektrik kablosu|trafo patla'],
 ['IGDAS_UMR','gas_leak_public_hazard','Doğal gaz güvenliği','dogalgaz kacagi|dogal gaz kacagi|gaz kokusu'],
 ['UMR_BELEDIYE','waste_container','Atık hizmeti','cop konteyneri|cop toplanmiyor|cop birik'],
 ['UMR_BELEDIYE','parks_public_space','Park hizmeti','park ekipmani|oyun grubu|park bakimi'],
 ['UMR_SYDV','social_assistance_service_access','Sosyal yardım hizmeti','maddi yardim|sosyal yardim basvurusu|gida yardimi|yakacak yardimi'],
 ['UMR_SHM','social_service_access','Sosyal hizmet','sosyal hizmet|bakim ihtiyaci|korunma ihtiyaci'],
 ['IETT','bus_service_disruption','Otobüs hizmeti','iett|otobus sefer|otobus duragi'],
 ['METRO_ISTANBUL','metro_service_disruption','Metro işletmesi','metro sefer|metro istasyon|metro ariza']
];
export const fold=s=>String(s||'').toLocaleLowerCase('tr').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
export function historicalRoutes(event){
 const title=fold(event.title),text=title+' '+fold(event.fullText||event.description||event.text).slice(0,3000);
 if(/reklam|sponsorlu|indirim kodu/.test(text))return [];
 const found=new Map();
 for(const [institution,topic,label,pattern] of historicalDuties){
  const re=new RegExp('(?:'+pattern+')','u');
  if(!re.test(text))continue;
  // Rutin tebrik/başarı paylaşımları açık kurum görevi değildir.
  if(institution==='UMR_ILCE_MEM'&&/sampiyon|madalya|tebrik|kutluyor/.test(text)&&!/okulda.*(?:yangin|kaza|saldiri|ariza)/.test(text))continue;
  if(!found.has(institution))found.set(institution,{institution,topic,label,reason:'İçerikte kurum görev konusuna ilişkin ifade eşleşmesi; resmî teyit değildir.'});
 }
 return [...found.values()];
}
