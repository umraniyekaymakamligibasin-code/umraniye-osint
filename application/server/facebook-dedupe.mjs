const fbFold=v=>String(v||'').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function fbURL(value){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||!['facebook.com','www.facebook.com','m.facebook.com','mbasic.facebook.com'].includes(u.hostname)||u.username||u.password||u.port)return null;return u;}catch{return null;}}
function fbIdentity(e){const own=String(e.facebookPostId||'');if(/^\d+(?:_\d+)?$/.test(own))return own.split('_').at(-1);const u=fbURL(e.url);return u?.searchParams.get('story_fbid')||u?.pathname.match(/\/(?:posts|permalink|reel|videos)\/([A-Za-z0-9_-]+)/)?.[1]||null;}
function fbAuthor(e){const named=String(e.sourceName||e.viewSource||'').match(/@([A-Za-z0-9._-]+)/)?.[1];if(named)return named.toLowerCase();const u=fbURL(e.sourcePageUrl)||fbURL(e.url);const handle=u?.pathname.match(/^\/([^/]+)\/(?:posts|videos)\//)?.[1];if(handle)return handle.toLowerCase();return fbFold(e.sourceName||e.viewSource||'');}
export function facebookRecordKeys(e){
 if(e.platform!=='facebook'&&e.provider!=='facebook')return [];
 const keys=[],identity=fbIdentity(e),u=fbURL(e.url);if(identity)keys.push('post:'+identity);
 if(u){const q=new URLSearchParams();for(const k of ['id','story_fbid','fbid','v'])if(u.searchParams.has(k))q.set(k,u.searchParams.get(k));q.sort();keys.push('url:'+u.pathname.replace(/\/+$/,'')+'?'+q);}
 const author=fbAuthor(e),text=fbFold(e.description||e.title),published=e.publishedAt;
 if(author&&text.length>=20&&typeof published==='string'&&published.includes('T')&&Number.isFinite(Date.parse(published)))keys.push('content:'+author+'|'+new Date(published).toISOString()+'|'+text);
 return keys;
}
function fbMerge(a,b){
 const early=[a.firstSeenAt||a.collectedAt,b.firstSeenAt||b.collectedAt].filter(v=>v&&Number.isFinite(Date.parse(v))).sort((x,y)=>Date.parse(x)-Date.parse(y))[0];
 const late=[a.lastSeenAt||a.collectedAt,b.lastSeenAt||b.collectedAt].filter(v=>v&&Number.isFinite(Date.parse(v))).sort((x,y)=>Date.parse(y)-Date.parse(x))[0];
 const merged={...a,firstSeenAt:early||a.firstSeenAt,collectedAt:early||a.collectedAt,lastSeenAt:late||a.lastSeenAt,duplicateRecordIds:[...new Set([...(a.duplicateRecordIds||[]),b.id,...(b.duplicateRecordIds||[])].filter(x=>x&&x!==a.id))]};
 if(String(b.description||'').length>String(a.description||'').length)merged.description=b.description;
 if(a.sources||b.sources)merged.sources=dedupeFacebookRecords([...(a.sources||[]),...(b.sources||[])]);
 return merged;
}
export function dedupeFacebookRecords(records){
 const result=[],index=new Map();for(const item of records){const keys=facebookRecordKeys(item);let found;
  for(const key of keys){const at=index.get(key);if(at===undefined)continue;const existing=result[at];if(key.startsWith('content:')){const x=fbIdentity(existing),y=fbIdentity(item);if(x&&y&&x!==y&&(/^\d+$/.test(x)&&/^\d+$/.test(y)))continue;}found=at;break;}
  if(found===undefined){found=result.length;result.push({...item});}else result[found]=fbMerge(result[found],item);
  for(const key of keys)if(!index.has(key))index.set(key,found);
 }
 return result;
}
