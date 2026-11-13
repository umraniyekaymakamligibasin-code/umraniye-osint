"""Public X candidates awaiting a successful existing ingestion bridge response."""
import contextlib, fcntl, hashlib, json, os, pathlib, tempfile

def digest(post):
    return hashlib.sha256(json.dumps(post,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()

class SearchQueue:
    def __init__(self, root, profile):
        self.path=pathlib.Path(root)/'x-search-pending'/('queue-'+hashlib.sha256(profile.encode()).hexdigest()[:24]+'.json')

    @contextlib.contextmanager
    def state(self):
        self.path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        with self.path.with_suffix('.lock').open('a') as lock:
            os.chmod(lock.name,0o600)
            fcntl.flock(lock,fcntl.LOCK_EX)
            state={'pending':{},'done':{}}
            if self.path.exists():
                # Fail closed on damage; never silently overwrite unacknowledged posts.
                state=json.loads(self.path.read_text(encoding='utf-8'))
                if not isinstance(state.get('pending'),dict) or not isinstance(state.get('done'),dict):
                    raise ValueError('x_pending_state_invalid')
            yield state
            fd,name=tempfile.mkstemp(dir=self.path.parent,prefix='.pending-')
            try:
                with os.fdopen(fd,'w',encoding='utf-8') as out:
                    json.dump(state,out,ensure_ascii=False,separators=(',',':'));out.flush();os.fsync(out.fileno())
                os.chmod(name,0o600);os.replace(name,self.path)
            finally:
                pathlib.Path(name).unlink(missing_ok=True)

    def add(self, posts):
        with self.state() as state:
            for post in posts:
                key=post['url']
                if state['done'].get(key)!=digest(post):state['pending'][key]=post

    def batch(self, limit=20):
        with self.state() as state:
            # FIFO lets older pending candidates drain even when new posts arrive.
            pending=list(state['pending'].values())
            newest=sorted(pending,key=lambda p:str(p.get('publishedAt') or ''),reverse=True)[:max(1,limit//2)]
            combined=newest+pending
            selected=list({p['url']:p for p in combined}.values())[:limit]
            return selected,len(pending)

    def acknowledge(self, posts):
        with self.state() as state:
            for post in posts:
                key=post['url'];fingerprint=digest(post)
                if key in state['pending'] and digest(state['pending'][key])==fingerprint:
                    del state['pending'][key];state['done'].pop(key,None);state['done'][key]=fingerprint
            while len(state['done'])>10000:del state['done'][next(iter(state['done']))]
