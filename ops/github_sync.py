#!/usr/bin/env python3
"""Export source files only; never imports changes into the live application."""
import argparse, fcntl, hashlib, json, os, pathlib, re, subprocess, time

BASE = pathlib.Path.home()/'.local/share/umraniye-github-sync'
REPO = BASE/'repository'
ROOTS = {
    'application': '/opt/umraniye-osint-deneme',
    'legacy-application': '/opt/umraniye-osint',
    'browser': '/opt/umraniye-osint-browser',
    'instagram-api': '/opt/umraniye-osint-instagram-api',
    'instagram-media': '/opt/umraniye-osint-igmedia',
    'x-shadow': '/opt/umraniye-osint-x-twscrape-deneme',
    'facebook-shadow': '/opt/umraniye-osint-facebook-fbgql-deneme',
    'telegram': '/opt/umraniye-telegram',
}
SKIP = {'node_modules','venv','image-tools','browsers','__pycache__','backups','profiles','browser-profiles','data','logs','credentials','sessions','dist'}
EXT = {'.mjs','.js','.cjs','.ts','.tsx','.jsx','.py','.html','.css','.sql','.md','.txt','.lock','.toml','.yaml','.yml','.sh','.service','.service.saved','.timer','.conf','.ini','.xml','.svg','.woff','.woff2','.ttf','.png','.jpg','.ico'}
JSON_NAMES = {'package.json','package-lock.json','tsconfig.json','config.example.json','rules-manifest.json','RELEASE.json'}
SECRET = re.compile(rb'-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----|(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})|\b\d{8,12}:[A-Za-z0-9_-]{30,}\b|\bAKIA[0-9A-Z]{16}\b')
ASSIGNED_SECRET = re.compile(rb'''(?im)^\s*(?:export\s+)?(?:const\s+|let\s+|var\s+)?(?:[A-Z_]*(?:PASSWORD|SECRET|API_KEY|ACCESS_TOKEN|BOT_TOKEN)[A-Z_]*)\s*[:=]\s*["']([^"'\r\n]{8,})["']''')

def run(*args):
    return subprocess.run(args,cwd=REPO,check=True,text=True,capture_output=True,timeout=90).stdout.strip()

def snapshot():
    files = {}
    for prefix, source in ROOTS.items():
        root = pathlib.Path(source)
        if not root.is_dir(): raise RuntimeError('Source missing: '+source)
        def fail(error): raise error
        for folder, dirs, names in os.walk(root,onerror=fail,followlinks=False):
            dirs[:] = [n for n in dirs if not n.startswith('.') and 'backup' not in n.lower() and n not in SKIP and not (pathlib.Path(folder)/n).is_symlink()]
            for name in sorted(names):
                p = pathlib.Path(folder)/name
                if p.is_symlink() or name.startswith('.') or '.bak' in name or '.pre-' in name or name=='get-pip.py': continue
                if p.suffix not in EXT and name not in JSON_NAMES and p.suffix != '.json' and name != 'service.saved': continue
                if any(w in name.lower() for w in ('cookie','credential','session-key','private-key')): continue
                if p.stat().st_size > 12_000_000: raise RuntimeError('Oversized source: '+str(p))
                data = p.read_bytes()
                if SECRET.search(data): raise RuntimeError('Secret pattern in '+str(p))
                for match in ASSIGNED_SECRET.finditer(data):
                    value=match.group(1).lower()
                    if not any(t in value for t in (b'example',b'placeholder',b'change',b'your_',b'/var/',b'/etc/',b'/opt/',b'process.env')):
                        raise RuntimeError('Review secret assignment in '+str(p))
                files[prefix+'/'+p.relative_to(root).as_posix()] = data
    return files

def digest(files):
    h=hashlib.sha256()
    for name,data in sorted(files.items()): h.update(name.encode()+b'\0'+hashlib.sha256(data).digest())
    return h.hexdigest()

def sync(files):
    run('git','fetch','origin','main')
    # Local commits awaiting retry may be ahead. Divergence stops safely.
    run('git','merge','--ff-only','origin/main')
    for prefix in ROOTS:
        folder=REPO/prefix
        if folder.exists():
            for p in folder.rglob('*'):
                if p.is_file() and p.relative_to(REPO).as_posix() not in files: p.unlink()
    for name,data in files.items():
        p=REPO/name
        if p.exists() and p.read_bytes()==data: continue
        p.parent.mkdir(parents=True,exist_ok=True)
        tmp=p.with_name(p.name+'.sync-tmp');tmp.write_bytes(data);tmp.replace(p)
    run('git','add','--',*ROOTS)
    if run('git','diff','--cached','--name-only'):
        run('git','commit','-m','Sync live OSINT source '+time.strftime('%Y-%m-%d %H:%M:%S UTC',time.gmtime()))
    run('git','push','origin','HEAD:main')
    (BASE/'status.json').write_text(json.dumps({'ok':True,'at':time.time(),'commit':run('git','rev-parse','HEAD'),'files':len(files)}))
    return digest(files)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--export');parser.add_argument('--seconds',type=int,default=50);args=parser.parse_args()
    BASE.mkdir(parents=True,exist_ok=True)
    with (BASE/'lock').open('w') as lock:
        try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError: return
        if args.export:
            files=snapshot();dest=pathlib.Path(args.export)
            for name,data in files.items():
                p=dest/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
            print(json.dumps({'files':len(files),'bytes':sum(map(len,files.values()))}));return
        start=time.monotonic();previous=None;done=None
        while time.monotonic()-start < args.seconds:
            try:
                files=snapshot();current=digest(files)
                if current==previous and current!=done: done=sync(files)
                previous=current
            except Exception as exc:
                (BASE/'status.json').write_text(json.dumps({'ok':False,'at':time.time(),'error':str(exc)}))
                print(str(exc),flush=True)
                time.sleep(10)
            time.sleep(3)

if __name__=='__main__': main()

