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
