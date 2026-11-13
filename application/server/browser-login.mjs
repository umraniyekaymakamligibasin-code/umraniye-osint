import {spawn} from 'node:child_process';
import {childEnv} from './child-env.mjs';
import {access} from 'node:fs/promises';
const root='/opt/umraniye-osint-browser';
export function createBrowserLogin({dataDir,launch=spawn,available=()=>access(root+'/login-native.py').then(()=>true,()=>false)}={}){
 let process=null,provider=null,startedAt=null,mode=null,lastExit=null,lastMessage=null,lastBlockedHost=null;
 async function status(){return {available:await available(),provider:process?provider:null,startedAt:process?startedAt:null,mode,lastExit,lastMessage,lastBlockedHost};}
 function monitor(child){let buffer='';child.stdout?.on('data',chunk=>{buffer=(buffer+chunk.toString()).slice(-1024);for(const line of buffer.split('\n').slice(0,-1)){const code=line.trim().match(/^OSINT_LOGIN (navigation_failed|startup_failed|display_busy|helper_failed|sandbox_failed|browser_busy|waiting_browser)$/)?.[1];if(code)lastMessage=code;const host=line.trim().match(/^OSINT_LOGIN blocked_host ([a-z0-9.-]{1,253})$/)?.[1];if(host)lastBlockedHost=host;}buffer=buffer.split('\n').at(-1)});}
 function terminate(){const child=process;if(!child)return;child.kill('SIGTERM');if(process===child){const timer=setTimeout(()=>{if(process===child)child.kill('SIGKILL')},10000);timer.unref();child.once('exit',()=>clearTimeout(timer));}}
 async function action(action,account){
  if(!await available())throw Error('login_not_installed');
  if(action==='open'){
   if(process){if(provider!==account.provider||mode!=='login')throw Error('login_busy');return {...await status(),url:'/yonetim/browser/vnc.html?autoconnect=1&resize=scale&path=%2Fyonetim%2Fbrowser%2Fwebsockify'};}
   const child=launch(root+'/venv/bin/python',[root+'/login-native.py',account.provider],{env:childEnv({OSINT_BROWSER_DATA:dataDir,PLAYWRIGHT_BROWSERS_PATH:root+'/browsers'},processEnv()),stdio:['ignore','pipe','ignore'],windowsHide:true});
   lastMessage=null;lastExit=null;lastBlockedHost=null;monitor(child);process=child;provider=account.provider;mode='login';startedAt=new Date().toISOString();const release=(code,signal)=>{if(process===child){lastExit={at:new Date().toISOString(),provider,code:Number.isInteger(code)?code:null,signal:typeof signal==='string'?signal:null};process=null;provider=null;startedAt=null;mode=null}};child.once('exit',release);child.once('error',()=>release(-1,null));
   return {...await status(),url:'/yonetim/browser/vnc.html?autoconnect=1&resize=scale&path=%2Fyonetim%2Fbrowser%2Fwebsockify'};
  }
  if(action==='scan'||action==='check'){
   if(process)throw Error('browser_busy');
   const child=launch(root+'/venv/bin/python',[root+'/collector.py',action==='check'?'--check-provider':'--provider',account.provider],{env:childEnv({OSINT_BROWSER_DATA:dataDir,PLAYWRIGHT_BROWSERS_PATH:root+'/browsers'},processEnv()),stdio:'ignore',windowsHide:true});process=child;provider=account.provider;mode='scan';lastExit=null;lastMessage=null;lastBlockedHost=null;startedAt=new Date().toISOString();const release=(code,signal)=>{if(process===child){lastExit={at:new Date().toISOString(),provider,code:Number.isInteger(code)?code:null,signal:typeof signal==='string'?signal:null};process=null;provider=null;startedAt=null;mode=null}};child.once('exit',release);child.once('error',()=>release(-1,null));return {ok:true};
  }
  if(action==='close'){if(process&&provider!==account.provider)throw Error('login_busy');terminate();return {ok:true};}
  if(action==='logout'){
   if(process)throw Error('login_busy');
   // Asılı kalan bir çıkış betiği HTTP isteğini ve aktif istek sayacını süresiz tutmasın.
   await new Promise((resolve,reject)=>{const c=launch(root+'/venv/bin/python',[root+'/login-session.py',account.provider,'--logout'],{env:childEnv({OSINT_BROWSER_DATA:dataDir},processEnv()),stdio:'ignore',windowsHide:true});const timer=setTimeout(()=>{c.kill('SIGKILL');reject(Error('logout_timeout'))},60000);timer.unref?.();c.once('error',e=>{clearTimeout(timer);reject(e)});c.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('logout_failed'))})});return {ok:true};
  }
  throw Error('invalid_action');
 }
 return {status,action,stop(){terminate()}};
}
const processEnv=()=>globalThis.process.env;
