#!/usr/bin/env python3
"""Aggregate-only date lineage inspection. No network, write, service or secret access."""
import collections,datetime as dt,json,pathlib,sqlite3,urllib.parse

ROOT=pathlib.Path('/var/lib/umraniye-osint-deneme')
def canonical(value):
 try:
  u=urllib.parse.urlsplit(str(value or ''))
  parts=u.path.strip('/').split('/')
  if u.scheme!='https' or u.hostname not in ('instagram.com','www.instagram.com') or u.username or u.password or u.port or len(parts)!=2 or parts[0] not in ('p','reel'):return None
  return '/'.join(parts)
 except ValueError:return None
def instant(value):
 try:
  if isinstance(value,(float,int)) and not isinstance(value,bool):return float(value) if value>0 else None
  d=dt.datetime.fromisoformat(str(value).replace('Z','+00:00'))
  return d.timestamp() if d.tzinfo else None
 except (TypeError,ValueError,OverflowError):return None
def readonly(path):
 con=sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True,timeout=5);con.execute('PRAGMA query_only=ON');return con
def main():
 now=dt.datetime.now(dt.timezone.utc).timestamp();counts=collections.Counter();ages=collections.Counter();queue={};stored={}
 con=readonly(pathlib.Path('/var/lib/umraniye-osint-instagram-api/queue.sqlite'))
 try:
  for url,published,data in con.execute('SELECT url,published,data FROM posts'):
   key=canonical(url)
   if not key:continue
   payload=json.loads(data) if data else {}
   queue[key]={'column':instant(published),'payload':instant(payload.get('publishedAt'))}
 finally:con.close()
 con=readonly(ROOT/'osint.sqlite')
 try:
  for (data,) in con.execute('SELECT data FROM lab_items ORDER BY published_at DESC LIMIT 5000'):
   try:payload=json.loads(data)
   except ValueError:continue
   key=canonical(payload.get('url'))
   if key:stored[key]=instant(payload.get('publishedAt'))
  affected=con.execute('SELECT url,origin FROM ig_intelligence_decisions WHERE reason=?',('publication_time_unverified',)).fetchall()
 finally:con.close()
 review={};file=ROOT/'instagram-review.json'
 if file.exists() and file.stat().st_size<16000000:
  content=json.loads(file.read_text(encoding='utf-8'));items=content.get('items') or {}
  for item in items.values() if isinstance(items,dict) else items:
   if isinstance(item,dict) and (key:=canonical(item.get('url'))):review[key]=item
 origins=collections.Counter()
 for url,origin in affected:
  counts['dateUnverifiedDecisions']+=1;origins[str(origin)]+=1;key=canonical(url);item=review.get(key,{})
  counts['foundInReviewFile']+=key in review
  counts['reviewHasTopLevelPublication']+=instant(item.get('publishedAt')) is not None
  evidence=queue.get(key,{})
  counts['exactURLFoundInAPIQueue']+=bool(evidence)
  counts['exactURLFoundInCurrentStorage']+=key in stored
  pub=evidence.get('payload') or evidence.get('column') or stored.get(key)
  if pub is not None:
   counts['hasStoredPublicationEvidence']+=1
   age=now-pub
   ages['future' if age < -300 else 'within60m' if age<=3600 else 'within3h' if age<=10800 else 'within72h' if age<=72*3600 else 'olderThan72h']+=1
  else:counts['noStoredPublicationEvidence']+=1
  if evidence.get('column') and evidence.get('payload') and abs(evidence['column']-evidence['payload'])>1:counts['conflictingAPIDates']+=1
 print(json.dumps({'at':dt.datetime.now(dt.timezone.utc).isoformat(),'readOnly':True,'apiRequests':0,'databaseWrites':0,
  'servicesChanged':False,'messagesSent':0,'counts':dict(counts),'origins':dict(origins),'evidenceAgeGroups':dict(ages),
  'rawRecordsPrinted':False,'datesRepaired':False},ensure_ascii=False,indent=2))
if __name__=='__main__':
 try:main()
 except (PermissionError,sqlite3.Error):print(json.dumps({'result':'protected_data_requires_sudo','databaseWrites':0}));raise SystemExit(1)
