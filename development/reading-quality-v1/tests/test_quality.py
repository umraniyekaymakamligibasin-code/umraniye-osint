"""Isolated persistence, scheduling and delivery tests; no network or live data."""
import importlib.util,json,sqlite3,sys,tempfile,time,types,unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
if sys.platform=='win32':sys.modules.setdefault('fcntl',types.SimpleNamespace())
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
fb=load('fb_quality',ROOT/'facebook/worker.py')
ig=load('ig_quality',ROOT/'instagram/worker.py')
audit=load('reading_audit_quality',ROOT/'reading_audit.py')

class Facebook(unittest.TestCase):
 @unittest.skipIf(sys.platform=='win32','Actual POSIX locks checked on server staging')
 def test_round_defers_remaining_source_without_penalty_and_resumes_it(self):
  with tempfile.TemporaryDirectory() as directory:
   state=Path(directory);sources=[{'source_id':str(i),'page_name':'Source '+str(i)} for i in range(10)]
   (state/'snapshot.json').write_text(json.dumps({'at':fb.stamp(),'sources':sources}))
   calls=[]
   def process(args,**kwargs):
    if args[0]=='node':return types.SimpleNamespace(returncode=0,stdout='{"result":[]}')
    source=json.loads(kwargs['input']);calls.append(source['source_id'])
    return types.SimpleNamespace(returncode=0,stdout=json.dumps({'status':'read_completed','requests':6,'posts':[]}))
   with patch.object(fb.subprocess,'run',side_effect=process):
    first=fb.run(True,state)
   self.assertEqual(first['requests'],36);self.assertEqual(first['deferredByBudget'],4)
   db=sqlite3.connect(state/'shadow.sqlite')
   self.assertEqual(fb.meta(db,'cursor'),6)
   self.assertIsNone(db.execute('SELECT retry_at FROM source_state WHERE id=?',('6',)).fetchone());db.close()
   calls.clear()
   with patch.object(fb.subprocess,'run',side_effect=process):fb.run(True,state)
   self.assertEqual(calls[0],'6')
 @unittest.skipIf(sys.platform=='win32','Actual POSIX locks checked on server staging')
 def test_one_source_cannot_hold_cursor_forever(self):
  with tempfile.TemporaryDirectory() as directory:
   state=Path(directory);(state/'snapshot.json').write_text(json.dumps({'at':fb.stamp(),'sources':[{'source_id':str(i),'page_name':'Source'} for i in range(3)]}))
   def process(args,**kwargs):
    return types.SimpleNamespace(returncode=0,stdout='{"result":[]}' if args[0]=='node' else '{"status":"request_budget_reached","posts":[],"requests":8}')
   with patch.object(fb.subprocess,'run',side_effect=process):fb.run(True,state);fb.run(True,state)
   db=sqlite3.connect(state/'shadow.sqlite');self.assertEqual(fb.meta(db,'cursor'),1);db.close()
 def test_budget_does_not_create_ten_minute_backoff(self):
  for status in fb.DEFERRED_STATUSES:self.assertEqual(fb.source_delay(status),0)
 def test_restrictions_keep_full_backoff(self):
  for status in ['rate_limited','human_verification_required','public_access_blocked','redirect_requires_review']:
   self.assertEqual(fb.source_delay(status),3600)
  self.assertEqual(fb.source_delay('network_error'),600)
 def test_progress_does_not_call_empty_or_failed_read_success(self):
  con=sqlite3.connect(':memory:');fb.setup(con);source={'source_id':'one'}
  fb.progress(con,source,'empty_or_layout_changed',0,0,2)
  self.assertIsNone(con.execute('SELECT last_success FROM source_progress').fetchone()[0])
  fb.progress(con,source,'read_completed',12,2,5)
  success=con.execute('SELECT last_success FROM source_progress').fetchone()[0]
  fb.progress(con,source,'request_budget_reached',0,0,1)
  self.assertEqual(con.execute('SELECT last_success FROM source_progress').fetchone()[0],success)
  con.close()
 def test_every_eligible_source_reached_by_rotation(self):
  con=sqlite3.connect(':memory:');fb.setup(con);sources=[{'source_id':str(i)} for i in range(39)]
  covered=set();cursor=0
  for _ in range(8):
   selected=fb.select_sources(sources,con,cursor,time.time(),limit=5)
   covered.update(x['source_id'] for x in selected);cursor=(int(selected[-1]['source_id'])+1)%39
  self.assertEqual(len(covered),39);con.close()
 def test_first_seen_and_richer_text_survive_retry(self):
  con=sqlite3.connect(':memory:');fb.setup(con)
  first={'id':'one','fullText':'full original text','collectedAt':'2026-11-13T10:00:00Z'}
  fb.retain(con,first)
  item=fb.retain(con,{'id':'one','fullText':'short','collectedAt':'2026-11-13T10:05:00Z'})
  self.assertEqual(item['firstSeenAt'],first['collectedAt']);self.assertEqual(item['fullText'],first['fullText'])
  con.close()

class Instagram(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.directory=Path(self.temp.name)
  self.handles=['source'+str(i) for i in range(7)]
  self.worker=ig.Worker(self.directory,{'token':'fixture-not-a-credential','igUserId':'1','enabledSince':0},'fixture',
   {'version':1,'accounts':[{'handle':h,'enabled':True} for h in self.handles]})
 def tearDown(self):self.worker.db.close();self.temp.cleanup()
 def post(self,text='Namık Kemal mahallesinde olay yerine ambulans sevk edildi.'):
  return {'id':'12345','caption':text,'permalink':'https://www.instagram.com/reel/ABC12345/','timestamp':ig.iso(time.time()-120)}
 def test_waiting_source_does_not_consume_read_slot(self):
  self.worker.db.execute('INSERT INTO health VALUES(?,?,?,?)',('source0',time.time()+86400,1,'meta_error_110_2207013'))
  order,waiting=self.worker.source_order()
  self.assertEqual(len(order),3);self.assertNotIn('source0',order);self.assertEqual(waiting,['source0'])
 def test_disabled_sources_never_scheduled(self):
  self.worker.handles.remove('source2');self.assertNotIn('source2',self.worker.source_order()[0])
 def test_all_waiting_does_not_attempt_network(self):
  for handle in self.handles:self.worker.db.execute('INSERT INTO health VALUES(?,?,?,?)',(handle,time.time()+3600,1,'limited'))
  self.assertEqual(self.worker.source_order()[0],[])
 def test_least_recently_attempted_prevents_starvation(self):
  seen=set()
  for turn in range(3):
   order,_=self.worker.source_order();seen.update(order)
   for h in order:self.worker.source_progress({'handle':h,'status':'readable','read':25})
  self.assertEqual(seen,set(self.handles))
 def test_missing_text_recovery_keeps_original_discovery(self):
  with patch.object(ig,'now',return_value=1800000000):
   post=self.post('');self.assertEqual(self.worker.remember('source1',post),'text_missing')
  with patch.object(ig,'now',return_value=1800000300):
   post['caption']='Ümraniye bölgesinde yangın; ekiplerin müdahalesi sürüyor.'
   self.worker.remember('source1',post)
  row=self.worker.db.execute('SELECT discovered,data FROM posts').fetchone()
  self.assertEqual(row[0],1800000000);self.assertEqual(json.loads(row[1])['firstSeenAt'],ig.iso(1800000000))
 def test_duplicate_is_not_new_pending_and_cannot_reset_time(self):
  p=self.post();self.assertEqual(self.worker.remember('source1',p),'pending')
  first=self.worker.db.execute('SELECT discovered FROM posts').fetchone()[0]
  self.assertEqual(self.worker.remember('source1',p),'known')
  self.assertEqual(self.worker.db.execute('SELECT discovered FROM posts').fetchone()[0],first)
 def test_persistence_survives_reopen(self):
  self.worker.remember('source1',self.post());self.worker.db.close()
  self.worker.db=sqlite3.connect(self.directory/'queue.sqlite')
  self.assertEqual(self.worker.db.execute('SELECT status FROM posts').fetchone()[0],'pending')
 def test_http_success_without_explicit_receipt_does_not_ack(self):
  self.worker.remember('source1',self.post())
  with patch.object(self.worker,'submit',return_value=({'ok':True},{'acknowledgedUrls':[]})):
   self.worker.drain()
  self.assertEqual(self.worker.db.execute('SELECT status FROM posts').fetchone()[0],'pending')
 def test_retry_receipt_wins_over_ack(self):
  p=self.post();self.worker.remember('source1',p)
  with patch.object(self.worker,'submit',return_value=({'ok':True},{'acknowledgedUrls':[p['permalink']],'retryUrls':[p['permalink']]})):
   self.worker.drain()
  self.assertEqual(self.worker.db.execute('SELECT status FROM posts').fetchone()[0],'pending')
 def test_explicit_ack_marks_only_sent_post(self):
  p=self.post();self.worker.remember('source1',p)
  with patch.object(self.worker,'submit',return_value=({'accepted':1},{'acknowledgedUrls':[p['permalink']]})):
   report=self.worker.drain()
  self.assertEqual(report['acknowledged'],1)
  self.assertEqual(self.worker.db.execute('SELECT status FROM posts').fetchone()[0],'acknowledged')
 def test_old_content_cannot_be_delivered(self):
  self.worker.remember('source1',self.post())
  self.worker.db.execute('UPDATE posts SET published=?',(time.time()-ig.FRESH_SECONDS-600,));self.worker.db.commit()
  with patch.object(self.worker,'submit') as send:self.worker.drain();send.assert_not_called()
 def test_post_discovered_two_hours_late_is_still_delivered(self):
  p=self.post();p['timestamp']=ig.iso(time.time()-7200)
  self.assertEqual(self.worker.remember('source1',p),'pending')
  with patch.object(self.worker,'submit',return_value=({'accepted':1},{'acknowledgedUrls':[p['permalink']]})) as send:
   self.assertEqual(self.worker.drain()['acknowledged'],1);send.assert_called_once()
 def test_meta_rate_limit_pause_still_delivers_read_posts(self):
  p=self.post();self.worker.remember('source1',p)
  fingerprint=__import__('hashlib').sha256(b'fixture-not-a-credential').hexdigest()
  self.worker.control('global_pause',{'fingerprint':fingerprint,'retryAt':time.time()+3600,'code':4})
  with patch.object(self.worker,'submit',return_value=({'accepted':1},{'acknowledgedUrls':[p['permalink']]})),patch.object(self.worker,'discover') as api:
   report=self.worker.run()
  api.assert_not_called();self.assertEqual(report['status'],'api_backoff');self.assertEqual(report['pending'],0)
  self.assertEqual(self.worker.db.execute('SELECT status FROM posts').fetchone()[0],'acknowledged')
 def test_token_pause_keeps_login_status_without_delivery(self):
  self.worker.remember('source1',self.post())
  fingerprint=__import__('hashlib').sha256(b'fixture-not-a-credential').hexdigest()
  self.worker.control('global_pause',{'fingerprint':fingerprint,'authRequired':True})
  with patch.object(self.worker,'submit',return_value=({},{})) as send:report=self.worker.run()
  self.assertEqual(report['status'],'token_renewal_required');send.assert_called_once_with([],0,'login_required')
 def test_untrusted_links_and_dates_rejected(self):
  p=self.post();p['permalink']='https://evil.invalid/reel/ABC12345/'
  self.assertEqual(ig.normalized(p,'source1')[1],'invalid_url')
  p=self.post();p['timestamp']='2026-11-13T10:00:00'
  self.assertEqual(ig.normalized(p,'source1')[1],'date_missing')
 def test_source_error_does_not_poison_other_sources(self):
  def discover(handle,cursor=None):
   if handle=='source0':raise ig.MetaError({'code':110,'error_subcode':2207013})
   return {'data':[self.post()]}
  with patch.object(self.worker,'panel_enabled',return_value=True),patch.object(self.worker,'discover',side_effect=discover),patch.object(self.worker,'submit',return_value=({},{})),patch.object(self.worker,'drain',return_value={'submitted':0}),patch.object(ig.time,'sleep'):
   report=self.worker.run()
  self.assertEqual(len(report['sources']),3)
  self.assertEqual(report['sources'][0]['status'],'api_error')
  self.assertEqual(report['sources'][1]['status'],'readable')
 def test_same_id_across_pages_counts_once(self):
  p=self.post()
  def discover(handle,cursor=None):return {'data':[p]*25,'paging':{'cursors':{'after':'fixture'}}}
  self.worker.handles=['source1']
  with patch.object(self.worker,'panel_enabled',return_value=True),patch.object(self.worker,'discover',side_effect=discover),patch.object(self.worker,'submit',return_value=({},{})),patch.object(self.worker,'drain',return_value={'submitted':0}),patch.object(ig.time,'sleep'):
   report=self.worker.run()
  self.assertEqual(report['sources'][0]['read'],75)
  self.assertEqual(report['uniqueRead'],1);self.assertEqual(report['newIdentities'],1)

class Audit(unittest.TestCase):
 def test_snapshot_is_not_counted_as_x_read_round(self):
  data=[{'snapshotReady':True,'sources':15},{'mode':'shadow','status':'read_completed','uniqueRead':40,'liveAttempted':True}]
  report=audit.summarize('x',data,1800000000)
  self.assertEqual(report['rounds'],1);self.assertEqual(report['readableRounds'],1)
 def test_news_count_field_does_not_mean_source_rows(self):
  report=audit.summarize('news',[{'event':'collection_completed','sources':15,'successful':15,'failed':0}],1800000000)
  self.assertEqual(report['rounds'],1);self.assertEqual(report['readableRounds'],1)
 def test_rereads_are_not_new_news(self):
  data=[{'at':'2026-11-13T10:00:00Z','transport':'instagram_graph_api','status':'completed','uniqueRead':75,'newIdentities':0,
   'sources':[{'handle':'source1','status':'readable','read':75,'reasons':{'known':75}}]}]
  report=audit.summarize('instagram',data,1800000000)
  self.assertEqual(report['newIdentityObservations'],0);self.assertEqual(report['sources'][0]['knownReReads'],75)
  self.assertIsNone(report['score']);self.assertIsNone(report['referenceCorpusRecall'])
 def test_empty_round_not_successful_read(self):
  report=audit.summarize('facebook',[{'status':'no_readable_sources','liveAttempted':True,'sources':[{'source':'source','status':'empty_or_layout_changed','read':0}]}],1800000000)
  self.assertEqual(report['readableRounds'],0)
 def test_audit_does_not_export_post_text_or_keys(self):
  report=audit.summarize('instagram',[{'transport':'instagram_graph_api','status':'completed','token':'fixture','sources':[{'handle':'source1','status':'readable','read':1,'caption':'private fixture content'}]}],1800000000)
  raw=json.dumps(report);self.assertNotIn('fixture',raw);self.assertNotIn('caption',raw)

if __name__=='__main__':unittest.main(verbosity=2)
