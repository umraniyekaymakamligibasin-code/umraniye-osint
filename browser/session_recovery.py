"""Bounded, read-only session checks for a stale attention latch. No challenge solving."""
import asyncio,hashlib,json,math,pathlib,time
from social_reader_repair import load_json,write_json

async def probe_paused(account,root,collect_session,cooldown_seconds,clock=time.time,interval=1800):
    provider=account['provider']
    if provider not in ('x','instagram'):raise ValueError('unsupported_provider')
    result={'provider':provider,'profileURL':account['profileURL'],'status':'verification_paused','posts':[],'sessionProbe':True,'readCount':0}
    delay=max(0,int(cooldown_seconds()))
    if delay:
        result.update(readerStatus='cooldown',retryInSeconds=delay);return result
    path=pathlib.Path(root)/('session-probe-'+provider+'-'+hashlib.sha256(account['profileURL'].encode()).hexdigest()[:20]+'.json')
    try:state=load_json(path,{})
    except (OSError,ValueError,TypeError):state={}
    if not isinstance(state,dict):state={}
    current=clock();last=state.get('lastProbe',0)
    if not isinstance(last,(int,float)) or not math.isfinite(last):last=0
    if last>current:
        write_json(path,{'lastProbe':current,'reason':'clock_adjusted'})
        result.update(readerStatus='probe_wait',retryInSeconds=interval);return result
    if current-last<interval:
        result.update(readerStatus='probe_wait',retryInSeconds=max(1,int(interval-(current-last))));return result
    # Reserve before launching, including errors, so failures cannot become a tight loop.
    write_json(path,{'lastProbe':current,'reason':'session_probe'})
    try:
        observed=await collect_session()
        allowed={'session_ready','session_unverified','time_budget','login_required','challenge_required','profile_busy','browser_error','robots_denied'}
        if not isinstance(observed,dict) or observed.get('status') not in allowed:observed={'status':'browser_error'}
        result.update(observed)
        if result['status']=='session_ready' and not str(result.get('sessionName') or '').strip():result['status']='session_unverified'
    except asyncio.TimeoutError:result['status']='time_budget'
    except Exception:result['status']='browser_error'
    result.update(provider=provider,profileURL=account['profileURL'],posts=[],sessionProbe=True)
    return result
