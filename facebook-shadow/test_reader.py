import json,pathlib,sys,time,unittest,subprocess,datetime as dt
from types import SimpleNamespace as Obj
from unittest.mock import patch
import reader
class ReaderTests(unittest.TestCase):
    def test_no_auth_or_proxy_or_external_destination(self):
        t=reader.BoundedTransport();reader.BoundedTransport.started=time.monotonic()
        for url,cookies in [('https://example.org',{}),('https://www.facebook.com',{'c_user':'fixture'})]:
            with self.assertRaises(reader.GuardStop):t.request('GET',url,{},cookies)
        with self.assertRaises(reader.GuardStop):t.get('https://www.facebook.com',{},proxy='http://invalid')
    def test_budget_and_deadline(self):
        t=reader.BoundedTransport();reader.BoundedTransport.max_requests=6;reader.BoundedTransport.requests_made=6;reader.BoundedTransport.started=time.monotonic()
        with self.assertRaisesRegex(reader.GuardStop,'request_budget_reached'):t.get('https://www.facebook.com',{})
        reader.BoundedTransport.requests_made=0;reader.BoundedTransport.started=time.monotonic()-36
        with self.assertRaisesRegex(reader.GuardStop,'time_budget_reached'):t.get('https://www.facebook.com',{})
    def test_metadata_preserves_source_date_and_reel_url(self):
        p=Obj(post_id='1234567890123456789',text='Ümraniye test metni',permalink='https://www.facebook.com/reel/2345678901234567890/',page_name='Fixture',created_time=1794500000)
        e=reader.normalized(p,{'source_id':'fixture','page_name':'Fixture','page_url':'https://www.facebook.com/fixture'})
        self.assertIsInstance(e['id'],str);self.assertTrue(e['publishedAt'].endswith('+00:00'));self.assertNotEqual(e['publishedAt'],e['collectedAt']);self.assertIn('/reel/',e['url'])
        p.created_time=None;self.assertIsNone(reader.normalized(p,{'source_id':'fixture','page_name':'Fixture','page_url':'https://www.facebook.com/fixture'})['publishedAt'])
    def test_http_throttle_stops_immediately(self):
        t=reader.BoundedTransport();reader.BoundedTransport.requests_made=0;reader.BoundedTransport.started=time.monotonic()
        response=Obj(status_code=429)
        class Managed:
            def __enter__(self):return response
            def __exit__(self,*args):pass
        with patch.object(t.session,'request',return_value=Managed()) as request:
            with self.assertRaisesRegex(reader.GuardStop,'rate_limited'):t.get('https://www.facebook.com',{})
            self.assertEqual(request.call_count,1)
    def test_real_library_api_is_posts_only(self):
        from fbgql import ScrapeJob
        j=ScrapeJob(page='fixture',max_posts=3,posts_only=True,workers=1,anonymous=True)
        self.assertTrue(j.posts_only);self.assertEqual(j.accounts,[]);self.assertEqual(j.workers,1)
    def decide(self,text,date=None,enabled=1):
        tables={'facebook_keywords':[{'id':1,'term':'yangın','aliases':'[]'},{'id':2,'term':'sporcu','aliases':'[]'}],'common_keyword_groups':[{'id':'events','name':'Olay','kind':'olay','priority':'P2','position':1}],'common_keyword_members':[{'keyword_id':i,'group_id':'events','provider':'facebook','enabled':enabled} for i in [1,2]],'common_keyword_state':[{'id':1,'revision':1}],'workspace_settings':[]}
        e={'id':'123','url':'https://www.facebook.com/reel/123/','title':text,'description':text,'fullText':text,'platform':'facebook','publishedAt':date or dt.datetime.now(dt.timezone.utc).isoformat()}
        p=subprocess.run(['node',str(pathlib.Path(__file__).parent/'adapter.mjs')],input=json.dumps({'snapshot':{'tables':tables,'sources':[],'revision':1},'posts':[e],'now':time.time()*1000,'freshnessMinutes':60}),capture_output=True,text=True,timeout=15)
        self.assertEqual(p.returncode,0,p.stderr);return json.loads(p.stdout)['result'][0]
    def test_shared_local_rules_and_active_facebook_membership(self):
        text='Ümraniye ilçesinde çıkan yangın itfaiye ekiplerinin müdahalesiyle söndürüldü.'
        self.assertEqual(self.decide(text)['decision'],'shadow_accepted');self.assertEqual(self.decide(text,enabled=0)['reason'],'keyword_missing')
    def test_shared_football_filter_preserves_other_municipal_sports(self):
        self.assertEqual(self.decide('Ümraniyespor maçında yangın paniği yaşandı ve ekipler müdahale etti.')['reason'],'excluded_umraniyespor')
        self.assertEqual(self.decide('Ümraniye Belediyesi Spor Kulübü sporcu öğrencimiz olimpiyat şampiyonu oldu ve altın madalya kazandı.')['decision'],'shadow_accepted')
    def test_no_foreign_city_road_false_positive(self):
        self.assertEqual(self.decide('Sakarya Karasu ilçesinde Ümraniye Caddesi üzerinde yangın çıktı ve ekipler söndürdü.')['decision'],'rejected')
    def test_old_publications_not_fresh_discoveries(self):
        old=(dt.datetime.now(dt.timezone.utc)-dt.timedelta(hours=2)).isoformat()
        self.assertEqual(self.decide('Ümraniye ilçesinde çıkan yangın itfaiye ekiplerinin müdahalesiyle söndürüldü.',date=old)['reason'],'outside_fresh_window')
if __name__=='__main__':unittest.main(verbosity=2)
