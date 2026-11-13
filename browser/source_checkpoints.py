"""Read evidence per source, committed only after the existing bridge confirms receipt.

A sample is not an exhaustive archive; bounded reading is recorded as such.
"""
import datetime,hashlib,json,pathlib,time,urllib.parse
from social_reader_repair import write_json
def load(root):
    path=pathlib.Path(root)/'source-read-checkpoints.json'
    try:
        if path.is_symlink() or path.stat().st_size>4000000:raise ValueError('unsafe_source_checkpoint')
        state=json.loads(path.read_text(encoding='utf-8'))
        if state.get('version')!=1 or not isinstance(state.get('sources'),dict):raise ValueError('invalid_source_checkpoint')
    except FileNotFoundError:state={'version':1,'sources':{}}
    return path,state
def identity(provider,source):
    if provider not in ('x','facebook','instagram') or not isinstance(source,str) or len(source)>1000:raise ValueError('invalid_source')
    return hashlib.sha256((provider+'|'+source).encode()).hexdigest()
def parsed(value):
    try:
        date=datetime.datetime.fromisoformat(str(value or '').replace('Z','+00:00'))
        return date if date.tzinfo else None
    except (ValueError,TypeError):return None
def known_urls(root,provider,source):
    _,state=load(root);return set(state['sources'].get(identity(provider,source),{}).get('knownUrls',[]))
def recovery_window(root,provider,source,now=None,default=10800,maximum=172800,initial=None):
    current=time.time() if now is None else now
    _,state=load(root);row=state['sources'].get(identity(provider,source),{});last=parsed(row.get('lastSuccessfulReadAt'))
    elapsed=current-last.timestamp()+1800 if last else (initial or default)
    return int(max(default,min(maximum,elapsed)))
def observation(source,posts,trace=None):
    trace=trace or {};times=[parsed(p.get('publishedAt')) for p in posts if isinstance(p,dict)];times=[d for d in times if d]
    return {'source':source,'readCount':max(len(posts),int(trace.get('postsRead',0))),
            'datedCount':max(len(times),int(trace.get('datedPosts',0))),
            'missingDates':int(trace.get('missingDates',0)),'errors':int(trace.get('routeErrors',0)),
            'timeBudgets':int(trace.get('timeBudgets',0)),
            'checkpointReached':trace.get('checkpointReached') is True,
            'knownUrls':list(dict.fromkeys(p.get('url') for p in posts if isinstance(p,dict) and p.get('url') and not p.get('_pinned')))[:100],
            'newestPublicationAt':max(times).isoformat() if times else None,
            'oldestPublicationAt':min(times).isoformat() if times else None}
def commit(root,provider,entries,now=None):
    if not entries:return
    path,state=load(root);current=time.time() if now is None else now;at=datetime.datetime.fromtimestamp(current,datetime.timezone.utc).isoformat()
    for entry in entries:
        key=identity(provider,entry['source']);old=state['sources'].get(key,{})
        row={**old,'provider':provider,'source':entry['source'],'lastReceiptAt':at,'lastReadCount':entry['readCount'],'boundedRead':True,'checkpointReached':entry.get('checkpointReached',False),'missingDates':entry.get('missingDates',0),'readErrors':entry.get('errors',0)}
        if entry['readCount']>0:row['lastReadAt']=at
        if entry['datedCount']>0 and not entry.get('missingDates') and not entry.get('errors') and not entry.get('timeBudgets'):row['lastSuccessfulReadAt']=at
        for field in ('newestPublicationAt','oldestPublicationAt'):
            if entry.get(field):row[field]=entry[field]
        old_boundary=old.get('knownUrls',[])
        # An incomplete X traversal must not move the boundary past an unread gap.
        row['knownUrls']=old_boundary if provider=='x' and old_boundary and not entry.get('checkpointReached') else list(dict.fromkeys(entry.get('knownUrls',[])+old_boundary))[:200]
        row['unreachedPreviousBoundary']=bool(provider=='x' and old_boundary and not entry.get('checkpointReached'))
        prior=parsed(old.get('lastSuccessfulReadAt'))
        row['gapBeyondRecoveryWindow']=bool(prior and current-prior.timestamp()>172800)
        state['sources'][key]=row
    state['sources']=dict(sorted(state['sources'].items(),key=lambda pair:pair[1].get('lastReceiptAt',''),reverse=True)[:2000])
    write_json(path,state)
