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
