import {newsworthiness} from '../src/newsworthiness.js';
import {localSportsNews} from './local-sports.mjs';
import {analyzeFacebook,fold} from './facebook-analysis-v6.mjs';
export function decideFacebookDisplay(post,keywords,source,{now=Date.now(),baseline=false,previous=false,replay=false,existingEvent=false}={}){
 const body=String(post.fullText||post.message||post.text||'').trim(),published=post.created_time||post.published_at;
 const analysis=analyzeFacebook(body,keywords,source,published,now),localMatches=analysis.matches.filter(k=>k.group_name==='konum'),topicMatches=analysis.matches.filter(k=>k.group_name==='olay');
 const explicit=/\bumraniye(?:['’]?(?:de|da|den|dan|nin|nun|ye|ya|deki|daki))?\b/.test(fold(body));
 const localContext=source.local_context===1||source.local_context===true||/\bumraniye\b/.test(fold(source.page_name||''));
 const scopedNeighborhood=localContext&&localMatches.some(k=>fold(k.term)!=='site');
 const institutional=analysis.institutional_context===true;
 const age=published&&Number.isFinite(Date.parse(published))?now-Date.parse(published):null;
 const reasons=[];if(body.length<12)reasons.push('text_missing_or_short');if(!explicit&&!scopedNeighborhood&&!institutional&&!analysis.geo_dictionary?.localCandidate)reasons.push('locality_not_established');if(!topicMatches.length)reasons.push('no_enabled_topic_match');if(age===null)reasons.push('publication_time_unknown');if(age!==null&&age< -60000)reasons.push('future_publication');if(age!==null&&age>48*3600000)reasons.push('outside_display_window');
 if(existingEvent){const i=reasons.indexOf('outside_display_window');if(i>=0)reasons.splice(i,1);}
 // UMRANIYE_FB_BALANCED_V1_20261109: non-institutional local incidents may enter REVIEW, never direct alerts.
 // Source identity and publication time are still validated by the existing reader/manager.
 const text=fold(body);
 const footballContext=/(?:\bumraniyespor\b|\bfutbol\w*|\balt ligler\b|\b(?:forvet|kaleci|ofsayt|penalti|hakem|taraftar)\b|\bhava toplari\b|\bumraniye oyunculari\b)/.test(text);
 const concreteIncident=/(?:\byangin\w*|\btrafik kazasi\b|\bkaza\w*|\bgozalti\w*|\btutukla\w*|\bkavga\w*|\bdarp\w*|\bsoygun\w*|\bhirsiz\w*|\bdolandir\w*|\bpatlama\w*|\bsilahli\b|\bbicakla\w*|\bsaldir\w*|\bdeprem\w*|\bsel baskin\w*|\bsu baskini\b|\bgocuk\w*|\bkayip\b|\bmahsur\b|\bzehirlen\w*|\bolum\w*|\byaralan\w*|\belektrik kesintisi\b|\bsu kesintisi\b|\byol kapandi\b|\btrafik kapandi\b|\bucus yasagi\b|\btehlikeli madde\b|\boperasyon duzenlen\w*|\barama kurtarma operasyonu\b)/.test(text);
 const explicitLocal=explicit||(scopedNeighborhood&&analysis.geo_dictionary?.localCandidate===true);
 const missingOnlyTopic=reasons.length===1&&reasons[0]==='no_enabled_topic_match';
 const safeTime=age!==null&&age>=-60000&&age<=6*3600000;
 const fallbackReview=!footballContext&&concreteIncident&&explicitLocal&&safeTime&&body.length>=40&&!institutional&&!baseline&&!previous&&!replay&&!analysis.reasons.includes('historical_event_reference')&&!analysis.reasons.includes('other_district_reference')&&missingOnlyTopic;
 if(fallbackReview){analysis.classification='İNCELEME GEREKLİ';analysis.verification_status='review_required';analysis.priority='P3';analysis.reasons=[...analysis.reasons,'topic_dictionary_gap_review'];}
 const worth=newsworthiness({fullText:body});if(worth.exclude)reasons.push(worth.reason);
 const display=!worth.exclude&&(reasons.length===0||fallbackReview);
 const review=fallbackReview||analysis.verification_status==='review_required'||!explicit&&!institutional||body.length<40;
 const historical=analysis.reasons.includes('historical_event_reference'),cross=analysis.reasons.includes('other_district_reference');
 const suppress=localSportsNews(body)||baseline||previous||replay||review||historical||cross||age===null||age>3600000||!analysis.incident_kind||institutional;
 return {version:'facebook-display-v1',sourceId:source.source_id,sourcePageUrl:source.page_url,existingEvent,sourceContextUsed:!explicit&&scopedNeighborhood,display,requiresReview:review,notificationCandidate:display&&!suppress&&!fallbackReview,reasons:fallbackReview?['verified_local_incident_review_only','topic_dictionary_gap','notification_suppressed']:display?[review?'local_review':'local_content_match',...(suppress?['notification_suppressed']:[])]:reasons,matchedKeywords:analysis.matches.map(k=>k.term),textLength:body.length,evaluatedAt:new Date(now).toISOString(),label:fallbackReview?'Yerel olay · inceleme gerekli':review?'İnceleme gerekli':age>3600000||baseline||replay?'Yakın tarihli kayıt · alarm kapalı':'Yerel paylaşım',analysis};
}
