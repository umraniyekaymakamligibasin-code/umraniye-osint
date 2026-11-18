import{eventRelation,eventCandidateTerms,eventKind}from './event-equivalence.js';
const groupFold=value=>String(value||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
const groupWords=value=>groupFold(value).replace(/[’'`][a-z]+\b/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const groupDayFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'});
const groupDay=value=>groupDayFormatter.format(new Date(value));
const groupStop=new Set('umraniye umraniyede istanbul haber haberi haberler dakika gundem son yeni oldu olan olarak etti eden icin sonra once yine kadar ile bir daha dolu anlar korku buyuk baskan baskani belediye belediyesi acikladi aciklama'.split(' '));
function wordStem(word){if(/^odul/.test(word))return 'odul';if(/^yarala|^yarali/.test(word))return 'yarali';if(/^coktu|^cokme|^coken/.test(word))return 'cokme';return word.length>7?word.slice(0,7):word}
function groupTokens(text){return new Set(groupWords(text).split(' ').filter(w=>w.length>3&&!groupStop.has(w)&&!/^\d+$/.test(w)).map(wordStem))}
function tokenOverlap(a,b){const common=[...a].filter(w=>b.has(w));return {count:common.length,coverage:common.length/Math.max(1,Math.min(a.size,b.size))}}
function groupBody(e){return groupWords(e.title+' '+String(e.description||'').slice(0,900))}
function groupPhase(e){const t=groupWords(e.title);if(/cenaze|son gorev|ugurlan|defned|topraga|son yolculuk/.test(t))return 'funeral';if(/tutuk|gozalti|sorustur|mahkeme|iddianame|dava/.test(t))return 'judicial';if(/yil donumu|anildi|anma program/.test(t))return 'commemoration';return 'event'}
function groupKind(e){
 const t=groupBody(e);
 if(/balkon.{0,30}(cok|goc)|balkon\w* cok/.test(t))return 'balcony';
 if(/yangin|alev/.test(t)&&!/tatbikat|egitim/.test(t))return 'fire';
 if(/helikopter|ucak/.test(t)&&/dus|kaza|kirim|irtibat/.test(t))return 'aviation';
 if(/trafik kazasi|zincirleme kaza|minibus.{0,25}devril|otomobil.{0,25}carp/.test(t))return 'traffic';
 if(/silahli saldiri|silahli kavga|kursun/.test(t))return 'shooting';
 if(/gocuk|bina.{0,25}cokme/.test(t))return 'collapse';
 if(/patlama|infilak/.test(t))return 'explosion';
 if(/odul|layik gorul/.test(t))return 'award';
 if(/ziyaret|kabul etti|bir araya|gorusme|zirve/.test(t))return 'meeting';
 if(/acilis|hizmete acil|sube.{0,20}acti/.test(t))return 'opening';
 if(/mac|spor|lig/.test(t)&&/gol|galibiyet|maglup|yenil|deplasman/.test(t))return 'sport';
 if(/toren|bayrak|istiklal marsi/.test(t))return 'ceremony';
 return 'general';
}
const groupPeople=['ismet yildirim','yuksel celik','murat kurum','davut gul'];
function knownPeople(text){return new Set(groupPeople.filter(name=>text.includes(name)))}
function quotes(e){return [...String(e.title||'').matchAll(/[“"]([^”"]{10,140})[”"]/g)].map(m=>groupWords(m[1])).filter(q=>q.split(' ').length>=3)}
function concreteLocation(value){const t=groupWords(value);return ['','ilce geneli','turkiye geneli','mahalle belirlenmedi','belirtilmemis','mahalle belirtilmemis','konum belirtilmemis','konum bilinmiyor'].includes(t)?'':t}
function compatiblePlaces(a,b){
 const national=(a.scope|| (a.nationalCritical?'national':'local'))==='national';
 const aa=concreteLocation(national?a.nationalLocation:a.neighborhood),bb=concreteLocation(national?b.nationalLocation:b.neighborhood);
 return !aa||!bb||aa===bb;
}
export function publicationKey(source){
 try{const u=new URL(source.url);u.hash='';
 if(['x.com','www.x.com','twitter.com','www.twitter.com'].includes(u.hostname)){const id=u.pathname.match(/\/status\/(\d+)/)?.[1];if(id)return 'x.com/status/'+id;}
 if(['instagram.com','www.instagram.com'].includes(u.hostname)){const id=u.pathname.match(/^\/(?:p|reel)\/([A-Za-z0-9_-]+)\/?$/)?.[1];if(id)return 'instagram.com/p/'+id;}
 if(['facebook.com','www.facebook.com','m.facebook.com'].includes(u.hostname)){u.hostname='facebook.com';const video=u.pathname.match(/\/(?:reel|videos)\/(\d+)/)?.[1];if(video)return 'facebook.com/video/'+video;}
 for(const k of [...u.searchParams.keys()])if(/^utm_/i.test(k)||['fbclid','gclid','msclkid'].includes(k))u.searchParams.delete(k);u.searchParams.sort();return u.hostname.replace(/^www\./,'')+u.pathname.replace(/\/$/,'')+u.search}catch{return [source.sourceId||source.sourceName,groupWords(source.title),source.publishedAt].join('|')}
}
export function publications(e){return (e.sources?.length?e.sources:e.url?[e]:[]).map(s=>({...s}))}
// Repair old early clusters before semantic matching. Only the primary publication
// inherits a legacy cluster ID; unrelated publications must not share its notes.
export function publicationRecords(events){
 const byUrl=new Map(),unlinked=[];
 for(const event of events){
  const sources=publications(event);if(!sources.length){unlinked.push({...event});continue}
  const primary=event.url?sources.findIndex(s=>publicationKey(s)===publicationKey(event)):0;
  for(let i=0;i<sources.length;i++){
   const source=sources[i],anchor=i===(primary<0?0:primary),key=publicationKey(source),row={...event,...source,id:anchor?event.id:'pub-'+stablePublicationId(key),relatedIds:anchor?[...new Set([event.id,...(event.relatedIds||[])])]:[],sources:[source],neighborhood:source.neighborhood||(anchor?event.neighborhood:'İlçe geneli'),publishedAt:source.publishedAt||(anchor?event.publishedAt:null)};
   const old=byUrl.get(key);if(!old){byUrl.set(key,row);continue}
   const dated=v=>!!v.publishedAt&&Number.isFinite(Date.parse(v.publishedAt));
   const preferred=dated(row)!==dated(old)?(dated(row)?row:old):String(row.collectedAt||'')>String(old.collectedAt||'')?row:old;
   const aliases=[...new Set([old.id,...(old.relatedIds||[]),row.id,...(row.relatedIds||[])])];
   const description=(old.description||'').length>(row.description||'').length?old.description:row.description;
   byUrl.set(key,{...preferred,id:old.id,relatedIds:aliases,description,sources:[{...preferred.sources[0],description,publishedAt:preferred.publishedAt}],firstSeenAt:[old.firstSeenAt||old.collectedAt,row.firstSeenAt||row.collectedAt].filter(Boolean).sort()[0]});
  }
 }
 return [...byUrl.values(),...unlinked];
}
function stablePublicationId(value){let h=2166136261;for(const c of value){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(36)}
export function publicationOrder(a,b){const at=Date.parse(a.publishedAt),bt=Date.parse(b.publishedAt);return (Number.isFinite(bt)?bt:-Infinity)-(Number.isFinite(at)?at:-Infinity)||String(a.id||a.url).localeCompare(String(b.id||b.url))}
function publisherKey(s){if(s.sourceId&&s.sourceId!=='browser-research')return s.sourceId;const name=groupWords(String(s.sourceName||'').split('·')[0]);if(name)return name;try{return new URL(s.url).hostname.replace(/^www\./,'')}catch{return ''}}
const featureMemo=new Map();
function featureKey(e){const d=String(e.description||'');let h=5381;for(let i=0;i<d.length;i+=3)h=((h*33)^d.charCodeAt(i))>>>0;const src=(e.sources||[]).map(s=>s.url||'').join(',');let sh=5381;for(let i=0;i<src.length;i+=3)sh=((sh*33)^src.charCodeAt(i))>>>0;return [e.id,e.title||'',e.publishedAt||'',e.scope||'',e.nationalCritical?'1':'0',d.length,h,src.length,sh].join('|');}
function eventFeatures(e,cache){
 const old=cache?.get(e);if(old)return old;
 const key=featureKey(e);let value=featureMemo.get(key);
 if(!value){
  const time=Date.parse(e.publishedAt),body=groupBody(e),kind=groupKind(e);value={time,day:Number.isFinite(time)?groupDay(time):null,body,kind,scope:e.scope||(e.nationalCritical?'national':'local'),phase:groupPhase(e),tokens:groupTokens(e.title),bodyTokens:groupTokens(body),people:knownPeople(groupWords(e.title)),bodyPeople:knownPeople(body),quotes:quotes(e),numbers:(String(e.title).match(/\b\d+\b/g)||[]).join(','),urls:new Set(publications(e).filter(p=>p.url).map(publicationKey)),incident:['balcony','fire','traffic','shooting','collapse','explosion','aviation'].includes(kind)};
  // Ozellik cikarimi deterministik; icerik ayni kaldikca yeniden hesaplanmaz (maliyetli regex taramalari).
  if(featureMemo.size>3000)featureMemo.clear();
  featureMemo.set(key,value);
 }
 cache?.set(e,value);return value;
}
function candidateKeys(e,f,query=false){
 const keys=[...new Set([e.id,...(e.relatedIds||[])])].map(id=>'alias:'+id);if(!f.day)return keys;
 for(const delta of (query?[-2,-1,0,1,2]:[0]))for(const term of eventCandidateTerms(e))keys.push('shared:'+groupDay(f.time+delta*86400000)+'|'+term);
 const days=query&&f.incident?[-2,-1,0,1,2].map(n=>groupDay(f.time+n*86400000)):[f.day];
 for(const day of new Set(days)){const prefix=[f.scope,f.kind,f.phase,day].join('|')+'|';for(const t of f.tokens)keys.push(prefix+'t:'+t);for(const q of f.quotes)keys.push(prefix+'q:'+q);for(const u of f.urls)keys.push(prefix+'u:'+u)}return keys;
}
export function sameEvent(a,b,cache){
 const shared=eventRelation(a,b);if(shared!==null)return shared;
 if((a.scope||(a.nationalCritical?'national':'local'))!==(b.scope||(b.nationalCritical?'national':'local'))||!compatiblePlaces(a,b))return false;
 // Legacy IDs are navigation aliases, never evidence that two events are equal.
 const af=eventFeatures(a,cache),bf=eventFeatures(b,cache);if(!a.publishedAt||!b.publishedAt||!Number.isFinite(af.time)||!Number.isFinite(bf.time))return false;
 if(Math.abs(af.time-bf.time)>36*3600000||af.phase!==bf.phase||af.kind!==bf.kind)return false;
 const ak=af.kind,incident=af.incident;if(!incident&&af.day!==bf.day)return false;
 if([...bf.urls].some(u=>af.urls.has(u)))return true;
 const at=af.tokens,title=tokenOverlap(at,bf.tokens),ta=af.body,tb=bf.body,body=tokenOverlap(af.bodyTokens,bf.bodyTokens),an=af.numbers,bn=bf.numbers;if(an&&bn&&an!==bn)return false;
 const pa=af.people,pb=bf.people;if(pa.size&&pb.size&&![...pa].some(p=>pb.has(p)))return false;
 if(incident){
  const sites=['guven sanayi','imes sanayi','dudullu organize','ihlamurkuyu metro','meydan avm','canpark avm','buyaka avm'],as=sites.filter(s=>ta.includes(s)),bs=sites.filter(s=>tb.includes(s)),sharedSite=as.some(s=>bs.includes(s));
  if(as.length&&bs.length&&!sharedSite)return false;
  return (title.count>=3&&title.coverage>=.72)||(sharedSite&&title.count>=1)||(ak==='balcony'&&/sanayi/.test(ta)&&/sanayi/.test(tb)&&an&&an===bn&&title.count>=1);
 }
 const qa=af.quotes,qb=bf.quotes,sharedQuote=qa.some(q=>qb.includes(q));
 const person=tokenOverlap(af.bodyPeople,bf.bodyPeople).count;
 if(ak==='award'){
  if(qa.length&&qb.length&&!sharedQuote)return false;
  if(sharedQuote&&(person||ta.includes('umraniye belediye baskani')&&tb.includes('umraniye belediye baskani')))return true;
  return person>0&&title.count>=4&&title.coverage>=.8&&body.count>=6;
 }
 if(groupWords(a.title)===groupWords(b.title)&&at.size>=3)return true;
 if(title.count>=5&&title.coverage>=.85&&body.count>=6)return true;
 // Two named participants and detailed shared context are needed for differently worded visits.
 return ak==='meeting'&&person>=2&&title.count>=2&&body.count>=8&&body.coverage>=.65;
}
function titleQuality(e){const t=String(e.title||'');return Math.min(t.length,140)/10+(e.sourceType==='Resmî kurum'?2:0)+(knownPeople(groupWords(t)).size?2:0)-(/[?]|\.\.\.|…/.test(t)?3:0)-(t===t.toLocaleUpperCase('tr-TR')?2:0)-(/sok|flas|korku dolu/.test(groupWords(t))?2:0)}
function order(a,b){const av=Date.parse(a.publishedAt),bv=Date.parse(b.publishedAt);return Number.isFinite(av)&&Number.isFinite(bv)?av-bv||String(a.id).localeCompare(String(b.id)):Number.isFinite(av)?-1:Number.isFinite(bv)?1:Date.parse(a.collectedAt||0)-Date.parse(b.collectedAt||0)||String(a.id).localeCompare(String(b.id))}
function newest(a,b){const av=Date.parse(a.publishedAt),bv=Date.parse(b.publishedAt);return Number.isFinite(av)&&Number.isFinite(bv)?bv-av||String(a.id).localeCompare(String(b.id)):Number.isFinite(av)?-1:Number.isFinite(bv)?1:Date.parse(b.collectedAt||0)-Date.parse(a.collectedAt||0)}
function* groupingSteps(events,{groupSimilar=true,splitEventIds=[]}={}){
 const groups=[],blocked=new Set(splitEventIds),cache=new WeakMap(),index=new Map();
 const root=g=>g.mergedInto?root(g.mergedInto):g;
 const relMemo=new Map(),stats={events:0,checks:0,cands:0,maxCand:0};
 const rel=(a,b)=>{const key=String(a.id)<String(b.id)?a.id+'|'+b.id:b.id+'|'+a.id;if(relMemo.has(key))return relMemo.get(key);stats.checks++;const value=eventRelation(a,b);if(relMemo.size>200000)relMemo.clear();relMemo.set(key,value);return value;};
 for(const event of [...events].sort(order)){
  stats.events++;
  const aliases=[...new Set([event.id,...(event.relatedIds||[])])],locked=aliases.some(id=>blocked.has(id)),feature=eventFeatures(event,cache),candidates=new Set();
  if(groupSimilar&&!locked)for(const key of candidateKeys(event,feature,true))for(const g of index.get(key)||[])candidates.add(root(g));
  stats.cands+=candidates.size;if(candidates.size>stats.maxCand)stats.maxCand=candidates.size;
  const compatible=g=>!g.locked&&g.members.every(member=>rel(member,event)!==false)&&g.members.some(member=>sameEvent(member,event,cache));
  const matches=[...candidates].sort((a,b)=>a.position-b.position).filter(compatible);
  let target=matches[0];
  if(target)for(const other of matches.slice(1))if(target.members.every(a=>other.members.every(b=>rel(a,b)!==false))){target.members.push(...other.members);target.aliases.push(...other.aliases);other.mergedInto=target;}
  if(target)target.members.sort(order);
  if(target){target.members.push(event);target.aliases.push(...aliases)}else{target={members:[event],aliases,locked,position:groups.length};groups.push(target)}
  if(groupSimilar&&!locked)for(const key of candidateKeys(event,feature)){if(!index.has(key))index.set(key,new Set());index.get(key).add(target)}
  yield;
 }
 if(stats.events>300)console.log(JSON.stringify({event:'grouping_stats',...stats}));
 return groups.filter(g=>!g.mergedInto).map(g=>{
  const first=g.members[0],lead=[...g.members].sort((a,b)=>titleQuality(b)-titleQuality(a)||order(a,b))[0],sources=new Map();
  for(const member of g.members)for(const p of publications(member)){const key=publicationKey(p),old=sources.get(key);if(!old||(p.description||'').length>(old.description||'').length)sources.set(key,p)}
  const rows=[...sources.values()].sort((a,b)=>Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0)),publishers=new Map();for(const row of rows){const key=publisherKey(row);if(key&&!publishers.has(key))publishers.set(key,row.sourceName||lead.sourceName||'Yayıncı')}
  const dated=g.members.filter(e=>Number.isFinite(Date.parse(e.publishedAt))).sort(order),last=dated.at(-1)||first,description=[...g.members].sort((a,b)=>(b.description||'').length-(a.description||'').length)[0].description||'';
  const classification=[...g.members].filter(e=>e.nationalCategory&&eventKind(e)!=='general').sort((a,b)=>titleQuality(b)-titleQuality(a)||order(b,a))[0]||lead;
  const grouped=g.members.length>1||rows.length>1,review=g.members.find(e=>e.priority==='review'),placed=g.members.find(e=>concreteLocation(e.scope==='national'?e.nationalLocation:e.neighborhood)),topics=[...new Set(g.members.flatMap(e=>e.topics||[e.topic]).filter(Boolean))],topic=topics.find(t=>t!=='Genel gündem')||first.topic;
  return {...first,nationalCategory:classification.nationalCategory||first.nationalCategory,nationalReason:classification.nationalReason||first.nationalReason,title:lead.title,sourceName:lead.sourceName,sourceType:lead.sourceType,description,topic,topics,neighborhood:placed?.neighborhood||first.neighborhood,nationalLocation:placed?.nationalLocation||first.nationalLocation,locationBasis:placed?.locationBasis||first.locationBasis,priority:review?'review':first.priority,priorityReason:review?.priorityReason||first.priorityReason,matchedKeywords:[...new Set(g.members.flatMap(e=>e.matchedKeywords||[]))],publishedAt:last.publishedAt,firstPublishedAt:dated[0]?.firstPublishedAt||dated[0]?.publishedAt||null,lastPublishedAt:last.publishedAt,relatedIds:[...new Set(g.aliases)],sources:rows,publicationCount:rows.length,publisherCount:publishers.size,publisherNames:[...publishers.values()],groupingReason:grouped?'Yayın tarihi, olay türü, kişi/yer ve başlık benzerliğine göre otomatik birleştirildi; bağımsız teyit değildir.':null};
 }).sort(newest);
}

export function groupEventRecords(events,options={}){const iterator=groupingSteps(events,options);let result;do{result=iterator.next();}while(!result.done);return result.value;}
export async function groupEventRecordsAsync(events,options={}){const iterator=groupingSteps(events,options);let result,count=0;while(!(result=iterator.next()).done){if(++count%4===0)await new Promise(resolve=>typeof setImmediate==='function'?setImmediate(resolve):setTimeout(resolve,0));}return result.value;}
