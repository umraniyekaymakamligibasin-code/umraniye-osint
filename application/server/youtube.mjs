const xml=s=>String(s||'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function youtubeChannel(url){const u=new URL(url);const id=u.pathname.startsWith('/channel/')?u.pathname.split('/')[2]:u.pathname==='/feeds/videos.xml'?u.searchParams.get('channel_id'):null;if(u.origin!=='https://www.youtube.com'||!/^UC[A-Za-z0-9_-]{22}$/.test(id||''))throw Error('youtube_channel_invalid');return id;}
export async function youtubeFeed(url,{key,send=fetch,cache=new Map(),now=Date.now()}={}){
 if(!key)throw Error('credential_missing');
 const channel=youtubeChannel(url);
 async function get(method,params){
  const target=new URL('https://www.googleapis.com/youtube/v3/'+method);for(const [k,v]of Object.entries({...params,key}))target.searchParams.set(k,v);
  let r;try{r=await send(target.href,{redirect:'error',signal:AbortSignal.timeout(12000)});}catch{throw Error('youtube_unavailable')}
  if(!r.ok)throw Error(r.status===403||r.status===429?'quota_or_permission':'youtube_unavailable');
  const reader=r.body.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000){await reader.cancel();throw Error('youtube_size')}chunks.push(value);}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes))}catch{throw Error('youtube_invalid_response')}
 }
 let uploads=cache.get(channel);if(!uploads||uploads.expires<now){const d=await get('channels',{part:'contentDetails',id:channel}),id=d.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;if(!/^[A-Za-z0-9_-]{10,100}$/.test(id||''))throw Error('youtube_channel_unavailable');uploads={id,expires:now+6*3600000};cache.set(channel,uploads);}
 const data=await get('playlistItems',{part:'snippet,contentDetails',playlistId:uploads.id,maxResults:'25'});
 // videoPublishedAt is the video publication time; snippet.publishedAt is the playlist-add time.
 return '<rss><channel>'+((data.items||[]).slice(0,25).flatMap(item=>{const id=item.contentDetails?.videoId,date=item.contentDetails?.videoPublishedAt;if(!/^[A-Za-z0-9_-]{11}$/.test(id||'')||!date)return [];return '<item><title>'+xml(item.snippet?.title)+'</title><link>https://www.youtube.com/watch?v='+id+'</link><published>'+xml(date)+'</published><description>'+xml(String(item.snippet?.description||'').slice(0,700))+'</description></item>'})).join('')+'</channel></rss>';
}
