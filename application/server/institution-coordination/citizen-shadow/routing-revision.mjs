import{createHash}from'node:crypto';
const transient=new Set(['lastSeenAt','collectedAt','lastFetchedAt','fetchedAt']);
function sorted(value,omit=false){if(Array.isArray(value))return value.map(v=>sorted(v,omit));if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>!omit||!transient.has(k)).map(k=>[k,sorted(value[k],k==='sources')]));return value;}
// Omit only known observational timestamps, preserving all policy/content fields.
export function routingRevision(event){return createHash('sha256').update(JSON.stringify(sorted(event,true))).digest('hex');}
