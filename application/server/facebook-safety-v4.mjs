const fold=s=>String(s||'').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
export function freshFacebookTime(time,now){
 return time.precision==='instant'&&Number.isFinite(Date.parse(time.publishedAt))&&now-Date.parse(time.publishedAt)>=-60000&&now-Date.parse(time.publishedAt)<=3600000;
}
export function applyFacebookSafety(item,{previous=false,duplicate=false,now=Date.now()}={}){
 if(item.platform!=='facebook')return item;
 const text=fold(item.title+' '+item.description);
 const cross=/\b(?:kavacik|beykoz|pendik|kadikoy|atasehir|uskudar|sancaktepe|sultanbeyli|cekmekoy|gaziantep|ankara|izmir)\w*/.test(text);
 const historical=/\b(?:dun|gecen|arsiv|nostalji|yillar once|haftaki bulten|haftanin ozeti)\b|\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{1,2}\s+(?:ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)\b/.test(text);
 item.eventAt=null;item.eventDateStatus=historical?'review_required':'not_independently_verified';
 if(cross){item.locationStatus='review_required';item.locationVerified=false;item.locationEvidence='cross_district_reference_v4';}
 const fresh=freshFacebookTime({precision:item.datePrecision,publishedAt:item.publishedAt},now);
 if(previous||duplicate||cross||historical||!fresh||item.locationStatus==='review_required'){
  item.notificationEligible=false;item.criticalAlert=false;
  item.alertSuppressionReason=previous?'already_seen':duplicate?'duplicate_content':cross?'location_review':historical?'event_date_review':!fresh?'not_fresh':'location_review';
  if(['P1','P2'].includes(item.priorityLevel)&&(cross||historical||!fresh))item.priorityLevel='P3';
 }
 item.freshnessVersion='facebook-live-v4';
 return item;
}
