#!/usr/bin/env python3
"""Ümraniye OSINT DENEME Instagram intelligence: no browser, no Telegram, no auto publishing outside internal Haber Gündemi."""
import collections, datetime as dt, fcntl, hashlib, json, os, pathlib, re, sqlite3, sys, unicodedata, urllib.parse

ROOT=pathlib.Path('/var/lib/umraniye-osint-deneme')
DB=ROOT/'osint.sqlite'
REVIEW=ROOT/'instagram-review.json'
STATUS=ROOT/'instagram-intelligence-status.json'
LOCK=ROOT/'.instagram-intelligence.lock'
MARK='osint-auto-v1'
UTC=dt.timezone.utc
LOC=re.compile(r'\b(?:umraniye|dudullu|tepeustu|ihlamurkuyu|elmalikent|parseller|yamanevler|armaganevler|topagaci|altinsehir|tantavi|esenkent|hekimba[sş]i|adem yavuz|serifali|tatlisu|cemil meric)\b')
# Neighboring district alone is not a sufficient Ümraniye location.
NEIGHBOR=re.compile(r'\b(?:atasehir|sarikazi)\b')
EVENT=re.compile(r'\b(?:yangin\w*|kaza\w*|trafik\w*|yaral\w*|darp\w*|kavga\w*|cinayet\w*|olum\w*|vefat\w*|saldir\w*|silah\w*|bicak\w*|gozalti\w*|tutuklan\w*|operasyon\w*|yakalan\w*|hirsiz\w*|dolandir\w*|patlam\w*|deprem\w*|cokme\w*|gocuk\w*|su baskin\w*|sel\w*|tahliye\w*|mahsur\w*|arama kurtarma|itfaiye|ambulans|elektrik kesinti\w*|su kesinti\w*|yol kapan\w*|ulasim aksa\w*)\b')
PUBLIC=re.compile(r'\b(?:kaymakam\w*|valilik|belediye\w*|muhtar\w*|emniyet|polis|jandarma|okul\w*|hastane\w*|ilce saglik|milli egitim|afet|afad|kurum\w*|bakan\w*)\b')
DEVELOPMENT=re.compile(r'\b(?:duyuru\w*|uyari\w*|aciklama\w*|karar\w*|denetim\w*|toplanti\w*|proje\w*|acilis\w*|tahsis\w*|egitim\w*|basvur\w*|hizmet\w*|tedbir\w*|tatbikat\w*|yikim\w*|etkinlik\w*|ziyaret\w*)\b')
AD=re.compile(r'\b(?:reklam|sponsorlu|isbirligi|kampanya|indirim|firsat|siparis|satilik|kiralik|fiyat|rezervasyon|magaza|stok|alisveris)\b')
NOISE=re.compile(r'\b(?:umraniyespor|umraniye spor kulubu futbol)\b')
TOKEN=re.compile(r'[a-z0-9]{3,}')

def fold(s):
    s=str(s or '').casefold().replace('ı','i').replace('İ','i')
    return ''.join(c for c in unicodedata.normalize('NFKD',s) if not unicodedata.combining(c)).replace('ç','c').replace('ş','s').replace('ğ','g').replace('ö','o').replace('ü','u')

def when(value):
    try:
        if not isinstance(value,str) or 'T' not in value:return None
        d=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
        return d.astimezone(UTC) if d.tzinfo is not None else None
    except (ValueError,OverflowError):return None

def canonical(url):
    try:
        u=urllib.parse.urlsplit(str(url or ''))
        if u.scheme!='https' or u.hostname not in ('www.instagram.com','instagram.com') or u.username or u.password or u.port:return None
        m=re.fullmatch(r'/(p|reel)/([A-Za-z0-9_-]{5,80})/?',u.path)
        if not m:return None
        return 'https://www.instagram.com/'+m.group(1)+'/'+m.group(2)+'/'
    except ValueError:return None

def words(s):return set(TOKEN.findall(fold(s)))

"""Exact-publication evidence join. Reads the existing API queue; never requests data."""
import datetime as dt,json,sqlite3
from pathlib import Path
from urllib.parse import urlsplit
import re

def identity(value):
 try:
  u=urlsplit(str(value or ''))
  if u.scheme!='https' or u.hostname not in ('www.instagram.com','instagram.com') or u.username or u.password or u.port:return None
  m=re.fullmatch(r'/(p|reel)/([A-Za-z0-9_-]{5,80})/?',u.path)
  return '/'.join(m.groups()) if m else None
 except ValueError:return None

def stamp(value):
 try:
  if isinstance(value,(int,float)) and not isinstance(value,bool):
   d=dt.datetime.fromtimestamp(value,dt.timezone.utc)
  else:
   d=dt.datetime.fromisoformat(str(value).replace('Z','+00:00'))
   if d.tzinfo is None:return None
   d=d.astimezone(dt.timezone.utc)
  return d if d.year>=2010 else None
 except (ValueError,TypeError,OverflowError,OSError):return None

def enrich_dates(items,queue_path,clock):
 """Only dates from the exact URL, matching API media ID and matching queue timestamp."""
 wanted={identity(i.get('url')) for i in items if not stamp(i.get('publishedAt'))}
 wanted.discard(None)
 evidence={};conflicts=set();unavailable=False;con=None
 if wanted:
  try:
   con=sqlite3.connect(Path(queue_path).resolve().as_uri()+'?mode=ro',uri=True,timeout=3)
   con.execute('PRAGMA query_only=ON')
   for media_id,url,column,data in con.execute('SELECT id,url,published,data FROM posts WHERE published IS NOT NULL'):
    key=identity(url)
    if key not in wanted or not isinstance(data,str) or len(data)>100000:continue
    try:p=json.loads(data)
    except (ValueError,TypeError):continue
    if not isinstance(p,dict) or p.get('collectionMethod')!='instagram_graph_api' or str(p.get('apiMediaId') or '')!=str(media_id) or identity(p.get('url'))!=key:continue
    date=stamp(p.get('publishedAt'));other=stamp(column)
    if not date or not other:continue
    if abs((date-other).total_seconds())>1 or date.timestamp()>clock.timestamp()+300:
     conflicts.add(key);continue
    if key in evidence and evidence[key]!=date:conflicts.add(key)
    evidence[key]=date
  except (OSError,sqlite3.Error):unavailable=True
  finally:
   if con:con.close()
 output=[]
 for item in items:
  if stamp(item.get('publishedAt')):output.append(item);continue
  key=identity(item.get('url'));copy=dict(item)
  if key in conflicts:copy['_publicationEvidenceStatus']='conflicting_dates'
  elif key in evidence:
   copy.update(publishedAt=evidence[key].isoformat(),datePrecision='instant',dateEvidence='instagram_graph_api_exact_media',
    timestampProvenance='instagram_graph_api_exact_media',_publicationEvidenceStatus='recovered_from_exact_api_media',
    _historicalDateRecovery=True)
  else:copy['_publicationEvidenceStatus']='queue_unavailable' if unavailable else 'no_exact_api_evidence'
  output.append(copy)
 return output


def classify(item,now,manual):
    url=canonical(item.get('url'))
    if not url:return 'archive','invalid_url',0,None
    text=' '.join(str(item.get(k) or '') for k in ('title','description','fullText')).strip()
    text=' '.join(text.split())
    n=fold(text);source=str(item.get('sourceName') or '').strip()
    p=when(str(item.get('publishedAt') or ''))
    evidence=fold(' '.join(str(item.get(k) or '') for k in ('dateEvidence','datePrecision','timestampProvenance')))
    if any(word in evidence for word in ('estimated','inferred','unknown','relative','tahmin')):
        return 'review','publication_evidence_estimated',0,p
    if NOISE.search(n):return 'archive','umraniyespor_football',0,p
    if not p:return 'review','publication_time_unverified',0,p
    age=(now-p).total_seconds()
    if age < -60:return 'review','publication_time_in_future',0,p
    if age > 10800:return 'archive','older_than_3h_no_replay',0,p
    if item.get('_historicalDateRecovery'):return 'review','historical_date_recovery_no_replay',0,p
    if len(n)<65 or len(words(text))<9:return 'review','text_insufficient',0,p
    loc=bool(LOC.search(n))
    if NEIGHBOR.search(n) and not re.search(r'\b(?:umraniye|dudullu|yamanevler|serifali|ihlamurkuyu)\b',n):loc=False
    inc=bool(EVENT.search(n));institution=bool(PUBLIC.search(n));development=bool(DEVELOPMENT.search(n))
    if AD.search(n) and not inc and not (institution and development):return 'archive','commercial_without_public_interest',0,p
    if not loc:return 'review','district_location_unverified',0,p
    if not inc and not (institution and development):return 'review','news_event_unclear',0,p
    if len(source)<3 or fold(source) in ('instagram','instagram hesabi','sosyal medya'):
        return 'review','source_unverified',0,p
    score=3+int(inc)*3+int(institution and development)*2+int(len(n)>105)+1
    sim=0.0;wt=words(text)
    for row in manual:
        other=words(' '.join(str(row.get(k) or '') for k in ('title','description')))
        if other:sim=max(sim,len(other&wt)/len(other|wt))
    if sim>=0.29:score+=1
    if score<7:return 'review','confidence_below_threshold',score,p
    return 'auto','local_recent_public_interest',score,p

def candidates(conn):
    allitems={}
    if REVIEW.exists() and REVIEW.stat().st_size<16000000:
        try:
            payload=json.loads(REVIEW.read_text(encoding='utf8'))
            for item in (payload.get('items') or {}).values():
                if isinstance(item,dict):
                    u=canonical(item.get('url'))
                    if u:allitems[u]={**item,'url':u,'_origin':'review'}
        except (ValueError,OSError,TypeError):pass
    tables={r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if 'lab_items' in tables:
        cols={r[1] for r in conn.execute('PRAGMA table_info(lab_items)')}
        if {'data','published_at'}.issubset(cols):
            for row in conn.execute("SELECT data FROM lab_items WHERE published_at>=? ORDER BY published_at DESC LIMIT 1800",((dt.datetime.now(UTC)-dt.timedelta(days=3)).isoformat(),)):
                try:item=json.loads(row[0]);u=canonical(item.get('url'))
                except (ValueError,TypeError,AttributeError):continue
                if u and (item.get('platform')=='instagram' or item.get('sourceName','').lower().find('instagram')>=0):
                    old=allitems.get(u)
                    if old and len(str(old.get('fullText') or old.get('description') or ''))>len(str(item.get('fullText') or item.get('description') or '')):continue
                    allitems[u]={**item,'url':u,'_origin':'database'}
    return enrich_dates(list(allitems.values()),'/var/lib/umraniye-osint-instagram-api/queue.sqlite',dt.datetime.now(UTC))

def status_write(data):
    fd=os.open(STATUS,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o644)
    try:
        with os.fdopen(fd,'w',encoding='utf8') as f:json.dump(data,f,ensure_ascii=False);f.flush();os.fsync(f.fileno())
    finally:pass

def run():
    if not DB.is_file():raise RuntimeError('DENEME_DB_MISSING')
    ROOT.mkdir(parents=True,exist_ok=True)
    with LOCK.open('a+') as f:
        try:fcntl.flock(f.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:print('STATUS=SKIPPED_LOCKED');return
        con=sqlite3.connect(str(DB),timeout=5)
        con.execute('PRAGMA busy_timeout=5000')
        try:
            if con.execute('PRAGMA quick_check').fetchone()[0]!='ok':raise RuntimeError('DB_INTEGRITY_FAILED')
            cols={r[1] for r in con.execute('PRAGMA table_info(osint_editorial_approvals)')}
            expected={'item_key','original_url','platform','title','description','source_name','published_at','approved_at','approved_by'}
            if not expected.issubset(cols):raise RuntimeError('EDITORIAL_SCHEMA_MISMATCH')
            manual=[]
            for row in con.execute("SELECT original_url,title,description,published_at,source_name FROM osint_editorial_approvals WHERE platform='instagram' AND approved_by NOT LIKE 'osint-auto-%' AND approved_at>=? ORDER BY approved_at DESC LIMIT 60", ((dt.datetime.now(UTC)-dt.timedelta(days=30)).isoformat(),)):
                manual.append(dict(zip(('url','title','description','publishedAt','sourceName'),row)))
            now=dt.datetime.now(UTC);items=candidates(con);count=collections.Counter();sample=[];replay=collections.Counter()
            for m in manual:
                when_post=when(m.get('publishedAt'))
                if when_post:
                    r=classify(m,when_post+dt.timedelta(minutes=5),manual)[0];replay[r]+=1
            existing=set(canonical(r[0]) for r in con.execute('SELECT original_url FROM osint_editorial_approvals') if canonical(r[0]))
            con.execute('BEGIN IMMEDIATE')
            con.execute('''CREATE TABLE IF NOT EXISTS ig_intelligence_decisions
            (url TEXT PRIMARY KEY, decision TEXT NOT NULL, reason TEXT NOT NULL, score INTEGER NOT NULL,
             published_at TEXT, source_name TEXT, examined_at TEXT NOT NULL, origin TEXT NOT NULL)''')
            for item in items[:2000]:
                url=canonical(item.get('url'))
                if not url:continue
                decision,reason,score,published=classify(item,now,manual)
                count[decision]+=1
                if len(sample)<15:sample.append({'url':url,'decision':decision,'reason':reason,'score':score})
                con.execute('''INSERT INTO ig_intelligence_decisions (url,decision,reason,score,published_at,source_name,examined_at,origin)
                    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET decision=excluded.decision,reason=excluded.reason,
                    score=excluded.score,published_at=excluded.published_at,source_name=excluded.source_name,
                    examined_at=excluded.examined_at,origin=excluded.origin''',
                    (url,decision,reason,score,published.isoformat() if published else None,str(item.get('sourceName') or '')[:130],now.isoformat(),item.get('_origin','unknown')))
                if decision!='auto':continue
                if url in existing:
                    count['previously_approved']+=1
                    continue
                title=' '.join(str(item.get('title') or '').split())
                description=' '.join(str(item.get('fullText') or item.get('description') or '').split())
                if len(title)<12:title=description[:160]
                if len(description)<40 or len(title)<12:continue
                key=hashlib.sha256(url.encode('utf8')).hexdigest()
                cur=con.execute('''INSERT OR IGNORE INTO osint_editorial_approvals
                  (item_key,original_url,platform,title,description,source_name,published_at,approved_at,approved_by)
                  VALUES(?,?,?,?,?,?,?,?,?)''',
                  (key,url,'instagram',title[:220],('Instagram paylaşımına göre (bağımsız teyit yok): '+description)[:2200],str(item.get('sourceName') or 'Instagram')[:130],published.isoformat(),now.isoformat(),MARK))
                if cur.rowcount:count['new_auto_news']+=1;existing.add(url)
            con.commit()
            auto_total=con.execute("SELECT COUNT(*) FROM osint_editorial_approvals WHERE approved_by=?",(MARK,)).fetchone()[0]
            output={'event':'instagram_intelligence_v1','at':now.isoformat(),'read':len(items),'autoCandidates':count['auto'],
               'autoInserted':count['new_auto_news'],'autoTotal':auto_total,'previouslyApproved':count['previously_approved'],'review':count['review'],'archive':count['archive'],
               'manualInstagramApprovals':len(manual),'manualReplay':dict(replay),'exampleDecisions':sample,
               'publicationEvidence':dict(collections.Counter(item.get('_publicationEvidenceStatus','existing_date') for item in items)),
               'telegram':'not_sent','note':'Otomatik haberler kaynak bildirimi olarak işaretlenir; resmi teyit değildir'}
            status_write(output);print(json.dumps(output,ensure_ascii=False,default=str))
        finally:con.close()

if __name__=='__main__':
    if '--date-audit' in sys.argv:
        con=sqlite3.connect(DB.resolve().as_uri()+'?mode=ro',uri=True,timeout=5)
        try:
            con.execute('PRAGMA query_only=ON');con.execute('BEGIN')
            items=candidates(con);clock=dt.datetime.now(UTC)
            counts=collections.Counter();ages=collections.Counter()
            for item in items:
                state=item.get('_publicationEvidenceStatus','existing_date');counts[state]+=1
                if state=='recovered_from_exact_api_media':
                    age=(clock-when(item['publishedAt'])).total_seconds()
                    ages['within3h' if age<=10800 else 'within72h' if age<=72*3600 else 'olderThan72h']+=1
            print(json.dumps({'readOnly':True,'apiRequests':0,'databaseWrites':0,'messagesSent':0,
                'publicationEvidence':dict(counts),'recoveredDateAgeGroups':dict(ages),'historicalReplay':False},ensure_ascii=False))
        finally:con.close()
    elif '--selftest' in sys.argv:
        now=dt.datetime.now(UTC);base={'url':'https://www.instagram.com/p/ABC123zz/','sourceName':'Ümraniye yerel haber','publishedAt':now.isoformat(),
          'title':'Ümraniye Dudullu bölgesinde trafik kazası meydana geldi',
          'description':'Ümraniye Dudullu bölgesinde trafik kazası meydana geldi. Polis ve sağlık ekipleri olay yerine sevk edildiği bildirildi.'}
        assert classify(base,now,[])[0]=='auto',classify(base,now,[])
        assert classify({**base,'publishedAt':(now-dt.timedelta(days=1)).isoformat()},now,[])[0]=='archive'
        assert classify({**base,'title':'Ümraniyespor futbol kulübü','description':'Ümraniyespor futbol kulübü ' + base['description']},now,[])[0]=='archive'
        assert classify({**base,'publishedAt':''},now,[])[0]=='review'
        assert classify({**base,'title':'Ümraniye alışveriş mağazası kampanyası','description':'Ümraniye mağazasında kampanya indirim kiralık fırsat ve fiyat avantajları duyuruldu.'},now,[])[0]!='auto'
        print('SELFTEST_OK=1')
    else:run()
