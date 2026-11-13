import collections,datetime as dt,json,os,sqlite3,subprocess,sys,time
from pathlib import Path
HERE=Path(__file__).resolve().parent;STATE=Path('/var/lib/umraniye-osint-facebook-fbgql-deneme')
def main():
    import fcntl
    os.umask(0o077)
    with (STATE/'run.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:print('{"status":"shadow_busy"}');return
        report={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'mode':'shadow','productionWrites':0,'telegramWrites':0,'browserStarted':False,'liveAttempted':False}
        con=sqlite3.connect(STATE/'shadow.sqlite');con.executescript('CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY,data TEXT NOT NULL);CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value INTEGER);')
        try:
            snap=json.loads((STATE/'snapshot.json').read_text(encoding='utf-8'));sources=snap['sources']
            if not sources:report['status']='no_enabled_sources';return
            cursor=con.execute("SELECT value FROM meta WHERE key='cursor'").fetchone();cursor=cursor[0] if cursor else 0
            source=sources[cursor%len(sources)];report.update(source=source['page_name'],sourceUrl=source['page_url'])
            if '--live' not in sys.argv:report['status']='dry_run_plan_only';return
            pause=con.execute("SELECT value FROM meta WHERE key='retryAt'").fetchone()
            if pause and pause[0]>time.time():report.update(status='backoff',retryAt=pause[0]);return
            busy=subprocess.run(['systemctl','show','umraniye-osint-browser-facebook.service','--property=ActiveState','--value'],capture_output=True,text=True,timeout=4)
            if busy.returncode or busy.stdout.strip() in ('active','activating','reloading'):report['status']='deferred_existing_facebook_round';return
            report['liveAttempted']=True
            p=subprocess.run([sys.executable,str(HERE/'reader.py')],input=json.dumps(source),capture_output=True,text=True,encoding='utf-8',timeout=45)
            if p.returncode:raise RuntimeError('reader_process_failed')
            data=json.loads(p.stdout);report.update({k:v for k,v in data.items() if k!='posts'})
            payload={'snapshot':snap,'posts':data['posts'],'now':time.time()*1000,'freshnessMinutes':60}
            a=subprocess.run(['node',str(HERE/'adapter.mjs')],input=json.dumps(payload,ensure_ascii=False),text=True,encoding='utf-8',capture_output=True,timeout=20)
            if a.returncode:raise RuntimeError('shared_filter_adapter_failed')
            accepted=0;new=0;reasons=collections.Counter()
            for e in json.loads(a.stdout)['result']:
                if e['decision']=='rejected':reasons[e['reason']]+=1;continue
                accepted+=1;new+=int(con.execute('SELECT 1 FROM posts WHERE id=?',(e['id'],)).fetchone() is None)
                con.execute('INSERT OR REPLACE INTO posts VALUES(?,?)',(e['id'],json.dumps(e,ensure_ascii=False)))
            report.update(uniqueRead=len({e['id'] for e in data['posts']}),accepted=accepted,newShadowRows=new,rejections=dict(reasons),newFreshShadowPostVerified=bool(new),existingScopeComparable=False)
            if data['status'] not in ('read_completed','empty_or_layout_changed'):
                con.execute('INSERT OR REPLACE INTO meta VALUES(?,?)',('retryAt',int(time.time()+3600)))
            else:con.execute('INSERT OR REPLACE INTO meta VALUES(?,?)',('cursor',cursor+1))
        except Exception as e:report.update(status='reader_error',errorType=type(e).__name__,newFreshShadowPostVerified=False)
        finally:
            con.commit();con.close();p=STATE/'report.json';t=p.with_suffix('.tmp');t.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');t.chmod(0o600);t.replace(p);print(json.dumps(report,ensure_ascii=False))
if __name__=='__main__':main()
