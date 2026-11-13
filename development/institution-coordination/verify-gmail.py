import importlib.util,unittest,smtplib
from pathlib import Path
s=importlib.util.spec_from_file_location('gmail',Path(__file__).parent/'server/gmail-smtp.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class SMTP:
 mode='ok'
 def __init__(self,*a,**kw):pass
 def __enter__(self):return self
 def __exit__(self,*a):pass
 def ehlo(self):pass
 def starttls(self,**kw):pass
 def login(self,*a):
  if self.mode=='auth':raise smtplib.SMTPAuthenticationError(535,b'rejected')
 def send_message(self,msg):
  assert str(msg['From'])=='umraniyekaymakamligibasin@gmail.com'
  if self.mode=='timeout':raise TimeoutError()
  return {}
class Tests(unittest.TestCase):
 def test_delivery_states(self):
  payload={'to':'test@example.invalid','password':'not-real','idempotencyKey':'one','text':'test fixture'}
  SMTP.mode='ok';self.assertTrue(m.deliver(payload,SMTP)['ok'])
  SMTP.mode='auth';self.assertTrue(m.deliver(payload,SMTP)['definitelyNotSent'])
  SMTP.mode='timeout';self.assertFalse(m.deliver(payload,SMTP)['definitelyNotSent'])
 def test_header_injection(self):
  self.assertEqual(m.deliver({'to':'a@example.invalid\r\nBcc: x@y.invalid'})['code'],'recipient_invalid')
if __name__=='__main__':unittest.main()
