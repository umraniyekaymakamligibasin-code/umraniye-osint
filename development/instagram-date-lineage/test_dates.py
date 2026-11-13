"""Isolated evidence recovery and no-replay checks. No real data or network."""
import datetime as dt,importlib.util,json,sqlite3,sys,tempfile,types,unittest
from pathlib import Path

if sys.platform=='win32':sys.modules.setdefault('fcntl',types.SimpleNamespace())
spec=importlib.util.spec_from_file_location('tested_intelligence',Path(__file__).with_name('intelligence.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class Dates(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'queue.sqlite'
  self.now=dt.datetime(2026,11,13,18,30,tzinfo=dt.timezone.utc)
  self.date=self.now-dt.timedelta(days=2)
  self.url='https://www.instagram.com/reel/ABC12345/'
  self.item={'url':self.url,'title':'Ümraniye ilçesinde trafik kazası meydana geldi',
   'description':'Ümraniye ilçesinde trafik kazası meydana geldi. Polis ve ambulans ekipleri olay yerine sevk edildiği bildirildi.',
   'sourceName':'@fixture','firstSeenAt':'2026-11-12T12:00:00Z','dateEvidence':'unknown'}
  con=sqlite3.connect(self.path);con.execute('CREATE TABLE posts(id TEXT,url TEXT,published REAL,data TEXT)');con.close()
 def tearDown(self):self.tmp.cleanup()
 def insert(self,**changes):
  payload={'url':self.url,'publishedAt':self.date.isoformat(),'collectionMethod':'instagram_graph_api','apiMediaId':'12345'}
  payload.update(changes.pop('payload',{}))
  row={'id':'12345','url':self.url,'published':self.date.timestamp(),'data':json.dumps(payload)};row.update(changes)
  con=sqlite3.connect(self.path);con.execute('INSERT INTO posts VALUES(?,?,?,?)',tuple(row.values()));con.commit();con.close()
 def recover(self,item=None):return m.enrich_dates([item or self.item],self.path,self.now)[0]
 def test_exact_api_media_recovers_date(self):
  self.insert();item=self.recover()
  self.assertEqual(item['publishedAt'],self.date.isoformat());self.assertEqual(item['datePrecision'],'instant')
  self.assertEqual(item['_publicationEvidenceStatus'],'recovered_from_exact_api_media')
 def test_source_discovery_and_content_never_replaced(self):
  self.insert();item=self.recover()
  for field in ['firstSeenAt','sourceName','description','title']:self.assertEqual(item[field],self.item[field])
  self.assertNotIn('publishedAt',self.item)
 def test_old_recovery_archived_without_auto_approval(self):
  self.insert();decision=m.classify(self.recover(),self.now,[])
  self.assertEqual(decision[:2],('archive','older_than_3h_no_replay'))
 def test_recent_recovery_cannot_replay_historical_item(self):
  self.date=self.now-dt.timedelta(minutes=20);self.insert()
  self.assertEqual(m.classify(self.recover(),self.now,[])[:2],('review','historical_date_recovery_no_replay'))
 def test_unknown_stays_unknown(self):
  item=self.recover();self.assertNotIn('publishedAt',item)
  self.assertEqual(m.classify(item,self.now,[])[1],'publication_evidence_estimated')
 def test_wrong_url_never_supplies_date(self):
  self.insert(url='https://www.instagram.com/reel/OTHER123/');self.assertNotIn('publishedAt',self.recover())
 def test_wrong_media_id_never_supplies_date(self):
  self.insert(payload={'apiMediaId':'99999'});self.assertNotIn('publishedAt',self.recover())
 def test_payload_url_mismatch_never_supplies_date(self):
  self.insert(payload={'url':'https://www.instagram.com/p/OTHER123/'});self.assertNotIn('publishedAt',self.recover())
 def test_wrong_collection_method_not_trusted(self):
  self.insert(payload={'collectionMethod':'fixture_browser'});self.assertNotIn('publishedAt',self.recover())
 def test_column_payload_conflict_is_reported(self):
  self.insert(published=self.date.timestamp()+60);item=self.recover()
  self.assertNotIn('publishedAt',item);self.assertEqual(item['_publicationEvidenceStatus'],'conflicting_dates')
 def test_multiple_conflicting_rows_rejected(self):
  self.insert();self.date+=dt.timedelta(minutes=2);self.insert()
  self.assertEqual(self.recover()['_publicationEvidenceStatus'],'conflicting_dates')
 def test_future_evidence_rejected(self):
  self.date=self.now+dt.timedelta(hours=1);self.insert();self.assertNotIn('publishedAt',self.recover())
 def test_timezone_less_evidence_rejected(self):
  self.insert(payload={'publishedAt':'2026-11-12T12:00:00'});self.assertNotIn('publishedAt',self.recover())
 def test_missing_queue_does_not_create_database(self):
  path=self.path.with_name('missing.sqlite')
  item=m.enrich_dates([self.item],path,self.now)[0]
  self.assertEqual(item['_publicationEvidenceStatus'],'queue_unavailable');self.assertFalse(path.exists())
 def test_existing_date_is_preserved_even_if_queue_differs(self):
  self.insert();item={**self.item,'publishedAt':self.now.isoformat()}
  self.assertEqual(self.recover(item),item)
 def test_tracking_query_does_not_break_exact_permalink(self):
  self.insert();item=self.recover({**self.item,'url':self.url+'?utm_source=fixture'})
  self.assertEqual(item.get('publishedAt'),self.date.isoformat())
 def test_no_record_writes(self):
  self.insert();before=self.path.read_bytes();self.recover();self.assertEqual(before,self.path.read_bytes())
 def test_host_and_credentials_rejected(self):
  for url in ['https://instagram.com.evil.invalid/reel/ABC12345/','https://user@www.instagram.com/reel/ABC12345/','http://instagram.com/reel/ABC12345/']:
   self.assertIsNone(m.identity(url))

if __name__=='__main__':unittest.main(verbosity=2)
