"""Bounded anonymous Facebook supplement. Live writes only through separate publisher."""
import collections,datetime as dt,fcntl,json,os,sqlite3,subprocess,sys,time
from pathlib import Path
HERE=Path(__file__).resolve().parent;STATE=Path('/var/lib/umraniye-osint-facebook-fbgql-deneme')
def stamp():return dt.datetime.now(dt.timezone.utc).isoformat()
def setup(con):
 con.executescript('CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY,data TEXT NOT NULL);CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value INTEGER);CREATE TABLE IF NOT EXISTS candidates(id TEXT PRIMARY KEY,data TEXT NOT NULL,seen REAL NOT NULL);CREATE TABLE IF NOT EXISTS source_state(id TEXT PRIMARY KEY,retry_at REAL NOT NULL,last_attempt REAL NOT NULL);')
def meta(con,k,default=0):
 row=con.execute('SELECT value FROM meta WHERE key=?',(k,)).fetchone();return row[0] if row else default
def select_sources(sources,con,cursor,now,limit=10):
 rotated=sources[cursor%len(sources):]+sources[:cursor%len(sources)] if sources else []
 states=dict(con.execute('SELECT id,retry_at FROM source_state'))
 return [s for s in rotated if states.get(str(s['source_id']),0)<=now][:limit]
DEFERRED_STATUSES={'request_budget_reached','time_budget_reached'}

def source_delay(status):
 if status in DEFERRED_STATUSES or status in ('read_completed','empty_or_layout_changed'):return 0
 return 3600 if status in ('rate_limited','public_access_blocked','human_verification_required','redirect_requires_review') else 600

def progress(con,source,status,read,new,requests):
 con.execute('CREATE TABLE IF NOT EXISTS source_progress(id TEXT PRIMARY KEY,last_attempt REAL,last_success REAL,status TEXT,read_count INTEGER,new_identities INTEGER,requests INTEGER)')
 sid=str(source['source_id']);old=con.execute('SELECT last_success FROM source_progress WHERE id=?',(sid,)).fetchone()
 success=time.time() if status=='read_completed' and read>0 else (old[0] if old else None)
 con.execute('INSERT OR REPLACE INTO source_progress VALUES(?,?,?,?,?,?,?)',(sid,time.time(),success,status,read,new,requests))

def retain(con,e):
 old=con.execute('SELECT data FROM candidates WHERE id=?',(e['id'],)).fetchone()
 previous=json.loads(old[0]) if old else {}
 e={**e,'firstSeenAt':previous.get('firstSeenAt') or previous.get('collectedAt') or e['collectedAt']}
 if len(previous.get('fullText') or '')>len(e.get('fullText') or ''):
  e.update(fullText=previous['fullText'],description=previous.get('description') or previous['fullText'],title=previous.get('title') or previous['fullText'][:160])
 con.execute('INSERT OR REPLACE INTO candidates VALUES(?,?,?)',(e['id'],json.dumps(e,ensure_ascii=False),time.time()));return e

def run(live=False,state=STATE):
 state=Path(state);state.mkdir(mode=0o700,parents=True,exist_ok=True)
 with (state/'run.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  con=sqlite3.connect(state/'shadow.sqlite',timeout=5);setup(con);start=time.monotonic()
  report={'at':stamp(),'mode':'supplement-staging','productionWrites':0,'telegramWrites':0,'browserStarted':False,'liveAttempted':False,'maximumSourcesPerRound':10,'maximumPostsPerSource':12,'requestBudget':40,'freshAdmissionMinutes':60,'sources':[]}
  try:
   snap=json.loads((state/'snapshot.json').read_text())
   if time.time()-dt.datetime.fromisoformat(snap['at']).timestamp()>900:raise RuntimeError('snapshot_stale')
   sources=snap['sources'];cursor=meta(con,'cursor');selected=select_sources(sources,con,cursor,time.time())
   if not live:report.update(status='dry_run_plan_only',plannedSources=len(selected));return report
   if meta(con,'retryAt')>time.time():report.update(status='backoff',retryAt=meta(con,'retryAt'));return report
   requests=0;read=0;successful=0;observed=set();new_observed=set()
   report.update(deferredByBudget=0,sourceCoverage={'configured':len(sources),'scheduled':len(selected)})
   for source in selected:
    if time.monotonic()-start>=110 or 40-requests<5:
     index=next(i for i,s in enumerate(sources) if s['source_id']==source['source_id'])
     con.execute('INSERT OR REPLACE INTO meta VALUES(?,?)',('cursor',index));con.commit()
     report['deferredByBudget']+=len(selected)-len(report['sources'])
     break
    timeout=min(32,max(1,120-(time.monotonic()-start)))
    source={**source,'requestBudget':min(8,40-requests)}
    report['liveAttempted']=True
    try:
     result=subprocess.run([sys.executable,str(HERE/'reader.py')],input=json.dumps(source),capture_output=True,text=True,encoding='utf-8',timeout=timeout)
     if result.returncode:raise RuntimeError('reader_process_failed')
     data=json.loads(result.stdout)
    except subprocess.TimeoutExpired:data={'status':'time_budget_reached','posts':[],'requests':source['requestBudget']}
    except Exception:data={'status':'reader_process_failed','posts':[],'requests':source['requestBudget']}
    requests+=max(0,min(source['requestBudget'],int(data.get('requests',source['requestBudget']))));read+=len(data.get('posts',[]))
    source_new=0
    for e in data.get('posts',[]):
     if e['id'] not in observed and con.execute('SELECT 1 FROM candidates WHERE id=?',(e['id'],)).fetchone() is None:
      new_observed.add(e['id']);source_new+=1
     retain(con,e);observed.add(e['id'])
    status=data.get('status','reader_error');ok=status in ('read_completed','empty_or_layout_changed');successful+=int(status=='read_completed' and bool(data.get('posts')))
    defer_key='defer:'+str(source['source_id']);defer_count=meta(con,defer_key)+1 if status in DEFERRED_STATUSES else 0
    con.execute('INSERT OR REPLACE INTO meta VALUES(?,?)',(defer_key,defer_count))
    delay=source_delay(status)
    progress(con,source,status,len(data.get('posts',[])),source_new,data.get('requests',0))
    con.execute('INSERT OR REPLACE INTO source_state VALUES(?,?,?)',(str(source['source_id']),time.time()+delay,time.time()))
    index=next(i for i,s in enumerate(sources) if s['source_id']==source['source_id'])
    con.execute('INSERT OR REPLACE INTO meta VALUES(?,?)',('cursor',index if status in DEFERRED_STATUSES and defer_count<2 else (index+1)%len(sources)));con.commit()
    report['sources'].append({'source':source['page_name'],'status':status,'read':len(data.get('posts',[])),'requests':data.get('requests',0),'newIdentities':source_new,'deferred':status in DEFERRED_STATUSES})
    if status in DEFERRED_STATUSES:
     report['deferredByBudget']+=len(selected)-len(report['sources'])+1
     break
    if status in ('rate_limited','human_verification_required'):
     con.execute('INSERT OR REPLACE INTO meta VALUES(?,?)',('retryAt',int(time.time()+3600)));break
   con.execute('DELETE FROM candidates WHERE seen<?',(time.time()-72*3600,))
   raw=[json.loads(r[0]) for r in con.execute('SELECT data FROM candidates ORDER BY seen DESC LIMIT 2000')]
   payload={'snapshot':snap,'posts':raw,'now':time.time()*1000,'freshnessMinutes':60}
   result=subprocess.run(['node',str(HERE/'adapter.mjs')],input=json.dumps(payload,ensure_ascii=False),capture_output=True,text=True,encoding='utf-8',timeout=20,env={**os.environ,'DATA_DIR':str(state)})
   if result.returncode:raise RuntimeError('shared_filter_adapter_failed')
   reasons=collections.Counter();accepted=0;new=0
   for e in json.loads(result.stdout)['result']:
    if e['decision']=='rejected':reasons[e['reason']]+=1;continue
    accepted+=1;new+=int(con.execute('SELECT 1 FROM posts WHERE id=?',(e['id'],)).fetchone() is None)
    con.execute('INSERT OR REPLACE INTO posts VALUES(?,?)',(e['id'],json.dumps(e,ensure_ascii=False)))
   report.update(status='read_completed' if successful else 'no_readable_sources',sourceReads=len(report['sources']),uniqueRead=len(observed),newIdentities=len(new_observed),readCount=read,requests=requests,accepted=accepted,newShadowRows=new,rejections=dict(reasons),newFreshShadowPostVerified=new>0)
   return report
  except Exception as e:
   report.update(status=str(e) if isinstance(e,RuntimeError) else 'reader_error',errorType=type(e).__name__);return report
  finally:
   con.commit();con.close();report['durationSeconds']=round(time.monotonic()-start,3)
   temp=state/'report.tmp';temp.write_text(json.dumps(report,ensure_ascii=False,indent=2));temp.chmod(0o600);temp.replace(state/'report.json')
if __name__=='__main__':
 r=run('--live' in sys.argv);print(json.dumps(r,ensure_ascii=False));raise SystemExit(1 if r['status'] in ('reader_error','snapshot_stale','shared_filter_adapter_failed') else 0)
