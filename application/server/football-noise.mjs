
// OSINT_X_FOOTBALL_GATE_V2
// X icin profesyonel futbol gurultusunu azaltir.
// Guvenlik, okul ve yerel sporcu haberlerini korur.

function normalize(value){
 return String(value??'')
  .toLocaleLowerCase('tr-TR')
  .replace(/[çğıöşü]/g,c=>({
   'ç':'c','ğ':'g','ı':'i',
   'ö':'o','ş':'s','ü':'u'
  }[c]))
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-z0-9]+/g,' ')
  .trim();
}

function contains(s,re){
 return re.test(s);
}

export function footballNoise(text){
 const s=normalize(text);
 if(!s)return false;

 // Acil olaylar, vatandas sikayetleri ve
 // hizmet sorunlari ASLA rutin futbol
 // haberi sayilarak elenmemeli.
 const important=/(?:^| )(?:yangin|deprem|sel|taskin|afet|afad|kaza|trafik|yarali|yaralandi|yaralanma|olum|olen|vefat|saldiri|kavga|siddet|darp|taciz|istismar|hirsizlik|polis|emniyet|ambulans|tehlike|guvenlik|sikayet|ihbar|sorun|ariza|bozuk|hasar|cokme|cukur|bakimsiz|onarim|tadilat|temizlik|temizlendi|okul|ogrenci|veli|cocuk|egitim|engelli|altyapi|yikim|tahliye)(?: |$)/;

 if(contains(s,important))return false;

 // Yerel basarilar ve spor tesisi yatirimlari.
 const localSuccess=/(?:umraniye belediyesi spor kulubu|milli judocu|milli sporcu|olimpiyat|madalya|judo|gures|karate|tekvando|taekwondo|atletizm|kros|yuzme|dunya sampiyonu|turkiye sampiyonu|sporcu basarisi)/;

 if(contains(s,localSuccess))return false;

 const publicService=/(?:^| )(?:acilis|acildi|hizmete|yatirim|yenilendi|restorasyon|bakim|onarildi)(?: |$)/;

 if(contains(s,publicService))return false;

 // Tam kelimeleri bul.
 const words=new Set();

 const tokens=/(?:^| )(futbol|futbolcu|mac|gol|goller|skor|penalti|ofsayt|derbi|kaleci|forvet|transfer|hakem|lig|kale|saha|top|sut|antrenman|tff|devre|fikstur)(?= |$)/g;

 for(const m of s.matchAll(tokens)){
  words.add(m[1]);
 }

 const has=(...names)=>names.some(n=>words.has(n));

 const club=/(?:^| )(?:umraniyespor|galatasaray|fenerbahce|besiktas|trabzonspor)(?: |$)/.test(s);

 const score=/(?:^| )\d{1,2}\s*[0-9]?(?: |$)/.test(s)
  && /\b(?:gol|mac|skor|lig|tff)\b/.test(s);

 const footballCore=has(
  'futbol','futbolcu','mac','gol',
  'goller','skor','transfer','tff'
 );

 // Kulup adi + futbol baglami.
 if(club&&(footballCore||score))return true;

 // Normal mac, skor ve futbol gundemi.
 if(footballCore&&words.size>=2)return true;

 // Birden cok spor terimi gecen paylasim.
 if(words.size>=3)return true;

 return false;
}
