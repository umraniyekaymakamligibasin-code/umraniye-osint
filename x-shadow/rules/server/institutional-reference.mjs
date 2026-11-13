import{createHash}from 'node:crypto';
let revision=0,targets=[{id:'x-tc-umraniye',provider:'x',handle:'tc_umraniye',label:'Ümraniye Kaymakamlığı',aliases:['Ümraniye Kaymakamlığı']},{id:'x-yuksel-celik',provider:'x',handle:'yukselcelikmia',label:'Yüksel Çelik',aliases:['Yüksel Çelik','Ümraniye Kaymakamı']}];const cache=new Map();
const fold=s=>String(s||'').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
const escaped=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function setInstitutionalTargets(rows,version){targets=rows.filter(t=>t.institutional&&t.enabled!==false&&!t.removedAt).map(t=>({...t,aliases:t.aliases??(t.provider==='x'&&t.handle==='tc_umraniye'?['Ümraniye Kaymakamlığı']:t.provider==='x'&&t.handle==='yukselcelikmia'?['Yüksel Çelik','Ümraniye Kaymakamı']:[])}));if(revision!==version){revision=version;cache.clear();}}
export function institutionalReference(e){
 try{const u=new URL(e.url),host=u.hostname.replace(/^(?:www\.|m\.)/,''),provider=host==='x.com'||host==='twitter.com'?'x':host==='facebook.com'?'facebook':host==='instagram.com'?'instagram':null;
  if(u.protocol!=='https:'||!provider||u.username||u.password||u.port)return null;
  if(provider==='x'&&!/^\/[A-Za-z0-9_]+\/status\/\d+\/?$/.test(u.pathname))return null;
  if(provider==='facebook'&&!/(?:\/(?:posts|reel|videos)\/[^/]+|\/(?:permalink|story)\.php)/.test(u.pathname))return null;
  if(provider==='instagram'&&!/^\/(p|reel)\/[^/]+\/?$/.test(u.pathname))return null;
  const text=String(e.fullText||e.description||e.title||''),digest=createHash('sha256').update(provider+'|'+u.href+'|'+text+'|'+String(e.replyToHandle||'')+'|'+String(e.quotedStatusUrl||'')+'|'+String(e.authorHandle||e.sourceHandle||e.sourceName||'')+'|'+revision).digest('hex');if(cache.has(digest))return cache.get(digest);
  const author=u.pathname.split('/')[1].toLowerCase(),t=fold(text),details=[];
  for(const target of targets.filter(x=>x.provider===provider)){
   const handle=String(target.handle||'').toLowerCase();if(!handle)continue;let relation=null,evidence=null;
   if((provider==='x'||provider==='facebook')&&author===handle||[e.authorHandle,e.sourceHandle].some(v=>String(v||'').replace(/^@/,'').toLowerCase()===handle)||provider==='instagram'&&String(e.sourceName||'').trim().match(/^@?([A-Za-z0-9_.]{1,30})(?:\s*·\s*Instagram)?$/i)?.[1]?.toLowerCase()===handle||provider==='facebook'&&String(e.sourcePageUrl||'').toLowerCase().replace(/\/$/,'')==='https://www.facebook.com/'+handle){relation='own';evidence='source_url_author';}
   else if(e.replyToHandle&&String(e.replyToHandle).toLowerCase()===handle){relation='reply';evidence='stored_reply_metadata';}
   else if(e.quotedStatusUrl&&new RegExp('^https://(?:www\\.)?(?:x|twitter)\\.com/'+escaped(handle)+'/status/\\d+/?$','i').test(e.quotedStatusUrl)){relation='quote';evidence='stored_quote_metadata';}
   else if(new RegExp('(?:^|[^A-Za-z0-9_])@'+escaped(handle)+'(?![A-Za-z0-9_])','i').test(text)){relation='mention';evidence='explicit_handle_text';}
   else if(new RegExp('(?<![A-Za-z0-9_])'+escaped(handle)+'(?![A-Za-z0-9_])','i').test(text)){relation='plain';evidence='exact_handle_text';}
   else if(/\bumraniye\b/.test(t)&&/kaymakam|belediye|kurum/.test(t)&&(target.aliases||[]).some(a=>fold(a).length>=6&&new RegExp('(?<![a-z0-9])'+escaped(fold(a))+'(?![a-z0-9])').test(t))){relation='plain';evidence='name_with_district_and_role';}
   if(relation)details.push({id:target.id,handle,label:target.label,provider,relation,evidence});
  }
  const incoming=details.some(d=>d.relation!=='own'),result=details.length?{targets:[...new Set(details.map(d=>d.handle))],details,category:institutionalCategory(text),kind:incoming?'incoming_reference':'institutional_post',label:incoming?'Kuruma yöneltilen paylaşım · inceleme gerekli':'Kurum paylaşımı'}:null;
  if(cache.size>=5000)cache.delete(cache.keys().next().value);cache.set(digest,result);return result;
 }catch{return null;}
}
export function institutionalCategory(text){const t=fold(text);if(/yangin|patlama|silahli|gocuk|acil yardim|su baskini/.test(t))return{code:'ACIL_OLAY',label:'ACİL OLAY',urgentReview:true};if(/iddia|rusvet|usulsuz|yolsuz|ihmal/.test(t))return{code:'KURUMSAL_IDDIA',label:'KURUMSAL İDDİA',urgentReview:true};if(/tesekkur|sag olun|minnet/.test(t))return{code:'TESEKKUR',label:'TEŞEKKÜR',urgentReview:false};if(/bilgi|ne zaman|nasil|basvuru|ogrenmek/.test(t))return{code:'BILGI_TALEBI',label:'BİLGİ TALEBİ',urgentReview:false};if(/sikayet|magdur|sorun|cozum|yardim bek|yapilmiyor|kesinti|cop|aydinlatma/.test(t))return{code:'VATANDAS_SIKAYETI',label:'VATANDAŞ ŞİKÂYETİ',urgentReview:false};return{code:'GENEL_BAHSETME',label:'GENEL BAHSETME',urgentReview:false};}
