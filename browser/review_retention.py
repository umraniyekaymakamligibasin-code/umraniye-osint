"""Locked cleanup of private review files; publication dates are never invented."""
import argparse,contextlib,datetime,json,os,pathlib,tempfile

@contextlib.contextmanager
def review_lock(root,provider,blocking=True):
    import fcntl
    if provider not in ('x','instagram'):raise ValueError('invalid_provider')
    root=pathlib.Path(root);root.mkdir(parents=True,exist_ok=True,mode=0o700)
    path=root/(provider+'-review.lock')
    if path.is_symlink():raise ValueError('unsafe_lock')
    fd=os.open(path,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:
        if os.geteuid()==0:
            parent=root.stat();os.fchown(fd,parent.st_uid,parent.st_gid)
        fcntl.flock(fd,fcntl.LOCK_EX|(0 if blocking else fcntl.LOCK_NB))
        try:yield
        finally:fcntl.flock(fd,fcntl.LOCK_UN)
    finally:os.close(fd)

def expired(row,cutoff):
    def parse(value):
        try:
            value=str(value or '')
            if len(value)==10:return datetime.date.fromisoformat(value)
            stamp=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
            return stamp if stamp.tzinfo is not None else None
        except (ValueError,TypeError):return None
    value=parse(row.get('publishedAt'))
    if value is None:value=parse(row.get('firstSeenAt') or row.get('collectedAt'))
    if value is None:return False
    if isinstance(value,datetime.datetime):return value<datetime.datetime.fromisoformat(cutoff+'T00:00:00+03:00')
    return value<datetime.date.fromisoformat(cutoff)

def clean_file(root,provider,cutoff):
    path=pathlib.Path(root)/(provider+'-review.json')
    with review_lock(root,provider,blocking=False):
        if not path.exists():return 0
        if path.is_symlink() or path.stat().st_size>32_000_000:raise ValueError('review_file_unsafe_or_too_large')
        state=json.loads(path.read_text(encoding='utf-8'));items=state['items']
        kept={key:row for key,row in items.items() if not expired(row,cutoff)}
        removed=len(items)-len(kept)
        if not removed:return 0
        owner=path.stat();state['items']=kept;fd,name=tempfile.mkstemp(prefix='.review-retention-',dir=path.parent)
        try:
            with os.fdopen(fd,'w',encoding='utf-8') as stream:json.dump(state,stream,ensure_ascii=False);stream.flush();os.fsync(stream.fileno())
            os.chmod(name,0o600)
            if os.geteuid()==0:os.chown(name,owner.st_uid,owner.st_gid)
            os.replace(name,path)
        finally:pathlib.Path(name).unlink(missing_ok=True)
        return removed

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',required=True);parser.add_argument('--cutoff',required=True);args=parser.parse_args()
    if pathlib.Path(args.root).resolve()!=pathlib.Path('/var/lib/umraniye-osint-deneme').resolve():raise SystemExit('invalid_root')
    datetime.date.fromisoformat(args.cutoff);removed=0;busy=0
    for provider in ('x','instagram'):
        try:removed+=clean_file(args.root,provider,args.cutoff)
        except BlockingIOError:busy+=1
    print(json.dumps({'removed':removed,'busy':busy}))
