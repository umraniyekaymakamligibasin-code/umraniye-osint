import {analyzeGeoText} from './geo-dictionary.mjs';
// DENEME social monitoring: local evidence is required independently of topic or author.
const fold=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ı/g,'i');
export const SOCIAL_HANDLES=['tc_umraniye','yukselcelikmia'];
export const SOCIAL_SEARCH_TERMS=['Ümraniye'];
export function socialScope(title,description=''){
 if(analyzeGeoText(title+' '+description).localCandidate)return true;
 const text=fold(title+' '+description);
 return /(?<![\p{L}\p{N}_@])(?:umraniye|dudullu)(?:de|da|den|dan|ye|ya|nin|nun|li)?(?![\p{L}\p{N}_])/u.test(text)||/(?<![\p{L}\p{N}_])عمرانية(?![\p{L}\p{N}_])/u.test(text);
}
// No static national dictionary fallback when the category record is missing or invalid.
export function socialGroups(){return []}
const falseEmergency=new Set(['Yüksel Çelik','Kaymakam Yüksel Çelik','Kaymakamımız Yüksel Çelik','Yuksel Celik','District Governor Yuksel Celik','Parseller','Ümraniye Parseller','Parseller Mahallesi','Ümraniye Parseller Mahallesi','kentsel dönüşüm'].map(fold));
const emergencies=new Set(['balkon çökmesi','balkon çöktü','bina çöktü','enkaz','acil durum','çatı uçtu','toprak kayması'].map(fold));
export function categoryGroups(record){
 if(!record||record.scope!=='umraniye_only'||record.nationalNewsEnabled!==false||record.requiresLocalContext!==true||!record.groups||Array.isArray(record.groups))return [];
 const entries=Object.entries(record.groups);if(entries.length>30)return [];
 const groups=[];
 for(const [id,g] of entries){
  if(!g||typeof g.name!=='string'||!/^P[1-4]$/.test(g.priority)||!Array.isArray(g.keywords)||g.keywords.length>1000||g.keywords.some(t=>typeof t!=='string'||!t.trim()||t.length>80||/[\r\n\x00]/.test(t)))return [];
  groups.push({id,name:g.name,priority:g.priority,enabled:g.enabled!==false,terms:[...new Set(g.keywords.map(t=>t.trim()))]});
 }
 const emergency=groups.find(g=>g.id==='afet_acil');
 if(emergency){
  // Correct earlier substring matching: 'sel' in 'Yüksel'/'Parseller' is not flooding.
  const removed=emergency.terms.filter(t=>falseEmergency.has(fold(t)));
  emergency.terms=emergency.terms.filter(t=>!falseEmergency.has(fold(t)));
  for(const term of removed)if(!groups.some(g=>g!==emergency&&g.terms.includes(term)))groups.find(g=>g.id==='diger_yerel')?.terms.push(term);
  const other=groups.find(g=>g.id==='diger_yerel');
  if(other){const moved=other.terms.filter(t=>emergencies.has(fold(t)));other.terms=other.terms.filter(t=>!emergencies.has(fold(t)));emergency.terms=[...new Set([...emergency.terms,...moved])];}
 }
 return groups.sort((a,b)=>a.priority.localeCompare(b.priority));
}
function matches(text,term){
 const escaped=fold(term).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return new RegExp('(?<![\\p{L}\\p{N}_])'+escaped+'(?![\\p{L}\\p{N}_])','u').test(text);
}
export function categoryMatches(title,description,groups){
 if(!socialScope(title,description))return [];
 const text=fold(title+' '+description);
 return groups.filter(g=>g.enabled&&g.terms.some(t=>matches(text,t))).map(({id,name,priority})=>({id,name,priority}));
}
