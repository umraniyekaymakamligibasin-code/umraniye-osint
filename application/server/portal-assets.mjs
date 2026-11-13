import {readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
export function createAssetResponder(assets,directory) {
 const cache=new Map();
 return async request=>{
  const path=new URL(request.url).pathname;if(!assets.has(path))return null;
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
  let promise=cache.get(path);
  if(!promise){
   const [name,type]=assets.get(path);
   promise=(async()=>{const bytes=await readFile(new URL(name,directory));if(bytes.length>2000000)throw Error('asset_too_large');return {bytes,type,etag:'W/"'+createHash('sha256').update(bytes).digest('hex').slice(0,24)+'"',compressed:/javascript|css/.test(type)?gzipSync(bytes,{level:6}):null};})();
   cache.set(path,promise);promise.catch(()=>{if(cache.get(path)===promise)cache.delete(path);});
  }
  const asset=await promise,encoding=request.headers.get('Accept-Encoding')||'';
  const gzip=asset.compressed&&encoding.split(',').some(v=>/^\s*gzip\s*(?:;|$)/i.test(v)&&!/(?:^|;)\s*q\s*=\s*0(?:\.0*)?\s*(?:;|$)/i.test(v));
  const headers={'Content-Type':asset.type,'Cache-Control':'private,max-age=300',ETag:asset.etag,Vary:'Accept-Encoding','X-Content-Type-Options':'nosniff',...(gzip?{'Content-Encoding':'gzip'}:{})};
  if((request.headers.get('If-None-Match')||'').split(',').map(x=>x.trim()).includes(asset.etag))return new Response(null,{status:304,headers});
  return new Response(request.method==='HEAD'?null:gzip?asset.compressed:asset.bytes,{headers});
 };
}
