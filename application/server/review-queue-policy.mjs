import {publicationKey} from '../src/grouping.js';
import {compareRecordsNewest,retainedEvent,retentionCutoff} from '../src/retention.js';
export function reviewPublicationKey(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!['x.com','www.x.com','twitter.com','www.twitter.com','facebook.com','www.facebook.com','m.facebook.com','instagram.com','www.instagram.com'].includes(u.hostname))return null;return publicationKey({url:u.href});}catch{return null;}
}
export function manualApproval(row){return !String(row.approved_by||'').startsWith('osint-auto-');}
export function matchingApproval(rows,url){const key=reviewPublicationKey(url);if(!key)return null;const matches=rows.filter(row=>reviewPublicationKey(row.original_url)===key);return matches.find(manualApproval)||matches[0]||null;}
export function pendingReviewItems(items,approvals,cutoff=retentionCutoff()){
 const approved=new Set(approvals.filter(manualApproval).map(row=>reviewPublicationKey(row.original_url)).filter(Boolean)),unique=new Map();
 for(const item of items){
  const key=reviewPublicationKey(item.url);if(key&&approved.has(key))continue;
  const pub=item.publishedAt,hasDate=pub&&Number.isFinite(Date.parse(pub));
  if(!retainedEvent({publishedAt:hasDate?pub:item.firstSeenAt||item.collectedAt},cutoff))continue;
  const identity=key||String(item.url||item.id),old=unique.get(identity);
  if(!old||(!old.publishedAt&&item.publishedAt)||String(item.fullText||item.description||'').length>String(old.fullText||old.description||'').length)unique.set(identity,item);
 }
 return [...unique.values()].sort(compareRecordsNewest);
}
