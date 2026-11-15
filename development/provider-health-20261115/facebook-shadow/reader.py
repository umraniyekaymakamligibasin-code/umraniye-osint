"""Small anonymous posts-only wrapper around the pinned fbgql source.
No account, browser, proxy, comments, production bridge, or challenge solving.
"""
import datetime as dt,json,os,re,sys,time
from pathlib import Path
from urllib.parse import urlsplit
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'vendor'))
COMMIT='28e03ae84012be44d37a67014fcfcfcc420c9ee9'
class GuardStop(BaseException):pass

class BoundedTransport:
    max_requests=8
    requests_made=0
    started=0
    partial=None
    def __init__(self,timeout=8):
        import requests
        self.session=requests.Session();self.session.trust_env=False
    def request(self,method,url,headers,cookies=None,data=None):
        parts=urlsplit(url)
        if parts.scheme!='https' or parts.hostname not in ('www.facebook.com','facebook.com') or parts.port not in (None,443) or parts.username or parts.password:raise GuardStop('destination_denied')
        if cookies or self.session.cookies.get('c_user'):raise GuardStop('unexpected_authenticated_session')
        if BoundedTransport.requests_made>=BoundedTransport.max_requests:raise GuardStop('request_budget_reached')
        remaining=25-(time.monotonic()-BoundedTransport.started)
        if remaining<=0:raise GuardStop('time_budget_reached')
        BoundedTransport.requests_made+=1
        try:
            with self.session.request(method,url,headers=headers,data=data,timeout=min(8,remaining),allow_redirects=False,stream=True) as r:
                if r.status_code in (401,403,429):raise GuardStop('public_access_blocked' if r.status_code!=429 else 'rate_limited')
                if 300<=r.status_code<400:
                    # Do not follow redirects or bypass login. Classify the real access gate.
                    from urllib.parse import urljoin
                    destination=urlsplit(urljoin(url,r.headers.get('Location','')))
                    if destination.scheme=='https' and destination.hostname in ('www.facebook.com','facebook.com') and destination.port in (None,443) and not destination.username and not destination.password:
                        if destination.path.startswith(('/checkpoint/','/challenge/')):raise GuardStop('human_verification_required')
                        if destination.path.startswith(('/login/','/login.php','/recover/')):raise GuardStop('public_access_blocked')
                    raise GuardStop('redirect_requires_review')
                if r.status_code!=200:raise GuardStop('http_error_'+str(r.status_code))
                chunks=[];size=0
                for chunk in r.iter_content(65536):
                    size+=len(chunk)
                    if size>5_000_000:raise GuardStop('response_too_large')
                    if time.monotonic()-BoundedTransport.started>25:raise GuardStop('time_budget_reached')
                    chunks.append(chunk)
                body=b''.join(chunks).decode('utf-8','replace')
                if '/checkpoint/' in body or 'captcha_response' in body:raise GuardStop('human_verification_required')
                return body
        except GuardStop:raise
        except Exception:raise GuardStop('network_error') from None
    def get(self,url,cookies,proxy=None,headers=None):
        if proxy:raise GuardStop('proxy_disabled')
        return self.request('GET',url,headers or {'User-Agent':'Mozilla/5.0'},cookies)
    def post_form(self,headers,data,cookies,proxy=None):
        if proxy:raise GuardStop('proxy_disabled')
        return self.request('POST','https://www.facebook.com/api/graphql/',headers,cookies,data)

def normalized(post,source):
    sid=str(post.post_id);text=str(post.text or '');published=None
    if isinstance(post.created_time,(int,float)) and not isinstance(post.created_time,bool):
        try:published=dt.datetime.fromtimestamp(post.created_time,dt.timezone.utc).isoformat()
        except (ValueError,OverflowError,OSError):pass
    url=str(post.permalink or '')
    u=urlsplit(url)
    if u.scheme!='https' or u.hostname not in ('www.facebook.com','facebook.com','m.facebook.com') or u.username or u.password or u.port:return None
    if not re.fullmatch(r'[A-Za-z0-9_:-]{1,150}',sid):return None
    return {'id':sid,'facebookPostId':sid,'facebookSourceId':source['source_id'],'url':url,'title':text[:160],'description':text,'fullText':text,'author':str(post.page_name or source['page_name']),'sourceName':source['page_name'],'sourcePageUrl':source['page_url'],'publishedAt':published,'collectedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'platform':'facebook','source':'facebook','reader':'fbgql','locationVerified':False}

def salvage(result,source):
    # GuardStop is a BaseException, so fbgql cannot keep feed pages read before a later
    # page hits the request/time budget. Those posts are real observations: keep them.
    if result['posts'] or not BoundedTransport.partial:return
    result['posts']=[e for p in BoundedTransport.partial[:12] if (e:=normalized(p,source))]
    # The budget status is kept so the worker still defers this source and reads the rest next round.
    if result['posts']:result['partial']=True

def read(source):
    from fbgql import Scraper,ScrapeJob,runner,policy
    runner.SyncTransport=BoundedTransport
    policy.MAX_EMPTY_RETRIES=0;policy.MAX_TRANSPORT_RETRIES=1
    if not getattr(runner._append_unique,'tracks_partial',False):
        original=runner._append_unique
        def tracked(posts,new):
            original(posts,new);BoundedTransport.partial=posts
        tracked.tracks_partial=True;runner._append_unique=tracked
    BoundedTransport.partial=None
    BoundedTransport.requests_made=0;BoundedTransport.max_requests=max(1,min(8,int(source.get('requestBudget',8))));BoundedTransport.started=time.monotonic()
    result={'status':'not_started','posts':[],'reader':'fbgql','upstreamCommit':COMMIT,'anonymous':True,'commentsEnabled':False,'browserStarted':False}
    try:
        job=ScrapeJob(page=source['page_url'],max_posts=12,posts_only=True,workers=1,reply_concurrency=1,anonymous=True,min_interval_sec=2)
        response=Scraper().run(job)
        result['posts']=[e for r in response.posts if (e:=normalized(r.post,source))]
        missing=next((e for e in result['posts'] if not e['fullText'].strip()),None)
        if missing and BoundedTransport.requests_made<BoundedTransport.max_requests and time.monotonic()-BoundedTransport.started<17:
            try:
                detail=Scraper().run(ScrapeJob(post_url=missing['url'],max_posts=1,posts_only=True,workers=1,reply_concurrency=1,anonymous=True,min_interval_sec=2))
                for r in detail.posts:
                    expanded=normalized(r.post,source)
                    if expanded and expanded['id']==missing['id'] and len(expanded['fullText'])>len(missing['fullText']):missing.update(expanded)
            except GuardStop as err:
                if str(err) in ('rate_limited','public_access_blocked','human_verification_required'):raise
        result['status']='read_completed' if result['posts'] else 'empty_or_layout_changed'
    except GuardStop as e:result['status']=str(e);salvage(result,source)
    except Exception as e:result.update(status='reader_error',errorType=type(e).__name__);salvage(result,source)
    result['requests']=BoundedTransport.requests_made;result['durationSeconds']=round(time.monotonic()-BoundedTransport.started,3)
    return result

if __name__=='__main__':
    # Suppress library progress; machine-readable result only. No login/session command.
    import contextlib,io
    source=json.load(sys.stdin)
    with contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):result=read(source)
    print(json.dumps(result,ensure_ascii=False))
