export const fold=s=>String(s??'').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[’']/g,' ').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
const equivalents=[
 [/\buygun degil\b/g,'uygunsuz'],[/\bguvenli degil\b/g,'guvensiz'],[/\bnet degil\b/g,'belirsiz'],[/\bguncel degil\b/g,'guncelligini yitirmis'],[/\bait degil\b/g,'yanlis eslenmis'],[/\berisilebilir degil\b/g,'erisilemiyor'],
 [/\bcalismamaktadir\b/g,'calismiyor'],[/\bcalismamakta\b/g,'calismiyor'],[/\bcalismamasi\b/g,'calismiyor'],
 [/\barizalidir\b/g,'bozuk'],[/\barizali\b/g,'bozuk'],[/\bbozulmus\b/g,'bozuk'],
 [/\belektrikler kesik\b/g,'elektrik kesintisi var'],[/\bsular kesik\b/g,'su kesintisi var'],
 [/\bsu yok\b/g,'su kesintisi var'],[/\belektrik yok\b/g,'elektrik kesintisi var'],
 [/\bmevcut\b/g,'var'],[/\bkirilmis\b/g,'kirik'],[/\byikik\b/g,'yikilmis'],
];
export function normalize(value){let s=fold(value);for(const [pattern,to]of equivalents)s=s.replace(pattern,to);return s.replace(/\b(bozuk|calismiyor)\b/g,'arizali');}
export function clauseState(value){const text=normalize(value);if(/\b(tatbikat|temsili|senaryo|film cekimi|egitim amacli)\b/.test(text))return 'simulation';if(/\b(gecen yil|gecen ay|eskiden|arsiv goruntusu|yillar once)\b/.test(text))return 'historical';const resolved=[...text.matchAll(/\b(giderildi|duzeltildi|tamir edildi|cozuldu|sona erdi)\b/g)].at(-1);if(resolved&&!/\b(hala|halen|tekrar|yeniden|ancak)\b/.test(text.slice(resolved.index+resolved[0].length)))return 'resolved';if(/\b(degil|olmadi|yasanmadi|yokmus|iddia dogru degil)\b/.test(text))return 'negated';return 'active';}
const tokenCache=new Map(),patternCache=new Map();
export function phrasesMatch(value,phrase){
 let tokens=tokenCache.get(value);if(!tokens){tokens=normalize(value).split(' ');if(tokenCache.size>=64)tokenCache.delete(tokenCache.keys().next().value);tokenCache.set(value,tokens);}
 let pattern=patternCache.get(phrase);if(!pattern){pattern=normalize(phrase).split(' ').map(word=>({word,re:new RegExp('^'+word+'(?:da|de|dan|den|nda|nde|nin|nun|lar|ler|lari|leri|dir|tir)$')}));if(patternCache.size>=8192)patternCache.delete(patternCache.keys().next().value);patternCache.set(phrase,pattern);}
 return tokens.some((_,i)=>pattern.every(({word,re},j)=>tokens[i+j]===word||re.test(tokens[i+j]||'')));
}
