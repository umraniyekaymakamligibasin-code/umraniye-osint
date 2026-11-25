import{queueAdminHealthAlerts}from'./admin-health-mail.mjs';
import{createHash}from'node:crypto';
import{readFile,chmod,chown,stat}from'node:fs/promises';
import{pathToFileURL}from'node:url';
import{loadState,saveState}from'./state-store.mjs';
export function criticalCodes(health,mail,now=Date.now()){
 const codes=[];
 if(!health||!Number.isFinite(Date.parse(health.at))||now-Date.parse(health.at)>900000)codes.push('health_check_stale');
 if(!health?.lastRunAt||now-Date.parse(health.lastRunAt)>600000)codes.push('routing_stale');
 if(Number(health?.missingCases)>0)codes.push('panel_case_missing');
 if(Number(health?.missingContent)>0)codes.push('panel_content_missing');
 if(Number(health?.missingFreshNotices)>0)codes.push('notification_not_queued');
 if(Number(health?.overdue)>0)codes.push('routing_overdue');
 if((health?.errors||[]).some(r=>Number(r.count)>0))codes.push('routing_errors');
 if(Number(health?.deliveryAudit?.inaccessible)>0)codes.push('institution_access_missing');
 if(!mail||!Number.isFinite(Date.parse(mail.at))||now-Date.parse(mail.at)>120000)codes.push('mail_worker_stale');
 if(Number(mail?.unresolvedDead)>0)codes.push('mail_unresolved_delivery');
 if(Number(mail?.overdue)>0)codes.push('mail_overdue');
 if(mail?.healthy===false&&!codes.some(c=>c.startsWith('mail_')))codes.push('mail_worker_error');
 return [...new Set(codes)].sort();
}
export function transitionAlerts(previous={},codes,now=Date.now()){
 const stamp=new Date(now).toISOString(),fingerprint=createHash('sha256').update(JSON.stringify(codes)).digest('hex');
 const changed=fingerprint!==previous.fingerprint;
 const remind=codes.length>0&&now-Date.parse(previous.lastAlertAt||0)>=3600000;
 const emit=(changed&&(codes.length>0||previous.active===true))||remind;
 const entry=emit?{at:stamp,kind:codes.length?'critical':'recovered',codes}:null;
 return {entry,state:{at:stamp,active:codes.length>0,codes,fingerprint,lastAlertAt:entry?stamp:previous.lastAlertAt||null,history:entry?[...(previous.history||[]),entry].slice(-100):previous.history||[],externalDelivery:'not_configured',externalReason:'dedicated_owner_admin_destination_not_configured'}};
}
export async function updateHealthAlerts({directory='/var/lib/umraniye-osint-deneme/citizen-routing',now=Date.now()}={}){
 const read=async name=>{try{return JSON.parse(await readFile(directory+'/'+name,'utf8'));}catch{return null;}};
 const health=await read('health.json'),mail=await read('mail-status.json');
 const previous=await loadState(directory+'/critical-alerts.json',{},s=>s&&typeof s==='object');
 const result=transitionAlerts(previous.value,criticalCodes(health,mail,now),now);
 try{const delivery=await queueAdminHealthAlerts({directory:directory.replace(/\/citizen-routing$/,''),state:result.state,now});if(delivery.configured){result.state.externalDelivery='email_outbox';result.state.externalReason=null;}}catch{result.state.externalDelivery='enqueue_failed';result.state.externalReason='admin_alert_queue_unavailable';}
 await saveState(directory+'/critical-alerts.json',result.state);
 if(process.getuid?.()===0){const group=(await stat(directory+'/mail-status.json')).gid;await chown(directory+'/critical-alerts.json',0,group);await chmod(directory+'/critical-alerts.json',0o640);}
 if(result.entry)console.error(JSON.stringify({event:'institution_health_alert',...result.entry,externalDelivery:'not_configured'}));
 return result.state;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await updateHealthAlerts();
