import{readFile}from 'node:fs/promises';
const file='/var/lib/umraniye-osint-news-share/news.json';
export async function primaryNewsShare(now=Date.now()){
 try{
  const data=JSON.parse(await readFile(file,'utf8')),age=now-Date.parse(data.exportedAt);
  if(data.schema!==1||data.role!=='news_only_bridge'||!Number.isFinite(age)||age< -60000||age>120000||!Array.isArray(data.events))return null;
  return data.events.filter(e=>e&&typeof e.url==='string'&&typeof e.title==='string');
 }catch{return null;}
}
