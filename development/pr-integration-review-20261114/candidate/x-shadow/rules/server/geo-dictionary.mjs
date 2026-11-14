import seed from './geo-dictionary-data.mjs';
export const geoFold=s=>String(s||'').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
export function geoNormalize(s){return geoFold(s).replace(/<[^>]*>/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\b(?:caddesi(?:nde|nden|ne|nin)?|cadde|cad|cd)\b/g,'cad').replace(/\b(?:bulvari(?:nda|ndan|na|nin)?|bulvar|bulv|blv)\b/g,'bulvar').replace(/\s+/g,' ').trim();}
const clone=x=>JSON.parse(JSON.stringify(x));const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
let state={revision:1,records:clone(seed.records)},compiled=[],neighborhoodPatterns=[];
// Sözlük değişmedikçe normalize edilmiş biçimler ve RegExp nesneleri bir kez hazırlanır (her analizde yüzlerce kez yeniden üretilmez).
function compile(){const cache=new Map(),boundary=form=>{let re=cache.get(form);if(!re){re=new RegExp('(?<![a-z0-9])'+escape(form)+'(?![a-z0-9])');cache.set(form,re);}return re;};
 compiled=state.records.filter(r=>r.enabled!==false).map(r=>({record:r,forms:[...new Set([r.name,...r.aliases].map(geoNormalize).filter(Boolean))].sort((a,b)=>b.length-a.length).map(form=>({form,re:boundary(form)})),mahalle:r.mahalle.map(name=>({name,re:boundary(geoNormalize(name))}))}));
 neighborhoodPatterns=[...new Set(state.records.flatMap(r=>r.mahalle))].filter(n=>!['site','ataturk','istiklal','namik kemal'].includes(geoNormalize(n))).map(name=>({name,re:boundary(geoNormalize(name))}));}
compile();
export function setGeoDictionary(value){if(!value||!Array.isArray(value.records)||value.records.length<seed.records.length||value.records.length>5000||new Set(value.records.map(r=>r.id)).size!==value.records.length)throw Error('Konum sözlüğü kayıt sayısı/kimliği geçersiz');
 const originals=new Map(seed.records.map(r=>[r.id,r]));for(const r of value.records){const original=originals.get(r.id);if((!original&&(!/^UMR-USER-/.test(r.id)||!r.name||!r.source?.length))||(original&&(r.name!==original.name||JSON.stringify(r.source)!==JSON.stringify(original.source)||r.verification_status!==original.verification_status))||r.officially_verified!==false||!Array.isArray(r.aliases)||!Array.isArray(r.mahalle))throw Error('Konum sözlüğü kaynak veya teyit alanları değiştirilemez');}
 if(seed.records.some(r=>!value.records.some(v=>v.id===r.id)))throw Error('İçe aktarılan kayıt silinemez');
 state=clone(value);compile();return geoDictionaryState();}
export function geoDictionaryState(){return {schema_version:seed.schema_version,source_file:seed.source_file,source_sha256:seed.source_sha256,revision:state.revision,records:clone(state.records),summary:{total:state.records.length,active:state.records.filter(r=>r.enabled!==false).length,missingMahalle:state.records.filter(r=>!r.mahalle.length).length,officiallyVerified:0}};}
export async function loadGeoDictionary(DB){const r=await DB.prepare('SELECT data FROM workspace_settings WHERE id=?').bind('location-dictionary').first();if(r)setGeoDictionary(JSON.parse(r.data));return geoDictionaryState();}
export function geoDictionaryPatch(current,input){
 if(!Number.isInteger(input.revision)||input.revision!==current.revision)throw Error('Sözlük başka oturumda değişti; yenileyin');const next=clone(current);
 const list=v=>{if(!Array.isArray(v)||v.length>40||v.some(x=>typeof x!=='string'||x.length>180||/[\x00-\x1f<>]/.test(x)))throw Error('Geçersiz konum listesi');return [...new Set(v.map(x=>x.trim()).filter(Boolean))];};
 if(input.action==='add'){const name=String(input.name||'').trim(),source=list(input.source||[]);if(name.length<4||name.length>160||/[<>\x00-\x1f]/.test(name)||!source.length||source.some(s=>{try{return !['https:','http:'].includes(new URL(s).protocol)}catch{return true}}))throw Error('Konum adı ve kaynak bağlantısı gerekli');if(next.records.some(r=>geoNormalize(r.name)===geoNormalize(name)))throw Error('Bu konum zaten var');next.records.push({id:'UMR-USER-'+globalThis.crypto.randomUUID(),name,type:['Cadde','Bulvar','Kavşak','Bağlantı Yolu'].includes(input.type)?input.type:'Cadde',mahalle:list(input.mahalle||[]),aliases:list(input.aliases||[]),source,verification_status:'YÖNETİCİ KAYDI - RESMÎ TEYİT GEREKLİ',officially_verified:false,additional_location_required:'EVET',priority:3,enabled:true,original:{createdAt:new Date().toISOString(),source}});}
 else{const r=next.records.find(r=>r.id===input.id);if(!r)throw Error('Konum kaydı bulunamadı');r.aliases=list(input.aliases);r.mahalle=list(input.mahalle);r.enabled=input.enabled!==false;}
 next.revision++;return next;
}
export function analyzeGeoText(value){
 const text=geoNormalize(value),found=[];const outsideDistrict=/\b(?:adana|adiyaman|afyonkarahisar|agri|amasya|ankara|antalya|artvin|aydin|balikesir|bilecik|bingol|bitlis|bolu|burdur|bursa|canakkale|cankiri|corum|denizli|diyarbakir|edirne|elazig|erzincan|erzurum|eskisehir|gaziantep|giresun|gumushane|hakkari|hatay|isparta|mersin|izmir|kars|kastamonu|kayseri|kirklareli|kirsehir|kocaeli|konya|kutahya|malatya|manisa|kahramanmaras|mardin|mugla|mus|nevsehir|nigde|ordu|rize|sakarya|samsun|siirt|sinop|sivas|tekirdag|tokat|trabzon|tunceli|sanliurfa|usak|van|yozgat|zonguldak|aksaray|bayburt|karaman|kirikkale|batman|sirnak|bartin|ardahan|igdir|yalova|karabuk|kilis|osmaniye|duzce|karasu|kadikoy|uskudar|atasehir|beykoz|pendik|sancaktepe|cekmekoy|sultanbeyli|tuzla|kartal|maltepe|gebze)(?:da|de|dan|den|daki|deki|nin|nun)?\b/.test(text);const districtMention=/\bumraniye(?:de|den|ye|nin|li|deki)?\b/.test(text);
 for(const {record:r,forms,mahalle}of compiled){let selected=null;for(const {form,re} of forms){const m=re.exec(text);if(m){selected={start:m.index,end:m.index+m[0].length,alias:form};break;}}if(selected)found.push({r,mahallePatterns:mahalle,...selected});}
 const matches=found.map(hit=>{
  let context=text.slice(Math.max(0,hit.start-180),Math.min(text.length,hit.end+180));
  // A district/neighborhood embedded in the road's own name is not independent context.
  for(const f of found)context=context.replaceAll(text.slice(f.start,f.end),' ');
  const explicitDistrict=/\bumraniye(?:de|den|ye|nin|li|deki)?\b/.test(context);
  const otherDistrict=/\b(?:adana|adiyaman|afyonkarahisar|agri|amasya|ankara|antalya|artvin|aydin|balikesir|bilecik|bingol|bitlis|bolu|burdur|bursa|canakkale|cankiri|corum|denizli|diyarbakir|edirne|elazig|erzincan|erzurum|eskisehir|gaziantep|giresun|gumushane|hakkari|hatay|isparta|mersin|izmir|kars|kastamonu|kayseri|kirklareli|kirsehir|kocaeli|konya|kutahya|malatya|manisa|kahramanmaras|mardin|mugla|mus|nevsehir|nigde|ordu|rize|sakarya|samsun|siirt|sinop|sivas|tekirdag|tokat|trabzon|tunceli|sanliurfa|usak|van|yozgat|zonguldak|aksaray|bayburt|karaman|kirikkale|batman|sirnak|bartin|ardahan|igdir|yalova|karabuk|kilis|osmaniye|duzce|karasu|kadikoy|uskudar|atasehir|beykoz|pendik|sancaktepe|cekmekoy|sultanbeyli|tuzla|kartal|maltepe|gebze)(?:da|de|dan|den|daki|deki|nin|nun)?\b/.test(context);
  const places=hit.mahallePatterns.filter(p=>p.re.test(context)).map(p=>p.name);
  const neighborhoodConflict=neighborhoodPatterns.some(p=>!hit.r.mahalle.includes(p.name)&&p.re.test(context))&&!places.length&&hit.r.mahalle.length>0;
  const contextEstablished=explicitDistrict&&!otherDistrict&&!neighborhoodConflict;
  return {id:hit.r.id,name:hit.r.name,type:hit.r.type,aliases:hit.r.aliases,mahalle:hit.r.mahalle,matchedNeighborhoods:places,source:hit.r.source,verification_status:hit.r.verification_status,officially_verified:false,additional_location_required:hit.r.additional_location_required,explicitDistrict,otherDistrict,neighborhoodConflict,contextEstablished};
 });
 const localCandidate=matches.some(m=>m.contextEstablished),localContextEstablished=matches.length>0&&matches.every(m=>m.contextEstablished);
 return {version:'geo-dictionary-v1',revision:state.revision,matches,explicitOutsideDistrict:outsideDistrict&&!districtMention,outsideDistrict:matches.length>0&&outsideDistrict&&!districtMention,localCandidate,localContextEstablished,dictionaryVerified:false,status:!matches.length?'no_match':localContextEstablished?'local_indicated':'review_required',label:!matches.length?'Eşleşme yok':localContextEstablished?'Yerel konum belirtilmiş (teyitsiz)':'İnceleme Gerekli'};
}
export function geoLocationFields(geo){if(!geo.matches.length)return {};return {geoDictionary:geo,locationStatus:geo.status,locationVerified:false,locationEvidence:geo.localContextEstablished?'dictionary_and_district_context_unverified':'dictionary_context_review_required',...(geo.localContextEstablished?{}:{notificationEligible:false,criticalAlert:false})};}

export function outsideLocalScope(e){
 const title=geoNormalize(e.title||''),head=analyzeGeoText(e.title||'');
 const body=analyzeGeoText((e.title||'')+' '+(e.fullText||e.description||''));
 const physical=/yangin|alev|kaza|carpti|carpis|cinayet|silahli|patlama|park halindeki|saldiri|gocuk|coktu/.test(title);
 return !!(head.explicitOutsideDistrict&&physical||body.outsideDistrict);
}
