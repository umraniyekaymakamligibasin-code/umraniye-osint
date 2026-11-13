#!/usr/bin/env python3
"""Read-only aggregate operational evidence. No Graph, browser, delivery or raw export."""
import collections,datetime as dt,json,sqlite3,subprocess,sys
from pathlib import Path

UTC=dt.timezone.utc
UNITS={
 'news':'umraniye-osint-deneme.service',
 'x':'umraniye-osint-x-twscrape-deneme.service',
 'facebook':'umraniye-osint-facebook-fbgql-deneme.service',
 'instagram':'umraniye-osint-instagram-api.service',
}
def instant(s):
 try:
  d=dt.datetime.fromisoformat(str(s).replace('Z','+00:00'))
  return d.timestamp() if d.tzinfo else None
 except (ValueError,TypeError,OverflowError):return None

def summarize(provider,records,at):
 result={'rounds':0,'readableRounds':0,'roundStatuses':{},'sources':[],
  'referenceCorpusRecall':None,'precision':None,'score':None,
  'note':'Observed reads are not new publications. Scores require labelled references and visibility checks.'}
 statuses=collections.Counter();sources={};times=[];new_ids=0;unique_reads=0;deferred=0;accepted=0
 for record in records:
  status=record.get('status');event=record.get('event')
  if provider=='news':
   if event!='collection_completed':continue
   status='interrupted' if record.get('stopped') else 'completed'
   result['successfulSourceOperations']=result.get('successfulSourceOperations',0)+int(record.get('successful',0))
   result['failedSourceOperations']=result.get('failedSourceOperations',0)+int(record.get('failed',0))
  elif provider=='instagram':
   if record.get('transport')!='instagram_graph_api':continue
  elif not record.get('status') or not record.get('mode'):continue
  result['rounds']+=1;statuses[str(status or 'unreported')]+=1
  ts=instant(record.get('at'));times.extend([ts] if ts else [])
  readable=False
  unique_reads+=int(record.get('uniqueRead') or 0);new_ids+=int(record.get('newIdentities') or 0)
  accepted+=int(record.get('newShadowRows') or 0);deferred+=int(record.get('deferredByBudget') or 0)
  source_rows=record.get('sources')
  for row in source_rows if isinstance(source_rows,list) else []:
   if not isinstance(row,dict):continue
   identity=row.get('handle') or row.get('source')
   if not identity:continue
   key=str(identity)[:150];state=sources.setdefault(key,{'source':key,'attempts':0,'readableAttempts':0,'lastAttempt':None,'lastContentRead':None,'latestStatus':None,'knownReReads':0,'newIdentities':0})
   state['attempts']+=1;state['lastAttempt']=record.get('at');state['latestStatus']=row.get('status')
   if row.get('status') in ('readable','read_completed') and int(row.get('read') or 0)>0:
    state['readableAttempts']+=1;state['lastContentRead']=record.get('at');readable=True
   state['knownReReads']+=int((row.get('reasons') or {}).get('known',0))
   state['newIdentities']+=int(row.get('newIdentities') or 0)
  if readable or provider=='x' and status=='read_completed' and int(record.get('uniqueRead') or 0)>0 or provider=='news' and not record.get('stopped') and int(record.get('successful') or 0)>0:result['readableRounds']+=1
 result.update(roundStatuses=dict(statuses),sources=list(sources.values()),observedSpanHours=round((max(times)-min(times))/3600,2) if len(times)>1 else 0,
  latestRoundAgeMinutes=round((at-max(times))/60,1) if times else None,uniqueReadObservations=unique_reads,
  newIdentityObservations=new_ids,newStagingRows=accepted,budgetDeferredObservations=deferred,
  natural48HourObservationComplete=None)
 return result

def journal(unit):
 process=subprocess.run(['journalctl','-u',unit,'--since','48 hours ago','-n','6000','-o','cat','--no-pager'],
  capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=20)
 if process.returncode:raise RuntimeError('journal_unavailable')
 rows=[]
 for line in process.stdout.splitlines():
  if not line.startswith('{') or len(line)>1000000:continue
  try:value=json.loads(line)
  except (ValueError,TypeError):continue
  if isinstance(value,dict):rows.append(value)
 return rows

def aggregate_db(path,query):
 try:
  if not path.is_file():return {'available':False,'reason':'not_present'}
  con=sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True,timeout=3)
  try:
   con.execute('PRAGMA query_only=ON')
   return {'available':True,'counts':dict(con.execute(query).fetchall())}
  finally:con.close()
 except (OSError,sqlite3.Error):return {'available':False,'reason':'protected_or_schema_unavailable'}

def main():
 now=dt.datetime.now(UTC);report={'at':now.isoformat(),'readOnly':True,'apiRequests':0,'databaseWrites':0,'scansStarted':0,'messagesSent':0,'channels':{}}
 for provider,unit in UNITS.items():
  try:report['channels'][provider]=summarize(provider,journal(unit),now.timestamp())
  except (OSError,subprocess.SubprocessError,RuntimeError):report['channels'][provider]={'available':False,'reason':'journal_unavailable','score':None}
 report['instagramQueue']=aggregate_db(Path('/var/lib/umraniye-osint-instagram-api/queue.sqlite'),'SELECT status,count(*) FROM posts GROUP BY status')
 report['instagramDecisions']=aggregate_db(Path('/var/lib/umraniye-osint-deneme/osint.sqlite'),'SELECT reason,count(*) FROM ig_intelligence_decisions GROUP BY reason')
 report['acceptance']={'status':'evidence_incomplete','scoresRecalculated':False,'externalBrowserVerified':False,
  'missing':['frozen_labelled_reference_per_channel','publication_to_discovery_latency_sample','authorized_panel_visibility','48h_post_install_operation']}
 print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
