# OSINT_INSTAGRAM_ALLOWLIST_V60
"""Yalnızca yönetici paneline kaydedilmiş Instagram hesapları."""
from pathlib import Path
import json,os,re,tempfile

FILE=Path('/opt/umraniye-osint-browser/.instagram-v60/targets.json')
HANDLE=re.compile(r'^[A-Za-z0-9._]{1,30}$')

def handles():
    try:
        obj=json.loads(FILE.read_text(encoding='utf-8'))
        if obj.get('version')!=1 or not isinstance(obj.get('accounts'),list):return set()
        result=set()
        for row in obj['accounts']:
            if not isinstance(row,dict):return set()
            name=str(row.get('handle','')).lower()
            if not HANDLE.fullmatch(name):return set()
            if row.get('enabled') is True:result.add(name)
        return result
    except (OSError,ValueError,TypeError):
        return set()  # Fail closed; never run global exploration.

def all_targets(path=FILE):
    try:
        obj=json.loads(Path(path).read_text(encoding='utf-8'))
        rows=obj['accounts']
        if obj['version']!=1 or not isinstance(rows,list) or len(rows)>200:return []
        out=[];seen=set()
        for row in rows:
            h=str(row['handle']).lower()
            if not HANDLE.fullmatch(h) or h in seen:return []
            seen.add(h)
            if row['enabled'] is True:out.append(h)
        return out
    except (OSError,ValueError,TypeError,KeyError):return []

def next_batch(data_folder,count=2,advance=True):
    targets=all_targets()
    if not targets:return []
    cursor=Path(data_folder)/'instagram-v60-cursor.json'
    try:
        old=json.loads(cursor.read_text(encoding='utf-8'))
        index=int(old.get('next',0))%len(targets)
    except (OSError,ValueError,TypeError):index=0
    chosen=[targets[(index+i)%len(targets)] for i in range(min(len(targets),count))]
    if not advance:return chosen
    state={'next':(index+len(chosen))%len(targets),'revisionTargets':len(targets)}
    fd,tmp=tempfile.mkstemp(prefix='.instagram-cursor-',dir=str(data_folder))
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as f:
            json.dump(state,f);f.flush();os.fsync(f.fileno())
        os.replace(tmp,cursor)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
    return chosen


def advance_batch(data_folder,planned,attempted):
    """Advance only the attempted prefix; never skip unread accounts after a short tour."""
    targets=all_targets()
    if not targets or not planned:return False
    cursor=Path(data_folder)/'instagram-v60-cursor.json'
    try:index=int(json.loads(cursor.read_text(encoding='utf-8')).get('next',0))%len(targets)
    except (OSError,ValueError,TypeError):index=0
    expected=[targets[(index+i)%len(targets)] for i in range(min(len(targets),len(planned)))]
    if list(planned)!=expected:return False
    count=max(0,min(len(planned),int(attempted)))
    if not count:return False
    state={'next':(index+count)%len(targets),'revisionTargets':len(targets)}
    fd,tmp=tempfile.mkstemp(prefix='.instagram-cursor-',dir=str(data_folder))
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as stream:json.dump(state,stream);stream.flush();os.fsync(stream.fileno())
        os.chmod(tmp,0o600);os.replace(tmp,cursor)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
    return True
