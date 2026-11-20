import{DatabaseSync}from'node:sqlite';import{execFileSync}from'node:child_process';import{loadState,saveState}from'./state-store.mjs';import{recoveryDecision}from'./health-policy.mjs';
const dir='/var/lib/umraniye-osint-deneme/citizen-routing',now=Date.now();
const db=new DatabaseSync('/var/lib/umraniye-osint-deneme/osint.sqlite',{readOnly:true,timeout:5000});
let report;
try{
 db.exec('PRAGMA query_only=ON');const last=JSON.parse(db.prepare("SELECT value FROM cit_delivery_meta WHERE key='last_run'").get()?.value||'null');
 const active=unit=>{try{execFileSync('systemctl',['is-active','--quiet',unit],{stdio:'ignore',timeout:5000});return true;}catch{return false;}};
 const prior=await loadState(dir+'/health.json',{recoveryAttempts:[]},s=>Array.isArray(s?.recoveryAttempts));
 const decision=recoveryDecision({now,lastRun:Date.parse(last?.at)||0,active:active('umraniye-cit-routing.service'),timerActive:active('umraniye-cit-routing.timer'),attempts:prior.value.recoveryAttempts});
 const queue=db.prepare('SELECT state,count(*) count FROM cit_delivery_jobs GROUP BY state').all();
 const errors=db.prepare('SELECT error_code,count(*) count FROM cit_delivery_jobs WHERE error_code IS NOT NULL GROUP BY error_code').all();
 const overdue=db.prepare("SELECT count(*) n FROM cit_delivery_jobs WHERE state IN('pending','retry') AND available_at>0 AND available_at<?").get(now-900000).n;
 const missingCases=db.prepare('SELECT count(*) n FROM cit_case_links l LEFT JOIN coord_cases c ON c.id=l.case_id WHERE l.active=1 AND c.id IS NULL').get().n;
 const sourceUnits={};for(const unit of ['umraniye-osint-instagram-api.service','umraniye-osint-browser.service']){try{sourceUnits[unit]=execFileSync('systemctl',['show',unit,'-p','Result','--value'],{encoding:'utf8',timeout:5000}).trim();}catch{sourceUnits[unit]='unknown';}}
 let recovery=null;const attempts=decision.attempts;
 if(decision.action){attempts.push(now);try{execFileSync('systemctl',['start','--no-block',decision.action==='start_timer'?'umraniye-cit-routing.timer':'umraniye-cit-routing.service'],{stdio:'ignore',timeout:5000});recovery='requested';}catch{recovery='failed';}}
 report={at:new Date(now).toISOString(),healthy:!decision.stale&&!overdue&&!errors.length&&!missingCases&&!last?.deliveryAudit?.inaccessible,queue,errors,overdue,missingCases,lastRunAt:last?.at||null,deliveryAudit:last?.deliveryAudit||null,sourceUnits,recoveryAction:decision.action,recovery,recoveryAttempts:attempts,recoveryLimited:decision.recoveryLimited};
 await saveState(dir+'/health.json',report);console.log(JSON.stringify(report));
}finally{db.close();}
