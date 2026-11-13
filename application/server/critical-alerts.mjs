import {nationalCritical} from '../worker/index.js';
import {publicationTime} from './intelligence.mjs';
const fold=s=>String(s||'').toLocaleLowerCase('tr').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
export const CRITICAL_TERMS=['terör saldırısı','bombalı saldırı','helikopter kazası','uçak düştü','şehit oldu','savaş başladı','savaş ilanı','bina çöktü','enkaz altında','sel felaketi','afet bölgesi','deprem','büyük patlama','otobüs kazası','tren kazası'];
export function criticalSignal(title,description=''){
 const h=fold(title),text=fold(title+' '+description),national=nationalCritical(title,description);
 const no={critical:false,category:null,national};
 if(/tatbikat|senaryo|simulasyon|belgesel|film|\bdizi\b|yil donum|yildonum|arsiv|tarihte bugun|\banma\b|\banildi\b|cenaze|defned|taziye|tutuklan|tutuklu|sorusturma|iddianame|mahkeme|olasi deprem|deprem riski|deprem egitim|savas oyun|kentsel donusum|kontrollu yikim|planli yikim/.test(h)||/asilsiz|yalanlandi|sehit (?:yok|olmadi)|saldiri.{0,15}(?:engellendi|onlendi)/.test(h)||/\?/.test(title))return {...no,suppressed:true};
 let category=national.nationalCritical&&national.nationalUrgent!==false?national.nationalCategory:null;
 if(/teror saldirisi|bombali saldiri|intihar saldirisi|canli bomba/.test(h))category='Saldırı';
 else if(/(?:asker|polis|jandarma|personel).{0,40}sehit|sehit (?:oldu|dustu|verdik)|sehit sayisi/.test(h))category='Şehit haberi';
 else if(/savas (?:basladi|ilan|cikti|patlak)|savas ilan|savasa girdi|askeri operasyon basladi/.test(h))category='Savaş / çatışma';
 else if(/(?:bina|apartman|is yeri|isyeri|yapi).{0,30}(?:coktu|cokme|yikildi)|enkaz altinda|maden gocugu/.test(h))category='Çökme / göçük';
 else if(/sel felaketi|afet bolgesi|(?:sel|taskin|heyelan|cig).{0,60}(?:mahsur|tahliye|hayatini kaybet|yikim|felaket)|(?:evler|yerlesim).{0,25}su altinda/.test(h))category='Sel / afet';
 else if(/(?:helikopter|ucak).{0,35}(?:dustu|kaza|carp|irtibat.{0,10}kesildi)|(?:otobus|tren|feribot|gemi).{0,40}(?:kazasi|kaza|devrildi|batti|alabora|raydan|carpis)|zincirleme kaza/.test(h))category='Kaza';
 else if(/umraniye|dudullu/.test(text)&&/trafik kazasi|kaza yapti|carpisti|otomobil.{0,25}carp|yangin cikti|yangin basladi|balkon.{0,25}cok|patlama (?:oldu|meydana)|trafo.{0,20}patla/.test(h))category='Yerel acil olay';
 return {critical:!!category,category,national};
}
export function criticalNotification(event,now=Date.now()){
 const result=criticalSignal(event.title,event.description),time=publicationTime(event.publishedAt,now),age=time.precision==='instant'?now-Date.parse(time.publishedAt):Infinity;
 return {...result,eligible:result.critical&&time.precision==='instant'&&age>=-300000&&age<=3600000};
}
