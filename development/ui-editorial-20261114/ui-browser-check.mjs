// Isolated presentation test server. Fixtures are never written to the OSINT database.
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const app=resolve('work/pr-review-20261114/candidate/application'),out=resolve('work/pr-review-20261114/ui-preview');
const {mkdir}=await import('node:fs/promises');await mkdir(out,{recursive:true});
const at=new Date().toISOString(),requests=[],errors=[];
const event={id:'presentation-fixture',stream:'news',title:'Arayüz kontrol kaydı: uzun haber başlığının kart içindeki okunabilirliği',description:'Bu kayıt yalnız otomatik arayüz testinde kullanılır. Gerçek haber değildir; canlı uygulamaya veya veritabanına kaydedilmez.',sourceName:'Arayüz test kaynağı',priority:'normal',sourceCount:2,publishedAt:at,firstSeenAt:at,firstPublishedAt:at,lastNewRecordAt:at,reviewLabel:'İncelenmedi',reviewStatus:'new',location:'Ümraniye',locationLabel:'İnceleme Gerekli',locationVerified:false,matchedKeywords:[],sources:[],platform:'instagram',accountName:'Arayüz kontrolü',url:''};
const summary={actor:{name:'Tasarım kontrolü',admin:false},counters:{todayNews:2,social:1,priority:0,review:0},headlines:[event,{...event,id:'fixture-two'}],latest:[event,{...event,id:'fixture-two'}],priority:[],social:[],sources:['Arayüz test kaynağı'],syncedAt:at};
const server=createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://localhost');requests.push(u.pathname+u.search);
 if(u.pathname.startsWith('/api/')){
  let data={};if(u.pathname==='/api/portal/summary')data=summary;
  else if(u.pathname==='/api/session')data={adminUnlocked:false};
  else if(u.pathname==='/api/portal/list')data={items:[{...event,stream:u.searchParams.get('page')==='social'?'social':'news'}],page:Number(u.searchParams.get('pageNo')||u.searchParams.get('page')||1)||1,pages:2,total:2};
  else if(u.pathname==='/api/portal/event')data={event,relationNote:'Yalnız arayüz test kaydı.',reviewStatuses:{new:'İncelenmedi'}};
  else if(u.pathname==='/api/portal/report')data={daily:[],weekly:[],sources:[],totals:{}};
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));return;
 }
 const name=u.pathname==='/'?'src/portal.html':u.pathname.startsWith('/assets/')?'src'+u.pathname:null;
 if(!name){res.writeHead(404);res.end();return;}
 const p=resolve(app,name);if(!p.startsWith(app)){res.writeHead(403);res.end();return;}
 const data=await readFile(p);const ext=p.split('.').at(-1);res.writeHead(200,{'Content-Type':({html:'text/html; charset=utf-8',css:'text/css',js:'text/javascript',png:'image/png',woff2:'font/woff2'})[ext]||'application/octet-stream'});res.end(data);
 }catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const profile=await mkdtemp(join(tmpdir(),'osint-ui-chrome-'));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--disable-extensions','--disable-background-networking','--disable-component-update','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
let ws;const pending=new Map();let serial=0;
try{
 let port;for(let i=0;i<100;i++){try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break}catch{}await new Promise(r=>setTimeout(r,100));}assert(port,'headless browser ready');
 const target=await(await fetch('http://127.0.0.1:'+port+'/json/new?'+encodeURIComponent(origin),{method:'PUT'})).json();
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
 ws.onmessage=e=>{const v=JSON.parse(e.data);if(v.id){const p=pending.get(v.id);if(p){pending.delete(v.id);v.error?p.reject(Error(JSON.stringify(v.error))):p.resolve(v.result);}}else if(v.method==='Runtime.exceptionThrown')errors.push(v.params.exceptionDetails.text+' '+(v.params.exceptionDetails.exception?.description||''));};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
 const wait=async expr=>{for(let i=0;i<70;i++){if(await evaluate(expr))return;await new Promise(r=>setTimeout(r,100));}throw Error('UI condition timeout: '+expr);};
 await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await call('Network.setBlockedURLs',{urls:['https://*']});
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:origin});await wait("document.querySelector('.card-grid .news-row')!==null");
 const layout=async()=>evaluate(`(()=>{const visible=e=>!!e&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0;return {overflow:document.documentElement.scrollWidth>innerWidth+1,brand:visible(document.querySelector('.identity small')),platformTitle:visible(document.querySelector('.platform-title')),cards:getComputedStyle(document.querySelector('.card-grid')).display,hiddenAdmin:document.querySelector('#admin-nav').hidden,cardWidth:document.querySelector('.card-grid .news-row').getBoundingClientRect().width}})()`);
 const desktop=await layout();assert(!desktop.overflow);assert(desktop.brand&&desktop.platformTitle&&desktop.hiddenAdmin);assert.equal(desktop.cards,'grid');
 await writeFile(join(out,'desktop.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
 await evaluate("document.querySelector('[data-go=news]').click()");await wait("document.querySelector('[data-mode=grid]')!==null && document.querySelector('.news-row')!==null");
 assert.equal(await evaluate("document.querySelector('#list-results').classList.contains('card-grid')"),true);
 await evaluate("document.querySelector('[data-mode=list]').click()");assert.equal(await evaluate("document.querySelector('#list-results').className"),'news-list');
 await evaluate("document.querySelector('[data-mode=grid]').click()");assert.equal(await evaluate("document.querySelector('#list-results').className"),'card-grid');
 await evaluate("document.querySelector('.headline-button').click()");await wait("document.querySelector('#event-title')!==null");assert.equal(await evaluate("document.querySelector('#event-dialog').open"),true);
 await evaluate("document.querySelector('#close-dialog').click()");assert.equal(await evaluate("document.querySelector('#event-dialog').open"),false);
 await evaluate("document.querySelector('[data-go=social]').click()");await wait("document.querySelector('.social-card')!==null");
 await evaluate("document.querySelector('[data-tab=facebook]').click()");await new Promise(r=>setTimeout(r,200));assert(requests.some(x=>x.includes('platform=facebook')));
 await evaluate("document.querySelector('[data-go=home]').click()");await wait("document.querySelector('.home-news-grid')!==null");
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 const mobile=await layout();assert(!mobile.overflow);assert(mobile.brand&&mobile.platformTitle);
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.searchbar > select')).display!=='none'"),true);
 await evaluate("document.querySelector('#mobile-menu').click()");assert.equal(await evaluate("document.querySelector('#mobile-menu').getAttribute('aria-expanded')"),'true');
 await evaluate("document.querySelector('#menu-backdrop').click()");assert.equal(await evaluate("document.querySelector('#mobile-menu').getAttribute('aria-expanded')"),'false');
 await writeFile(join(out,'mobile.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
 for(const width of [320,768,1024,1920]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<700});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'overflow at '+width);}
 assert.deepEqual(errors,[]);
 const result={result:'isolated_ui_checks_passed',desktop,mobile,widthsChecked:[320,390,768,1024,1440,1920],navigation:true,cardListSwitch:true,detailOpenClose:true,platformFilter:true,mobileMenu:true,consoleErrors:errors,liveDataOrBackendVerified:false,fixturesOnly:true,liveSiteChanged:false};
 await writeFile(join(out,'checks.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 await call('Browser.close');
}finally{ws?.close();chrome.kill();await new Promise(r=>server.close(r));await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200}).catch(()=>{});}
