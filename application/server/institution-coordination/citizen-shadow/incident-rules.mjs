export const incidentRules=[{
 code:'CIT-TRAFFIC-PARK-OBSTRUCTION',title:'Hatalı park nedeniyle toplu taşıma geçişinin engellenmesi',family:'Ulaşım',subcategory:'İBB trafik',
 patterns:['Hatalı park nedeniyle toplu taşıma geçişinin engellenmesi','hatalı park otobüs seferini aksattı','hatalı park nedeniyle otobüsün ilerleyemediği','hatalı park nedeniyle otobüs geçemiyor','park eden araç otobüsün geçişini engelliyor'],
 exclusions:['advertisement','negated','historical','resolved','simulation','football'],risk:'normal',sensitivity:'ordinary',panelCandidates:['UMR_BELEDIYE','UMR_EMNIYET'],serviceAuthority:'Trafik ihlali için Emniyet; ulaşım koordinasyonu için Belediye/işletmeci',mandateVerified:false,conditions:['locality_verified','institution_approved','topic_approved','grant_active']
}];
