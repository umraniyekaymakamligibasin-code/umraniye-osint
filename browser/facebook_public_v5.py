from source_checkpoints import observation as checkpoint_observation,commit as checkpoint_commit
"""Bounded page polling in the existing DENEME worker; no Meta API."""
import asyncio,json,time,datetime,urllib.request,urllib.error,shutil,re
from facebook_live_v4 import read_page,atomic
from facebook_access_v63 import is_paused,access_state
from importlib import import_module
enrich=import_module('facebook-media-v6').enrich

def exchange(data,payload=None):
    raw=json.dumps(payload,ensure_ascii=False).encode() if payload is not None else None
    if raw is not None and len(raw)>180000:raise ValueError('facebook_payload_limit')
    req=urllib.request.Request('http://127.0.0.1:3001/api/admin/integrations/browser-facebook',data=raw,headers={'X-OSINT-Browser-Key':(data/'browser-service.key').read_bytes().hex(),'Content-Type':'application/json'})
    from loopback_bridge import exchange_json
    return exchange_json(urllib.request.build_opener(urllib.request.ProxyHandler({})),req,timeout=12)

async def collect_facebook(pw,account,config,data,network_guard,cleaned):
    from collector import profile_dir,profile_lock
    try:
        with profile_lock(profile_dir(account)):
            return await _collect(pw,account,config,data,network_guard,cleaned,profile_dir(account))
    except BlockingIOError:
        return {'provider':'facebook','profileURL':account['profileURL'],'status':'profile_busy','posts':[],'terms':[]}

async def _collect(pw,account,config,data,network_guard,cleaned,folder):
    started=time.monotonic();work=await asyncio.to_thread(exchange,data)
    selected=work.get('sources',[])[:6]
    access_path=data/'facebook-access-state-v63.json'
    generation=work.get('loginGeneration',0)
    try:previous_access=json.loads(access_path.read_text(encoding='utf-8'))
    except (OSError,ValueError):previous_access={}
    if is_paused(previous_access,generation):
        print(json.dumps({'event':'facebook_access_paused','reason':previous_access.get('reason'),'retryAt':previous_access.get('retryAt'),'requiresManualLogin':previous_access.get('requiresManualLogin',False)}),flush=True)
        return {'provider':'facebook','profileURL':account['profileURL'],'status':'verification_paused','posts':[],'terms':[]}

    detail_path=data/'facebook-detail-v6.json'
    try:detail_state=json.loads(detail_path.read_text(encoding='utf-8'))
    except (OSError,ValueError):detail_state={}
    result={'provider':'facebook','profileURL':account['profileURL'],'status':'partial','posts':[],'terms':[]}
    if not selected:result['status']='no_visible_results';return result
    context=await pw.chromium.launch_persistent_context(str(folder),channel='chromium',headless=True,args=['--autoplay-policy=user-gesture-required'],chromium_sandbox=True,locale='tr-TR',timezone_id='Europe/Istanbul',viewport={'width':1280,'height':900},accept_downloads=False,service_workers='block')
    await context.route('**/*',lambda route:network_guard(route,interactive=False))
    semaphore=asyncio.Semaphore(1);observed=[];source_reads=[]
    async def source(s):
        async with semaphore:
            if time.monotonic()-started>58:return
            assessment=access_state(observed,generation)
            if assessment['reason']:return
            begin=datetime.datetime.now(datetime.timezone.utc).isoformat();spec={'url':s['page_url'],'name':s['page_name'],'page_id':s.get('page_id')}
            async def read():
                read_started=time.monotonic()
                posts,reasons,status=await read_page(context,spec)
                # Read one permalink when text is absent; OCR evidence always stays separate.
                candidates=[p for p in posts if p.get('url') and (not p.get('description','').strip() or len(p.get('description',''))>=3000 or re.search(r'(?:\.{3}|…|daha fazla(?:sını)?(?: gör)?|see more)\s*$',p.get('description',''),re.I)) and time.time()-detail_state.get(p['facebookPostId'],0)>900]
                candidate=min(candidates,key=lambda p:detail_state.get(p['facebookPostId'],0)) if candidates else None
                if candidate and time.monotonic()-read_started<18:
                    detail_state[candidate['facebookPostId']]=time.time()
                    try:await asyncio.wait_for(enrich(context,candidate,spec),timeout=5)
                    except asyncio.TimeoutError:candidate['detailStatus']='detail_time_budget'
                return posts,reasons,status
            try:posts,reasons,status=await asyncio.wait_for(read(),timeout=25)
            except asyncio.TimeoutError:posts,reasons,status=[],{'timeout':1},'read_error'
            except Exception as ex:posts,reasons,status=[],{type(ex).__name__:1},'read_error'
            metrics=reasons.pop('_read_metrics',{})
            posts=posts[:30]
            payload={'source_id':s['source_id'],'started_at':begin,'status':status,'reasons':reasons,'posts':posts}
            while len(json.dumps(payload,ensure_ascii=False).encode())>175000 and posts:posts.pop()
            try:summary=await asyncio.to_thread(exchange,data,payload)
            except Exception as ex:summary={'ingestError':type(ex).__name__}
            row={'event':'facebook_public_v6_source','source':s['page_url'],'status':status,'observed':len(posts),'readMetrics':metrics,'reasons':reasons,**summary}
            if not summary.get('ingestError'):
                source_reads.append(checkpoint_observation(s['page_url'],posts,{'routeErrors':int(status not in ('readable',)),'timeBudgets':int(metrics.get('stopReason')=='time_budget')}))
            observed.append(row);print(json.dumps(row,ensure_ascii=False),flush=True)
    try:
        await asyncio.gather(*(source(s) for s in selected))
        checkpoint_commit(data,'facebook',source_reads)
        atomic(access_path,access_state(observed,generation))
        atomic(detail_path,dict(sorted(detail_state.items(),key=lambda pair:pair[1],reverse=True)[:1000]))
        result['readerObservation']={'postsRead':sum(r.get('observed',0) for r in observed),'routesPlanned':len(selected),'routesCompleted':len(observed),'timeBudgets':sum(r.get('readMetrics',{}).get('stopReason')=='time_budget' for r in observed),'routeErrors':sum(r.get('status')!='readable' or bool(r.get('ingestError')) for r in observed),'reasons':{}}
        for row in observed:
            for key,value in row.get('reasons',{}).items():
                if isinstance(value,int):result['readerObservation']['reasons'][key]=result['readerObservation']['reasons'].get(key,0)+value
        result['readCount']=sum(r.get('observed',0) for r in observed)
        result['managedStored']=sum(r.get('stored',0) for r in observed)
        result['managedFeed']=sum(r.get('feed',0) for r in observed)
        result['status']='collected' if result['readCount'] and any(r['status']=='readable' and not r.get('ingestError') for r in observed) else 'partial'
        atomic(data/'facebook-live-v4-report.json',{'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readerVersion':'facebook-public-v67','sources':observed,'ocrAvailable':bool(shutil.which('tesseract')),'ingestion':'shared_facebook_manager','durationSeconds':round(time.monotonic()-started,2)})
        return result
    finally:
        result['durationMs']=round((time.monotonic()-started)*1000);await context.close()
