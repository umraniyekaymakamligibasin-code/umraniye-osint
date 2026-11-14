"""Local Facebook supplement publisher; no cookies, login, or Telegram client."""
import datetime as dt,fcntl,hashlib,json,os,sqlite3,time,urllib.request,urllib.error
from pathlib import Path
from contextlib import closing
STATE=Path('/var/lib/umraniye-osint-facebook-supplement')
SOURCE=Path('/var/lib/umraniye-osint-facebook-fbgql-deneme/shadow.sqlite')
MAIN=Path('/var/lib/umraniye-osint-deneme/osint.sqlite')
KEY=Path('/var/lib/umraniye-osint-deneme/browser-service.key')
ENDPOINT='http://127.0.0.1:3001/api/admin/integrations/browser-worker'

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):raise RuntimeError('redirect_denied')

def exchange(payload=None):
    key=KEY.read_bytes().hex()
    data=json.dumps(payload,ensure_ascii=False).encode() if payload is not None else None
    req=urllib.request.Request(ENDPOINT,data=data,headers={'X-OSINT-Browser-Key':key,'Content-Type':'application/json'})
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
    with opener.open(req,timeout=35) as r:
        if r.status!=200:raise RuntimeError('bridge_http_error')
        body=r.read(1000001)
        if len(body)>1000000:raise RuntimeError('bridge_response_too_large')
        return json.loads(body)

def pending(source,ledger,now):
    output=[]
    for sid,data in source.execute('SELECT id,data FROM posts ORDER BY rowid DESC LIMIT 2000'):
        if ledger.execute('SELECT 1 FROM deliveries WHERE id=?',(sid,)).fetchone():continue
        e=json.loads(data)
        try:
            t=dt.datetime.fromisoformat(e['publishedAt'].replace('Z','+00:00'))
            if t.tzinfo is None or not 0<=now-t.timestamp()<=3600:continue
        except (ValueError,TypeError,KeyError):continue
        # Explicit whitelist; never forwards classification/notification overrides.
        row={k:e.get(k) for k in ['url','title','description','fullText','publishedAt','sourceName','author','firstSeenAt']}
        row['firstSeenAt']=e.get('firstSeenAt') or e.get('collectedAt')
        row['title']=str(row['title'] or row['fullText'] or '')[:400]
        row['description']=str(row['description'] or row['fullText'] or '')[:3000]
        row['fullText']=str(row['fullText'] or row['description'])[:30000]
        row['sourceName']=str(row['sourceName'] or row['author'] or 'Facebook')[:100]
        row['platform']='facebook';row['reader']='fbgql-backup'
        row['facebookPostId']=e.get('facebookPostId') or e['id']
        row['sourcePageUrl']=e.get('sourcePageUrl');row['facebookSourceId']=e.get('facebookSourceId')
        if not row['sourcePageUrl'] or not row['facebookSourceId']:continue
        # Match the existing backend URL canonicalization before receipt/storage checks.
        import urllib.parse
        u=urllib.parse.urlsplit(row['url']);q=urllib.parse.parse_qs(u.query)
        row['url']=urllib.parse.urlunsplit((u.scheme,u.netloc,u.path,urllib.parse.urlencode({k:q[k][0] for k in ['id','story_fbid','fbid'] if k in q}),''))
        if len(json.dumps(row,ensure_ascii=False).encode())>50000:continue
        if len(json.dumps([x[1] for x in output]+[row],ensure_ascii=False).encode())>54000:break
        output.append((sid,row))
        if len(output)>=20:break
    return output

def verify_storage(urls):
    if not urls:return 0
    with closing(sqlite3.connect(MAIN.as_uri()+'?mode=ro',uri=True,timeout=5)) as con:
        con.execute('PRAGMA query_only=ON')
        return sum(bool(con.execute("SELECT 1 FROM lab_items WHERE json_extract(data,'$.url')=? LIMIT 1",(url,)).fetchone()) for url in urls)

def publish():
    os.umask(0o077);STATE.mkdir(parents=True,exist_ok=True,mode=0o700)
    with open(STATE/'publish.lock','a+b') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        report={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'reader':'fbgql-backup','status':'no_pending_fresh_posts','testMessageSent':False,'browserHealthChanged':False,'automaticTimerEnabledByPublisher':False,'panelBrowserVerified':False}
        ledger=sqlite3.connect(STATE/'delivery.sqlite',timeout=5)
        ledger.execute('CREATE TABLE IF NOT EXISTS deliveries(id TEXT PRIMARY KEY,url TEXT NOT NULL,at TEXT NOT NULL,stored INTEGER NOT NULL)')
        try:
            with closing(sqlite3.connect(SOURCE.as_uri()+'?mode=ro',uri=True,timeout=5)) as source:
                source.execute('PRAGMA query_only=ON');batch=pending(source,ledger,time.time())
            if not batch:return report
            config=exchange()
            if not config.get('automationEnabled'):
                report['status']='existing_automation_disabled';return report
            groups={}
            for sid,e in batch:
                identity=(e['facebookSourceId'],e['sourcePageUrl'])
                groups.setdefault(identity,[]).append(e)
            payload={'reader':'fbgql-backup','revision':config['revision'],'groupRevision':config['groupRevision'],'results':[{'provider':'facebook','profileURL':url,'source_id':sid,'status':'collected','posts':posts} for (sid,url),posts in groups.items()]}
            answer=exchange(payload)
            receipts=answer.get('receipts',[])
            if not receipts or any(r.get('provider')!='facebook' or not isinstance(r.get('storedUrls'),list) for r in receipts):raise RuntimeError('backup_bridge_not_supported')
            sent={e['url']:sid for sid,e in batch};ack={u for r in receipts for u in r.get('acknowledgedUrls',[])};stored={u for r in receipts for u in r['storedUrls']}
            if not stored<=ack or not ack<=set(sent):raise RuntimeError('receipt_mismatch')
            verified=verify_storage(stored)
            if verified!=len(stored):raise RuntimeError('storage_receipt_unverified')
            for url in ack:ledger.execute('INSERT OR IGNORE INTO deliveries VALUES(?,?,?,?)',(sent[url],url,report['at'],int(url in stored)))
            ledger.commit()
            report.update(status='published' if stored else 'filtered_by_live_rules',submitted=len(batch),accepted=answer.get('accepted'),rejected=answer.get('rejected'),acknowledged=len(ack),stored=len(stored),confirmedInExistingStorage=verified,retry=sum(len(r.get('retryUrls',[])) for r in receipts),backupIntegrationVerified=verified>0)
            return report
        except Exception as exc:
            report.update(status='publish_failed',error='http_'+str(exc.code) if isinstance(exc,urllib.error.HTTPError) else str(exc) if isinstance(exc,RuntimeError) else type(exc).__name__)
            return report
        finally:
            ledger.close();p=STATE/'report.tmp';p.write_text(json.dumps(report,ensure_ascii=False,indent=2));p.chmod(0o600);p.replace(STATE/'report.json')

if __name__=='__main__':
    report=publish();print(json.dumps(report,ensure_ascii=False));raise SystemExit(1 if report['status']=='publish_failed' else 0)
