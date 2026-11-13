"""Fit queued posts into the existing HTTP limit without acknowledging deferred URLs."""
import json
def encode(payload):return json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode('utf-8')
def bounded_payload(payload,limit=58000):
    if len(encode(payload))<=limit:return payload
    prepared={**payload,'results':[{**r,'posts':[],'prefilterReasons':dict(r.get('prefilterReasons',{}))} for r in payload.get('results',[])]}
    original=[list(r.get('posts',[])) for r in payload.get('results',[])]
    for result,posts in zip(prepared['results'],original):result['prefilterReasons']['payload_deferred']=len(posts)
    if len(encode(prepared))>limit:raise ValueError('bridge_metadata_too_large')
    for position in range(max((len(posts) for posts in original),default=0)):
        for result,posts in zip(prepared['results'],original):
            if position>=len(posts):continue
            result['posts'].append(posts[position]);result['prefilterReasons']['payload_deferred']-=1
            if len(encode(prepared))>limit:
                result['posts'].pop();result['prefilterReasons']['payload_deferred']+=1
    return prepared
