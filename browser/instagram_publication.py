"""Media IDs rank probes only; original-post page evidence supplies publication time."""
import datetime,hashlib,json,pathlib,time

def page_publication(value):
    try:
        stamp=datetime.datetime.fromisoformat(str(value or '').replace('Z','+00:00'))
        return stamp.astimezone(datetime.timezone.utc) if stamp.tzinfo is not None else None
    except (ValueError,TypeError,OverflowError):return None

def select_probes(links,entries,cursor,estimate,now,window=10800,limit=4):
    fresh=[];unverified=[]
    for item in links[:24]:
        row=entries.get(str(item.get('code')),{})
        if not isinstance(row,dict) or not isinstance(row.get('checkedAt',0),(int,float)):row={}
        known=page_publication(row.get('publishedAt'))
        if known is not None and 0<=now-row.get('checkedAt',0)<21600:
            age=now-known.timestamp()
            if age>window:continue
            if age>=-300:fresh.append(item);continue
        created=estimate(str(item.get('code') or ''))
        age=now-created.timestamp() if created is not None else None
        if age is not None and -300<=age<=window:fresh.append(item)
        else:unverified.append(item)
    try:cursor=int(cursor)
    except (ValueError,TypeError):cursor=0
    selected=fresh[:limit];slots=limit-len(selected)
    if unverified and slots:
        start=int(cursor)%len(unverified);count=min(slots,len(unverified))
        selected.extend(unverified[(start+i)%len(unverified)] for i in range(count))
        cursor=(start+count)%len(unverified)
    return selected,cursor

def prepare_probes(root,handle,links,estimate,write_json,window=10800):
    path=pathlib.Path(root)/'instagram-publication-cache'/(hashlib.sha256(handle.encode()).hexdigest()[:24]+'.json')
    try:
        state=json.loads(path.read_text(encoding='utf-8'))
        if state.get('version')!=1 or not isinstance(state.get('entries'),dict):raise ValueError()
    except (OSError,ValueError,TypeError):state={'version':1,'entries':{},'cursor':0}
    selected,cursor=select_probes(links,state['entries'],state.get('cursor',0),estimate,time.time(),window=window)
    state['cursor']=cursor;write_json(path,state)
    def remember(code,stamp):
        state['entries'][code]={'publishedAt':stamp.isoformat(),'checkedAt':time.time()}
        state['entries']=dict(sorted(state['entries'].items(),key=lambda pair:pair[1].get('checkedAt',0),reverse=True)[:500])
        write_json(path,state)
    return selected,remember
