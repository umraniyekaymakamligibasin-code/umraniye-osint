const tabs=document.getElementById('tabs'),list=document.getElementById('items'),status=document.getElementById('status');let tab='active';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=u=>{try{let x=new URL(u,location.origin);return ['https:','http:'].includes(x.protocol)?x.href:null}catch{return null}};
const label={active:'Görünür haberler',filtered:'Otomatik elenenler',queue:'Bildirim kuyruğu',removed:'Kaldırılanlar'};
async function load(){status.textContent=label[tab]+' yükleniyor…';list.replaceChildren();
try{const r=await fetch('/api/moderation/items?bucket='+tab,{credentials:'same-origin'});if(!r.ok)throw Error('Sunucu hata kodu: '+r.status);const data=await r.json();
status.textContent=label[tab]+' · '+data.total+' kayıt'+(data.total>data.items.length?' (ilk '+data.items.length+' gösteriliyor)':'');
if(!data.items.length){list.textContent='Bu bölümde kayıt bulunmuyor.';return;}
for(const item of data.items){const el=document.createElement('article');el.className='item';
const url=safeUrl(item.url);const title=esc(item.title||'Başlık belirtilmemiş');
const summary='<div><div class="meta">'+esc(item.stream||'')+' · '+esc(item.sourceName||'')+' · '+esc(item.publishedAt||item.created_at||'')+' '+(item.status?'· '+esc(item.status):'')+'</div><h2>'+(url?'<a target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">'+title+'</a>':title)+'</h2><div class="muted">'+esc(item.description||'')+'</div></div>';
let action='';if(tab==='active')action='<button class="danger" data-action="hide">Kaldır</button>';
if(tab==='filtered')action='<button data-action="dismiss">Listeden arşivle</button>';
if(tab==='queue'&&item.status!=='sending')action='<button class="danger" data-action="suppress">Kuyruktan çıkar</button>';
if(tab==='removed')action='<button data-action="restore">Geri yükle</button>';
el.innerHTML=summary+'<div class="action">'+action+'</div>';const button=el.querySelector('[data-action]');
if(button)button.addEventListener('click',async()=>{const a=button.dataset.action;
if(!confirm(a==='restore'?'İçeriği yeniden görünür yap?':'İşlemi uygulamak istiyor musun?'))return;
let reason='';
button.disabled=true;try{const response=await fetch('/api/moderation/action',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({action:a,item,reason})});const result=await response.json();if(!response.ok)throw Error(result.error||'İşlem başarısız');await load();}catch(e){button.disabled=false;alert(e.message)}});
el.__moderationItem=item;list.append(el);
}
}catch(e){status.textContent='Kayıtlar alınamadı: '+e.message}}
tabs.addEventListener('click',e=>{const button=e.target.closest('[data-tab]');if(!button)return;tab=button.dataset.tab;for(const b of tabs.querySelectorAll('button'))b.classList.toggle('active',b===button);load()});load();
// bulk-select-feature-v2
;(()=>{
 const selected=new Map();
 let busy=false;

 const bar=document.createElement('section');
 bar.className='moderation-bulk';
 bar.setAttribute('aria-label','Toplu içerik kaldırma');

 bar.innerHTML=`
 <label>
   <input type="checkbox" id="moderation-select-all">
   Görüntülenenlerin tümünü seç
 </label>
 <strong id="moderation-bulk-count">0 seçili</strong>
 <button type="button" class="danger"
         id="moderation-bulk-hide" disabled>
   Seçilenleri kaldır
 </button>`;

 status.insertAdjacentElement('afterend',bar);

 const selectAll=bar.querySelector('#moderation-select-all');
 const count=bar.querySelector('#moderation-bulk-count');
 const hide=bar.querySelector('#moderation-bulk-hide');

 const keyOf=e=>String(e.id||'')+'|'+String(e.url||'');
 const boxes=()=>[
   ...list.querySelectorAll('input[data-moderation-check]')
 ];

 function sync(){
   bar.hidden=tab!=='active';
   count.textContent=selected.size+' seçili';

   const all=boxes();

   selectAll.disabled=busy||!all.length;
   selectAll.checked=!!all.length&&all.every(x=>x.checked);
   selectAll.indeterminate=!selectAll.checked
     &&all.some(x=>x.checked);

   hide.disabled=busy||!selected.size;
 }

 function decorate(){
   if(tab==='active'){
     for(const el of list.querySelectorAll('article.item')){
       if(el.dataset.moderationSelectable==='yes')continue;

       const item=el.__moderationItem;

       if(!item||(!item.id&&!item.url))continue;

       const key=keyOf(item);
       const label=document.createElement('label');
       label.className='moderation-check-label';

       const input=document.createElement('input');
       input.type='checkbox';
       input.dataset.moderationCheck='1';
       input.checked=selected.has(key);

       input.addEventListener('change',()=>{
         if(busy){
           input.checked=selected.has(key);
           return;
         }

         if(input.checked)selected.set(key,item);
         else selected.delete(key);

         sync();
       });

       label.append(
         input,
         document.createTextNode('Seç')
       );

       el.dataset.moderationSelectable='yes';
       el.prepend(label);
     }
   }

   sync();
 }

 const observer=new MutationObserver(changes=>{
   if(changes.some(c=>c.removedNodes.length)){
     selected.clear();
   }
   decorate();
 });

 observer.observe(list,{childList:true});

 selectAll.addEventListener('change',()=>{
   if(busy)return;

   for(const input of boxes()){
     input.checked=selectAll.checked;

     const item=input.closest('article.item')?.__moderationItem;
     if(!item)continue;

     const key=keyOf(item);

     if(input.checked)selected.set(key,item);
     else selected.delete(key);
   }

   sync();
 });

 hide.addEventListener('click',async()=>{
   if(busy||tab!=='active'||!selected.size)return;

   const items=[...selected.values()];

   if(!confirm(
     items.length+
     ' haber veya paylaşım panelden kaldırılacak. Onaylıyor musun?'
   ))return;

   busy=true;
   sync();

   let done=0;
   let error=null;

   try{
     for(const item of items){
       const response=await fetch('/api/moderation/action',{
         method:'POST',
         credentials:'same-origin',
         headers:{'Content-Type':'application/json'},
         body:JSON.stringify({
           action:'hide',
           item,
           reason:''
         })
       });

       const result=await response.json();

       if(!response.ok||!result.ok){
         throw Error(result.error||'İşlem başarısız');
       }

       done++;
       count.textContent=done+'/'+items.length+' kaldırıldı';
     }
   }catch(e){
     error=e;
   }finally{
     busy=false;
     await load();

     status.textContent=error
       ?done+' kayıt kaldırıldı; ardından hata: '+error.message
       :done+' kayıt kaldırıldı.';

     sync();
   }
 });

 decorate();
})();
