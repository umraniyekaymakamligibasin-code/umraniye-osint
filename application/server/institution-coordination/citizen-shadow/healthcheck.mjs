import{readFile}from'node:fs/promises';
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
 const pendingDue=db.prepare("SELECT count(*) n FROM cit_delivery_jobs WHERE state IN('pending','retry') AND available_at<=?").get(now).n;
 const missingContent=db.prepare("SELECT count(*) n FROM coord_cases c LEFT JOIN lab_items l ON l.id=c.source_event_id LEFT JOIN coord_source_content k ON k.event_id=c.source_event_id WHERE c.status<>'dismissed' AND l.id IS NULL AND k.event_id IS NULL").get().n;
 const missingFreshNotices=db.prepare(`SELECT count(*) n FROM coord_cases c
 JOIN coord_institutions i ON i.id=c.institution_id AND i.enabled=1 AND i.approval_status='approved' AND i.email_enabled=1
 JOIN coord_topics t ON t.id=c.topic_id AND t.enabled=1 AND t.approval_status='approved' AND t.sensitivity<>'restricted'
 JOIN coord_institution_topic_grants g ON g.institution_id=i.id AND g.topic_id=t.id AND g.granted=1 AND length(trim(g.approval_reference))>0
 JOIN coord_mail_recipients r ON r.institution_id=i.id AND r.active=1 AND r.verified_at IS NOT NULL AND r.verified_by IS NOT NULL
 WHERE c.status<>'dismissed' AND c.sensitivity<>'restricted'
 AND (julianday(c.first_published_at)>=julianday('now','-1 day') OR julianday(c.first_seen_at)>=julianday('now','-1 day'))
 AND NOT EXISTS(SELECT 1 FROM coord_mail_outbox o WHERE o.coord_case_id=c.id AND o.recipient_id=r.id AND o.recipient_hash=r.address_fingerprint)`).get().n;
 let mailHealthy=false;try{const m=JSON.parse(await readFile(dir+'/mail-status.json','utf8'));mailHealthy=m.healthy===true&&now-Date.parse(m.at)<120000&&active('umraniye-cit-mail.service');}catch{}
 const mailDecision=recoveryDecision({now,lastRun:0,active:active('umraniye-cit-mail.service'),timerActive:true,attempts:prior.value.mailRecoveryAttempts||[]});
 let mailRecovery=null;const mailRecoveryAttempts=mailDecision.attempts;
 if(mailDecision.action==='start_worker'){mailRecoveryAttempts.push(now);try{execFileSync('systemctl',['start','--no-block','umraniye-cit-mail.service'],{stdio:'ignore',timeout:5000});mailRecovery='requested';}catch{mailRecovery='failed';}}
 let recovery=null;const attempts=decision.attempts;
 if(decision.action){attempts.push(now);try{execFileSync('systemctl',['start','--no-block',decision.action==='start_timer'?'umraniye-cit-routing.timer':'umraniye-cit-routing.service'],{stdio:'ignore',timeout:5000});recovery='requested';}catch{recovery='failed';}}
 report={at:new Date(now).toISOString(),healthy:!missingFreshNotices&&mailHealthy&&!missingContent&&!decision.stale&&!overdue&&!errors.length&&!missingCases&&!last?.deliveryAudit?.inaccessible&&!Object.values(sourceUnits).some(v=>!['success',''].includes(v)),queue,errors,overdue,pendingDue,missingContent,missingFreshNotices,mailHealthy,mailRecovery,mailRecoveryAttempts,missingCases,lastRunAt:last?.at||null,deliveryAudit:last?.deliveryAudit||null,sourceUnits,recoveryAction:decision.action,recovery,recoveryAttempts:attempts,recoveryLimited:decision.recoveryLimited};
 await saveState(dir+'/health.json',report);console.log(JSON.stringify(report));
}finally{db.close();}
