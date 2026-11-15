import importlib.util,pathlib,unittest,time
B=pathlib.Path(__file__).parent/'browser'
def module(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
a=module('access_test',B/'facebook_access_v63.py');r=module('session_test',B/'facebook-session-recovery.py')
class Access(unittest.TestCase):
 def test_login_wait_survives_time(self):
  state=a.access_state([{'status':'blocked','reasons':{'login_required':1}}]*2,3,100)
  self.assertEqual(state['reason'],'shared_login_required');self.assertTrue(a.is_paused(state,3,999999))
 def test_verified_generation_releases_login(self):
  state=a.access_state([{'status':'blocked','reasons':{'login_required':1}}]*2,3,100)
  self.assertFalse(a.is_paused(state,4,101))
 def test_rate_pause_survives_generation(self):
  state=a.access_state([{'status':'rate_limited'}],3,100)
  self.assertTrue(a.is_paused(state,4,101));self.assertFalse(a.is_paused(state,4,4000))
 def test_simultaneous_rate_and_challenge_keeps_rate_wait(self):
  state=a.access_state([{'status':'rate_limited'},{'status':'blocked','reasons':{'account_verification_required':1}}],3,100)
  self.assertEqual(state['reason'],'rate_limited');self.assertTrue(a.is_paused(state,4,101))
 def test_generic_403_not_login(self):
  state=a.access_state([{'status':'blocked','reasons':{'http_status':403}}]*4,3,100)
  self.assertEqual(state['reason'],'shared_access_restricted');self.assertFalse(state['requiresManualLogin'])
 def test_one_restricted_page_does_not_block_whole_account(self):
  state=a.access_state([{'status':'blocked','reasons':{'login_required':1}},{'status':'readable'}],3,100)
  self.assertIsNone(state['reason'])
 def test_challenge_requires_owner(self):
  state=a.access_state([{'status':'blocked','reasons':{'account_verification_required':1}}],3,100)
  self.assertTrue(a.is_paused(state,3,999999))
class Session(unittest.TestCase):
 def cookies(self,**kw):return [dict(name=n,domain='.facebook.com',expires=time.time()+100,**kw) for n in ('c_user','xs')]
 def test_valid_home_session(self):self.assertTrue(r.session_ready('https://www.facebook.com/',self.cookies(),False,True))
 def test_login_or_checkpoint_never_verified(self):
  for path in ('login/','checkpoint/','challenge/'):self.assertFalse(r.session_ready('https://www.facebook.com/'+path,self.cookies(),False,True))
 def test_password_visible_or_no_feed_not_verified(self):
  self.assertFalse(r.session_ready('https://www.facebook.com/',self.cookies(),True,True));self.assertFalse(r.session_ready('https://www.facebook.com/',self.cookies(),False,False))
 def test_cookie_pair_required(self):self.assertFalse(r.session_ready('https://www.facebook.com/',self.cookies()[:1],False,True))
 def test_expired_cookies_rejected(self):
  cookies=self.cookies()
  for c in cookies:c['expires']=time.time()-1
  self.assertFalse(r.session_ready('https://www.facebook.com/',cookies,False,True))
 def test_other_host_rejected(self):self.assertFalse(r.session_ready('https://facebook.com.other.invalid/',self.cookies(),False,True))
class Pacing(unittest.TestCase):
 def test_login_pacing_only_released_after_auth_not_rate_limit(self):
  self.assertTrue(r.can_release_pacing({'lastStatus':'verification_paused'},{},100))
  self.assertFalse(r.can_release_pacing({'lastStatus':'verification_paused'},{'reason':'rate_limited','retryAt':200},100))
  self.assertFalse(r.can_release_pacing({'lastStatus':'collected'},{},100))
class ReaderFlow(unittest.IsolatedAsyncioTestCase):
 async def test_two_login_gates_stop_remaining_sources_and_close_profile(self):
  import sys,types,tempfile,json,asyncio
  from unittest.mock import patch
  sys.modules['facebook_access_v63']=a
  reads=[]
  async def read_page(context,spec):reads.append(spec);return [],{'login_required':1},'blocked'
  def atomic(path,value):path.write_text(json.dumps(value))
  sys.modules['facebook_live_v4']=types.SimpleNamespace(read_page=read_page,atomic=atomic)
  sys.modules['source_checkpoints']=types.SimpleNamespace(observation=lambda *args:{},commit=lambda *args:None)
  sys.modules['facebook-media-v6']=types.SimpleNamespace(enrich=None)
  mod=module('public_flow_test',B/'facebook_public_v5.py')
  class Context:
   closed=False
   async def route(self,*args):pass
   async def close(self):self.closed=True
  ctx=Context()
  class Chromium:
   async def launch_persistent_context(self,*args,**kwargs):return ctx
  pw=types.SimpleNamespace(chromium=Chromium())
  sources=[{'page_url':'https://www.facebook.com/fixture'+str(i)+'/','page_name':'fixture','source_id':str(i)} for i in range(6)]
  def exchange(data,payload=None):return {'sources':sources,'loginGeneration':0} if payload is None else {}
  with tempfile.TemporaryDirectory() as d,patch.object(mod,'exchange',side_effect=exchange):
   result=await mod._collect(pw,{'profileURL':'https://www.facebook.com/'},{},pathlib.Path(d),None,None,pathlib.Path(d)/'profile')
   self.assertEqual(len(reads),2);self.assertTrue(ctx.closed);self.assertEqual(result['readCount'],0)
   state=json.loads((pathlib.Path(d)/'facebook-access-state-v63.json').read_text());self.assertTrue(state['requiresManualLogin'])
   class DeniedChromium:
    async def launch_persistent_context(self,*args,**kwargs):raise AssertionError('paused account launched a browser')
   paused=await mod._collect(types.SimpleNamespace(chromium=DeniedChromium()),{'profileURL':'https://www.facebook.com/'},{},pathlib.Path(d),None,None,pathlib.Path(d)/'profile')
   self.assertEqual(paused['status'],'verification_paused')
if __name__=='__main__':unittest.main()

