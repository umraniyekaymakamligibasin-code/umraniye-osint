import{queueAdminHealthAlerts,dispatchAdminHealthMail}from'./admin-health-mail.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFile,lstat,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {createInstitutionRecipients} from '../server/institution-recipients.mjs';
import {createGmailSender} from '../server/gmail-sender.mjs';
import {dispatchDueInstitutionNotices} from '../server/dispatch-event-email.mjs';
import {accountKey} from '../../accounts.mjs';
import {reconcileMail} from './mail-reconciliation.mjs';
export async function mailPass(adapters){return dispatchDueInstitutionNotices({...adapters,limit:1});}
export async function watchMail(){
 const directory=process.env.DATA_DIR||'/var/lib/umraniye-osint-deneme';
 const raw=new DatabaseSync(join(directory,'osint.sqlite'),{timeout:5000});raw.exec('PRAGMA foreign_keys=ON');
 const db={prepare(sql){let args=[];return {bind(...v){args=v;return this},async first(){return raw.prepare(sql).get(...args)||null},async all(){return {results:raw.prepare(sql).all(...args)}},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...args).changes)}}}}}};
 let stopped=false;const stop=()=>{stopped=true};process.on('SIGTERM',stop);process.on('SIGINT',stop);
 const statusPath=join(directory,'citizen-routing','mail-status.json');
 let reconciliation={at:null,healthy:true,examined:0,queued:0,skipped:0};
 const reconcile=()=>{try{reconciliation={at:new Date().toISOString(),healthy:true,...reconcileMail(raw)};}catch{reconciliation={at:new Date().toISOString(),healthy:false,error:'mail_reconciliation_failed'};}};
 reconcile();const reconcileTimer=setInterval(reconcile,2000);
 try{while(!stopped){
  const at=new Date().toISOString();let status;
  try{
   const keyPath=join(directory,'institution-recipients.key');const meta=await lstat(keyPath);if(!meta.isFile()||meta.isSymbolicLink())throw Error('recipient_key_unavailable');
   const recipients=createInstitutionRecipients({db,key:await accountKey(keyPath)}),sender=createGmailSender({directory});const errors=[];
   const outcome=await mailPass({db,decryptAddress:recipients.decrypt,sendWithIdempotency:sender.send,portalUrl:'https://umraniyeosint.com/kurum',onError:e=>errors.push(e.code)});
   let adminAlerts={configured:false,sent:0,dead:0,queued:0};
   try{const alerts=JSON.parse(await readFile(join(directory,'citizen-routing','critical-alerts.json'),'utf8'));await queueAdminHealthAlerts({directory,state:alerts});adminAlerts=await dispatchAdminHealthMail({directory});}catch{adminAlerts={configured:true,healthy:false,error:'admin_alert_delivery_failed'};}
   const queue=raw.prepare('SELECT state,count(*) AS count FROM coord_mail_outbox GROUP BY state').all();
   const pending=raw.prepare("SELECT count(*) AS count,min(created_at) AS oldest FROM coord_mail_outbox WHERE state='queued'").get();
   const overdue=raw.prepare("SELECT count(*) AS count FROM coord_mail_outbox WHERE state='queued' AND next_attempt_at<=?").get(new Date(Date.now()-120000).toISOString()).count;
   const oldestPendingAgeSeconds=pending.oldest?Math.max(0,Math.floor((Date.now()-Date.parse(pending.oldest))/1000)):0;
   const unresolved=queue.filter(r=>r.state==='dead').reduce((sum,r)=>sum+r.count,0);
   status={at,healthy:adminAlerts.healthy!==false&&!adminAlerts.dead&&reconciliation.healthy&&!outcome.dead&&!errors.length&&!unresolved&&!overdue,...outcome,unresolvedDead:unresolved,queued:pending.count,oldestPendingAgeSeconds,overdue,queue,errors,reconciliation,adminAlerts};
  }catch{status={at,healthy:false,error:'mail_worker_failed'};}
  try{await writeFile(statusPath+'.tmp',JSON.stringify(status),{mode:0o600});await rename(statusPath+'.tmp',statusPath);}catch{console.error(JSON.stringify({event:'institution_mail_status_write_failed'}));}
  if(!status.healthy||status.sent)console.log(JSON.stringify({event:'institution_mail_pass',...status}));
  if(!stopped)await sleep(1000);
 }}finally{clearInterval(reconcileTimer);raw.close();process.off('SIGTERM',stop);process.off('SIGINT',stop);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await watchMail();
