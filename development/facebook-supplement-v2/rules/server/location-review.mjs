import {analyzeGeoText,geoLocationFields} from './geo-dictionary.mjs';

// LOCATION_REVIEW_V1
// Metinsel konum isareti, bagimsiz konum dogrulamasi degildir.
const fold=value=>String(value||'')
 .toLocaleLowerCase('tr-TR')
 .normalize('NFKD')
 .replace(/[\u0300-\u036f]/g,'')
 .replace(/ı/g,'i')
 .replace(/\s+/g,' ').trim();

const local=/\b(?:umraniye|dudullu|yamanevler|ihlamurkuyu|elmalikent|armaganevler|tepeustu|topagaci)\w*/;

const cross=/\b(?:kavacik|ruzgarlibahce|ruzgarli bahce|cavusbasi)\w*/;

const route=/\bumraniye\w*\s*[-–—/]\s*(?:kavacik|beykoz)\w*|\b(?:kavacik|beykoz)\w*\s*[-–—/]\s*umraniye\w*/;

export function reviewLocalLocation(title,description=''){
 const geo=analyzeGeoText(title+' '+description);if(geo.matches.length)return geoLocationFields(geo);
 const heading=fold(title);
 const details=fold(description);
 const lead=details.slice(0,240);

 const uncertain=reason=>({
  locationStatus:'review_required',
  locationEvidence:reason,
  locationVerified:false
 });

 if(cross.test(heading)||route.test(heading)||route.test(details))
  return uncertain('cross_district_location_reference');

 if(cross.test(lead)&&!local.test(heading))
  return uncertain('other_district_in_primary_text');

 if(local.test(heading)||local.test(lead))
  return {
   locationStatus:'local_indicated',
   locationEvidence:'explicit_local_text_reference',
   locationVerified:false
  };

 return uncertain('locality_not_clear_in_primary_text');
}
