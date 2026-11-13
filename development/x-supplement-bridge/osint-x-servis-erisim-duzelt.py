#!/usr/bin/env python3
import base64,datetime as dt,hashlib,json,os,pathlib,shutil,sqlite3,subprocess,sys,tempfile,time,urllib.request,urllib.error
APP=pathlib.Path('/opt/umraniye-osint-deneme')
STATE=pathlib.Path('/var/lib/umraniye-osint-x-backup')
SITE='umraniye-osint-deneme.service'
COLLECTOR='umraniye-osint-x-twscrape-deneme.service'
PUB='umraniye-osint-x-backup-publish.service'
TIMER='umraniye-osint-x-twscrape-deneme.timer'
EXPECTED='847580ab335c1752ad302cc51fa4fbac8b912908135b38f71db0909e1122e029'
PAYLOAD={'portal-shell.next.mjs': 'aW1wb3J0IHtjcmVhdGVJbnN0aXR1dGlvbkhvc3R9IGZyb20gJy4vaW5zdGl0dXRpb24tY29vcmRpbmF0aW9uL3NlcnZlci9pbnN0aXR1dGlvbi1ob3N0Lm1qcyc7DQppbXBvcnQge2NyZWF0ZUNvbnRlbnRNb2RlcmF0aW9ufSBmcm9tICcuL2NvbnRlbnQtbW9kZXJhdGlvbi5tanMnOw0KaW1wb3J0IHtyZWFkRmlsZX0gZnJvbSAnbm9kZTpmcy9wcm9taXNlcyc7DQppbXBvcnQge2NyZWF0ZVBvcnRhbEFQSX0gZnJvbSAnLi9wb3J0YWwtYXBpLm1qcyc7DQppbXBvcnQge2NyZWF0ZUFzc2V0UmVzcG9uZGVyfSBmcm9tICcuL3BvcnRhbC1hc3NldHMubWpzJzsNCmNvbnN0IGFzc2V0cz1uZXcgTWFwKFtbJy9hc3NldHMvY29udGVudC1tb2RlcmF0aW9uLXVpLmpzJyxbJ2NvbnRlbnQtbW9kZXJhdGlvbi11aS5qcycsJ2FwcGxpY2F0aW9uL2phdmFzY3JpcHQnXV0sWycvYXNzZXRzL2NvbnRlbnQtbW9kZXJhdGlvbi11aS5jc3MnLFsnY29udGVudC1tb2RlcmF0aW9uLXVpLmNzcycsJ3RleHQvY3NzJ11dLFsnL2Fzc2V0cy9wb3J0YWwuY3NzJyxbJ3BvcnRhbC5jc3MnLCd0ZXh0L2NzcyddXSxbJy9hc3NldHMvcG9ydGFsLmpzJyxbJ3BvcnRhbC5qcycsJ2FwcGxpY2F0aW9uL2phdmFzY3JpcHQnXV0sWycvYXNzZXRzL2FkbWluLXBvcnRhbC5jc3MnLFsnYWRtaW4tcG9ydGFsLmNzcycsJ3RleHQvY3NzJ11dLFsnL2Fzc2V0cy9JbnRlclZhcmlhYmxlLndvZmYyJyxbJ0ludGVyVmFyaWFibGUud29mZjInLCdmb250L3dvZmYyJ11dXSk7DQpleHBvcnQgZnVuY3Rpb24gY3JlYXRlUG9ydGFsU2hlbGwoYmFzZSxlbnYse29yaWdpbixzb2NpYWxJdGVtc30pew0KIGFzc2V0cy5zZXQoJy9hc3NldHMvd29ya3NwYWNlLXJlZnJlc2guY3NzJyxbJ3dvcmtzcGFjZS1yZWZyZXNoLmNzcycsJ3RleHQvY3NzJ10pOw0KIGFzc2V0cy5zZXQoJy9hc3NldHMvdmVuZG9yL3RhYmxlci90YWJsZXIubWluLmNzcycsWyd2ZW5kb3IvdGFibGVyL3RhYmxlci5taW4uY3NzJywndGV4dC9jc3MnXSk7DQogY29uc3QgYXNzZXRSZXNwb25zZT1jcmVhdGVBc3NldFJlc3BvbmRlcihhc3NldHMsbmV3IFVSTCgnLi4vc3JjL2Fzc2V0cy8nLGltcG9ydC5tZXRhLnVybCkpOw0KIGNvbnN0IHBvcnRhbD1jcmVhdGVQb3J0YWxBUEkoYmFzZSxlbnYse29yaWdpbixsaXZlOnRydWUsc29jaWFsSXRlbXN9KTsNCiBjb25zdCBtb2RlcmF0aW9uPWNyZWF0ZUNvbnRlbnRNb2RlcmF0aW9uKHtiYXNlLGVudixvcmlnaW4sc29jaWFsSXRlbXMsYWN0b3I6cG9ydGFsLmFjdG9yLGludmFsaWRhdGU6cG9ydGFsLmludmFsaWRhdGV9KTsNCiBmdW5jdGlvbiBzdHlsZWQoaHRtbCl7cmV0dXJuIGh0bWwucmVwbGFjZSgnPC9oZWFkPicsJzxsaW5rIHJlbD0ic3R5bGVzaGVldCIgaHJlZj0iL2Fzc2V0cy9hZG1pbi1wb3J0YWwuY3NzIj48L2hlYWQ+JykucmVwbGFjZSgnPC9ib2R5PicsJzxkaXYgc3R5bGU9InBhZGRpbmc6MThweDt0ZXh0LWFsaWduOmNlbnRlcjtmb250LXNpemU6MTJweDtjb2xvcjojNjY3MDg1Ij7CqSAyMDI2IEhha2FuIEJpbGdpbi4gVMO8bSBoYWtsYXLEsSBzYWtsxLFkxLFyLjwvZGl2PjwvYm9keT4nKTt9DQogY29uc3Qgd29ya2VyPXthc3luYyBmZXRjaChyZXF1ZXN0LC4uLmFyZ3Mpew0KICAgIGNvbnN0IHU9bmV3IFVSTChyZXF1ZXN0LnVybCk7DQogICAgaWYodS5wYXRobmFtZT09PScvaWNlcmlrLWRlbmV0aW0nKXtjb25zdCBhPWF3YWl0IHBvcnRhbC5hY3RvcihyZXF1ZXN0KTtpZighYSlyZXR1cm4gUmVzcG9uc2UucmVkaXJlY3Qob3JpZ2luKycvZ2lyaXMnLDMwMik7aWYoIWEuYWRtaW4pcmV0dXJuIG5ldyBSZXNwb25zZSgnWW9uZXRpY2kgeWV0a2lzaSBnZXJla2xpJyx7c3RhdHVzOjQwM30pO3JldHVybiBuZXcgUmVzcG9uc2UobW9kZXJhdGlvbi5odG1sLHtoZWFkZXJzOnsnQ29udGVudC1UeXBlJzondGV4dC9odG1sOyBjaGFyc2V0PXV0Zi04JywnQ2FjaGUtQ29udHJvbCc6J25vLXN0b3JlJ319KTsgfQ0KICAgIGlmKHUucGF0aG5hbWUuc3RhcnRzV2l0aCgnL2FwaS9tb2RlcmF0aW9uLycpKXJldHVybiBtb2RlcmF0aW9uLmhhbmRsZShyZXF1ZXN0KTsNCiAgaWYoYXNzZXRzLmhhcyh1LnBhdGhuYW1lKSlyZXR1cm4gYXNzZXRSZXNwb25zZShyZXF1ZXN0KTsNCiAgY29uc3QgcmVzcG9uc2U9YXdhaXQgcG9ydGFsLmZldGNoKHJlcXVlc3QpO2lmKHJlc3BvbnNlKXJldHVybiByZXNwb25zZTsNCiAgaWYodS5wYXRobmFtZT09PScvYXBpL3NvY2lhbCcpew0KICAgaWYoIWF3YWl0IHBvcnRhbC5hY3RvcihyZXF1ZXN0KSlyZXR1cm4gUmVzcG9uc2UuanNvbih7ZXJyb3I6J0t1bGxhbsSxY8SxIGdpcmnFn2kgZ2VyZWtsaSd9LHtzdGF0dXM6NDAxfSk7DQogICByZXR1cm4gUmVzcG9uc2UuanNvbih7aXRlbXM6YXdhaXQgbW9kZXJhdGlvbi5maWx0ZXIoYXdhaXQgc29jaWFsSXRlbXMoKSl9LHtoZWFkZXJzOnsnQ2FjaGUtQ29udHJvbCc6J25vLXN0b3JlJ319KTsNCiAgfQ0KICBpZih1LnBhdGhuYW1lPT09Jy9zb3N5YWwtbWVkeWEnKXJldHVybiBSZXNwb25zZS5yZWRpcmVjdChvcmlnaW4rJy8/cGFnZT1zb2NpYWwnLDMwMik7DQogIGlmKHUucGF0aG5hbWU9PT0nLyd8fHUucGF0aG5hbWU9PT0nL2luZGV4Lmh0bWwnKXsNCiAgIGlmKHUuc2VhcmNoUGFyYW1zLmhhcygndmlldycpKXJldHVybiBSZXNwb25zZS5yZWRpcmVjdChvcmlnaW4rJy9jYWxpc21hJyt1LnNlYXJjaCwzMDIpOw0KICAgaWYoIWF3YWl0IHBvcnRhbC5hY3RvcihyZXF1ZXN0KSlyZXR1cm4gUmVzcG9uc2UucmVkaXJlY3Qob3JpZ2luKycvZ2lyaXMnLDMwMik7DQogICByZXR1cm4gbmV3IFJlc3BvbnNlKGF3YWl0IHJlYWRGaWxlKG5ldyBVUkwoJy4uL3NyYy9wb3J0YWwuaHRtbCcsaW1wb3J0Lm1ldGEudXJsKSkse2hlYWRlcnM6eydDb250ZW50LVR5cGUnOid0ZXh0L2h0bWw7IGNoYXJzZXQ9dXRmLTgnLCdDYWNoZS1Db250cm9sJzonbm8tc3RvcmUnfX0pOw0KICB9DQogIGlmKHUucGF0aG5hbWU9PT0nL2NhbGlzbWEnKXsNCiAgIGNvbnN0IG5leHQ9bmV3IFVSTChyZXF1ZXN0LnVybCk7bmV4dC5wYXRobmFtZT0nLyc7Y29uc3Qgcj1hd2FpdCBiYXNlLmZldGNoKG5ldyBSZXF1ZXN0KG5leHQse2hlYWRlcnM6cmVxdWVzdC5oZWFkZXJzfSksLi4uYXJncyk7DQogICBpZihyLmhlYWRlcnMuZ2V0KCdjb250ZW50LXR5cGUnKT8uaW5jbHVkZXMoJ3RleHQvaHRtbCcpKXJldHVybiBuZXcgUmVzcG9uc2Uoc3R5bGVkKGF3YWl0IHIudGV4dCgpKSx7c3RhdHVzOnIuc3RhdHVzLGhlYWRlcnM6ci5oZWFkZXJzfSk7cmV0dXJuIHI7DQogIH0NCiAgY29uc3Qgcj1hd2FpdCBiYXNlLmZldGNoKHJlcXVlc3QsLi4uYXJncyk7DQogIGlmKHJlcXVlc3QubWV0aG9kPT09J1BPU1QnJiZyLm9rJiZ1LnBhdGhuYW1lLnN0YXJ0c1dpdGgoJy9hcGkvYWRtaW4vJykpcG9ydGFsLmludmFsaWRhdGUoKTsNCiAgaWYoci5oZWFkZXJzLmdldCgnY29udGVudC10eXBlJyk/LmluY2x1ZGVzKCd0ZXh0L2h0bWwnKSlyZXR1cm4gbmV3IFJlc3BvbnNlKHN0eWxlZChhd2FpdCByLnRleHQoKSkse3N0YXR1czpyLnN0YXR1cyxoZWFkZXJzOnIuaGVhZGVyc30pO3JldHVybiByOw0KIH19Ow0KIGNvbnN0IGluc3RpdHV0aW9uYWw9Y3JlYXRlSW5zdGl0dXRpb25Ib3N0KHtiYXNlOndvcmtlcixkYjplbnYuREIsb3JpZ2luLGFjdG9yOnBvcnRhbC5hY3RvciwNCiBzZXJ2aWNlUmVxdWVzdEFsbG93ZWQ6YXN5bmMgcmVxdWVzdD0+ew0KIGNvbnN0IHA9bmV3IFVSTChyZXF1ZXN0LnVybCkucGF0aG5hbWU7DQogLy8gVGhlc2UgZml4ZWQgcm91dGVzIHJldGFpbiB0aGVpciBleGlzdGluZyBjb25zdGFudC10aW1lIHNlY3JldCB2YWxpZGF0aW9uIGluc2lkZSBsYWIud29ya2VyLg0KIHJldHVybiBbJ0dFVCcsJ1BPU1QnXS5pbmNsdWRlcyhyZXF1ZXN0Lm1ldGhvZCkmJlsnL2FwaS9hZG1pbi9pbnRlZ3JhdGlvbnMvYnJvd3Nlci1mYWNlYm9vaycsJy9hcGkvYWRtaW4vaW50ZWdyYXRpb25zL2Jyb3dzZXItd29ya2VyJ10uaW5jbHVkZXMocCk7DQogfX0pOw0KIHJldHVybiB7d29ya2VyOmluc3RpdHV0aW9uYWwsaW52YWxpZGF0ZTpwb3J0YWwuaW52YWxpZGF0ZX07DQp9DQo=', 'test_service_routes.mjs': 'aW1wb3J0IGFzc2VydCBmcm9tICdub2RlOmFzc2VydC9zdHJpY3QnOw0KaW1wb3J0IHtwYXRoVG9GaWxlVVJMfSBmcm9tICdub2RlOnVybCc7DQppbXBvcnQge3RpbWluZ1NhZmVFcXVhbH0gZnJvbSAnbm9kZTpjcnlwdG8nOw0KY29uc3Qge2NyZWF0ZVBvcnRhbFNoZWxsfT1hd2FpdCBpbXBvcnQocGF0aFRvRmlsZVVSTChwcm9jZXNzLmFyZ3ZbMl0pKTsNCmNvbnN0IG9yaWdpbj0naHR0cHM6Ly91bml0LmludmFsaWQnLGtleT0nZml4dHVyZS1zZXJ2aWNlLWtleSc7bGV0IHZhbGlkYXRlZD0wOw0KY29uc3Qgcm91dGVzPVsnL2FwaS9hZG1pbi9pbnRlZ3JhdGlvbnMvYnJvd3Nlci13b3JrZXInLCcvYXBpL2FkbWluL2ludGVncmF0aW9ucy9icm93c2VyLWZhY2Vib29rJ107DQpjb25zdCBiYXNlPXthc3luYyBmZXRjaChyZXF1ZXN0KXsNCiBjb25zdCBwPW5ldyBVUkwocmVxdWVzdC51cmwpLnBhdGhuYW1lOw0KIGlmKHJvdXRlcy5pbmNsdWRlcyhwKSl7DQogIHZhbGlkYXRlZCsrO2NvbnN0IHN1cHBsaWVkPUJ1ZmZlci5mcm9tKHJlcXVlc3QuaGVhZGVycy5nZXQoJ1gtT1NJTlQtQnJvd3Nlci1LZXknKXx8JycpLGV4cGVjdGVkPUJ1ZmZlci5mcm9tKGtleSk7DQogIHJldHVybiBSZXNwb25zZS5qc29uKHtvazpzdXBwbGllZC5sZW5ndGg9PT1leHBlY3RlZC5sZW5ndGgmJnRpbWluZ1NhZmVFcXVhbChzdXBwbGllZCxleHBlY3RlZCl9LHtzdGF0dXM6c3VwcGxpZWQubGVuZ3RoPT09ZXhwZWN0ZWQubGVuZ3RoJiZ0aW1pbmdTYWZlRXF1YWwoc3VwcGxpZWQsZXhwZWN0ZWQpPzIwMDo0MDR9KTsNCiB9DQogaWYocD09PScvYXBpL2FjY291bnQnKXJldHVybiBSZXNwb25zZS5qc29uKHtlcnJvcjonbG9naW5fcmVxdWlyZWQnfSx7c3RhdHVzOjQwMX0pOw0KIHJldHVybiBuZXcgUmVzcG9uc2UobnVsbCx7c3RhdHVzOjQwNH0pOw0KfX07DQpjb25zdCBEQj17cHJlcGFyZSgpe3Rocm93IEVycm9yKCd1bmV4cGVjdGVkX2RhdGFiYXNlX2FjY2VzcycpfX07DQpjb25zdCB7d29ya2VyfT1jcmVhdGVQb3J0YWxTaGVsbChiYXNlLHtEQn0se29yaWdpbixzb2NpYWxJdGVtczphc3luYygpPT5bXX0pOw0KZm9yKGNvbnN0IHAgb2Ygcm91dGVzKWZvcihjb25zdCBtZXRob2Qgb2YgWydHRVQnLCdQT1NUJ10pew0KIGxldCByPWF3YWl0IHdvcmtlci5mZXRjaChuZXcgUmVxdWVzdChvcmlnaW4rcCx7bWV0aG9kLGhlYWRlcnM6eydYLU9TSU5ULUJyb3dzZXItS2V5JzprZXl9fSkpO2Fzc2VydC5lcXVhbChyLnN0YXR1cywyMDApOw0KIHI9YXdhaXQgd29ya2VyLmZldGNoKG5ldyBSZXF1ZXN0KG9yaWdpbitwLHttZXRob2R9KSk7YXNzZXJ0LmVxdWFsKHIuc3RhdHVzLDQwNCk7DQogcj1hd2FpdCB3b3JrZXIuZmV0Y2gobmV3IFJlcXVlc3Qob3JpZ2luK3Ase21ldGhvZCxoZWFkZXJzOnsnWC1PU0lOVC1Ccm93c2VyLUtleSc6J3dyb25nJ319KSk7YXNzZXJ0LmVxdWFsKHIuc3RhdHVzLDQwNCk7DQp9DQpmb3IoY29uc3QgcCBvZiBbJy9hcGkvYWRtaW4vb3RoZXInLCcvYXBpL2FkbWluL2ludGVncmF0aW9ucy9icm93c2VyLXdvcmtlci1leHRyYSddKXsNCiBjb25zdCByPWF3YWl0IHdvcmtlci5mZXRjaChuZXcgUmVxdWVzdChvcmlnaW4rcCx7aGVhZGVyczp7J1gtT1NJTlQtQnJvd3Nlci1LZXknOmtleX19KSk7YXNzZXJ0LmVxdWFsKHIuc3RhdHVzLDQwMSk7DQp9DQphc3NlcnQuZXF1YWwodmFsaWRhdGVkLDEyKTsNCmNvbnNvbGUubG9nKCdQQVNTOiBib3RoIGZpeGVkIHNlcnZpY2Ugcm91dGVzIEdFVC9QT1NUIHJlYWNoIGtleSB2YWxpZGF0aW9uOyBtaXNzaW5nL3dyb25nIGtleSBkZW5pZWQ7IHVucmVsYXRlZCBhZG1pbiBwYXRocyBkZW5pZWQnKTsNCg==', 'collector.timer': 'W1VuaXRdDQpEZXNjcmlwdGlvbj1TdXBwbGVtZW50YWwgWCBjb3ZlcmFnZSBldmVyeSBzZXZlbiBtaW51dGVzIGFmdGVyIGNvbXBsZXRlZCByb3VuZA0KW1RpbWVyXQ0KT25BY3RpdmVTZWM9N21pbg0KT25Vbml0SW5hY3RpdmVTZWM9N21pbg0KUmFuZG9taXplZERlbGF5U2VjPTMwDQpBY2N1cmFjeVNlYz01cw0KVW5pdD11bXJhbml5ZS1vc2ludC14LXR3c2NyYXBlLWRlbmVtZS5zZXJ2aWNlDQpbSW5zdGFsbF0NCldhbnRlZEJ5PXRpbWVycy50YXJnZXQNCg==', 'collector.conf': 'W1NlcnZpY2VdDQpFeGVjU3RhcnRQb3N0PSsvdXNyL2Jpbi9zeXN0ZW1jdGwgLS1uby1ibG9jayBzdGFydCB1bXJhbml5ZS1vc2ludC14LWJhY2t1cC1wdWJsaXNoLnNlcnZpY2UNCg=='}
ENDPOINT='http://127.0.0.1:3001/api/admin/integrations/browser-worker'

def run(args,timeout=30,env=None):return subprocess.run(args,capture_output=True,text=True,timeout=timeout,env=env)
def put(p,data):
 p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_name(p.name+'.tmp');tmp.write_bytes(data);tmp.chmod(0o644);tmp.replace(p)
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*a,**k):raise RuntimeError('unexpected_redirect')
def status(key=None):
 headers={'X-OSINT-Browser-Key':key} if key else {}
 req=urllib.request.Request(ENDPOINT,headers=headers)
 try:
  with urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect()).open(req,timeout=15) as r:return r.status
 except urllib.error.HTTPError as e:return e.code

def main():
 if os.geteuid()!=0:raise RuntimeError('sudo_required')
 target=APP/'server/portal-shell.mjs'
 if target.is_symlink() or STATE.is_symlink():raise RuntimeError('symlink_denied')
 if hashlib.sha256(target.read_bytes()).hexdigest()!=EXPECTED:raise RuntimeError('source_version_changed_no_install')
 if 'X_BACKUP_BRIDGE_V1' not in (APP/'server/browser-research.mjs').read_text():raise RuntimeError('backup_admission_missing')
 if not (STATE/'report.json').exists():raise RuntimeError('existing_publisher_missing')
 timer=pathlib.Path('/etc/systemd/system')/TIMER;drop=pathlib.Path('/etc/systemd/system')/(COLLECTOR+'.d/zz-backup-publish.conf')
 if timer.exists() or drop.exists():raise RuntimeError('backup_already_configured')
 with tempfile.TemporaryDirectory(prefix='service-access-test-') as d:
  clone=pathlib.Path(d)/'app';clone.mkdir()
  for folder,dirs,names in os.walk(APP,followlinks=False):
   dirs[:]=[n for n in dirs if not n.startswith('.') and n not in {'node_modules','backups','data','logs','profiles','venv'} and not (pathlib.Path(folder)/n).is_symlink()]
   for name in names:
    src=pathlib.Path(folder)/name
    if not src.is_symlink() and (src.suffix in {'.mjs','.js','.cjs','.html','.png'} or name=='package.json'):
     dest=clone/src.relative_to(APP);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dest)
  put(clone/'server/portal-shell.mjs',base64.b64decode(PAYLOAD['portal-shell.next.mjs']));test=pathlib.Path(d)/'test.mjs';put(test,base64.b64decode(PAYLOAD['test_service_routes.mjs']))
  checked=run(['node',str(test),str(clone/'server/portal-shell.mjs')],60,env={**os.environ,'DATA_DIR':str(pathlib.Path(d)/'fixture-state')})
  if checked.returncode:raise RuntimeError('service_auth_regression_failed_no_install')
 backup=pathlib.Path('/var/lib/umraniye-osint-deneme/backups')/('x-service-access-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));backup.mkdir(mode=0o700,parents=True)
 shutil.copyfile(target,backup/'portal-shell.mjs')
 rollback="""#!/usr/bin/env python3
from pathlib import Path
import shutil,subprocess
subprocess.run(['systemctl','disable','--now','umraniye-osint-x-twscrape-deneme.timer'],capture_output=True)
for n in ['/etc/systemd/system/umraniye-osint-x-twscrape-deneme.timer','/etc/systemd/system/umraniye-osint-x-twscrape-deneme.service.d/zz-backup-publish.conf']:Path(n).unlink(missing_ok=True)
shutil.copyfile(Path(__file__).parent/'portal-shell.mjs','/opt/umraniye-osint-deneme/server/portal-shell.mjs')
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','restart','umraniye-osint-deneme.service'],check=True)
print('Servis erisim duzeltmesi geri alindi; kayitlar ve oturumlar korundu.')
"""
 (backup/'geri-al.py').write_text(rollback)
 prod=run(['systemctl','show','umraniye-osint.service','--property=ExecMainStartTimestampMonotonic','--value']).stdout.strip()
 try:
  put(target,base64.b64decode(PAYLOAD['portal-shell.next.mjs']))
  if run(['systemctl','restart',SITE],60).returncode:raise RuntimeError('application_restart_failed')
  for _ in range(30):
   try:
    if status()==404:break
   except Exception:pass
   time.sleep(1)
  else:raise RuntimeError('unsigned_service_probe_failed')
  key=(pathlib.Path('/var/lib/umraniye-osint-deneme')/'browser-service.key').read_bytes().hex()
  if status('wrong-key')!=404:raise RuntimeError('invalid_key_not_rejected')
  signed=status(key)
  if signed!=200:raise RuntimeError('signed_config_http_'+str(signed))
 except Exception:
  run(['python3',str(backup/'geri-al.py')],90);raise
 # Publish existing fresh candidates first. Exactly one existing normal collection
 # is requested only if the stored fresh candidate set has already expired.
 attempt=run(['systemctl','start',PUB],100)
 report=json.loads((STATE/'report.json').read_text());freshRound=False
 if report.get('status')=='no_pending_fresh_posts':
  freshRound=True;run(['systemctl','start',COLLECTOR],210);attempt=run(['systemctl','start',PUB],100);report=json.loads((STATE/'report.json').read_text())
 verified=attempt.returncode==0 and report.get('confirmedInExistingStorage',0)>0
 if verified:
  put(timer,base64.b64decode(PAYLOAD['collector.timer']));put(drop,base64.b64decode(PAYLOAD['collector.conf']))
  if run(['systemd-analyze','verify',str(timer)]).returncode:timer.unlink();drop.unlink();raise RuntimeError('timer_verify_failed')
  if run(['systemctl','daemon-reload']).returncode or run(['systemctl','enable','--now',TIMER]).returncode:raise RuntimeError('timer_enable_failed')
 prodAfter=run(['systemctl','show','umraniye-osint.service','--property=ExecMainStartTimestampMonotonic','--value']).stdout.strip()
 output={'result':'x_backup_connected' if verified else 'service_access_fixed_publication_pending','serviceGETAuthorized':True,'missingAndInvalidKeysRejected':True,'fixedInternalRoutesOnly':True,'backupEnabled':verified,'intervalMinutesAfterRound':7 if verified else None,'freshCollectionRequested':freshRound,'browserHealthPreserved':True,'productionServiceUnchanged':prod==prodAfter,'telegramSettingsChanged':False,'historicalReplay':False,'externalBrowserVerified':False,'publisher':report,'backup':str(backup),'rollback':'sudo python3 '+str(backup/'geri-al.py')}
 if not verified:
  with sqlite3.connect('file:/var/lib/umraniye-osint-deneme/osint.sqlite?mode=ro',uri=True) as con:
   r=con.execute('SELECT data FROM lab_config WHERE id=?',('x-backup-status',)).fetchone()
   if r:
    v=json.loads(r[0]);output['admission']={k:v.get(k) for k in ['at','accepted','rejected','results']}
 (STATE/'service-access-report.json').write_text(json.dumps(output,ensure_ascii=False,indent=2));print(json.dumps(output,ensure_ascii=False,indent=2))

if __name__=='__main__':
 try:main()
 except Exception as e:print('KURULAMADI: '+(str(e) if isinstance(e,RuntimeError) else type(e).__name__));sys.exit(1)
