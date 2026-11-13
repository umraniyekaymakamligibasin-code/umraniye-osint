// Contextual inference for configured local publishers. Never independent verification.
import {readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {analyzeGeoText,geoDictionaryState,geoNormalize} from './geo-dictionary.mjs';
const incident=/\b(?:yangin\w*|alev\w*|kaza\w*|yaral\w*|darp\w*|kavga\w*|cinayet\w*|patlama\w*|gocuk\w*|saldiri\w*|silah\w*|s\s*lahli|bicak\w*|hirsiz\w*|soygun\w*|gozalti\w*|itfaiye\w*|ambulans\w*|mahsur|kayip|kesinti\w*|tahliye\w*)\b/;
let cached=null,expires=0,cachedPath='';
function configuredSources(){
 const path=join(process.env.DATA_DIR||'/var/lib/umraniye-osint-deneme','social-source-context.json');
 if(path===cachedPath&&Date.now()<expires)return cached;
 try{if(statSync(path).size>100000)throw Error('source_context_size');const state=JSON.parse(readFileSync(path,'utf8'));if(state.version!==1||!Array.isArray(state.sources)||state.sources.length>300)throw Error('source_context_invalid');cached=state.sources.filter(r=>['instagram','x','facebook'].includes(r.provider)&&r.enabled===true&&r.scope==='umraniye'&&typeof r.identity==='string'&&r.identity.length<=140).map(r=>({...r,identity:geoNormalize(r.identity.replace(/^@/,''))}));}
 catch{cached=[];}cachedPath=path;expires=Date.now()+10000;return cached;
}
export function sourceNeighborhoodContext(entry){
 if(!entry||typeof entry!=='object')return null;
 const provider=entry.platform||entry.provider;let url;try{url=new URL(entry.url);}catch{return null;}
 const hosts={instagram:['instagram.com','www.instagram.com'],x:['x.com','www.x.com','twitter.com','www.twitter.com'],facebook:['facebook.com','www.facebook.com','m.facebook.com']};
 if(url.protocol!=='https:'||url.username||url.password||url.port||!hosts[provider]?.includes(url.hostname))return null;
 const sourceName=String(entry.sourceName||'').split(/\s+·\s+(?:Instagram|Facebook|X)\s*$/i)[0].trim();
 const identity=geoNormalize(sourceName.replace(/^@/,''));
 if(!configuredSources().some(r=>r.provider===provider&&r.identity===identity))return null;
 const text=String(entry.fullText||entry.description||entry.title||'').slice(0,6000),n=geoNormalize(text);
 if(text.length<40||!incident.test(n)||/\b(?:reklam|sponsorlu|siparis|satilik|kiralik)\b/.test(n))return null;
 const geo=analyzeGeoText(text);
 // A publisher's home district never overrides a different locality in the content.
 if(geo.explicitOutsideDistrict||geo.outsideDistrict)return null;
 const namedDistricts=[...n.matchAll(/\b([a-z]+) ilce(?:si|sinde|sinden|sine|sinin)\b/g)].map(m=>m[1]);
 if(namedDistricts.some(name=>name!=='umraniye'))return null;
 if(/\bumraniye\s+(?:de\s+)?(?:degil|olmadi|yasanmadi)\b/.test(n))return null;
 const neighborhoods=[...new Set(geoDictionaryState().records.filter(r=>r.enabled!==false).flatMap(r=>r.mahalle||[]))].filter(name=>{
  const form=geoNormalize(name);if(/tarihsel/.test(form))return false;
  return new RegExp('(?:^| )'+form+' (?:mahall[a-z]*|mah|mh)(?: |$)').test(n);
 });
 if(!neighborhoods.length)return null;
 return {version:'source-neighborhood-v1',provider,source:sourceName,neighborhoods,basis:'configured_local_publisher_and_neighborhood_and_incident',independentlyVerified:false};
}
export function sourceContextFields(entry){
 const context=sourceNeighborhoodContext(entry);if(!context)return {};
 return {sourceLocationContext:context,locationStatus:'local_indicated',locationVerified:false,locationEvidence:'configured_local_source_and_neighborhood_inference',neighborhood:context.neighborhoods.join(', '),priorityLevel:'P3',notificationEligible:false,criticalAlert:false,policePriority:false,priorityExplanation:'Yerel kaynak ve mahalle bağlamından otomatik alındı; bağımsız konum teyidi yok'};
}
