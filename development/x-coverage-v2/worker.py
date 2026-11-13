"""Independent X shadow collector. No delivery bridge, production DB, or Telegram client."""
import argparse, asyncio, collections, datetime as dt, json, os, re, sqlite3, subprocess, sys, time
from contextlib import contextmanager
from pathlib import Path
from zoneinfo import ZoneInfo

HERE=Path(__file__).resolve().parent
UTC=dt.timezone.utc

def utcnow():return dt.datetime.now(UTC)
def stamp():return utcnow().isoformat()

@contextmanager
def locked(path):
    f=open(path,'a+b')
    if f.tell()==0:f.write(b'0');f.flush()
    f.seek(0)
    try:
        if os.name=='nt':
            import msvcrt
            msvcrt.locking(f.fileno(),msvcrt.LK_NBLCK,1)
        else:
            import fcntl
            fcntl.flock(f.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
    except OSError:f.close();raise RuntimeError('shadow_busy') from None
    try:yield
    finally:
        if os.name=='nt':
            f.seek(0);msvcrt.locking(f.fileno(),msvcrt.LK_UNLCK,1)
        else:fcntl.flock(f.fileno(),fcntl.LOCK_UN)
        f.close()

def store(path):
    con=sqlite3.connect(path);con.execute('PRAGMA busy_timeout=2000')
    con.executescript('CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY,data TEXT NOT NULL,queries TEXT NOT NULL,first_seen TEXT NOT NULL,last_seen TEXT NOT NULL);CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS runs(at TEXT PRIMARY KEY,report TEXT NOT NULL);')
    return con
def getmeta(con,key,default=0):
    row=con.execute('SELECT value FROM meta WHERE key=?',(key,)).fetchone()
    return json.loads(row[0]) if row else default
def setmeta(con,key,value):con.execute('INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(key,json.dumps(value)))

def savepost(con,e,query):
    row=con.execute('SELECT queries FROM posts WHERE id=?',(e['id'],)).fetchone()
    queries=sorted(set((json.loads(row[0]) if row else [])+[query]))
    e={**e,'queries':queries,'publishedTurkey':dt.datetime.fromisoformat(e['publishedAt'].replace('Z','+00:00')).astimezone(ZoneInfo('Europe/Istanbul')).isoformat()}
    con.execute('INSERT INTO posts VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,queries=excluded.queries,last_seen=excluded.last_seen',(e['id'],json.dumps(e,ensure_ascii=False),json.dumps(queries),stamp(),stamp()))
    return row is None

def quoted(term):
    # Dictionary data cannot inject X operators, URLs, or quotes.
    term=re.sub(r'[^\w\sçğıöşüÇĞİÖŞÜ-]',' ',str(term),flags=re.UNICODE).strip()
    return '"'+term[:55]+'"' if term else None

def plan(groups,sources,cursor,now):
    from coverage import plans
    return plans(groups,sources,cursor,now)

def adapter(snapshot,posts=None):
    payload={'snapshot':snapshot,'posts':posts or [],'now':time.time()*1000,'freshnessMinutes':60}
    p=subprocess.run(['node',str(HERE/'adapter.mjs')],input=json.dumps(payload,ensure_ascii=False),text=True,encoding='utf-8',capture_output=True,timeout=20)
    if p.returncode:raise RuntimeError('filter_adapter_failed')
    return json.loads(p.stdout)

def normalize(tweet,query):
    sid=str(tweet.id_str);user=tweet.user
    if not re.fullmatch(r'\d{1,25}',sid):raise ValueError('invalid_post_id')
    handle=user.username
    if not re.fullmatch(r'[A-Za-z0-9_]{1,15}',handle):raise ValueError('invalid_author')
    when=tweet.date
    published=when.astimezone(UTC).isoformat() if isinstance(when,dt.datetime) and when.tzinfo else None
    text=str(tweet.rawContent or '')
    related=[]
    for name in ('retweetedTweet','quotedTweet'):
        nested=getattr(tweet,name,None)
        if nested:related.append({'text':str(nested.rawContent or ''),'username':str(nested.user.username),'name':str(nested.user.displayname)})
    return {'id':sid,'url':f'https://x.com/{handle}/status/{sid}','author':handle,'displayName':str(user.displayname),'sourceName':str(user.displayname),'title':text[:160],'description':text,'fullText':text,'metadata':related,'publishedAt':published,'collectedAt':stamp(),'platform':'x','source':'x','reader':'twscrape','query':query,'locationVerified':False}

def isolated_environment():
    for key in ('TWS_PROXY','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'):os.environ.pop(key,None)
    os.environ['TWS_HTTP_BACKEND']='httpx';os.environ['TWS_LOG_LEVEL']='CRITICAL'

async def collect(account_db,plans,output,limit=40,con=None):
    isolated_environment()
    from twscrape import API
    from twscrape.logger import logger
    from coverage import read_queries
    logger.remove()
    api=API(str(account_db),debug=False,raise_when_no_account=True,wait_timeout=0)
    accounts=await api.pool.get_all()
    if not accounts:raise RuntimeError('session_missing')
    if len(accounts)!=1:raise RuntimeError('one_independent_account_required')
    if not accounts[0].active:raise RuntimeError('session_inactive')
    await read_queries(api,plans,output,limit,con,normalize)

def status_error(exc):
    kind=type(exc).__name__
    if kind=='NoAccountError':return 'rate_limited_or_account_unavailable'
    if kind in ('AbortReqError','ApiError','XClIdParseError'):return 'access_error'
    if kind in ('TimeoutError','TimeoutExpired'):return 'time_budget_exceeded'
    if isinstance(exc,RuntimeError) and str(exc) in {'session_missing','session_inactive','one_independent_account_required','filter_adapter_failed'}:return str(exc)
    return 'reader_error'

def resources():
    try:
        import resource
        r=resource.getrusage(resource.RUSAGE_SELF);child=resource.getrusage(resource.RUSAGE_CHILDREN)
        return {'peakRSSKiB':r.ru_maxrss,'childPeakRSSKiB':child.ru_maxrss,'cpuSeconds':round(r.ru_utime+r.ru_stime+child.ru_utime+child.ru_stime,3)}
    except ImportError:return {'measurement':'RSS unavailable on this host','cpuSeconds':round(time.process_time(),3)}

def old_busy():
    if os.name=='nt':return True # live runs only from inspected Linux server
    # The sequential orchestrator stays active while Instagram/Facebook run too.
    # Only the actual legacy X reader conflicts with this shadow X request.
    p=subprocess.run(['systemctl','show','umraniye-osint-browser-x.service','--property=ActiveState','--value'],capture_output=True,text=True,timeout=4)
    return p.returncode!=0 or p.stdout.strip() in ('active','activating','reloading')

async def guarded_collect(account_db,plans,raw,limit,con=None):
    # Separate, manually supplied account; no browser process or legacy X mutation.
    return await collect(account_db,plans,raw,limit,con)

def run(state,live=False):
    from prepare import states
    from coverage import setup, persisted_candidates
    state=Path(state);state.mkdir(parents=True,exist_ok=True,mode=0o700)
    with locked(state/'round.lock'):
        started=time.monotonic();con=store(state/'shadow.sqlite');setup(con)
        report={'at':stamp(),'mode':'shadow','readerVersion':2,'telegramWrites':0,'productionWrites':0,'liveAttempted':False,'newLivePostVerified':False,'backupPromotionReady':False}
        try:
            snapshot=json.loads((state/'snapshot.json').read_text(encoding='utf-8'))
            if (utcnow()-dt.datetime.fromisoformat(snapshot['at'])).total_seconds()>3600:raise RuntimeError('snapshot_stale')
            config=json.loads((HERE/'config.example.json').read_text())
            if config['shadow'] is not True or config['telegram'] is not False or config['productionWrites'] is not False or config['freshnessMinutes']!=60:raise RuntimeError('unsafe_configuration')
            limit=max(1,min(40,int(config['resultsPerQuery'])));budget=max(10,min(120,int(config['timeoutSeconds'])))
            cursor=getmeta(con,'cursor');plans=plan(adapter(snapshot)['groups'],snapshot['sources'],cursor,utcnow())[:6]
            report.update(plans=plans,queryCount=len(plans),maximumResultsPerQuery=limit,timeoutSeconds=budget,dictionaryRevision=snapshot['revision'])
            if not live:report['status']='dry_run_plan_only';return report
            if time.time()<getmeta(con,'retryAt'):report.update(status='backoff',retryAt=getmeta(con,'retryAt'));return report
            if not (state/'accounts.sqlite').exists():report['status']='session_missing';return report
            if not plans:report['status']='no_enabled_search_scope';return report
            report['liveAttempted']=True;raw=[];failure=None
            try:asyncio.run(asyncio.wait_for(guarded_collect(state/'accounts.sqlite',plans,raw,limit,con),timeout=budget))
            except Exception as exc:failure=status_error(exc)
            # Raw candidates survive adapter failures; success is never acknowledged before storage.
            candidates=persisted_candidates(con,utcnow())
            filtered=adapter(snapshot,candidates)['result'];reasons=collections.Counter();new=0;accepted=0
            for e in filtered:
                if e['decision']=='rejected':reasons[e['reason']]+=1;continue
                accepted+=1;new+=int(savepost(con,e,'coverage-v2'))
            report.update(uniqueRead=len({e['id'] for e in raw}),retainedCandidates=len(candidates),accepted=accepted,newShadowRows=new,rejections=dict(reasons),status=failure or ('read_completed' if raw else 'empty_results'),errorCount=int(bool(failure)))
            report['newLivePostVerified']=bool(new) and not failure
            report['backupPromotionReady']=False
            report['liveCollectionVerified']=bool(raw) and not failure
            report['promotionBlocker']='existing_application_bridge_not_verified'
            # Rotate after partial failures as successful queries already committed checkpoints.
            setmeta(con,'cursor',cursor+1)
            if failure:
                failures=getmeta(con,'failures')+1;setmeta(con,'failures',failures);setmeta(con,'retryAt',time.time()+min(21600,600*2**min(failures-1,6)));report['retryAt']=getmeta(con,'retryAt')
            else:setmeta(con,'failures',0);setmeta(con,'retryAt',0)
            return report
        except Exception as exc:
            report.update(status=str(exc) if isinstance(exc,RuntimeError) and str(exc) in ('snapshot_stale','unsafe_configuration') else status_error(exc),errorCount=1)
            raise
        finally:
            report['pendingBackfillQueries']=con.execute('SELECT count(*) FROM coverage_queries WHERE backlog IS NOT NULL').fetchone()[0]
            report['durationSeconds']=round(time.monotonic()-started,3);report['resources']=resources()
            con.execute('INSERT OR REPLACE INTO runs VALUES(?,?)',(report['at'],json.dumps(report,ensure_ascii=False)));con.commit();con.close()
            temp=state/'report.tmp';temp.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');temp.chmod(0o600);temp.replace(state/'report.json')

def main():
    os.umask(0o077);ap=argparse.ArgumentParser();ap.add_argument('--state',default='/var/lib/umraniye-osint-x-twscrape-deneme');ap.add_argument('--live',action='store_true');a=ap.parse_args()
    try:report=run(a.state,a.live);print(json.dumps(report,ensure_ascii=False));return 0
    except Exception as exc:print(json.dumps({'status':str(exc) if isinstance(exc,RuntimeError) and str(exc) in ('shadow_busy','snapshot_stale') else status_error(exc),'liveVerified':False}));return 1
if __name__=='__main__':sys.exit(main())
