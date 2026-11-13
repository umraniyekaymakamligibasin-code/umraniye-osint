'use strict';
const $=id=>document.getElementById(id);
const paths={home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',news:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M7 8h10M7 12h4M7 16h4m4-4h2m-2 4h2"/>',social:'<rect x="3" y="4" width="18" height="14" rx="3"/><path d="m7 18-1 4 5-4M7 9h10M7 13h6"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6"/>',archive:'<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v13h14V8M10 12h4"/>',settings:'<path d="m9 3-1 3-3 1-2 4 2 2v3l4 3 3-1 3 1 4-3v-3l2-2-2-4-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',shield:'<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',report:'<path d="M14 2H5v20h14V7Zm0 0v6h5M8 12h8M8 16h6"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',chevron:'<path d="m6 9 6 6 6-6"/>',image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 6"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',external:'<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',list:'<path d="M8 5h13M8 12h13M8 19h13M3 5h.1M3 12h.1M3 19h.1"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',folder:'<path d="M3 6V3h6l3 3h9v15H3Z"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>'};
const icon=name=>'<i aria-hidden="true"><svg viewBox="0 0 24 24">'+(paths[name]||paths.news)+'</svg></i>';
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(n=>{n.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+(paths[n.dataset.icon]||paths.news)+'</svg>';});}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function url(v){try{const u=new URL(v,location.origin);return ['http:','https:'].includes(u.protocol)?u.href:'#';}catch{return '#';}}
const label={critical:'Kritik',important:'Önemli',normal:'Normal'},platformName={x:'X',instagram:'Instagram',facebook:'Facebook',news:'Haber'};
let detailEpoch=0;
const state={page:'home',tab:'local',platform:'all',mode:localStorage.getItem('osint-ui-view-v2')||'grid',pageNo:1,summary:null,actor:null,list:null,filters:{q:'',period:'',priority:'',source:'',start:'',end:'',type:'all'},request:0,controller:null,detail:null,lastFocus:null};
const pageInfo={home:['Ümraniye Gündemi','İlçemize ilişkin güncel haberler ve sosyal medya gelişmeleri'],news:['Haber Gündemi','Haber kaynaklarından gelen yayınlar; aynı olayın kaynakları bir arada.'],social:['Sosyal Medya','X, Instagram ve Facebook paylaşımları ayrı ve kaynaklarıyla birlikte.'],alerts:['Öncelikli Bildirimler','İlçemizdeki öncelikli olaylar ve inceleme bekleyen kayıtlar.'],archive:['Arşiv ve Raporlar','Mevcut haber ve sosyal medya kayıtlarında arayın, süzün ve raporlayın.']};
function date(v,short=false){if(!v)return 'Tarih belirtilmemiş';if(/^\d{4}-\d{2}-\d{2}$/.test(v))return new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:short?'short':'long',year:'numeric',timeZone:'Europe/Istanbul'}).format(new Date(v+'T12:00:00Z'))+' · Saat belirtilmemiş';const d=new Date(v);return Number.isFinite(+d)?new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:short?'short':'long',...(!short?{year:'numeric'}:{}),hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(d):'Tarih okunamadı';}
function badge(e){return '<span class="badge '+esc(e.priority)+'">'+esc(label[e.priority]||'Normal')+'</span>';}
function missingImage(){return '<span class="media-fallback" role="img" aria-label="Haber görseli bulunmamaktadır">'+icon('image')+'<span class="fallback-long">Haber görseli<br>bulunmamaktadır.</span><span class="fallback-short" aria-hidden="true">Görsel yok</span></span>';}
function media(e){return '<div class="story-media'+(e.imageUrl?' is-loading':' no-image')+'"'+(e.imageUrl?' aria-busy="true"':'')+'>'+(e.imageUrl?'<span class="media-loading">Görsel hazırlanıyor…</span><img src="'+esc(url(e.imageUrl))+'" alt="'+esc(e.title)+'" loading="lazy" decoding="async" width="480" height="320" referrerpolicy="no-referrer">':missingImage())+'</div>';}
function meta(e){return '<div class="metadata"><span>'+esc(e.sourceName)+'</span><span>·</span><time'+(e.publishedAt?' datetime="'+esc(e.publishedAt)+'"':'')+'>'+esc(date(e.publishedAt,true))+'</time>'+(e.sourceCount>1?'<span>· '+e.sourceCount+' yayın</span>':'')+'</div>';}
function newsRow(e){return '<article class="news-row '+(e.priority==='critical'?'critical-row':'')+'">'+media(e)+'<div class="row-copy"><h3><button class="headline-button" data-event="'+esc(e.id)+'">'+esc(e.title)+'</button></h3><p class="clamp">'+esc(e.description||'Kaynak, konum ve zaman bilgisi için olay dosyasını açın.')+'</p><div class="metadata">'+badge(e)+(e.nationalCritical?'<span class="badge">Ulusal gündem</span>':'')+'<span>'+esc(e.sourceName)+'</span><time>'+esc(date(e.publishedAt,true))+'</time>'+(e.sourceCount>1?'<span>'+e.sourceCount+' yayın</span>':'')+'</div></div></article>';}
function socialCard(e){return '<article class="social-card '+(e.priority==='critical'?'critical-row':'')+'"><div class="social-top"><span class="platform-mark '+esc(e.platform)+'">'+(e.platform==='facebook'?'f':e.platform==='instagram'?icon('image'):'𝕏')+'</span><div><strong>'+esc(e.accountName||e.sourceName)+'</strong><small>'+esc((e.platforms?.length?e.platforms:[e.platform]).map(p=>platformName[p]||p).join(' · '))+(e.sourceCount>1?' · '+Number(e.sourceCount)+' yayın':'')+'</small></div>'+badge(e)+'</div><h3><button class="headline-button" data-event="'+esc(e.id)+'">'+esc(e.title)+'</button></h3><p class="clamp clamp3">'+esc(e.description)+'</p>'+(e.imageUrl?media(e):'')+'<div class="social-meta"><span>Yayın: '+esc(date(e.publishedAt))+'</span><span>İlk tespit: '+esc(date(e.firstSeenAt))+'</span><span>Konum: '+esc(e.location||'Belirtilmemiş')+' · '+esc(e.locationLabel)+'</span></div><div class="social-bottom"><span class="badge">'+esc(e.reviewLabel)+'</span><button class="text-link" data-event="'+esc(e.id)+'">Olay dosyası</button>'+(e.url?'<a class="btn button" href="'+esc(url(e.url))+'" target="_blank" rel="noopener noreferrer">Gönderiye git '+icon('external')+'</a>':'')+'</div></article>';}
function empty(title='Kayıt bulunamadı',description='Seçtiğiniz filtrelere uygun kayıt yok. Filtreleri değiştirerek tekrar deneyebilirsiniz.'){return '<div class="empty">'+icon('archive')+'<h2>'+esc(title)+'</h2><p>'+esc(description)+'</p></div>';}
function searchForm(archive=false){const f=state.filters,sources=state.summary?.sources||[];return '<form id="filter-form" class="searchbar" role="search"><label class="search-input">'+icon('search')+'<input name="q" value="'+esc(f.q)+'" aria-label="Kayıtlarda ara" placeholder="Haberlerde ve sosyal medya paylaşımlarında ara..."></label><select name="period" aria-label="Yayın dönemi"><option value="">Tüm tarihler</option><option value="24h" '+(f.period==='24h'?'selected':'')+'>Son 24 Saat</option><option value="today" '+(f.period==='today'?'selected':'')+'>Bugün</option></select><select name="priority" aria-label="Öncelik"><option value="">Tüm öncelikler</option>'+Object.entries(label).map(([v,t])=>'<option value="'+v+'" '+(f.priority===v?'selected':'')+'>'+t+'</option>').join('')+'</select><button class="btn button primary" type="submit">'+icon('search')+'Ara</button><details class="advanced" '+(archive?'open':'')+'><summary>Daha fazla filtre</summary><div><label>Kaynak<select name="source"><option value="">Tüm kaynaklar</option>'+sources.map(s=>'<option '+(s===f.source?'selected':'')+'>'+esc(s)+'</option>').join('')+'</select></label><label>Başlangıç tarihi<input name="start" type="date" value="'+esc(f.start)+'"></label><label>Bitiş tarihi<input name="end" type="date" value="'+esc(f.end)+'"></label>'+(archive?'<label>İçerik türü<select name="type"><option value="all">Haber ve sosyal medya</option><option value="news" '+(f.type==='news'?'selected':'')+'>Haber</option><option value="social" '+(f.type==='social'?'selected':'')+'>Sosyal medya</option></select></label>':'')+'<button class="text-link" type="button" id="clear-filters">Filtreleri temizle</button></div></details></form>';}
function renderMetrics(){const c=state.summary.counters;return '<section class="metrics" aria-label="Gündem göstergeleri">'+[['Bugünkü Haberler',c.todayNews,'news','news'],['Sosyal Medya Kayıtları',c.social,'social','social'],['Öncelikli Olaylar',c.priority,'bell','alerts'],['İnceleme Bekleyenler',c.review,'shield','review']].map(([t,n,i,p])=>'<button class="metric" data-metric="'+p+'"><div><span>'+t+'</span><strong>'+new Intl.NumberFormat('tr-TR').format(n)+'</strong></div>'+icon(i)+'</button>').join('')+'</section>';}
function rail(title,items,type){return '<section class="rail-panel"><div class="rail-heading">'+icon(type==='alerts'?'bell':'social')+esc(title)+'</div>'+(items.length?items.map(e=>'<article class="rail-item">'+badge(e)+'<h3><button class="headline-button" data-event="'+esc(e.id)+'">'+esc(e.title)+'</button></h3>'+meta(e)+'</article>').join(''):'<p class="data-note">Şu an bu bölümde kayıt bulunmuyor.</p>')+'<a class="rail-foot" href="/?page='+type+'" data-go="'+type+'">Tümünü görüntüle →</a></section>';}
function home(){const s=state.summary,head=s.headlines[0];return searchForm()+renderMetrics()+'<div class="home-columns"><div><div class="section-heading"><h2>Öne çıkan gelişmeler</h2><a class="text-link" data-go="news" href="/?page=news">Haber gündemi →</a></div>'+(head?'<div class="hero-grid"><article class="lead-story"><button data-event="'+esc(head.id)+'">'+media(head)+'<div class="lead-copy">'+badge(head)+'<h2>'+esc(head.title)+'</h2><p class="clamp clamp3">'+esc(head.description)+'</p>'+meta(head)+'</div></button></article><div class="mini-stack">'+s.headlines.slice(1,4).map(e=>'<button class="mini-story" data-event="'+esc(e.id)+'"><div>'+badge(e)+'</div><div class="mini-image-title">'+media(e)+'<h3 class="clamp clamp3">'+esc(e.title)+'</h3></div>'+meta(e)+'</button>').join('')+'</div></div>':empty('Henüz ilçe haberi yok','Mevcut veri kopyasında görüntülenebilir ilçe haberi bulunmuyor.'))+'<div class="section-heading"><h2>Son haberler</h2><a class="text-link" href="/?page=news" data-go="news">Tüm haberler →</a></div><div class="card-grid home-news-grid">'+s.latest.map(newsRow).join('')+'</div><p class="data-note">Yayın saatleri Türkiye saatidir. Görseli bulunmayan kayıtlar için temsili haber fotoğrafı kullanılmaz.</p></div><aside class="right-column" aria-label="Gündemde son durum">'+rail('Öncelikli Bildirimler',s.priority,'alerts')+rail('Sosyal Medyada Son Gelişmeler',s.social,'social')+'<section class="rail-panel"><div class="rail-heading">'+icon('report')+'Günün brifingi</div><p class="data-note">Son 72 saatin haberlerini seçin. Makama sunacağınız rapora yalnız işaretlediğiniz kayıtlar eklensin.</p><a class="btn button" href="/calisma?view=brief">Brifing hazırla '+icon('arrow')+'</a></section></aside></div>';}
function tabs(){const options=state.page==='social'?[['all','Tümü'],['x','X'],['instagram','Instagram'],['facebook','Facebook']]:state.page==='alerts'?[['all','Tümü'],['critical','Kritik'],['important','Önemli'],['review','İnceleme Bekleyen']]:[['all','Tüm Haberler'],['24h','Son 24 Saat'],['priority','Öncelikli'],['local','İlçe Gündemi'],['national','Ulusal Gündem']];const selected=state.page==='social'?state.platform:state.tab;return '<div class="tabs" role="tablist" aria-label="'+esc(pageInfo[state.page][0])+'">'+options.map(([v,t])=>'<button class="tab '+(selected===v?'active':'')+'" role="tab" tabindex="'+(selected===v?'0':'-1')+'" aria-selected="'+(selected===v)+'" data-tab="'+v+'">'+t+'</button>').join('')+'</div>';}
function listShell(){return (state.page!=='archive'?tabs():'')+searchForm(state.page==='archive')+'<div class="list-heading"><span id="list-count">Kayıtlar yükleniyor…</span><div class="view-toggle">'+(state.page==='news'?'<button class="btn button '+(state.mode==='list'?'active':'')+'" data-mode="list" aria-label="Liste görünümü">'+icon('list')+'<span>Liste</span></button><button class="btn button '+(state.mode==='grid'?'active':'')+'" data-mode="grid" aria-label="Kart görünümü">'+icon('grid')+'<span>Kartlar</span></button>':'')+(state.page==='archive'&&state.actor?.admin?'<a class="btn button" id="csv-export" href="'+esc(exportURL())+'">'+icon('download')+'CSV indir</a>':'')+'</div></div><div id="list-results" aria-busy="true"><div class="loading"><span></span>Kayıtlar yükleniyor…</div></div><div id="pagination"></div>'+(state.page==='archive'?'<section id="reports" aria-label="Kayıtlara dayalı raporlar"></section><p class="data-note">Raporlar yalnız mevcut veri kopyasındaki kayıtları kapsar. Kaynak dağılımı olayın ana kaynağına göre hesaplanır; yayın sayısı değildir.</p>':'<p class="data-note">Kaynak yayını ile sistemin ilk tespit zamanı olay dosyasında ayrı gösterilir.</p>');}
function params(){const p=new URLSearchParams({...state.filters,page:state.pageNo,limit:20});if(state.page==='news')p.set('stream','news');if(state.page==='social'){p.set('stream','social');p.set('platform',state.platform);}if(state.page==='alerts'){p.set('section','alerts');if(['critical','important'].includes(state.tab))p.set('priority',state.tab);else if(state.tab==='review')p.set('tab','review');}if(state.page==='news')p.set('tab',state.tab);if(state.page==='home')p.set('section','home');return p;}
function exportURL(){return '/api/portal/export?'+params();}
async function api(path,options={}){const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});if(response.status===401){location.replace('/giris');throw Error('Oturum sona erdi.');}const type=response.headers.get('content-type')||'';if(!type.includes('application/json'))throw Error('Sunucu geçici olarak yanıt veremedi. Lütfen tekrar deneyin.');const data=await response.json();if(!response.ok)throw Error(data.error||'İşlem tamamlanamadı.');return data;}
async function loadList(){const serial=++state.request;state.controller?.abort();state.controller=new AbortController();try{const d=await api('/api/portal/list?'+params(),{signal:state.controller.signal});if(serial!==state.request)return;state.list=d;renderList();if(state.page==='archive')loadReports(serial).catch(e=>{if(serial===state.request)$('reports').innerHTML='<p class="data-note">'+esc(e.message)+'</p>';});}catch(e){if(e.name==='AbortError'||serial!==state.request)return;$('list-results').innerHTML='<div class="error-box">'+esc(e.message)+'<br><button class="btn button" id="retry-list">Yeniden dene</button></div>';$('list-count').textContent='Liste yüklenemedi';}finally{if(serial===state.request)$('list-results')?.setAttribute('aria-busy','false');}}
function renderList(){const d=state.list;if(!$('list-results'))return;$('list-count').textContent=new Intl.NumberFormat('tr-TR').format(d.total)+' kayıt · '+d.page+'. sayfa';const social=state.page==='social';$('list-results').className=social?'social-grid':state.mode==='grid'&&state.page==='news'?'card-grid':'news-list';$('list-results').innerHTML=d.items.length?d.items.map(e=>social?socialCard(e):newsRow(e)).join(''):empty();$('pagination').innerHTML=d.pages>1?'<nav class="pagination" aria-label="Sayfalar"><button class="btn button" data-pagination="'+(d.page-1)+'" '+(d.page<=1?'disabled':'')+'>← Önceki</button><span>'+d.page+' / '+d.pages+'</span><button class="btn button" data-pagination="'+(d.page+1)+'" '+(d.page>=d.pages?'disabled':'')+'>Sonraki →</button></nav>':'';wireMedia();}
async function loadReports(serial){const d=await api('/api/portal/report?'+params());if(serial!==state.request||!$('reports'))return;const max=Math.max(1,...d.weekly.map(x=>x.count)),sourceMax=Math.max(1,...d.sources.map(x=>x.count));$('reports').innerHTML='<div class="metrics">'+[['Bugünkü kayıtlar',d.today],['Toplam kayıt',d.total],['Sosyal medya',d.social],['Öncelikli kayıt',d.priority]].map(([s,n])=>'<div class="metric"><div><span>'+s+'</span><strong>'+n+'</strong></div></div>').join('')+'</div><div class="reports"><section class="report-panel"><h2>Son 7 günün kayıtları</h2><div class="daily-bars" role="img" aria-label="'+esc(d.weekly.map(x=>x.day+': '+x.count+' kayıt').join(', '))+'">'+d.weekly.map(x=>'<div class="day-column"><b>'+x.count+'</b><div class="day-bar" style="height:'+Math.max(1,Math.round(x.count/max*85))+'px"></div><span>'+esc(x.day.slice(8))+'/'+esc(x.day.slice(5,7))+'</span></div>').join('')+'</div></section><section class="report-panel"><h2>Kaynaklara göre dağılım</h2>'+d.sources.map(s=>'<div class="bar-row"><span>'+esc(s.name)+'</span><div class="bar-track"><span style="width:'+Math.round(s.count/sourceMax*100)+'%"></span></div><strong>'+s.count+'</strong></div>').join('')+'</section></div>';}
function syncAddress(){const u=new URL(location);u.searchParams.delete('view');u.searchParams.set('page',state.page);history.replaceState(null,'',u);}
async function go(page,{reset=true,tab=null}={}){if(!Object.hasOwn(pageInfo,page))page='home';state.request++;state.controller?.abort();state.page=page;state.pageNo=1;if(reset){state.filters={q:'',period:'',priority:'',source:'',start:'',end:'',type:'all'};state.tab=page==='news'?'local':'all';state.platform='all';}if(tab)state.tab=tab;syncAddress();closeMenu();document.querySelectorAll('[data-go]').forEach(n=>{const selected=n.dataset.go===page;n.classList.toggle('active',selected);if(n.closest('nav'))n.setAttribute('aria-current',selected?'page':'false');});$('page-title').textContent=pageInfo[page][0];$('page-description').textContent=pageInfo[page][1];document.title=pageInfo[page][0]+' · OSINT Takip Sistemi';$('content').innerHTML=page==='home'?home():listShell();if(page!=='home')await loadList();else wireMedia();}
function wireMedia(){document.querySelectorAll('.story-media img').forEach(img=>{
 if(img.dataset.osintMediaWired)return;img.dataset.osintMediaWired='true';
 const parent=img.parentElement;let finished=false,waiting=false,retries=0;
 let localThumbnail=false;try{const target=new URL(img.src,location.origin);localThumbnail=target.origin===location.origin&&target.pathname==='/api/portal/thumbnail';}catch{}
 const finish=()=>{finished=true;img.removeEventListener('load',loaded);img.removeEventListener('error',unavailable);parent.classList.remove('is-loading');parent.removeAttribute('aria-busy');parent.querySelector('.media-loading')?.remove();};
 const loaded=()=>{if(!finished)finish();};
 const unavailable=async()=>{
  if(finished||waiting)return;
  if(localThumbnail&&retries<2){
   waiting=true;let status=0;
   try{const response=await fetch(img.src,{credentials:'same-origin',signal:AbortSignal.timeout(3000)});status=response.status;await response.body?.cancel();}catch{}
   if(finished||!img.isConnected)return;
   // Only a pending render is retried. Missing/denied images are not polled.
   if(status===202||status===200){const delay=status===202?[2000,5000][retries]:0;retries++;setTimeout(()=>{if(finished||!img.isConnected)return;waiting=false;const target=new URL(img.src,location.origin);target.searchParams.set('_retry',String(retries));img.src=target.href;},delay);return;}
  }
  finish();parent.classList.add('no-image');parent.innerHTML=missingImage();
 };
 img.addEventListener('load',loaded);img.addEventListener('error',unavailable);
 if(img.complete){if(img.naturalWidth)loaded();else unavailable();}
});}
function closeMenu(){$('sidebar').classList.remove('open');$('menu-backdrop').hidden=true;$('mobile-menu').setAttribute('aria-expanded','false');}
function notify(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('toast').hidden=true,4000);}
async function detail(id){const serial=++detailEpoch;state.lastFocus=document.activeElement;$('event-content').innerHTML='<div class="loading"><span></span>Olay dosyası açılıyor…</div>';if(!$('event-dialog').open)$('event-dialog').showModal();try{const d=await api('/api/portal/event?id='+encodeURIComponent(id));if(serial!==detailEpoch||!$('event-dialog').open)return;state.detail=d;const e=d.event;const keys=e.matchedKeywords.map(x=>typeof x==='string'?x:x.term||x.name||'').filter(Boolean);$('event-content').innerHTML='<div class="metadata">'+badge(e)+'<span class="badge">'+esc(e.stream==='social'?platformName[e.platform]:'Haber kaynağı')+'</span><span class="badge '+(e.locationVerified?'verified':'review')+'">'+esc(e.locationLabel)+'</span></div><h2 id="event-title">'+esc(e.title)+'</h2><div class="full-text">'+esc(e.description||'Bu kayıt için ek haber metni bulunmuyor. Özgün kaynağı inceleyebilirsiniz.')+'</div><div class="detail-grid">'+[['İlk yayın',date(e.firstPublishedAt)],['İlk tespit',date(e.firstSeenAt)],['Son yeni kayıt',date(e.lastNewRecordAt)],['İlgili bölge',e.location||'Konum belirtilmemiş'],['Öncelik',label[e.priority]],['İnceleme durumu',e.reviewLabel]].map(([k,v])=>'<div class="detail-cell"><small>'+k+'</small>'+esc(v)+'</div>').join('')+'</div>'+(e.priorityExplanation?'<p class="data-note">Öncelik dayanağı: '+esc(e.priorityExplanation)+'</p>':'')+(keys.length?'<p class="data-note">Eşleşen ifadeler: '+esc(keys.join(', '))+'</p>':'')+(e.geoMatches?.length?'<section class="detail-section"><h3>Konum sözlüğü eşleşmeleri</h3>'+e.geoMatches.map(g=>'<div class="source-row"><strong>'+esc(g.name)+'</strong><small>'+esc((g.mahalle||[]).join(', ')||'Mahalle belirtilmemiş')+' · '+esc(g.verification_status||'Resmî teyit gerekli')+'</small><small>Resmî konum doğrulaması yapılmış sayılmaz.</small></div>').join('')+'</section>':'')+'<section class="detail-section"><h3>İlgili kaynaklar</h3>'+e.sources.map(s=>'<div class="source-row">'+(s.url?'<a target="_blank" rel="noopener noreferrer" href="'+esc(url(s.url))+'">'+esc(s.sourceName||s.title)+' '+icon('external')+'</a>':esc(s.sourceName||s.title))+'<small>'+esc(platformName[s.platform])+' · Yayın: '+esc(date(s.publishedAt))+' · İlk tespit: '+esc(date(s.firstSeenAt))+'</small></div>').join('')+'<p class="data-note">'+esc(d.relationNote)+(e.groupingReason?' '+esc(e.groupingReason):'')+'</p></section><section class="detail-section"><h3>Olayı değerlendirin</h3><form id="review-form" class="review-form"><label>İnceleme durumu<select id="review-status">'+Object.entries(d.reviewStatuses).map(([v,t])=>'<option value="'+v+'" '+(e.reviewStatus===v?'selected':'')+'>'+t+'</option>').join('')+'</select></label><button class="btn button primary" type="submit">Durumu kaydet</button><p>İnceleme durumu kaydedilir. Bu işlem Telegram bildirimi oluşturmaz.</p></form></section><div class="detail-actions">'+(e.url?'<a class="btn button" target="_blank" rel="noopener noreferrer" href="'+esc(url(e.url))+'">Özgün yayını aç '+icon('external')+'</a>':'')+(e.stream==='news'?'<a class="btn button" href="/calisma?view=account">Kişisel notlar ve kayıtlar</a>':'')+'</div>';if(!$('event-dialog').open)return;$('close-dialog').focus();}catch(e){$('event-content').innerHTML='<h2 id="event-title">Dosya açılamadı</h2><p>'+esc(e.message)+'</p>';}}
document.addEventListener('click',async ev=>{const goButton=ev.target.closest('[data-go]');if(goButton){ev.preventDefault();go(goButton.dataset.go);return;}const event=ev.target.closest('[data-event]');if(event){detail(event.dataset.event);return;}const tab=ev.target.closest('[data-tab]');if(tab){if(state.page==='social')state.platform=tab.dataset.tab;else state.tab=tab.dataset.tab;state.pageNo=1;$('content').innerHTML=listShell();document.querySelector('[data-tab="'+tab.dataset.tab+'"]')?.focus();loadList();return;}const metric=ev.target.closest('[data-metric]');if(metric){const dest=metric.dataset.metric;if(dest==='review')await go('alerts',{tab:'review'});else{await go(dest);if(dest==='news'){state.filters.period='today';$('content').innerHTML=listShell();loadList();}}return;}const mode=ev.target.closest('[data-mode]');if(mode){state.mode=mode.dataset.mode;localStorage.setItem('osint-ui-view-v2',state.mode);$('content').innerHTML=listShell();renderList();return;}const p=ev.target.closest('[data-pagination]');if(p&&!p.disabled){state.pageNo=Number(p.dataset.pagination);await loadList();$('filter-form').scrollIntoView({block:'start'});return;}if(ev.target.closest('#clear-filters'))go(state.page);if(ev.target.closest('#retry-list'))loadList();});
document.addEventListener('submit',async ev=>{if(ev.target.id==='filter-form'){ev.preventDefault();const values=Object.fromEntries(new FormData(ev.target));if(values.start&&values.end&&values.start>values.end){notify('Başlangıç tarihi bitiş tarihinden sonra olamaz.');return;}state.filters={...state.filters,...values};state.pageNo=1;if(state.page==='home'){await go('archive',{reset:false});return;}else if($('csv-export'))$('csv-export').href=exportURL();loadList();}if(ev.target.id==='review-form'){ev.preventDefault();const button=ev.target.querySelector('button');button.disabled=true;try{const e=state.detail.event;const d=await api('/api/portal/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId:e.id,status:$('review-status').value,revision:e.caseRevision})});notify('İnceleme durumu kaydedildi.');e.caseRevision=d.revision;e.reviewStatus=d.status;if(state.page!=='home')loadList();}catch(e){notify(e.message);}finally{button.disabled=false;}}});
$('close-dialog').onclick=()=>$('event-dialog').close();$('event-dialog').addEventListener('close',()=>{detailEpoch++;state.detail=null;state.lastFocus?.focus();});$('event-dialog').addEventListener('click',ev=>{if(ev.target===$('event-dialog')){const r=$('event-dialog').getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)$('event-dialog').close();}});
$('mobile-menu').onclick=()=>{const open=!$('sidebar').classList.contains('open');$('sidebar').classList.toggle('open',open);$('menu-backdrop').hidden=!open;$('mobile-menu').setAttribute('aria-expanded',String(open));};$('menu-backdrop').onclick=closeMenu;document.addEventListener('keydown',ev=>{if(ev.key==='Escape')closeMenu();});
$('logout').onclick=async()=>{try{await api('/api/logout',{method:'POST'});location.replace('/giris');}catch(e){notify(e.message);}};
async function start(){icons();$('clock').textContent=new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Istanbul'}).format(new Date());try{state.summary=await api('/api/portal/summary');state.actor=state.summary.actor;const session=await api('/api/session');$('user-name').textContent=state.actor.name||'Hesabım';$('avatar').textContent=(state.actor.name||'K').slice(0,1).toLocaleUpperCase('tr-TR');$('admin-nav').hidden=!state.actor.admin;$('tags-nav').hidden=session.adminUnlocked!==true;$('nav-alert-count').textContent=state.summary.counters.priority||'';$('alert-dot').hidden=!state.summary.counters.priority;$('wire-text').textContent=state.summary.headlines[0]?.title||'Mevcut veri kopyasında yeni ilçe haberi bulunmuyor.';$('notice').hidden=false;$('notice').classList.add('live-update');$('notice').textContent='Son güncelleme: '+date(state.summary.syncedAt)+' · Türkiye saati';await go(new URLSearchParams(location.search).get('page')||'home');}catch(e){$('content').innerHTML='<div class="error-box">'+esc(e.message)+'<br><button class="btn button" id="retry-start">Yeniden dene</button></div>';$('retry-start').onclick=start;}}
start();

document.addEventListener('keydown',event=>{const current=event.target.closest('[role=tab]');if(current&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const tabs=[...current.parentElement.querySelectorAll('[role=tab]')];let index=tabs.indexOf(current);index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[index].click();}if(event.key==='Escape'&&$('sidebar').classList.contains('open')){closeMenu();$('mobile-menu').focus();}});

let portalRefreshing=false;
async function refreshPortal(){if(document.hidden||portalRefreshing||!state.summary)return;portalRefreshing=true;try{const latest=await api('/api/portal/summary');state.summary=latest;$('wire-text').textContent=latest.headlines[0]?.title||'İlçe gündemi güncelleniyor.';$('nav-alert-count').textContent=latest.counters.priority||'';$('alert-dot').hidden=!latest.counters.priority;$('notice').textContent='Son güncelleme: '+date(latest.syncedAt)+' · Türkiye saati';if(state.page==='home'){const form=$('filter-form');if(!form?.contains(document.activeElement)&&![...form?.elements||[]].some(e=>e.name&&e.value)){$('content').innerHTML=home();wireMedia();}}else if(!$('filter-form')?.contains(document.activeElement))await loadList();}catch{}finally{portalRefreshing=false;}}
setInterval(refreshPortal,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshPortal();});

;(()=>{fetch('/api/account',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(d=>{if(d?.actor?.admin){const a=document.getElementById('icerik-denetim-link');if(a){a.hidden=false;a.style.display='';}}}).catch(()=>{});})();


/* OSINT_CARD_MODERATION_MENU_V1 */
;(() => {
  'use strict';

  async function initialize() {
    let actor;

    try {
      const response = await fetch('/api/portal/summary', {
        credentials:'same-origin',
        cache:'no-store'
      });

      if (!response.ok) return;
      actor = (await response.json()).actor;
    } catch {
      return;
    }

    // Yalnizca yonetici hesabinda etkinlestir
    if (!actor?.admin) return;

    const style = document.createElement('style');

    style.textContent = `
      article.osint-admin-card {
        position:relative;
      }
      .osint-admin-card:has(
        .osint-admin-popup:not([hidden])
      ) {
        overflow:visible!important;
      }
      .osint-admin-control {
        position:absolute;
        top:8px;
        right:8px;
        z-index:25;
        font:inherit;
      }
      .osint-admin-more {
        display:grid;
        place-items:center;
        width:34px;
        height:34px;
        background:#fff;
        color:#263746;
        border:1px solid #d0d5dd;
        border-radius:9px;
        box-shadow:0 1px 5px #0002;
        cursor:pointer;
        font-size:21px;
        line-height:1;
      }
      .osint-admin-more:hover {
        background:#eef2f6;
      }
      .osint-admin-popup {
        position:absolute;
        right:0;
        top:39px;
        min-width:190px;
        display:grid;
        gap:3px;
        padding:7px;
        background:#fff;
        border:1px solid #d0d5dd;
        border-radius:10px;
        box-shadow:0 9px 25px #0002;
      }
      .osint-admin-popup[hidden] {
        display:none!important;
      }
      .osint-admin-popup button,
      .osint-admin-popup a {
        font:inherit;
        text-align:left;
        display:block;
        width:100%;
        padding:10px;
        border:0;
        border-radius:6px;
        background:transparent;
        text-decoration:none;
        color:#263746;
        cursor:pointer;
        box-sizing:border-box;
      }
      .osint-admin-popup button:hover,
      .osint-admin-popup a:hover {
        background:#f1f5f9;
      }
      .osint-admin-popup .osint-admin-hide {
        color:#aa2424;
      }
      .osint-admin-more:disabled,
      .osint-admin-hide:disabled {
        opacity:.5;
        cursor:progress;
      }
    `;

    document.head.appendChild(style);

    function closeMenus(except) {
      document.querySelectorAll(
        '.osint-admin-popup'
      ).forEach(p => {
        if (p !== except) p.hidden = true;
      });
    }

    function decorate() {
      let items = [];

      try {
        if (
          typeof state !== 'undefined' &&
          Array.isArray(state.list?.items)
        ) {
          items = state.list.items;
        }
      } catch {}

      const listCards = [
        ...document.querySelectorAll(
          '#list-results article'
        )
      ];

      const mapped = new Map();

      if (listCards.length === items.length) {
        listCards.forEach((card, i) => {
          if (items[i]?.id)
            mapped.set(card, items[i].id);
        });
      }

      for (const card of document.querySelectorAll(
        'article'
      )) {
        if (card.dataset.osintAdminMenu === '1')
          continue;

        const target = card.hasAttribute('data-event')
          ? card
          : card.querySelector('[data-event]');

        const id = target?.getAttribute('data-event')
          || mapped.get(card);

        if (!id || String(id).length > 180)
          continue;

        card.dataset.osintAdminMenu = '1';
        card.classList.add('osint-admin-card');

        const control = document.createElement('div');
        control.className = 'osint-admin-control';

        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'osint-admin-more';
        more.textContent = '⋯';
        more.title = 'Yönetici işlemleri';
        more.setAttribute(
          'aria-label','Yönetici işlemleri'
        );
        more.setAttribute('aria-expanded','false');

        const popup = document.createElement('div');
        popup.className = 'osint-admin-popup';
        popup.hidden = true;

        const hide = document.createElement('button');
        hide.type = 'button';
        hide.className = 'osint-admin-hide';
        hide.textContent = 'Panelden kaldır';

        const link = document.createElement('a');
        link.href = '/icerik-denetim';
        link.textContent = 'İçerik Denetim Merkezi';

        popup.append(hide,link);
        control.append(more,popup);
        card.append(control);

        more.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();

          const opening = popup.hidden;
          closeMenus(popup);

          popup.hidden = !opening;

          more.setAttribute(
            'aria-expanded',String(opening)
          );
        });

        popup.addEventListener(
          'click',event => event.stopPropagation()
        );

        hide.addEventListener('click',async event => {
          event.preventDefault();
          event.stopPropagation();

          if (!confirm(
            'Bu haber veya paylaşım panelden kaldırılsın mı?'
          )) return;

          hide.disabled = true;
          more.disabled = true;

          try {
            // Mevcut portal API'den kaydi al
            const read = await fetch(
              '/api/portal/event?id=' +
              encodeURIComponent(id),
              {
                credentials:'same-origin',
                cache:'no-store'
              }
            );

            const detail = await read.json();

            if (!read.ok || !detail.event)
              throw Error(
                detail.error ||
                'Haber ayrıntısı alınamadı'
              );

            // Mevcut yonetici kaldirma API'sini kullan
            const response = await fetch(
              '/api/moderation/action',
              {
                method:'POST',
                credentials:'same-origin',
                headers:{
                  'Content-Type':'application/json'
                },
                body:JSON.stringify({
                  action:'hide',
                  item:detail.event,
                  reason:''
                })
              }
            );

            const result = await response.json();

            if (!response.ok)
              throw Error(
                result.error ||
                'Kaldırma işlemi başarısız'
              );

            location.reload();

          } catch(error) {
            alert(
              'İçerik kaldırılamadı: ' +
              error.message
            );

            hide.disabled = false;
            more.disabled = false;
          }
        });
      }
    }

    let scheduled = false;

    function schedule() {
      if (scheduled) return;
      scheduled = true;

      requestAnimationFrame(() => {
        scheduled = false;
        decorate();
      });
    }

    const observer = new MutationObserver(schedule);

    observer.observe(document.body,{
      childList:true,
      subtree:true
    });

    document.addEventListener('click',event => {
      if (!event.target.closest(
        '.osint-admin-control'
      )) closeMenus();
    });

    document.addEventListener('keydown',event => {
      if (event.key === 'Escape')
        closeMenus();
    });

    decorate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',initialize,{once:true}
    );
  } else {
    initialize();
  }
})();

