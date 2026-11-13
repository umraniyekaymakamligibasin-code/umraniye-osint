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
    batches=[];terms=[]
    for g in groups:
        if g.get('kind')=='konum':continue
        for term in g['terms']:
            q=quoted(term)
            if q and q not in terms:terms.append(q)
    for start in range(0,len(terms),5):
        chunks=terms[start:start+5]
        batches.append({'kind':'keywords','query':'(Ümraniye OR Umraniye OR Dudullu) ('+' OR '.join(chunks)+')'})
    accounts=[]
    for r in sources:
        handle=str(r.get('handle') or '').lstrip('@')
        if re.fullmatch(r'[A-Za-z0-9_]{1,15}',handle):accounts.append('from:'+handle)
    if accounts:
        batches.append({'kind':'accounts','query':'('+' OR '.join(accounts[cursor%len(accounts):][:2] or accounts[:2])+')'})
    # Always one rotating keyword batch and one rotating real account batch, at most two calls.
    keywords=[p for p in batches if p['kind']=='keywords'];out=[]
    if keywords:out.append(keywords[cursor%len(keywords)])
    if accounts:out.append(batches[-1])
    since=(now-dt.timedelta(minutes=60)).strftime('%Y-%m-%d')
    for p in out:p['query']+=' since:'+since
    return out

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

async def collect(account_db,plans,output,limit=10):
    isolated_environment()
    from twscrape import API
    from twscrape.logger import logger
    logger.remove() # Never log raw upstream exceptions, headers, URLs, sessions.
    api=API(str(account_db),debug=False,raise_when_no_account=True,wait_timeout=0)
    accounts=await api.pool.get_all()
    if not accounts:raise RuntimeError('session_missing')
    if len(accounts)!=1:raise RuntimeError('one_independent_account_required')
    if not accounts[0].active:raise RuntimeError('session_inactive')
    for p in plans:
        async for tweet in api.search(p['query'],limit=limit,kv={'product':'Latest'}):
            output.append(normalize(tweet,p['query']))

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
    for unit in ('umraniye-osint-browser-x.service','umraniye-osint-sirali.service'):
        p=subprocess.run(['systemctl','show',unit,'--property=ActiveState','--value'],capture_output=True,text=True,timeout=4)
        if p.returncode or p.stdout.strip() in ('active','activating','reloading'):return True
    return False

async def guarded_collect(account_db,plans,raw,limit):
    task=asyncio.create_task(collect(account_db,plans,raw,limit))
    try:
        while not task.done():
            done,_=await asyncio.wait([task],timeout=2)
            if done:break
            if await asyncio.to_thread(old_busy):raise RuntimeError('existing_x_round_started')
        return await task
    finally:
        if not task.done():
            task.cancel()
            try:await task
            except asyncio.CancelledError:pass

def run(state,live=False):
    from prepare import states
    state=Path(state);state.mkdir(parents=True,exist_ok=True,mode=0o700)
    with locked(state/'round.lock'):
        started=time.monotonic();before=states();con=store(state/'shadow.sqlite')
        report={'at':stamp(),'mode':'shadow','telegramWrites':0,'productionWrites':0,'liveAttempted':False,'errorCount':0,'newLivePostVerified':False}
        try:
            snapshot=json.loads((state/'snapshot.json').read_text(encoding='utf-8'))
            if (utcnow()-dt.datetime.fromisoformat(snapshot['at'])).total_seconds()>3600:raise RuntimeError('snapshot_stale')
            config=json.loads((HERE/'config.example.json').read_text())
            if config['shadow'] is not True or config['telegram'] is not False or config['productionWrites'] is not False or config['freshnessMinutes']!=60:raise RuntimeError('unsafe_configuration')
            limit=max(1,min(10,int(config['resultsPerQuery'])));budget=max(10,min(90,int(config['timeoutSeconds'])))
            cursor=getmeta(con,'cursor');plans=plan(adapter(snapshot)['groups'],snapshot['sources'],cursor,utcnow())[:max(1,min(2,int(config['queriesPerRound'])))];report['plans']=plans
            report['dictionaryRevision']=snapshot['revision']
            if not live:report['status']='dry_run_plan_only';return report
            if time.time()<getmeta(con,'retryAt'):report['status']='backoff';report['retryAt']=getmeta(con,'retryAt');return report
            if not (state/'accounts.sqlite').exists():report['status']='session_missing';return report
            if old_busy():report['status']='deferred_existing_x_round';return report
            if not plans:report['status']='no_enabled_search_scope';return report
            report['liveAttempted']=True;raw=[];failure=None
            try:asyncio.run(asyncio.wait_for(guarded_collect(state/'accounts.sqlite',plans,raw,limit),timeout=budget))
            except Exception as exc:failure='deferred_existing_x_round' if isinstance(exc,RuntimeError) and str(exc)=='existing_x_round_started' else status_error(exc)
            # Retain each query provenance but filter every record through shared rules.
            unique={e['id']:e for e in raw};filtered=adapter(snapshot,list(unique.values()))['result'];reasons=collections.Counter();accepted=[];new=0
            for e in filtered:
                if e['decision']=='rejected':reasons[e['reason']]+=1;continue
                for query in sorted({r['query'] for r in raw if r['id']==e['id']}):new+=int(savepost(con,e,query))
                accepted.append(e['id'])
            def in_window(value):
                try:
                    t=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
                    return t.tzinfo is not None and 0<=(utcnow()-t).total_seconds()<=3600
                except (ValueError,TypeError,AttributeError):return False
            old={e['id'] for e in snapshot['existingX'] if in_window(e['publishedAt'])};found=set(unique);comparable={e['id'] for e in unique.values() if in_window(e['publishedAt'])}
            report.update(uniqueRead=len(found),comparisonWindowMinutes=60,datedInComparisonWindow=len(comparable),sharedWithExisting=len(comparable&old),shadowOnlyObserved=len(comparable-old),accepted=len(accepted),newShadowRows=new,rejections=dict(reasons),existingCoverageComparable=False,comparisonNote='Only ID overlap within reference snapshot; different scopes are not labelled missed',status=failure or ('read_completed' if found else 'empty_results'),errorCount=int(bool(failure)))
            report['newLivePostVerified']=bool(new) and not failure
            if failure and failure!='deferred_existing_x_round':
                failures=getmeta(con,'failures')+1;setmeta(con,'failures',failures);setmeta(con,'retryAt',time.time()+min(21600,600*2**min(failures-1,6)))
                report['retryAt']=getmeta(con,'retryAt')
            elif not failure:setmeta(con,'cursor',cursor+1);setmeta(con,'failures',0);setmeta(con,'retryAt',0)
            return report
        except Exception as exc:
            report.update(status=status_error(exc),errorCount=1)
            raise
        finally:
            report['durationSeconds']=round(time.monotonic()-started,3);report['resources']=resources();report['serviceObservation']={'before':before,'after':states(),'normalOldRoundObserved':False}
            con.execute('INSERT OR REPLACE INTO runs VALUES(?,?)',(report['at'],json.dumps(report,ensure_ascii=False)));con.commit();con.close()
            temp=state/'report.tmp';temp.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');temp.chmod(0o600);temp.replace(state/'report.json')

def main():
    os.umask(0o077);ap=argparse.ArgumentParser();ap.add_argument('--state',default='/var/lib/umraniye-osint-x-twscrape-deneme');ap.add_argument('--live',action='store_true');a=ap.parse_args()
    try:report=run(a.state,a.live);print(json.dumps(report,ensure_ascii=False));return 0
    except Exception as exc:print(json.dumps({'status':str(exc) if isinstance(exc,RuntimeError) and str(exc) in ('shadow_busy','snapshot_stale') else status_error(exc),'liveVerified':False}));return 1
if __name__=='__main__':sys.exit(main())
