#!/usr/bin/env python3
"""Two bounded read-only Meta checks. Secrets stay in memory; no posts are exported."""
import datetime as dt,json,pathlib,re,urllib.request,urllib.error,urllib.parse

ROOT='https://graph.facebook.com/v27.0/'
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
def clean(value,secret):
 text=str(value or '').replace(secret,'[gizli]')
 text=re.sub(r'https?://\S+','[adres]',text)
 text=re.sub(r'[A-Za-z0-9_\-]{36,}','[kimlik gizlendi]',text)
 text=re.sub(r'\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b','[e-posta]',text)
 return text[:1200]
def request(path,params,token):
 url=ROOT+path+'?'+urllib.parse.urlencode(params)
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
 req=urllib.request.Request(url,headers={'Authorization':'Bearer '+token})
 try:
  with opener.open(req,timeout=15) as response:raw=response.read(500001)
 except urllib.error.HTTPError as error:
  raw=error.read(65536);error.close()
 if len(raw)>500000:raise ValueError('response_limit')
 data=json.loads(raw)
 if not isinstance(data,dict):raise ValueError('invalid_response')
 if isinstance(data.get('error'),dict):
  e=data['error']
  return None,{'code':e.get('code'),'subcode':e.get('error_subcode'),'transient':e.get('is_transient'),
   'title':clean(e.get('error_user_title'),token),'explanation':clean(e.get('error_user_msg') or e.get('message'),token)}
 return data,None
def main():
 credentials=json.loads(pathlib.Path('/etc/umraniye-osint-instagram-api/credentials.json').read_text())
 token=credentials['token'];owner=str(credentials['igUserId'])
 if not owner.isdigit() or not isinstance(token,str) or not token:raise ValueError('invalid_saved_credentials')
 report={'readOnly':True,'databaseWrites':0,'servicesChanged':False,'tokensPrinted':False,'messagesSent':0,'apiRequests':0}
 report['tokenExpiresAt']=dt.datetime.fromtimestamp(credentials['expiresAt'],dt.timezone.utc).isoformat() if credentials.get('expiresAt') else None
 report['apiRequests']+=1;data,error=request('me/permissions',{},token)
 if error:report['permissionsError']=error
 else:
  report['permissionStates']={r['permission']:r.get('status') for r in data.get('data',[]) if isinstance(r,dict) and re.fullmatch(r'[a-z_]{1,70}',str(r.get('permission','')))}
  report['missingRequiredPermissions']=[p for p in ['instagram_basic','instagram_manage_insights','pages_read_engagement','pages_show_list'] if report['permissionStates'].get(p)!='granted']
 if error and error.get('code')==190:report['sourceCheckSkipped']='invalid_token'
 else:
  report['apiRequests']+=1
  data,error=request(owner,{'fields':'business_discovery.username(asayisberkemal34_){username,media.limit(1){id,timestamp}}'},token)
  if error:report['sourceError']=error
  else:
   source=data.get('business_discovery') or {};posts=(source.get('media') or {}).get('data') or []
   report['sourceCheck']={'handle':'asayisberkemal34_','identityMatches':source.get('username')=='asayisberkemal34_','returnedPosts':len(posts),'datedPosts':sum(bool(p.get('timestamp')) for p in posts),'postContentPrinted':False}
 print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':
 try:main()
 except PermissionError:print('Korumalı bağlantı ayarı için sudo gerekli.');raise SystemExit(1)
 except Exception as error:print(json.dumps({'result':'check_failed','errorType':type(error).__name__,'tokensPrinted':False}));raise SystemExit(1)
