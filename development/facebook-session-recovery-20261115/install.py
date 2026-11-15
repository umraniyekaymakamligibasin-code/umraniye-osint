#!/usr/bin/env python3
"""Version-checked Facebook login recovery; no credentials are exported."""
import argparse,base64,datetime,fcntl,gzip,hashlib,json,os,pathlib,pwd,shutil,signal,socket,sqlite3,subprocess,tempfile,time
BUNDLE='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'
APP=pathlib.Path('/opt/umraniye-osint-browser');DATA=pathlib.Path('/var/lib/umraniye-osint-deneme')
TIMERS=['umraniye-osint-sirali.timer','umraniye-osint-browser.timer','umraniye-osint-browser-x.timer','umraniye-osint-browser-facebook.timer','umraniye-osint-browser-instagram.timer']
SERVICES=[s.replace('.timer','.service') for s in TIMERS]
def run(args,check=True,**kw):return subprocess.run(args,check=check,**kw)
def active(u):return subprocess.run(['systemctl','show',u,'-p','ActiveState','--value'],capture_output=True,text=True).stdout.strip() in ('active','activating','reloading')
def safe(p):
 for q in [p,*p.parents]:
  if q.is_symlink():raise RuntimeError('symlink_path_rejected')
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None
def write(p,data,uid,gid,mode):
 safe(p);fd,tmp=tempfile.mkstemp(prefix='.fb-recovery-',dir=p.parent)
 try:
  with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno());os.fchown(f.fileno(),uid,gid);os.fchmod(f.fileno(),mode)
  os.replace(tmp,p)
 finally:pathlib.Path(tmp).unlink(missing_ok=True)
def port_open(port):
 try:
  with socket.create_connection(('127.0.0.1',port),timeout=.3):return True
 except OSError:return False
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');parser.add_argument('--login',action='store_true');args=parser.parse_args()
 if os.geteuid()!=0:raise RuntimeError('sudo_required')
 lock=open('/run/osint-reviewed-release.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 files=json.loads(gzip.decompress(base64.b64decode(BUNDLE)));user=pwd.getpwnam('osintdeneme');targets=[]
 for name,item in files.items():
  if pathlib.PurePosixPath(name).name!=name:raise RuntimeError('invalid_payload_path')
  p=APP/name;safe(p);actual=digest(p)
  if actual not in (item['before'],item['after']):raise RuntimeError('source_drift_no_install: '+name)
  data=base64.b64decode(item['content'])
  if hashlib.sha256(data).hexdigest()!=item['after']:raise RuntimeError('payload_hash_mismatch')
  compile(data,str(p),'exec');targets.append((name,p,item,data))
 if not args.apply:print(json.dumps({'result':'preflight_passed','files':len(files),'installed':False}));return
 if args.login and (port_open(6080) or port_open(5902)):raise RuntimeError('another_login_window_is_open')
 timers={t:active(t) for t in TIMERS};backup=None;installed=False;manifest=[];login_process=None
 def interrupted(*unused):raise KeyboardInterrupt
 for sig in (signal.SIGHUP,signal.SIGTERM,signal.SIGINT):signal.signal(sig,interrupted)
 try:
  for t,on in timers.items():
   if on:run(['systemctl','stop',t])
  deadline=time.monotonic()+360;notice=0
  while any(active(s) for s in SERVICES):
   if time.monotonic()>deadline:raise RuntimeError('existing_browser_round_busy_no_install')
   if time.monotonic()>notice:print('Mevcut tarama turu bekleniyor; tarayicilar zorla kapatilmaz.',flush=True);notice=time.monotonic()+30
   time.sleep(2)
  for name,p,item,data in targets:
   if digest(p) not in (item['before'],item['after']):raise RuntimeError('source_changed_during_wait')
  stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');root=pathlib.Path('/var/backups/umraniye-osint-reviewed');safe(root);root.mkdir(mode=0o700,exist_ok=True)
  if root.stat().st_uid!=0:raise RuntimeError('backup_not_root_owned')
  os.chmod(root,0o700);backup=root/('facebook-session-'+stamp);backup.mkdir(mode=0o700)
  for name,p,item,data in targets:
   st=p.stat() if p.exists() else None;meta={'name':name,'exists':st is not None,'uid':st.st_uid if st else user.pw_uid,'gid':st.st_gid if st else user.pw_gid,'mode':st.st_mode&0o777 if st else 0o640};manifest.append(meta)
   if st:shutil.copy2(p,backup/name)
  (backup/'manifest.json').write_text(json.dumps(manifest));shutil.copy2(__file__,backup/'installer.py')
  (backup/'geri-al.py').write_text("import importlib.util,pathlib,json,fcntl\np=pathlib.Path(__file__).parent\ns=importlib.util.spec_from_file_location('fb_restore',p/'installer.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nlock=open('/run/osint-reviewed-release.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)\nif any(m.active(u) for u in m.SERVICES):raise SystemExit('Once mevcut tarama turunun bitmesini bekleyin.')\nfor v in json.loads((p/'manifest.json').read_text()):\n target=m.APP/v['name']\n if v['exists']:m.write(target,(p/v['name']).read_bytes(),v['uid'],v['gid'],v['mode'])\n else:m.safe(target);target.unlink(missing_ok=True)\nprint('Yalniz Facebook kodu geri alindi; profil ve veriler korundu.')\n")
  installed=True
  for (name,p,item,data),meta in zip(targets,manifest):write(p,data,meta['uid'],meta['gid'],meta['mode'])
  result={'result':'facebook_session_guard_installed','siteRestarted':False,'telegramChanged':False,'profilesDeleted':False,'sessionVerified':False,'freshPostVerified':False,'backup':str(backup),'rollback':'sudo python3 '+str(backup/'geri-al.py')}
  if args.login:
   reportpath=DATA/'facebook-session-recovery-result.json';safe(reportpath);started=time.time()
   login_process=subprocess.Popen([str(APP/'venv/bin/python'),str(APP/'facebook-session-recovery.py')],user=user.pw_uid,group=user.pw_gid,extra_groups=os.getgrouplist(user.pw_name,user.pw_gid),env={**os.environ,'OSINT_BROWSER_DATA':str(DATA),'PLAYWRIGHT_BROWSERS_PATH':str(APP/'browsers')})
   login_exit=login_process.wait()
   try:report=json.loads(reportpath.read_text()) if reportpath.stat().st_mtime>=started else {}
   except (OSError,ValueError):report={}
   result['sessionVerified']=login_exit==0 and report.get('sessionVerified') is True and report.get('sameScannerProfile') is True
   if result['sessionVerified']:
    dbpath=DATA/'osint.sqlite';safe(dbpath)
    with sqlite3.connect(dbpath,timeout=15) as db:
     at=datetime.datetime.now(datetime.timezone.utc).isoformat()
     db.execute("INSERT INTO lab_config(id,data,revision,updated_at) VALUES('facebook-login-generation','{}',1,?) ON CONFLICT(id) DO UPDATE SET revision=lab_config.revision+1,updated_at=excluded.updated_at",(at,))
     result['loginSourcesReleased']=db.execute("UPDATE facebook_sources SET next_retry_at=NULL WHERE enabled=1 AND last_error_code IN ('facebook_login_required','facebook_verification_required')").rowcount
    result['result']='facebook_session_restored_normal_collection_pending'
   else:result['result']='facebook_login_not_verified_pauses_preserved'
  (backup/'report.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
 except Exception:
  if installed:
   for meta in manifest:
    p=APP/meta['name']
    if meta['exists']:write(p,(backup/meta['name']).read_bytes(),meta['uid'],meta['gid'],meta['mode'])
    else:safe(p);p.unlink(missing_ok=True)
  raise
 finally:
  if login_process is not None and login_process.poll() is None:
   login_process.terminate()
   try:login_process.wait(timeout=30)
   except subprocess.TimeoutExpired:login_process.kill();login_process.wait()
  for t,on in timers.items():
   if on:run(['systemctl','start',t],check=False,stdout=subprocess.DEVNULL)
  if any(active(t)!=on for t,on in timers.items()):raise RuntimeError('timer_restore_requires_attention')
if __name__=='__main__':
 try:main()
 except KeyboardInterrupt:print('Giris iptal edildi; onceki zamanlayici durumlari geri yuklendi.');raise SystemExit(1)
 except Exception as error:print('TAMAMLANAMADI: '+str(error));raise SystemExit(1)
