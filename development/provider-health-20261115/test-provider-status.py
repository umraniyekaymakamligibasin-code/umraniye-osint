import importlib.util,json,pathlib,tempfile,time,unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).parent/'candidate'
def module(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
ig=module('ig_status_test',ROOT/'instagram-api/worker.py')
publisher=module('ig_publisher_test',ROOT/'instagram-api/publish_status.py')
class InstagramHealth(unittest.TestCase):
 def run_worker(self,mode):
  with tempfile.TemporaryDirectory() as tmp:
   w=ig.Worker(pathlib.Path(tmp),{'token':'fixture-only','igUserId':'1','enabledSince':0},'fixture',{'version':1,'accounts':[{'handle':'fixture','enabled':True}]})
   try:
    if mode=='waiting':w.db.execute('INSERT INTO health VALUES(?,?,?,?)',('fixture',time.time()+600,1,'meta_error_200_5258005'));w.db.commit()
    if mode=='error':outcome=ig.MetaError({'code':200,'error_subcode':5258005})
    elif mode=='expired':outcome=ig.MetaError({'code':190})
    elif mode=='content':outcome={'data':[{'id':'123','caption':'Ümraniye arayüz test verisi','permalink':'https://www.instagram.com/p/FIXTURE/','timestamp':ig.iso(),'media_type':'IMAGE'}]}
    else:outcome={'data':[]}
    with patch.object(w,'panel_enabled',return_value=True),patch.object(w,'discover',side_effect=outcome if isinstance(outcome,Exception) else None,return_value=outcome) as discover,patch.object(w,'drain',return_value={'status':'no_fresh_pending','submitted':0}),patch.object(w,'submit',return_value=({},{})),patch.object(ig.time,'sleep'):
     result=w.run()
     if mode=='waiting':discover.assert_not_called()
    return result
   finally:w.db.close()
 def test_waiting_is_not_completed(self):
  r=self.run_worker('waiting');self.assertEqual(r['status'],'source_backoff');self.assertEqual(r['attemptedSources'],0);self.assertEqual(r['waitingSourceStates'][0]['subcode'],5258005);self.assertTrue(r['retryAt'])
 def test_permission_error_is_not_rate_limit_or_completed(self):
  r=self.run_worker('error');self.assertEqual(r['status'],'source_errors');self.assertEqual(r['failedSources'],1);self.assertEqual(r['pauseReason'],'source_access_error')
 def test_empty_profile_is_not_content_read(self):
  r=self.run_worker('empty');self.assertEqual(r['status'],'empty_results');self.assertIsNone(r['lastContentReadAt'])
 def test_real_read_has_separate_timestamp(self):
  r=self.run_worker('content');self.assertEqual(r['status'],'completed');self.assertEqual(r['readSources'],1);self.assertTrue(r['lastContentReadAt'])
 def test_auth_pause_preserved(self):self.assertEqual(self.run_worker('expired')['status'],'token_renewal_required')
 def test_export_only_safe_waiting_fields(self):
  r=publisher.public_status({'waitingSources':1,'waitingSourceStates':[{'handle':'fixture','reason':'secret fixture text','code':200,'subcode':5258005,'retryAt':'not-a-date','token':'secret fixture text'}],'token':'secret fixture text'})
  self.assertNotIn('secret fixture text',json.dumps(r));self.assertEqual(r['waitingSourceStates'][0]['reason'],'source_backoff');self.assertNotIn('retryAt',r['waitingSourceStates'][0])
class FacebookRedirect(unittest.TestCase):
 def test_access_gates_stop_without_following_redirects(self):
  fb=module('fb_status_test',ROOT/'facebook-shadow/reader.py')
  for location,expected in [('https://www.facebook.com/login/?next=fixture','public_access_blocked'),('/checkpoint/fixture','human_verification_required'),('https://other.invalid/login/','redirect_requires_review'),('/different-page/','redirect_requires_review')]:
   transport=fb.BoundedTransport();fb.BoundedTransport.requests_made=0;fb.BoundedTransport.started=time.monotonic();fb.BoundedTransport.max_requests=8
   class Response:
    status_code=302;headers={'Location':location}
    def __enter__(self):return self
    def __exit__(self,*args):pass
   with patch.object(transport.session,'request',return_value=Response()) as request:
    with self.assertRaisesRegex(fb.GuardStop,expected):transport.get('https://www.facebook.com/fixture/',{})
    self.assertEqual(request.call_count,1);self.assertFalse(request.call_args.kwargs['allow_redirects'])
if __name__=='__main__':unittest.main()
