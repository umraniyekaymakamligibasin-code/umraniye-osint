import {groupEventRecordsAsync} from '../src/grouping.js';
import {newsworthiness} from '../src/newsworthiness.js';
import {compareRecordsNewest} from '../src/retention.js';
export function recordPlatforms(e) {
  const find = r => {
    if (['x','facebook','instagram'].includes(r.platform || r.provider)) return r.platform || r.provider;
    try {const h=new URL(r.url).hostname.replace(/^(www|m)\./,'');return ['x.com','twitter.com'].includes(h)?'x':h==='facebook.com'?'facebook':h==='instagram.com'?'instagram':'news';} catch {return null;}
  };
  return [...new Set([e,...(e.sources||[])].map(find).filter(Boolean))];
}
export async function groupedSocialRecords(records, settings={}) {
  const visible=records.filter(e=>!newsworthiness(e).exclude);
  const grouped=await groupEventRecordsAsync(visible,settings);
  const originals=new Map(visible.map(e=>[e.id,e]));
  return grouped.map(e=>{
    const members=[e,...(e.relatedIds||[]).map(id=>originals.get(id)).filter(Boolean)];
    const fullText=members.map(r=>String(r.fullText||r.description||r.text||'')).sort((a,b)=>b.length-a.length)[0];
    const times=members.map(r=>r.firstSeenAt||r.collectedAt).filter(v=>v&&Number.isFinite(Date.parse(v))).sort((a,b)=>Date.parse(a)-Date.parse(b));
    return {...e,fullText,firstSeenAt:times[0]||e.firstSeenAt,stream:'social',platforms:recordPlatforms(e)};
  }).sort(compareRecordsNewest);
}
