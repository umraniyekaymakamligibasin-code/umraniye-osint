"""Bounded X coverage with durable per-query cursors and recoverable raw candidates."""
import datetime as dt,hashlib,json,re,time
from contextlib import aclosing


def quoted(value):
    clean=re.sub(r"[^\w\sçğıöşüÇĞİÖŞÜ-]",' ',str(value)).strip()
    return '"'+clean[:55]+'"' if clean else None


def plans(groups,sources,cursor,now):
    # These five are mention targets by the owner's explicit instruction.
    mention_only={'tc_umraniye','yukselcelikmia','umraniyeilcemem','umraniyenufus','umraniye_tarim'}
    active=[s for s in sources if s.get('enabled') in (True,1) and not s.get('removedAt') and re.fullmatch(r'@?[A-Za-z0-9_]{1,15}',str(s.get('handle') or ''))]
    targets=list(dict.fromkeys(str(s['handle']).lstrip('@').lower() for s in active if s.get('institutional') or s.get('mentions') or str(s['handle']).lstrip('@').lower() in mention_only))
    handles=list(dict.fromkeys(str(s['handle']).lstrip('@').lower() for s in active if str(s['handle']).lstrip('@').lower() not in targets))
    out=[]
    batches=[handles[i:i+4] for i in range(0,len(handles),4)]
    for n in range(min(2,len(batches))):
        batch=batches[(cursor*2+n)%len(batches)]
        out.append({'kind':'accounts','base':'('+' OR '.join('from:'+h for h in batch)+')'})
    batches=[targets[i:i+3] for i in range(0,len(targets),3)]
    for n in range(min(2,len(batches))):
        batch=batches[(cursor*2+n)%len(batches)]
        base='('+' OR '.join('(@'+h+' OR to:'+h+')' for h in batch)+')'
        # Exclude all target institutions as authors, including cross-mentions.
        base+=' '+' '.join('-from:'+h for h in targets)
        out.append({'kind':'mentions','base':base})
    terms=list(dict.fromkeys(q for g in groups if g.get('kind')!='konum' for t in g.get('terms',[]) if (q:=quoted(t))))
    words=[terms[i:i+5] for i in range(0,len(terms),5)]
    if words:out.append({'kind':'keywords','base':'(Ümraniye OR Umraniye OR Dudullu) ('+' OR '.join(words[cursor%len(words)])+')'})
    # A locality-only query also catches unusual/obfuscated incident wording.
    out.append({'kind':'locality','base':'(Ümraniye OR Umraniye OR Dudullu)'})
    for p in out:
        p['key']=hashlib.sha256(p['base'].encode()).hexdigest()[:24]
        p['query']=p['base']+' since:'+(now-dt.timedelta(hours=72)).strftime('%Y-%m-%d')
    return out


def setup(con):
    con.executescript('CREATE TABLE IF NOT EXISTS coverage_candidates(id TEXT PRIMARY KEY,data TEXT NOT NULL,published REAL NOT NULL,seen REAL NOT NULL); CREATE TABLE IF NOT EXISTS coverage_queries(key TEXT PRIMARY KEY,high_id TEXT,backlog TEXT);')


def retain(con,e):
    try:
        when=dt.datetime.fromisoformat(e['publishedAt'].replace('Z','+00:00'))
        if when.tzinfo is None or not -30<=time.time()-when.timestamp()<=72*3600:return False
        if not re.fullmatch(r'[0-9]{1,25}',e['id']):return False
    except (KeyError,ValueError,TypeError,AttributeError):return False
    old=con.execute('SELECT data FROM coverage_candidates WHERE id=?',(e['id'],)).fetchone()
    e={**e,'firstSeenAt':json.loads(old[0]).get('firstSeenAt',e['collectedAt']) if old else e['collectedAt']}
    con.execute('INSERT INTO coverage_candidates VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,seen=excluded.seen',(e['id'],json.dumps(e,ensure_ascii=False),when.timestamp(),time.time()))
    return True


def persisted_candidates(con,now):
    con.execute('DELETE FROM coverage_candidates WHERE published<?',(now.timestamp()-72*3600,))
    return [json.loads(r[0]) for r in con.execute('SELECT data FROM coverage_candidates ORDER BY published DESC LIMIT 2000')]


async def fetch(api,query,limit,output,normalize):
    batch=[]
    async with aclosing(api.search(query,limit=limit,kv={'product':'Latest'})) as stream:
        async for tweet in stream:
            e=normalize(tweet,query);batch.append(e);output.append(e)
            if len(batch)>=limit:break
    return batch


async def read_queries(api,plans,output,limit,con,normalize):
    for p in plans:
        row=con.execute('SELECT high_id,backlog FROM coverage_queries WHERE key=?',(p['key'],)).fetchone() if con else None
        high=row[0] if row else None;backlog=json.loads(row[1]) if row and row[1] else None
        query=p['query']+(' since_id:'+high if high else '')
        before=len(output)
        try:
            batch=await fetch(api,query,limit,output,normalize)
        finally:
            # Includes partial responses when interrupted; no cursor change on failure.
            if con:
                for e in output[before:]:retain(con,e)
                con.commit()
        ids=[int(e['id']) for e in batch]
        if ids:
            if len(batch)>=limit:
                lower=min(int(high or 0),int(backlog['since'])) if backlog else int(high or 0)
                upper=max(min(ids)-1,int(backlog['max'])) if backlog else min(ids)-1
                backlog={'since':str(lower),'max':str(upper)}
            high=str(max([int(high or 0)]+ids))
        if con:
            con.execute('INSERT OR REPLACE INTO coverage_queries VALUES(?,?,?)',(p['key'],high,json.dumps(backlog) if backlog else None));con.commit()
    # Drain one older page per round, while every round still starts with new posts.
    if con:
        known={p['key']:p for p in plans}
        rows=[r for r in con.execute('SELECT key,high_id,backlog FROM coverage_queries WHERE backlog IS NOT NULL').fetchall() if r[0] in known]
        # Newest gap first: only recent posts remain admissible, so table order must
        # not let one query's old backlog starve a busier query's fresh gap.
        rows.sort(key=lambda r:int(json.loads(r[2])['max']),reverse=True)
        for key,high,encoded in rows:
            b=json.loads(encoded);q=known[key]['query']+' max_id:'+b['max']
            if int(b['since']):q+=' since_id:'+b['since']
            before=len(output)
            try:batch=await fetch(api,q,limit,output,normalize)
            finally:
                for e in output[before:]:retain(con,e)
                con.commit()
            if len(batch)>=limit:
                b['max']=str(min(int(e['id']) for e in batch)-1)
                if int(b['max'])<=int(b['since']):b=None
            else:b=None
            con.execute('UPDATE coverage_queries SET backlog=? WHERE key=?',(json.dumps(b) if b else None,key));con.commit()
            break
