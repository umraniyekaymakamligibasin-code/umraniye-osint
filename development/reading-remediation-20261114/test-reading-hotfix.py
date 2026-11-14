"""Offline regression: a real exception class name must stop the whole account round."""
import importlib.util,json,pathlib,tempfile,time,unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).parent/'candidate'
def module(name,path):
 spec=importlib.util.spec_from_file_location(name,path);value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
class Tests(unittest.TestCase):
 def test_throttled_client_stops_after_first_account_and_persists_cooldown(self):
  m=module('media_hotfix',ROOT/'instagram-media/scanner.py');error=type('ClientThrottledError',(Exception,),{});calls=[]
  class Client:
   def __getattr__(self,name):
    def blocked(*args,**kwargs):calls.append(name);raise error('fixture')
    return blocked
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);state=root/'state.json'
   with patch.object(m,'ROOT',root),patch.object(m,'STATE',state),patch.object(m,'targets',return_value=['first','second','third']),patch.object(m,'connect',return_value={'accounts':[{'provider':'instagram','enabled':True}]}),patch.object(m,'load_client',return_value=Client()),patch.object(m,'log'):
    try:m.run_scan()
    except RuntimeError as e:self.assertEqual(str(e),'all_selected_accounts_failed')
    saved=json.loads(state.read_text());self.assertGreater(saved['cooldownUntil'],time.time());self.assertEqual(len(calls),1)
 def test_protected_database_is_not_reported_as_missing(self):
  m=module('audit_hotfix',ROOT/'application/scripts/osint-reading-audit.py')
  class Protected:
   def stat(self):raise PermissionError('fixture')
  self.assertEqual(m.aggregate_db(Protected(),'SELECT 1')['reason'],'permission_denied')
if __name__=='__main__':unittest.main()
