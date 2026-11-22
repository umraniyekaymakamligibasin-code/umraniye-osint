// Shared event identity for news, social posts and the existing Telegram outbox.
const fold=s=>String(s||'').replace(/([\p{Ll}0-9])([\p{Lu}])/gu,'$1 $2').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[’'][a-z]+\b/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const stop=new Set('umraniye istanbul haber haberi haberler dakika gundem son yeni oldu olan olarak etti eden icin sonra once yine kadar ile bir daha buyuk baskan baskani belediye belediyesi acikladi aciklama belediyesinin sehit polis memuru verildi hakkinda facebook instagram twitter paylasim devamini goster daha fazlasini oku'.split(' '));
function stem(w){for(const root of ['ceza','katil','sampiyon','madalya','olimpiyat','sondur','yangin','balkon','tutuk','gozalti'])if(w.startsWith(root))return root;if(/^yaral/.test(w))return 'yarali';if(/^coktu|^cokme|^coken/.test(w))return 'cokme';return w.length>9?w.slice(0,9):w;}
function tokens(value){return [...new Set(fold(value).split(' ').filter(w=>w.length>3&&!stop.has(w)&&!/^\d+$/.test(w)).map(stem))];}
const title=e=>String(e.viewTitle||e.title||'');
const body=e=>String(e.fullText||e.viewText||e.description||'');
export function eventTerms(e){return tokens(title(e));}
function people(e){const ignored=new Set([...stop,'agirlastirilmis','muebbet','yargitay','karari','kaymakamligi','anadolu','turkiye','ulusal','yerel','mahallesi','caddesi','mudurlugu']);return [...title(e).matchAll(/(?=(?:^|[^\p{L}])([A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,})\s+([A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,}))/gu)].filter(m=>!ignored.has(fold(m[1]))&&!ignored.has(fold(m[2]))).map(m=>fold(m[1]+' '+m[2]));}
function phase(e){const t=fold(title(e));if(/cenaze|topraga|defned|son yolculuk/.test(t))return 'funeral';if(/anma|anildi|yil donumu/.test(t))return 'memorial';if(/yargitay|ceza.{0,30}onan|muebbet.{0,20}onan|ceza.{0,25}kesinles/.test(t))return 'appeal';if(/iddianame/.test(t))return 'indictment';if(/tutuklan|tutuklandi/.test(t))return 'arrest';if(/gozalti/.test(t))return 'detention';if(/mahkeme|dava|muebbet|ceza.{0,20}(carptir|veril)/.test(t))return 'trial';return 'event';}

function overlap(a,b){const s=new Set(b);return a.filter(t=>s.has(t)).length;}
function place(e){const t=fold(e.neighborhood);return ['', 'ilce geneli','turkiye geneli','mahalle belirlenmedi','belirsiz','belirtilmemis','mahalle belirtilmemis','konum belirtilmemis','konum bilinmiyor'].includes(t)?'':t;}
function sites(e){
 const text=fold(title(e)+' '+body(e)),out=new Map(),generic=new Set(['umraniye','istanbul','ilcesi','ilcesinde','ilcesindeki','bulunan','gelen','uzerindeki']);
 for(const m of text.matchAll(/\b([a-z]{3,}(?: [a-z]{3,}){0,2}) (mahallesi|mahallesinde|mahallesindeki|caddesi|caddesinde|caddesindeki|sokagi|sokaginda|bulvari|bulvarinda|ilcesi|ilcesinde|ilcesine|ilcesinden|koyu|koyunde|koyune|koyunun)\b/g)){
  const type=m[2].startsWith('mahalle')?'neighborhood':m[2].startsWith('cadde')?'street':m[2].startsWith('sok')?'road':m[2].startsWith('ilce')?'county':m[2].startsWith('koy')?'village':'boulevard',name=(type==='county'||type==='village'?m[1].split(' ').slice(-1):m[1].split(' ').filter(w=>!generic.has(w)).slice(-2)).join(' ');
  if(name){if(!out.has(type))out.set(type,new Set());out.get(type).add(name);}
 }
 // Named public venues are concrete event anchors too; a generic district name is not.
 const venueGeneric=new Set([...generic,'belediyesi','belediye','duzenlenen','bulunan','yeni','acilan','ilcemizde','ilcemizdeki','bir','bu']);
 for(const m of text.matchAll(/\b([a-z]{3,}(?: [a-z]{3,}){0,3}) (kultur merkezi|genclik merkezi|spor salonu|kutuphanesi|hastanesi|ilkokulu|ortaokulu|lisesi)\b/g)){
  const name=m[1].split(' ').filter(w=>!venueGeneric.has(w)).slice(-2).join(' ');
  if(name){const type='venue:'+m[2];if(!out.has(type))out.set(type,new Set());out.get(type).add(name);}
 }
 return out;
}
const compatibleName=(a,b)=>a===b||a.endsWith(' '+b)||b.endsWith(' '+a);
// Extracted site names may carry a preceding non-place word (punctuation is folded away); for conflicts compare the place word itself.
const siteQualifier=w=>['yukari','asagi','yeni','eski','kuzey','guney','dogu','bati','buyuk','kucuk'].includes(w)?w:'';
const sameSiteWord=(a,b)=>{if(compatibleName(a,b))return true;const x=a.split(' '),y=b.split(' ');return x.at(-1)===y.at(-1)&&siteQualifier(x.at(-2))===siteQualifier(y.at(-2));};
function sharedSites(a,b){for(const [type,aa]of a)for(const x of aa)for(const y of b.get(type)||[])if(compatibleName(x,y))return true;return false;}
function dateAnchors(e){return [...fold(title(e)+' '+body(e)).matchAll(/\b(\d{1,2}) (ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)(?: (20\d{2}))?\b/g)].map(m=>[m[1],m[2],m[3]||'']);}
function incidentTimes(e){const text=title(e)+' '+body(e).slice(0,1800),times=[];for(const m of text.matchAll(/\bsaat(?:lerinde)?\s*(\d{1,2})[.:](\d{2})|\b(\d{1,2})[.:](\d{2})\s*(?:sıralarında|siralarinda)/giu)){const h=Number(m[1]||m[3]),minute=Number(m[2]||m[4]);if(h<24&&minute<60)times.push(h*60+minute);}return [...new Set(times)];}
function plate(e){return [...fold(title(e)+' '+body(e)).matchAll(/\b\d{2} [a-z]{1,3} \d{2,4}\b/g)].map(m=>m[0]);}
function conflict(a,b){
 const at=Date.parse(a.publishedAt),bt=Date.parse(b.publishedAt);if(Number.isFinite(at)&&Number.isFinite(bt)&&Math.abs(at-bt)>36*3600000)return true;
 if(a.scope&&b.scope&&a.scope!==b.scope)return true;
 if(eventEvidence(a).phase!==eventEvidence(b).phase)return true;
 const ap=place(a),bp=place(b);if(ap&&bp&&!compatibleName(ap,bp))return true;
 const aa=eventEvidence(a).locations,bb=eventEvidence(b).locations;for(const [type,values]of aa){const other=bb.get(type);if(type==='village'&&(eventEvidence(a).multiple||eventEvidence(b).multiple))continue;if(other?.size&&![...values].some(x=>[...other].some(y=>sameSiteWord(x,y))))return true;}
 const A=eventEvidence(a),B=eventEvidence(b);if(A.cities.size&&B.cities.size&&![...A.cities].some(x=>B.cities.has(x)))return true;
 const ak=A.kind,bk=B.kind;if(ak!==bk&&ak!=='general'&&bk!=='general')return true;
 if(['fire','traffic','violence','collapse','explosion'].includes(A.kind)&&A.times.length&&B.times.length&&!A.times.some(a=>B.times.some(b=>Math.min(Math.abs(a-b),1440-Math.abs(a-b))<=60)))return true;
 const pa=A.people,pb=B.people;if(ak==='judicial'&&bk==='judicial'&&pa.length&&pb.length&&!pa.some(p=>pb.includes(p)))return true;
 const ad=A.dates,bd=B.dates;if(ad.length&&bd.length&&!ad.some(x=>bd.some(y=>x[0]===y[0]&&x[1]===y[1]&&(!x[2]||!y[2]||x[2]===y[2]))))return true;
 const av=A.plates,bv=B.plates;if(av.length&&bv.length&&!av.some(x=>bv.includes(x)))return true;
 return false;
}
export function eventRelation(a,b){
 if(conflict(a,b))return false;
 const at=Date.parse(a.publishedAt),bt=Date.parse(b.publishedAt);if(!Number.isFinite(at)||!Number.isFinite(bt))return null;
 if(spatialIdentity(a,b))return true;
 const aa=eventTerms(a),bb=eventTerms(b),common=overlap(aa,bb),coverage=common/Math.max(1,Math.min(aa.length,bb.length));
 const ba=eventEvidence(a).bodyTokens,bbt=eventEvidence(b).bodyTokens,sharedBody=overlap(ba,bbt),bodyCoverage=sharedBody/Math.max(1,Math.min(ba.length,bbt.length));
 const exact=fold(title(a))===fold(title(b));
 if(exact&&aa.length>=3)return true;
 if(exact&&aa.length>=2&&sharedBody>=4&&bodyCoverage>=.45)return true;
 if(common>=4&&coverage>=.67&&sharedBody>=5)return true;
 if(eventKind(a)==='judicial'&&eventKind(b)==='judicial'&&common>=2&&coverage>=.45&&sharedBody>=8)return true;
 const sharedSite=sharedSites(eventEvidence(a).locations,eventEvidence(b).locations);
 if(sharedSite&&common>=1&&sharedBody>=8&&bodyCoverage>=.8)return true;
 if(sharedSite&&common>=2&&coverage>=.5&&sharedBody>=5)return true;
 if(sharedBody>=12&&bodyCoverage>=.75&&common>=2&&(sharedSite||bodyCoverage>=.88))return true;
 return null;
}

const eventCities=["adana", "adiyaman", "afyonkarahisar", "agri", "amasya", "ankara", "antalya", "artvin", "aydin", "balikesir", "bilecik", "bingol", "bitlis", "bolu", "burdur", "bursa", "canakkale", "cankiri", "corum", "denizli", "diyarbakir", "edirne", "elazig", "erzincan", "erzurum", "eskisehir", "gaziantep", "giresun", "gumushane", "hakkari", "hatay", "isparta", "mersin", "istanbul", "izmir", "kars", "kastamonu", "kayseri", "kirklareli", "kirsehir", "kocaeli", "konya", "kutahya", "malatya", "manisa", "kahramanmaras", "mardin", "mugla", "mus", "nevsehir", "nigde", "ordu", "rize", "sakarya", "samsun", "siirt", "sinop", "sivas", "tekirdag", "tokat", "trabzon", "tunceli", "sanliurfa", "usak", "van", "yozgat", "zonguldak", "aksaray", "bayburt", "karaman", "kirikkale", "batman", "sirnak", "bartin", "ardahan", "igdir", "yalova", "karabuk", "kilis", "osmaniye", "duzce"];
const aliases=new Map([['afyon','afyonkarahisar'],['urfa','sanliurfa'],['antep','gaziantep'],['maras','kahramanmaras']]);
const evidenceCache=new WeakMap();
function canonicalPlace(value){return String(value||'').split(' ').map(w=>aliases.get(w)||w).join(' ');}
function incidentText(e){return fold(title(e)+' '+body(e).split(/[iİIı]lg[iİIı]l[iİIı] haberler|benzer haberler|d[iİIı][gğ]er haberler|related news|son dak[iİIı]ka haberler/i)[0].slice(0,1800));}
export function eventKind(e){
 const headline=fold(title(e)),text=incidentText(e);
 function classify(t){
  if(/\byangin\w*\b|\balev\w*\b/.test(t))return 'fire';
  if(/\bkaza(?:si|sinda|ya)?\b|carpis|carpti|devrildi/.test(t))return 'traffic';
  if(/coktu|gocuk|cokme|coken/.test(t))return 'collapse';
  if(/patlama|infilak/.test(t))return 'explosion';
  if(/silahli|silahla|silah ses|kursun|ates acti|cinayet|oldurul|oldurduk|katliam/.test(t))return 'violence';
  if(/madalya|sampiyon|olimpiyat/.test(t))return 'sport';
  return 'general';
 }
 if(phase(e)!=='event'&&/yargitay|muebbet|mahkeme|iddianame|katil|cinayet|ceza|dava/.test(headline))return 'judicial';
 const direct=classify(headline);return direct==='general'?classify(text):direct;
}
export function eventEvidence(e){
 const headline=title(e),article=body(e),location=e.nationalLocation||'',old=evidenceCache.get(e);if(old&&old.headline===headline&&old.article===article&&old.location===location)return old.value;
 const text=canonicalPlace(incidentText(e)),locations=sites(e),cities=new Set();
 for(const city of eventCities)if(new RegExp('(?:^| )'+city+'(?:da|de|dan|den|nin|nun)?(?: |$)').test(text+' '+canonicalPlace(fold(e.nationalLocation))))cities.add(city);
 const counties=new Set(locations.get('county')||[]),villages=new Set(locations.get('village')||[]);
 const multiple=/\b(?:iki|uc|dort|bes|[2-9])\s+(?:ayri|farkli)\s+(?:nokta|yer|koy|bolge)|pes pese|birden fazla (?:nokta|koy|yer)/.test(text);
 const fatalities=/\bolu\b|olum|hayatini kaybet|yasamini yitir|cansiz beden|ceset|oldurul|katliam/.test(text);
 const value={text,cities,counties,villages,multiple,fatalities,locations,phase:phase(e),people:people(e),dates:dateAnchors(e),times:incidentTimes(e),plates:plate(e),kind:eventKind(e),bodyTokens:tokens(article),titleTokens:tokens(headline)};
 evidenceCache.set(e,{headline,article,location,value});return value;
}
export function eventCandidateTerms(e){
 const f=eventEvidence(e),out=new Set(eventTerms(e));
 for(const c of f.cities)out.add('city:'+c);
 for(const [type,values]of f.locations)for(const value of values)out.add('site:'+type+':'+canonicalPlace(value));
 for(const term of f.bodyTokens.filter(t=>t.length>=5).slice(0,16))out.add('body:'+term);
 return [...out];
}
function spatialIdentity(a,b){
 const A=eventEvidence(a),B=eventEvidence(b),sameCity=[...A.cities].some(x=>B.cities.has(x));
 const sameCounty=[...A.counties].some(x=>[...B.counties].some(y=>compatibleName(x,y)));
 const sameVillage=[...A.villages].some(x=>[...B.villages].some(y=>compatibleName(x,y)));
 const sharedBody=overlap(A.bodyTokens,B.bodyTokens),coverage=sharedBody/Math.max(1,Math.min(A.bodyTokens.length,B.bodyTokens.length));
 const specificSite=sharedSites(A.locations,B.locations);
 const compatibleKind=A.kind===B.kind||A.kind==='general'||B.kind==='general';
 if(!compatibleKind)return false;
 if((sameVillage||specificSite&&sameCounty)&&sharedBody>=4&&(A.kind!=='general'||A.fatalities&&B.fatalities))return true;
 if(sameCity&&sameCounty&&(A.multiple||B.multiple)&&A.fatalities&&B.fatalities&&sharedBody>=5)return true;
 if(sameCity&&sameCounty&&sharedBody>=8&&coverage>=.55&&A.kind!=='general'&&A.kind===B.kind)return true;
 if(specificSite&&sharedBody>=10&&coverage>=.7)return true;
 return false;
}
