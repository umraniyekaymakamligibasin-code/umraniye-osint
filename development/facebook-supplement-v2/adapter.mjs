// No live application imports: only reviewed, hash-checked copies in ./rules.
import fs from 'node:fs';
import {loadCentralKeywords,centralProfile,matchCentralKeywords} from './rules/server/central-keywords.mjs';
import {loadGeoDictionary,analyzeGeoText,geoNormalize} from './rules/server/geo-dictionary.mjs';
import {setInstitutionalTargets} from './rules/server/institutional-reference.mjs';
import {localScopeAssessment} from './rules/server/local-scope-policy.mjs';
import {reviewLocalLocation} from './rules/server/location-review.mjs';
import {curateSocial,socialQualityReason} from './rules/server/social-quality.mjs';
import {isUmraniyesporContent} from './rules/server/filters/umraniyespor.mjs';
import {publicationTime,prioritize} from './rules/src/intelligence.js';
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const s=input.snapshot;
const DB={prepare(sql){let args=[];return{bind(...v){args=v;return this},async first(){if(sql.includes('common_keyword_state'))return s.tables.common_keyword_state[0];if(sql.includes('workspace_settings'))return s.tables.workspace_settings.find(r=>r.id===args[0])||null;throw Error('unreviewed_read')},async all(){const t=sql.match(/FROM (\w+)/)?.[1];if(!s.tables[t])throw Error('unreviewed_read');return {results:s.tables[t]}}}}};
await loadCentralKeywords(DB);await loadGeoDictionary(DB);setInstitutionalTargets(s.sources,s.revision);
const groups=centralProfile('facebook');
const result=(input.posts||[]).map(e=>{
 const reject=reason=>({id:e.id,decision:'rejected',reason});
 if(!e.fullText||!e.fullText.trim())return reject('text_missing');
 if(isUmraniyesporContent(e))return reject('excluded_umraniyespor');
 const time=publicationTime(e.publishedAt,input.now);
 if(!time.publishedAt||time.precision!=='instant')return reject('publication_date_missing_or_invalid');
 if(input.now-Date.parse(time.publishedAt)>input.freshnessMinutes*60000)return reject('outside_fresh_window');
 if(Date.parse(time.publishedAt)>input.now)return reject('future_publication');
 const ids=matchCentralKeywords(e.fullText,'facebook');
 if(!ids.length)return reject('keyword_missing');
 // Additional shadow-only safety: district in a road name is not district evidence.
 const withoutRoadName=geoNormalize(e.title+' '+e.fullText).replace(/\bumraniye\s+(?:caddesi|cad|cd|bulvari|blv|sokagi|sok|sk)\b/g,' ');
 if(analyzeGeoText(withoutRoadName).explicitOutsideDistrict)return reject('other_location_without_independent_district_context');
 const scope=localScopeAssessment(e);
 if(!scope.local)return reject(scope.reason);
 const curated=curateSocial(e);if(!curated)return reject(socialQualityReason(e));
 const location=reviewLocalLocation(e.title,e.fullText);
 const categories=groups.filter(g=>s.tables.common_keyword_members.some(m=>m.provider==='facebook'&&m.enabled&&m.group_id===g.id&&ids.includes(m.keyword_id))).map(({id,name,priority,kind})=>({id,name,priority,kind}));
 const keywords=s.tables.facebook_keywords.filter(w=>ids.includes(w.id)).map(w=>({id:w.id,term:w.term}));
 const priority=prioritize({...curated,...location,scope:'local'},input.now);
 return {...curated,...location,publishedAt:time.publishedAt,matchedKeywords:keywords,categories,localContext:scope,classification:priority,decision:'shadow_accepted',notificationEligible:false,criticalAlert:false};
});
process.stdout.write(JSON.stringify({groups,result}));
