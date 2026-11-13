#!/usr/bin/env python3
"""Read-only supplemental Instagram media monitor for Ümraniye OSINT.
Run in an isolated venv as osintdeneme. A user must authenticate voluntarily.
This does not follow accounts, download videos, or send direct messages.
"""
from __future__ import annotations
import argparse
import datetime as dt
import getpass
import hashlib
import json
import os
import pathlib
import re
import sys
import time
import urllib.request
import urllib.parse
import tempfile
import fcntl
from typing import Any

ROOT=pathlib.Path('/var/lib/umraniye-osint-deneme/ig-extra')
TARGETS=pathlib.Path('/opt/umraniye-osint-browser/.instagram-v60/targets.json')
REVIEW=pathlib.Path('/var/lib/umraniye-osint-deneme/instagram-review.json')
BROWSER_KEY=pathlib.Path('/var/lib/umraniye-osint-deneme/browser-service.key')
BRIDGE='http://127.0.0.1:3001/api/admin/integrations/browser-worker'
SESSION=ROOT/'session.json'
STATE=ROOT/'state.json'
MAX_AGE=3*3600
FUTURE_SKEW=300
M_LIMIT=6
REELS_LIMIT=6
STORY_LIMIT=12
MAX_PER_RUN=4
BASE_COOLDOWN=3600
FOLD=''
LOCATION_WORDS={'ümraniye','umraniye','dudullu','elmalıkent','elmalikent','ıhlamurkuyu','ihlamurkuyu','çamlık','camlik','tepeüstü','tepeustu','parseller','altınşehir','altinsehir','topağacı','topagaci','adem yavuz','inkılap','inkilap','armağanevler','armaganevler','çakmak','cakmak','istiklal mahallesi','atatürk mahallesi','ataturk mahallesi'}

def log(event:str,**k:Any)->None:
    safe={key:value for key,value in k.items() if key not in ('username','password','session','token','cookie','body','fullText','code')}
    print(json.dumps({'event':event,**safe},ensure_ascii=False,default=str),flush=True)

def atomic(path:pathlib.Path,data:Any,mode:int=0o600)->None:
    path.parent.mkdir(parents=True,exist_ok=True)
    fd,name=tempfile.mkstemp(prefix='.ig-extra-',dir=path.parent)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as f:
            json.dump(data,f,ensure_ascii=False,separators=(',',':'))
            f.flush();os.fsync(f.fileno())
        os.chmod(name,mode);os.replace(name,path)
    finally:
        if os.path.exists(name):os.unlink(name)

def load(path,default):
    try:return json.loads(path.read_text('utf-8'))
    except (FileNotFoundError,ValueError,UnicodeError):return default

def targets()->list[str]:
    obj=load(TARGETS,{})
    if obj.get('version')!=1 or not isinstance(obj.get('accounts'),list):
        raise RuntimeError('invalid_allowlist')
    out=[]
    for a in obj['accounts']:
        if not isinstance(a,dict) or a.get('enabled') is not True:continue
        h=str(a.get('handle','')).lower().strip().lstrip('@')
        if re.fullmatch(r'[a-z0-9._]{1,30}',h) and h not in out:out.append(h)
    return out

def utc(ts):
    if not isinstance(ts,dt.datetime):return None
    if ts.tzinfo is None:return None
    return ts.astimezone(dt.timezone.utc)

def age_seconds(ts,now=None):
    t=utc(ts)
    if t is None:return None
    return ((now or dt.datetime.now(dt.timezone.utc))-t).total_seconds()

def recent(ts,now=None):
    a=age_seconds(ts,now)
    return a is not None and -FUTURE_SKEW<=a<=MAX_AGE

def media_candidate(m,handle,kind,now=None):
    own=str(getattr(getattr(m,'user',None),'username','') or '').lower()
    if own != handle:return None
    code=str(getattr(m,'code','') or '')
    if not re.fullmatch(r'[A-Za-z0-9_-]{5,20}',code):return None
    published=utc(getattr(m,'taken_at',None))
    if not published or not recent(published,now):return None
    caption=str(getattr(m,'caption_text','') or '').strip()
    loc=getattr(getattr(m,'location',None),'name','') or ''
    alt=str(getattr(m,'accessibility_caption','') or '')
    full=' '.join(x for x in (caption,str(loc),alt) if x).strip()[:6000]
    url='https://www.instagram.com/'+('reel' if kind=='reel' else 'p')+'/'+code+'/'
    return {'url':url,'sourceName':'@'+handle,'handle':handle,
        'title':(caption or (('Instagram Reels · @'+handle) if kind=='reel' else 'Instagram gönderisi · @'+handle))[:240],
        'description':full[:3000],'fullText':full,'publishedAt':published.isoformat().replace('+00:00','Z'),
        'timeEvidence':'api_taken_at','mediaType':kind,'notificationEligible':bool(caption)}

def story_candidate(s,handle,now=None):
    owner=str(getattr(getattr(s,'user',None),'username','') or '').lower()
    # user_stories(uid) is scoped to the allowlisted profile; if the story
    # object omits its UserShort, retain that scope evidence. An explicit
    # contradictory username is never accepted.
    if owner and owner!=handle:return None
    pk=str(getattr(s,'pk','') or '')
    if not re.fullmatch(r'\d{8,35}',pk):return None
    published=utc(getattr(s,'taken_at',None))
    if published is None or not recent(published,now):return None
    bits=[]
    for loc in getattr(s,'locations',[]) or []:
        name=str(getattr(getattr(loc,'location',None),'name','') or '').strip()
        if name:bits.append(name)
    for item in getattr(s,'hashtags',[]) or []:
        name=str(getattr(getattr(item,'hashtag',None),'name','') or '').strip()
        if name:bits.append('#'+name)
    for item in getattr(s,'mentions',[]) or []:
        name=str(getattr(getattr(item,'user',None),'username','') or '').strip()
        if name:bits.append('@'+name)
    for item in getattr(s,'polls',[]) or []:
        question=str(getattr(item,'question','') or '').strip()
        if question:bits.append(question)
    for item in getattr(s,'links',[]) or []:
        title=str(getattr(item,'link_title','') or '').strip()
        if title:bits.append(title)
    text=' '.join(bits)[:2500]
    # Instagram Story does not expose text baked into images/video as captions.
    # Do not claim image/video content was understood. Every story is review-only.
    return {'url':f'https://www.instagram.com/stories/{handle}/{pk}/',
        'title':f'Instagram Hikâyesi · @{handle}', 'description':text or 'Görsel/video hikâyesi; içerik elle incelenmeli',
        'fullText':text,'publishedAt':published.isoformat().replace('+00:00','Z'),
        'sourceName':'@'+handle,'handle':handle,'mediaType':'story',
        'notificationEligible':False,'reviewReason':'story_visual_review'}

def local_match(s,config=None):
    text=str(s or '').casefold()
    if any(x in text for x in LOCATION_WORDS):return True
    # Server-issued geographical terms only; bounded to prevent untrusted config impact.
    for term in ((config or {}).get('geographicTerms') or [])[:1000]:
        if isinstance(term,str) and len(term)>3 and term.casefold() in text:return True
    return False

def identity(url):return hashlib.sha256(url.encode('utf8')).hexdigest()

def save_review(item,reason):
    # Review is not a bypass for the Ümraniyespor football exclusion.
    club=' '.join(str(item.get(k) or '') for k in ('title','description','fullText','sourceName')).casefold().replace('ü','u').replace('\u0307','')
    if 'umraniyespor' in club:return
    if not item.get('url','').startswith('https://www.instagram.com/'):return
    obj=load(REVIEW,{'items':{}})
    if not isinstance(obj,dict):obj={'items':{}}
    items=obj.get('items') or {}
    if not isinstance(items,dict):items={}
    key=identity(item['url'])
    old=items.get(key) or {}
    timestamp=dt.datetime.now(dt.timezone.utc).isoformat()
    row={k:str(item.get(k) or '')[:6000] for k in ('url','title','description','fullText','sourceName','publishedAt')}
    row.update(reason=reason,locationStatus='review_required',locationVerified=False,notificationEligible=False,
      mediaType=item.get('mediaType',''),firstSeenAt=old.get('firstSeenAt',timestamp),lastSeenAt=timestamp)
    items[key]=row
    obj['items']=dict(sorted(items.items(),key=lambda k:k[1].get('lastSeenAt',''),reverse=True)[:1800])
    atomic(REVIEW,obj)

def connect(payload=None):
    key=BROWSER_KEY.read_bytes().hex()
    data=json.dumps(payload,ensure_ascii=False).encode() if payload is not None else None
    req=urllib.request.Request(BRIDGE,data=data,headers={'X-OSINT-Browser-Key':key,'Content-Type':'application/json'})
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req,timeout=30) as resp:return json.load(resp)

def load_client():
    from instagrapi import Client
    if not SESSION.is_file():raise RuntimeError('login_required')
    c=Client()
    c.load_settings(str(SESSION))
    return c

def do_login():
    from instagrapi import Client
    ROOT.mkdir(parents=True,exist_ok=True,mode=0o700)
    user=input('Instagram izleme hesabı kullanıcı adı: ').strip().lstrip('@')
    if not re.fullmatch(r'[A-Za-z0-9._]{1,30}',user):raise RuntimeError('invalid_user')
    pw=getpass.getpass('Instagram şifresi (ekrana yazılmaz): ')
    code=getpass.getpass('2FA kodu varsa yaz, yoksa Enter: ')
    c=Client()
    try:
        ok=c.login(user,pw,verification_code=code or '')
        if not ok:raise RuntimeError('login_failed')
        # Do not save the password in settings; check persisted settings for sensitive fields.
        raw=c.get_settings()
        if isinstance(raw,dict):
            for k in ('password','passwd','login_password'):raw.pop(k,None)
        atomic(SESSION,raw)
        log('ig_extra_login_ok',sessionSaved=True)
    finally:
        pw='';code=''

def choose_accounts(state,handles):
    if not handles:return []
    cursor=int(state.get('cursor',0))%len(handles)
    selected=[handles[(cursor+i)%len(handles)] for i in range(min(MAX_PER_RUN,len(handles)))]
    state['cursor']=(cursor+len(selected))%len(handles)
    return selected

def api_rejection_reason(response):
    if not isinstance(response,dict):return 'bridge_invalid_response'
    results=response.get('results') or []
    reasons=[]
    for r in results:
        if isinstance(r,dict) and r.get('provider')=='instagram':
            reasons.extend([str(k) for k,v in (r.get('rejectionReasons') or {}).items() if v])
    return ','.join(reasons[:6]) or 'not_accepted'

def run_scan(dry=False):
    ROOT.mkdir(parents=True,exist_ok=True,mode=0o700)
    handles=targets()
    if not handles:log('ig_extra_no_targets');return
    state=load(STATE,{'version':1,'cursor':0,'baselined':{},'seen':{},'cooldownUntil':0})
    if not isinstance(state,dict) or state.get('version')!=1:raise RuntimeError('state_invalid')
    if time.time()<float(state.get('cooldownUntil',0)):
        log('ig_extra_cooldown',remainingSeconds=int(float(state['cooldownUntil'])-time.time()));return
    with (ROOT/'monitor.lock').open('a') as lf:
        try:fcntl.flock(lf,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:log('ig_extra_overlap_skip');return
        selected=choose_accounts(state,handles)
        config=None;profile=None
        try:
            config=connect()
            profile=next((p for p in (config.get('accounts') or []) if p.get('provider')=='instagram' and p.get('enabled') is not False),None)
            if not profile:raise RuntimeError('instagram_bridge_profile_missing')
        except Exception as exc:
            log('ig_extra_bridge_unavailable',reason=type(exc).__name__)
            # No authentication call if the bridge is down.
            raise RuntimeError('bridge_unavailable') from exc
        try:c=load_client()
        except Exception as exc:
            log('ig_extra_session_missing',reason=type(exc).__name__)
            raise RuntimeError('session_unusable') from exc
        stats={'scanned':0,'posts':0,'reels':0,'stories':0,'fresh':0,'observed':0,'sent':0,'reviewed':0,'errors':0,'baselines':0,'bridgeRejected':0}
        seen=state.setdefault('seen',{})
        baselined=state.setdefault('baselined',{})
        now=dt.datetime.now(dt.timezone.utc)
        for handle in selected:
            if handle not in targets():continue
            stats['scanned']+=1
            first=(handle not in baselined)
            try:
                uid=c.user_id_from_username(handle)
                med=c.user_medias(uid,amount=M_LIMIT) or []
                clips=c.user_clips(uid,amount=REELS_LIMIT) or []
                stories=c.user_stories(uid) or []
                candidates=[]
                for m in med:
                    typ='reel' if getattr(m,'product_type','')=='clips' else 'post'
                    x=media_candidate(m,handle,typ,now)
                    if x:candidates.append(x);stats['posts' if typ=='post' else 'reels']+=1
                for m in clips:
                    x=media_candidate(m,handle,'reel',now)
                    if x:candidates.append(x);stats['reels']+=1
                for s in stories[:STORY_LIMIT]:
                    x=story_candidate(s,handle,now)
                    if x:candidates.append(x);stats['stories']+=1
                unique={x['url']:x for x in candidates}
                stats['observed']+=len(unique)
                if first:stats['baselines']+=1
                for item in unique.values():
                    key=identity(item['url'])
                    if key in seen:continue
                    if first or dry:
                        seen[key]={'status':'baseline','at':time.time()};continue
                    stats['fresh']+=1
                    if item['mediaType']=='story':
                        save_review(item,'story_visual_review');stats['reviewed']+=1
                        seen[key]={'status':'reviewed','at':time.time()};continue
                    if not item.get('description'):
                        save_review(item,'caption_missing');stats['reviewed']+=1
                        seen[key]={'status':'reviewed','at':time.time()};continue
                    # The receiving OSINT server makes the final locality/priority decision.
                    result={'provider':'instagram','profileURL':profile['profileURL'],'status':'collected','posts':[item],'terms':['Ümraniye'],'readCount':1}
                    payload={'revision':config['revision'],'groupRevision':config.get('groupRevision',0),'results':[result],'sessionCheck':False}
                    try:
                        reply=connect(payload)
                        accepted=int(reply.get('accepted',0))
                        if accepted>0:
                            stats['sent']+=1;seen[key]={'status':'accepted','at':time.time()}
                        else:
                            # Store local items for manual review only when local evidence exists.
                            stats['bridgeRejected']+=1
                            reason=api_rejection_reason(reply)
                            if local_match(item['fullText'],config):
                                save_review(item,'bridge_rejected:'+reason[:120]);stats['reviewed']+=1
                            seen[key]={'status':'bridge_rejected','at':time.time()}
                            log('ig_extra_ingest_rejected',reason=reason)
                    except Exception as exc:
                        # Unacknowledged candidates are retried until their 3h lifetime ends.
                        stats['errors']+=1
                        log('ig_extra_bridge_error',reason=type(exc).__name__)
                baselined[handle]={'at':time.time()}
            except Exception as exc:
                stats['errors']+=1
                kind=type(exc).__name__
                log('ig_extra_account_error',reason=kind)
                if any(term in kind.lower() for term in ('rate','wait','challenge','loginrequired','feedback','blocked','429')):
                    state['cooldownUntil']=time.time()+BASE_COOLDOWN
                    log('ig_extra_cooldown_set',seconds=BASE_COOLDOWN)
                    break
            finally:
                # Checkpoint after each account so a late timeout loses no state.
                state['seen']=seen
                state['seen']={k:v for k,v in seen.items() if time.time()-float(v.get('at',0)) < 3*86400}
                atomic(STATE,state)
        log('ig_extra_round',**stats,selected=len(selected))
        if stats['scanned'] and stats['errors']>=stats['scanned'] and not (stats['posts'] or stats['reels'] or stats['stories']):
            raise RuntimeError('all_selected_accounts_failed')

def selftest():
    from types import SimpleNamespace as N
    now=dt.datetime.now(dt.timezone.utc)
    u=N(username='dudullu.haber')
    m=N(user=u,code='D12345_fake',taken_at=now-dt.timedelta(minutes=70),caption_text='Dudullu Merkez Camii önünde bankamatik sorunu',location=None,accessibility_caption='')
    # The mocked shortcode includes an underscore but is otherwise a valid opaque id.
    good=media_candidate(m,'dudullu.haber','reel',now)
    assert good and good['url'].startswith('https://www.instagram.com/reel/')
    assert media_candidate(m,'another','post',now) is None
    m.taken_at=now-dt.timedelta(days=1)
    assert media_candidate(m,'dudullu.haber','post',now) is None
    m.taken_at=now+dt.timedelta(minutes=20)
    assert media_candidate(m,'dudullu.haber','post',now) is None
    s=N(user=u,pk='123456789012345678',taken_at=now-dt.timedelta(hours=1),locations=[],hashtags=[],mentions=[],polls=[],links=[])
    sc=story_candidate(s,'dudullu.haber',now)
    assert sc and sc['notificationEligible'] is False and sc['mediaType']=='story'
    assert local_match('Dudullu Merkez Camii önü',{})
    assert not local_match('Ankara merkezi',{})
    assert choose_accounts({'cursor':12},['a','b','c','d'])==['a','b','c','d']
    print('SELFTEST_OK: media, reel, story, freshness, author, allowlist batch, locality',flush=True)

def main():
    p=argparse.ArgumentParser()
    p.add_argument('action',choices=('login','scan','selftest'))
    p.add_argument('--dry-run',action='store_true')
    a=p.parse_args()
    if a.action=='login':do_login()
    elif a.action=='selftest':selftest()
    else:run_scan(dry=a.dry_run)

if __name__=='__main__':
    try:main()
    except Exception as exc:
        log('ig_extra_fatal',reason=type(exc).__name__)
        sys.exit(1)

# UMRANIYE_OSINT_GUVENLI_V2_20261109_MEDIA
