import datetime as dt,json,sqlite3,tempfile,time,unittest
from pathlib import Path
from types import SimpleNamespace as O
import reader,worker
class FacebookTests(unittest.TestCase):
 def test_anonymous_destination_cookie_and_budget_guards(self):
  t=object.__new__(reader.BoundedTransport);t.session=O(cookies={});reader.BoundedTransport.requests_made=0;reader.BoundedTransport.started=time.monotonic()
  for url in ['http://www.facebook.com/','https://evil.invalid/','https://www.facebook.com:8443/']:
   with self.assertRaises(reader.GuardStop):t.request('GET',url,{})
  with self.assertRaises(reader.GuardStop):t.request('GET','https://www.facebook.com/',{},cookies={'c_user':'no'})
  reader.BoundedTransport.requests_made=8;reader.BoundedTransport.max_requests=8
  with self.assertRaises(reader.GuardStop):t.request('GET','https://www.facebook.com/',{})
 def test_date_text_and_source_identity(self):
  p=O(post_id='123',text='Ümraniye yangın',created_time=1700000000,permalink='https://www.facebook.com/test/posts/123',page_name='Test')
  s={'source_id':'fb1','page_name':'Yerel Haber','page_url':'https://www.facebook.com/test/'}
  e=reader.normalized(p,s);self.assertEqual(e['facebookSourceId'],'fb1');self.assertEqual(e['facebookPostId'],'123');self.assertIn('+00:00',e['publishedAt']);self.assertEqual(e['fullText'],p.text)
  p.created_time=True;self.assertIsNone(reader.normalized(p,s)['publishedAt'])
  p.permalink='https://evil.invalid/123';self.assertIsNone(reader.normalized(p,s))
 def test_source_rotation_and_per_source_backoff(self):
  c=sqlite3.connect(':memory:');worker.setup(c);sources=[{'source_id':str(i)} for i in range(25)]
  c.execute('INSERT INTO source_state VALUES(?,?,?)',('1',time.time()+3600,time.time()))
  a=worker.select_sources(sources,c,0,time.time());self.assertEqual(len(a),10);self.assertNotIn('1',[s['source_id'] for s in a])
  b=worker.select_sources(sources,c,11,time.time());self.assertEqual(b[0]['source_id'],'11');c.close()
 def test_partial_text_does_not_destroy_full_text_or_first_seen(self):
  c=sqlite3.connect(':memory:');worker.setup(c);e={'id':'123','fullText':'tam haber metni','description':'tam haber metni','title':'tam haber','collectedAt':'2026-11-13T12:00:00Z'}
  worker.retain(c,e);e.update(fullText='',description='',collectedAt='2026-11-13T12:10:00Z');saved=worker.retain(c,e)
  self.assertEqual(saved['fullText'],'tam haber metni');self.assertEqual(saved['firstSeenAt'],'2026-11-13T12:00:00Z');self.assertEqual(c.execute('SELECT count(*) FROM candidates').fetchone()[0],1);c.close()
 def test_budget_stop_keeps_already_read_feed_pages(self):
  from unittest.mock import patch
  try:from fbgql import runner
  except ModuleNotFoundError:self.skipTest('fbgql vendor copy is not present in this directory')
  from fbgql.models import Post
  now=int(time.time());calls=[]
  page=[Post(post_id=str(i),feedback_id=None,text='Ümraniye haber '+str(i),permalink='https://www.facebook.com/test/posts/'+str(i),comment_count=0,created_time=now) for i in range(1,4)]
  def timeline(uid,cursor,*args):
   calls.append(cursor)
   if cursor:raise reader.GuardStop('request_budget_reached')
   return page,'next'
  with patch.object(runner,'_resolve_page_id_candidates',return_value=['100']),patch.object(runner,'_post_timeline',side_effect=timeline),patch.object(runner,'time',O(sleep=lambda s:None)):
   r=reader.read({'source_id':'fb1','page_name':'Yerel Haber','page_url':'https://www.facebook.com/test/','requestBudget':8})
  self.assertEqual(calls,[None,'next']);self.assertEqual(r['status'],'request_budget_reached');self.assertTrue(r['partial']);self.assertEqual([e['id'] for e in r['posts']],['1','2','3'])
if __name__=='__main__':unittest.main(verbosity=2)
