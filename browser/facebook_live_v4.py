from social_reader_repair import facebook_dom_posts
from facebook_reels_normalize import normalize_reel
"""Public page reader integrated with DENEME's existing browser bridge."""
import asyncio, datetime, json, re, time, urllib.parse, hashlib
from playwright.async_api import TimeoutError as PlaywrightTimeoutError

VERSION='facebook-live-v4'
HOSTS={'www.facebook.com','facebook.com','m.facebook.com'}

def page_url(value):
    try:
        u=urllib.parse.urlsplit(value)
        if u.scheme!='https' or u.hostname not in HOSTS or u.port or u.username or u.password:
            return None
        path=u.path.strip('/')
        if re.fullmatch(r'people/[^/]+/[0-9]{5,40}',path):
            return 'https://www.facebook.com/profile.php?id='+path.rsplit('/',1)[1]
        if re.fullmatch(r'[A-Za-z0-9._-]{3,80}',path) and path.lower() not in {'login','search','groups','pages','profile.php','watch','reel','share','sharer.php','help'}:
            return 'https://www.facebook.com/'+path+'/'
        q=urllib.parse.parse_qs(u.query)
        if path=='profile.php' and len(q.get('id',[]))==1 and q['id'][0].isdigit():
            return 'https://www.facebook.com/profile.php?id='+q['id'][0]
    except (ValueError,TypeError): pass
    return None

def post_url(value):
    try:
        u=urllib.parse.urlsplit(value)
        if u.scheme!='https' or u.hostname not in HOSTS or u.port or u.username or u.password: return None
        if re.fullmatch(r'/people/[^/]+/[0-9]{5,40}/posts/[A-Za-z0-9_-]+/?',u.path):
            return 'https://www.facebook.com'+u.path.rstrip('/')
        if re.fullmatch(r'/[A-Za-z0-9._-]+/posts/[A-Za-z0-9_-]+/?',u.path):
            return 'https://www.facebook.com'+u.path.rstrip('/')
        if re.fullmatch(r'/permalink/[A-Za-z0-9_-]+/?',u.path):
            return 'https://www.facebook.com'+u.path.rstrip('/')
        if re.fullmatch(r'/(?:reel|videos)/[0-9]+/?',u.path) or re.fullmatch(r'/[A-Za-z0-9._-]+/videos/[0-9]+/?',u.path):
            return 'https://www.facebook.com'+u.path.rstrip('/')
        q=urllib.parse.parse_qs(u.query)
        if u.path in ('/story.php','/permalink.php') and all(len(q.get(k,[]))==1 and re.fullmatch(r'[A-Za-z0-9_-]+',q[k][0]) for k in ('id','story_fbid')):
            return 'https://www.facebook.com/permalink.php?'+urllib.parse.urlencode({k:q[k][0] for k in ('id','story_fbid')})
    except (ValueError,TypeError):pass
    return None

def walk(value):
    if isinstance(value,dict):
        yield value
        for v in value.values():yield from walk(v)
    elif isinstance(value,list):
        for v in value:yield from walk(v)

def source_identity(source):
    url=page_url(source.get('url',''))
    query=urllib.parse.parse_qs(urllib.parse.urlsplit(url or '').query)
    direct=query.get('id',[''])[0]
    configured=str(source.get('page_id') or '')
    direct=direct if direct.isdigit() else ''
    configured=configured if configured.isdigit() else ''
    if direct and configured and direct!=configured:return None,True
    return direct or configured or None,False

def document_identity(document,source):
    expected=page_url(source.get('url',''))
    candidates={str(n['id']) for n in walk(document) if n.get('__typename') in ('Page','User') and str(n.get('id','')).isdigit() and expected and (page_url(n.get('url','')) or '').lower()==expected.lower()}
    return next(iter(candidates)) if len(candidates)==1 else None

def extract(documents,source,now=None):
    """Bind own text, author, date and permalink through the SAME post_id."""
    now=time.time() if now is None else now
    result={}; rejected={}
    expected_id,conflict=source_identity(source)
    if conflict:return [],{'source_identity_conflict':1}
    def reject(reason):rejected[reason]=rejected.get(reason,0)+1
    for doc in documents:
        for story in walk(doc):
            if story.get('short_form_video_context') and story.get('post_id') and not story.get('comet_sections'):
                story=normalize_reel(story,page_url,post_url)
                if story is None:reject('reel_identity_or_privacy_unconfirmed');continue
            if story.get('__typename')!='Story' or not story.get('post_id'):continue
            pid=str(story['post_id'])
            actors=story.get('actors') or []
            actor=next((a for a in actors if isinstance(a,dict) and ((page_url(a.get('url','')) or '').lower()==source['url'].lower() or expected_id is not None and str(a.get('id'))==expected_id)),None)
            if not actor:reject('other_author');continue
            sections=story.get('comet_sections') or {}
            content=(sections.get('content') or {}).get('story') or {}
            if str(content.get('post_id',''))!=pid:
                reject('content_identity_missing');continue
            message=content.get('message') or story.get('message') or {}
            body=message.get('text') if isinstance(message,dict) else None
            if not isinstance(body,str):body=''
            if not body.strip():reject('text_missing')
            ts=story.get('creation_time')
            if isinstance(ts,bool) or not isinstance(ts,(int,float)) or not 1072915200<ts<4102444800:
                reject('date_missing');ts=None
            stamp=(sections.get('timestamp') or {}).get('story') or {}
            # The separate timestamp section can corroborate, never supply another post's date.
            if ts is not None and stamp.get('creation_time') is not None and stamp['creation_time']!=ts:
                reject('date_conflict');continue
            if stamp.get('id') and story.get('id') and stamp['id']!=story['id']:
                reject('timestamp_identity_conflict');continue
            url=next((u for value in (story.get('permalink_url'),content.get('wwwURL'),stamp.get('url')) if (u:=post_url(value or ''))),None)
            if not url:reject('permalink_missing')
            age=now-ts if ts is not None else None
            reason='date_missing' if age is None else 'future_date' if age < -60 else 'older_than_60_minutes' if age>3600 else None
            if reason:reject(reason)
            key=url or pid
            if key in result and len(result[key].get('fullText') or result[key].get('description',''))>len(body.strip()):continue
            result[key]={'url':url,'title':body.strip()[:240],'description':body.strip()[:3000],
                         'sourceName':str(actor.get('name') or source.get('name') or 'Facebook')[:100],
                         'publishedAt':datetime.datetime.fromtimestamp(ts,datetime.timezone.utc).isoformat(timespec='seconds') if ts is not None else None,
                         'facebookPostId':pid,'dateEvidence':'facebook_story_creation_time',
                         'readerVersion':VERSION,'sourcePageUrl':source['url'],'fullText':body.strip()[:12000],'textStatus':'storage_limited' if len(body.strip())>12000 else 'not_verified_complete','_fresh':reason is None}
    return list(result.values()),rejected

def atomic(path,data):
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8');tmp.chmod(0o600);tmp.replace(path)

def sources(data):
    stored=json.loads((data/'priority-sources.json').read_text(encoding='utf-8'))
    result=[];seen=set()
    for s in stored.get('sources',[]):
        if not isinstance(s,dict) or s.get('provider')!='facebook' or s.get('enabled') is not True:continue
        url=page_url(str(s.get('url') or ''))
        if url and url.lower() not in seen:
            result.append({'url':url,'name':s.get('name') or s.get('label') or 'Facebook'});seen.add(url.lower())
    return result

async def read_page(context,source):
    source=dict(source)
    expected_id,identity_conflict=source_identity(source)
    if expected_id:source['page_id']=expected_id
    started=time.monotonic()
    try:page=await asyncio.wait_for(context.new_page(),timeout=6)
    except (TimeoutError,asyncio.TimeoutError):
        return [],{'page_open_timeout':1,'_read_metrics':{'stopReason':'page_open_timeout','elapsedMs':round((time.monotonic()-started)*1000)}},'read_error'
    page.set_default_timeout(2500)
    tasks=set();seen=set();posts_by_id={};reasons={};transport=[];changed=asyncio.Event()
    metrics={'scrollRounds':0,'initialPosts':0,'loadedPosts':0,'visiblePostLinks':0,'stopReason':'scroll_limit','minimumScrollRounds':6,'maximumScrollRounds':10,'responsesSkipped':0,'rootFallbackUsed':False,'postsFallbackUsed':False,'entryPoint':'page_root','sourceIdentityEvidence':'profile_url_id' if expected_id else 'unresolved'}
    def consume(doc):
        if not source.get('page_id') and not identity_conflict:
            resolved=document_identity(doc,source)
            if resolved:source['page_id']=resolved;metrics['sourceIdentityEvidence']='matching_page_object'
        rows,rejected=extract([doc],source)
        for key,value in rejected.items():reasons[key]=reasons.get(key,0)+value
        for p in rows:
            previous=posts_by_id.get(p['facebookPostId'])
            if previous:
                if len(previous.get('fullText',''))>len(p.get('fullText','')):
                    p['fullText']=previous['fullText'];p['textStatus']=previous.get('textStatus')
                if len(previous.get('description',''))>len(p.get('description','')):
                    p['description']=previous['description'];p['title']=previous['title']
                if not p.get('publishedAt'):p['publishedAt']=previous.get('publishedAt')
            posts_by_id[p['facebookPostId']]=p
        if rows:changed.set()
    def consume_text(raw):
        checksum=hashlib.sha256(raw.encode()).digest()
        if checksum in seen:return
        seen.add(checksum)
        try:consume(json.loads(raw))
        except ValueError:pass
    async def response(r):
        try:
            text=await r.text()
            if len(text)>8_000_000:return
            for line in text.splitlines():
                line=line.removeprefix('for (;;);').strip()
                if line.startswith('{'):consume_text(line)
        except Exception:pass
    def receive(r):
        if urllib.parse.urlsplit(r.url).hostname not in HOSTS or '/api/graphql' not in r.url:return
        if r.status==429:transport.append(429);return
        if r.status==403:reasons['graphql_http_403']=reasons.get('graphql_http_403',0)+1;return
        if len(tasks)>=6:metrics['responsesSkipped']+=1;return
        t=asyncio.create_task(response(r));tasks.add(t);t.add_done_callback(tasks.discard)
    page.on('response',receive)
    def blocked():
        path=urllib.parse.urlsplit(page.url).path
        if any(x in path for x in ('/checkpoint','/challenge')):return 'account_verification_required','blocked'
        if '/login' in path:return 'login_required','blocked'
        if 429 in transport:return 'http_status','rate_limited'
        if 403 in transport:return 'http_status','blocked'
        return None
    async def snapshot():
        for raw in await page.locator('script[type="application/json"]').all_text_contents():consume_text(raw)
        for candidate in await facebook_dom_posts(page,source):
            if candidate['facebookPostId'] not in posts_by_id:posts_by_id[candidate['facebookPostId']]=candidate
        hrefs=await page.locator('a[href]').evaluate_all('(nodes)=>nodes.map(n=>n.href)')
        return len({u for h in hrefs if (u:=post_url(h))})
    def result(status=None):
        metrics['loadedPosts']=len(posts_by_id);metrics['elapsedMs']=round((time.monotonic()-started)*1000);out=dict(reasons);out['_read_metrics']=metrics
        failure=blocked()
        if failure:
            reason,kind=failure;out[reason]=429 if kind=='rate_limited' else 403 if reason=='http_status' else 1
            return [],out,kind
        return list(posts_by_id.values())[:30],out,status or ('readable' if posts_by_id else 'no_readable_dated_posts')
    async def navigate(url):
        metrics['stage']='navigation'
        response_obj=None
        try:response_obj=await page.goto(url,wait_until='commit',timeout=7000)
        except PlaywrightTimeoutError:reasons['navigation_timeout']=reasons.get('navigation_timeout',0)+1
        if response_obj and response_obj.status in (403,429):transport.append(response_obj.status)
        try:await page.wait_for_load_state('domcontentloaded',timeout=1800)
        except PlaywrightTimeoutError:reasons['dom_ready_timeout']=reasons.get('dom_ready_timeout',0)+1
        metrics['stage']='content_snapshot'
    try:
        try:
            # Keep partial observations and leave cleanup margin under the caller's 25 seconds.
            async with asyncio.timeout(max(1,20-(time.monotonic()-started))):
                url=source['url']
                await navigate(url)
                if blocked():return result()
                await page.wait_for_timeout(1200)
                links=await snapshot()
                articles=await page.locator('[role="article"],article').count()
                if not posts_by_id and not links and not articles and 'profile.php?' not in source['url'] and time.monotonic()-started<10:
                    metrics['postsFallbackUsed']=True
                    await navigate(source['url']+'posts/')
                    if blocked():return result()
                    await page.wait_for_timeout(1200);links=await snapshot()
                if await page.locator('input[type="password"]').count():
                    if await page.locator('input[type="password"]').first.is_visible():
                        reasons['login_required']=1;metrics['stopReason']='login_required';return result('blocked')
                metrics['initialPosts']=len(posts_by_id);stale=0
                for _ in range(10):
                    if len(posts_by_id)>=20:metrics['stopReason']='post_limit';break
                    if blocked():return result()
                    before=(len(posts_by_id),links);changed.clear()
                    movement=await page.evaluate('() => {\n const base=document.querySelector(\'[role="feed"]\')||document.querySelector(\'[role="main"]\');\n const candidates=[];let current=base;\n const eligible=n=>{if(!n)return false;const b=n.getBoundingClientRect();return n.clientHeight>200&&n.scrollHeight>n.clientHeight+40&&b.width>300&&b.bottom>0&&b.top<innerHeight&&/auto|scroll/.test(getComputedStyle(n).overflowY);};\n while(current){if(eligible(current))candidates.push(current);current=current.parentElement;}\n if(!candidates.length&&base)for(const n of [...base.querySelectorAll(\'div\')].slice(0,1200))if(eligible(n))candidates.push(n);\n candidates.sort((a,b)=>b.clientHeight*b.clientWidth-a.clientHeight*a.clientWidth);\n const target=candidates[0]||document.scrollingElement||document.documentElement;\n const before=target.scrollTop;target.scrollBy({top:850,left:0,behavior:\'instant\'});\n return {before,after:target.scrollTop,height:target.scrollHeight,viewport:target.clientHeight,container:candidates.length?\'feed_container\':\'document\',articles:document.querySelectorAll(\'[role="article"]\').length,ready:document.readyState};\n}\n')
                    if not movement['after']>movement['before']:
                        await page.mouse.move(640,650);await page.mouse.wheel(0,850)
                    metrics['scrollRounds']+=1;metrics['scrollMovement']=movement
                    # Do not repeatedly parse the entire page while waiting for a response.
                    try:await asyncio.wait_for(changed.wait(),timeout=0.9)
                    except asyncio.TimeoutError:pass
                    links=await snapshot();metrics['visiblePostLinks']=links
                    stale=0 if len(posts_by_id)>before[0] or links>before[1] else stale+1
                    if stale>=3 and metrics['scrollRounds']>=6:metrics['stopReason']='no_new_content';break
        except (TimeoutError,asyncio.TimeoutError,PlaywrightTimeoutError,asyncio.CancelledError):
            metrics['stopReason']='time_budget';reasons['partial_time_budget']=1
            return result('readable' if posts_by_id else 'read_error')
        if tasks:
            try:await asyncio.wait_for(asyncio.gather(*list(tasks),return_exceptions=True),timeout=0.7)
            except asyncio.TimeoutError:pass
        return result()
    finally:
        page.remove_listener('response',receive)
        for task in list(tasks):task.cancel()
        if tasks:
            try:await asyncio.wait_for(asyncio.gather(*tasks,return_exceptions=True),timeout=0.7)
            except (TimeoutError,asyncio.TimeoutError):pass
        try:await asyncio.wait_for(page.close(),timeout=2)
        except Exception:pass


async def collect_facebook(pw,account,config,data,network_guard,cleaned):
    started=time.monotonic()
    result={'provider':'facebook','profileURL':account['profileURL'],'status':'browser_error','posts':[],'terms':['Ümraniye']}
    pool=sources(data)
    if not pool:result['status']='no_visible_results';return result
    state_path=data/'facebook-live-v4-state.json'
    try:state=json.loads(state_path.read_text(encoding='utf-8'))
    except (OSError,ValueError):state={'cursor':0,'sources':{}}
    context=await pw.chromium.launch_persistent_context(str(data/'facebook-public-v4'),channel='chromium',headless=True,
        chromium_sandbox=True,locale='tr-TR',timezone_id='Europe/Istanbul',viewport={'width':1280,'height':900},
        accept_downloads=False,service_workers='block')
    # Dedicated public profile: existing authorized login profile remains untouched.
    await context.route('**/*',network_guard)
    raw=[];observed=[];readable=0
    try:
        cursor=int(state.get('cursor',0))%len(pool)
        selected=[pool[(cursor+i)%len(pool)] for i in range(min(3,len(pool)))]
        for index,source in enumerate(selected):
            if time.monotonic()-started>59:break
            state['cursor']=(cursor+index+1)%len(pool)
            atomic(state_path,state)
            old=state['sources'].get(source['url'],{})
            if old.get('retryAt',0)>time.time():
                observed.append({'source':source['url'],'status':'backoff','retryAt':old['retryAt']});continue
            try:
                posts,reasons,status=await asyncio.wait_for(read_page(context,source),timeout=19)
            except Exception as e:posts,reasons,status=[],{type(e).__name__:1},'read_error'
            failures=0 if status=='readable' else min(5,int(old.get('failures',0))+1)
            state['sources'][source['url']]={'failures':failures,'retryAt':time.time()+min(3600,120*2**failures) if failures else 0}
            atomic(state_path,state)
            if status=='readable':readable+=1
            fresh=[p for p in posts if p.pop('_fresh')]
            raw.extend(fresh)
            row={'event':'facebook_live_v4_source','source':source['url'],'status':status,'dated':len(posts),'fresh':len(fresh),'reasons':reasons}
            observed.append(row);print(json.dumps(row,ensure_ascii=False),flush=True)
        by_url={p['url']:p for p in raw}
        accepted=cleaned(list(by_url.values()),'facebook',config)
        # Preserve only known provenance fields through the existing bridge.
        for p in accepted:
            for field in ('facebookPostId','dateEvidence','readerVersion','sourcePageUrl'):
                p[field]=by_url[p['url']][field]
        result['posts']=accepted
        result['status']='collected' if accepted else 'no_visible_results' if readable else 'partial'
        atomic(data/'facebook-live-v4-report.json',{'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'readerVersion':VERSION,'durationSeconds':round(time.monotonic()-started,2),'sources':observed,
            'freshLocalPosts':len(accepted),'posts':accepted,'ingestion':'pending_existing_bridge'})
        return result
    finally:
        result['durationMs']=round((time.monotonic()-started)*1000)
        await context.close()
