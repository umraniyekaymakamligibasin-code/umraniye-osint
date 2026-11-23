import test from'node:test';import assert from'node:assert/strict';import vm from'node:vm';import{readFileSync}from'node:fs';
const source=readFileSync(new URL('./institution.js',import.meta.url),'utf8');
async function fixture(){
 const nodes=new Map(),timers=[],listeners={},docListeners={};let calls=0,rows=[{id:'one',title:'Birinci',status:'new'}],status=200;
 function node(){return{value:'',open:false,children:[],classList:{toggle(){},add(){},remove(){}},addEventListener(){},setAttribute(){},append(...x){this.children.push(...x);this.firstChild=this.children[0]},replaceChildren(...x){this.replaced=(this.replaced||0)+1;this.children=x;this.firstChild=x[0]},after(){},focus(){}}}
 const get=s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s)};
 const document={visibilityState:'visible',activeElement:{tagName:'BODY'},querySelector:get,createElement:node,body:node(),addEventListener:(n,f)=>docListeners[n]=f};
 const window={scrollY:0,addEventListener:(n,f)=>listeners[n]=f};
 const context=vm.createContext({document,window,URLSearchParams,Intl,Date,AbortSignal,Error,JSON,Number,Math,encodeURIComponent,fetch:async path=>{if(path==='/api/institution/me')return{ok:true,json:async()=>({memberships:[{code:'UMR_EMNIYET',display_name:'Emniyet'}]})};calls++;return{ok:status===200,status,json:async()=>status===200?{institution:'UMR_EMNIYET',cases:rows,nextBefore:null}:{error:'institution_access_not_found'}}},setInterval:(fn,ms)=>timers.push({fn,ms})});
 vm.runInContext(source,context);await new Promise(setImmediate);
 return{context,document,window,get,timers,get calls(){return calls},setRows:r=>rows=r,setStatus:s=>status=s};
}
test('visible panel polls at five seconds and displays a newly delivered case',async()=>{const f=await fixture();assert.equal(f.timers[0].ms,5000);f.setRows([{id:'two',title:'Yeni kavga',status:'new'}]);await f.timers[0].fn();assert.equal(vm.runInContext('state.items[0].id',f.context),'two');assert.equal(f.calls,2);});
test('unchanged automatic response does not replace the list or move focus',async()=>{const f=await fixture();const n=f.get('#cases').replaced;await f.timers[0].fn();assert.equal(f.get('#cases').replaced,n);});
test('hidden tab, open detail, editing, busy request and reading older records pause automatic refresh',async()=>{const f=await fixture();const n=f.calls;f.document.visibilityState='hidden';await f.timers[0].fn();f.document.visibilityState='visible';f.get('#case-dialog').open=true;await f.timers[0].fn();f.get('#case-dialog').open=false;f.document.activeElement.tagName='INPUT';await f.timers[0].fn();f.document.activeElement.tagName='BODY';f.window.scrollY=500;await f.timers[0].fn();f.window.scrollY=0;vm.runInContext('state.busy=true',f.context);await f.timers[0].fn();assert.equal(f.calls,n);});
test('revoked access clears visible cases and stops polling the former institution',async()=>{const f=await fixture();f.setStatus(403);await f.timers[0].fn();assert.equal(vm.runInContext('state.items.length',f.context),0);assert.equal(vm.runInContext('state.institution',f.context),'');const n=f.calls;await f.timers[0].fn();assert.equal(f.calls,n);});
