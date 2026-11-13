import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const file=process.argv[2],root=file.slice(0,file.lastIndexOf('/'));
const {createBrowserResearch}=await import(pathToFileURL(file));
const {loadCentralKeywords}=await import(pathToFileURL(root+'/central-keywords.mjs'));
const {loadGeoDictionary}=await import(pathToFileURL(root+'/geo-dictionary.mjs'));
const records=new Map(),writes=[];
const tables={common_keyword_state:[{id:1,revision:0}],facebook_keywords:[{id:1,term:'yangın',aliases:'[]',enabled:1}],common_keyword_groups:[{id:'events',name:'Olay',kind:'olay',priority:'P2',enabled:1,position:1}],common_keyword_members:[{keyword_id:1,group_id:'events',provider:'x',enabled:1},{keyword_id:1,group_id:'events',provider:'facebook',enabled:1}],workspace_settings:[]};
const cfg={accounts:[{provider:'x',profileURL:'https://x.com/home',enabled:true,label:'X'}],automationEnabled:true};
const DB={prepare(sql){let a=[];return{bind(...v){a=v;return this},async first(){
 if(a[0]==='browser-status')throw Error('primary_health_access_forbidden');
 if(sql.includes('FROM facebook_sources'))return a[0]==='fb1'?{source_id:'fb1',page_name:'Yerel Haber',page_url:'https://www.facebook.com/test/'}:null;
 if(sql.includes('common_keyword_state'))return tables.common_keyword_state[0];
 if(sql.includes('workspace_settings'))return null;
 if(sql.includes('lab_config')){if(a[0]==='browser-research')return {data:JSON.stringify(cfg),revision:1};if(a[0]==='social-keyword-groups')return null;}
 if(sql.includes('lab_items'))return records.has(a[0])?{data:records.get(a[0]),collected_at:JSON.parse(records.get(a[0])).collectedAt}:null;
 return null;
 },async all(){if(sql.includes('lab_items'))return {results:[]};const t=sql.match(/FROM (\w+)/)?.[1];return {results:tables[t]||[]};},async run(){
 if(a[0]==='browser-status')throw Error('primary_health_write_forbidden');writes.push({sql,a});
 if(sql.startsWith('INSERT OR IGNORE INTO lab_items')){const exists=records.has(a[0]);if(!exists)records.set(a[0],a[2]);return {meta:{changes:exists?0:1}};}
 if(sql.startsWith('UPDATE lab_items SET data=')){records.set(a.at(-1),a[0]);}
 return {meta:{changes:1}};
 }}}};
await loadCentralKeywords(DB);await loadGeoDictionary(DB);
const api=createBrowserResearch(DB),request=posts=>({reader:'twscrape-backup',revision:1,groupRevision:0,results:[{provider:'x',profileURL:'https://x.com/home',status:'collected',posts}]});
const text='Ümraniye ilçesinde çıkan yangın itfaiye ekiplerinin müdahalesiyle söndürüldü. Olay yerinde güvenlik önlemleri alındı.';
const p={title:text,description:text,fullText:text,url:'https://x.com/test/status/1234567890123456789',sourceName:'Yerel Haber',publishedAt:new Date().toISOString(),firstSeenAt:new Date(Date.now()-60000).toISOString()};
let result=await api.ingest(request([p]));assert.equal(result.accepted,1);assert.equal(result.receipts[0].storedUrls.length,1);assert.equal(records.size,1);
let saved=JSON.parse([...records.values()][0]);assert.equal(saved.firstSeenAt,p.firstSeenAt);assert.equal(saved.collectionMethod,'x_twscrape_backup');
result=await api.ingest(request([{...p}]));assert.equal(result.accepted,1);assert.equal(records.size,1);
result=await api.ingest(request([{...p,publishedAt:new Date(Date.now()-7200000).toISOString()}]));assert.equal(result.accepted,0);assert.equal(result.receipts[0].storedUrls.length,0);assert.equal(result.receipts[0].acknowledgedUrls.length,1);
await assert.rejects(()=>api.ingest({...request([]),sessionCheck:true}),/invalid/);
await assert.rejects(()=>api.ingest({...request([]),results:[{provider:'facebook'}]}),/invalid/);
await assert.rejects(()=>api.ingest({...request([]),revision:999}),/revision_conflict/);
assert(writes.some(w=>w.a[0]==='x-backup-status'));assert(!writes.some(w=>w.a[0]==='browser-status'));
const fb={...p,url:'https://www.facebook.com/test/posts/1234567890123456789',sourcePageUrl:'https://www.facebook.com/test/',facebookPostId:'1234567890123456789',platform:'facebook'};
const fbRequest=posts=>({reader:'fbgql-backup',revision:1,groupRevision:0,results:[{provider:'facebook',profileURL:fb.sourcePageUrl,source_id:'fb1',status:'collected',posts}]});
result=await api.ingest(fbRequest([fb]));assert.equal(result.accepted,1);assert.equal(result.receipts[0].storedUrls.length,1);assert.equal(records.size,2);
result=await api.ingest(fbRequest([{...fb}]));assert.equal(result.accepted,1);assert.equal(records.size,2);
await assert.rejects(()=>api.ingest({...fbRequest([fb]),results:[{...fbRequest([fb]).results[0],source_id:'disabled'}]}),/invalid/);
await assert.rejects(()=>api.ingest(fbRequest([{...fb,sourcePageUrl:'https://www.facebook.com/other/'}])),/invalid/);
assert(writes.some(w=>w.a[0]==='facebook-backup-status'));
console.log('PASS backend: real admission, receipt, duplicate ID, discovery time, freshness, provider scope, revision, separate health');
