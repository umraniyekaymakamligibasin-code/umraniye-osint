import datetime as dt,json,sqlite3,tempfile,time,unittest
from pathlib import Path
from unittest.mock import patch
import publish

class PublisherTests(unittest.TestCase):
 def setup_paths(self,d):
  root=Path(d);source=root/'shadow.sqlite';main=root/'main.sqlite';state=root/'pub'
  with sqlite3.connect(source) as c:c.execute('CREATE TABLE posts(id TEXT PRIMARY KEY,data TEXT,first_seen TEXT)')
  with sqlite3.connect(main) as c:c.execute('CREATE TABLE lab_items(id TEXT PRIMARY KEY,data TEXT)')
  return source,main,state
 def post(self,c,sid,hours=0):
  t=(dt.datetime.now(dt.timezone.utc)-dt.timedelta(hours=hours)).isoformat();e={'url':'https://x.com/test/status/'+sid,'title':'Ümraniye haber','description':'Ümraniye yangın','fullText':'Ümraniye yangın','publishedAt':t,'collectedAt':t,'sourceName':'Yerel Haber'}
  c.execute('INSERT INTO posts VALUES(?,?,?)',(sid,json.dumps(e),t));c.commit();return e
 def test_only_fresh_pending_and_preserved_first_discovery(self):
  with tempfile.TemporaryDirectory() as d:
   source,main,state=self.setup_paths(d)
   with sqlite3.connect(source) as c:
    fresh=self.post(c,'1');self.post(c,'2',2);self.post(c,'3',-2)
    ledger=sqlite3.connect(':memory:');ledger.execute('CREATE TABLE deliveries(id TEXT PRIMARY KEY)')
    rows=publish.pending(c,ledger,time.time());self.assertEqual([r[0] for r in rows],['1']);self.assertEqual(rows[0][1]['firstSeenAt'],fresh['collectedAt'])
    ledger.execute('INSERT INTO deliveries VALUES(?)',('1',));self.assertEqual(publish.pending(c,ledger,time.time()),[]);ledger.close()
 def test_confirmed_delivery_not_replayed(self):
  with tempfile.TemporaryDirectory() as d:
   source,main,state=self.setup_paths(d)
   with sqlite3.connect(source) as c:e=self.post(c,'1')
   with sqlite3.connect(main) as c:c.execute('INSERT INTO lab_items VALUES(?,?)',('id',json.dumps(e)))
   config={'automationEnabled':True,'accounts':[{'provider':'x','enabled':True,'profileURL':'https://x.com/home'}],'revision':1,'groupRevision':1}
   receipt={'accepted':1,'rejected':0,'receipts':[{'provider':'x','profileURL':'https://x.com/home','storedUrls':[e['url']],'acknowledgedUrls':[e['url']],'retryUrls':[]}]}
   with patch.multiple(publish,STATE=state,SOURCE=source,MAIN=main),patch.object(publish,'exchange',side_effect=[config,receipt]) as network:
    r=publish.publish();self.assertEqual(r['confirmedInExistingStorage'],1)
    self.assertEqual(publish.publish()['status'],'no_pending_fresh_posts');self.assertEqual(network.call_count,2)
 def test_failed_post_keeps_pending(self):
  with tempfile.TemporaryDirectory() as d:
   source,main,state=self.setup_paths(d)
   with sqlite3.connect(source) as c:self.post(c,'1')
   config={'automationEnabled':True,'accounts':[{'provider':'x','profileURL':'https://x.com/home'}],'revision':1,'groupRevision':1}
   with patch.multiple(publish,STATE=state,SOURCE=source,MAIN=main),patch.object(publish,'exchange',side_effect=[config,TimeoutError()]):
    self.assertEqual(publish.publish()['status'],'publish_failed')
   with sqlite3.connect(state/'delivery.sqlite') as c:self.assertEqual(c.execute('SELECT count(*) FROM deliveries').fetchone()[0],0)
 def test_redirect_refused(self):
  with self.assertRaisesRegex(RuntimeError,'redirect_denied'):publish.NoRedirect().redirect_request(None,None,None,None,None,None)

if __name__=='__main__':unittest.main(verbosity=2)
