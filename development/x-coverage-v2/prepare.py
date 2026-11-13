"""Restricted, consistent read of the real dictionary; never copies credentials/profiles."""
import argparse, datetime as dt, hashlib, json, os, re, sqlite3, subprocess
from pathlib import Path

UNITS=['umraniye-osint-browser-x.service','umraniye-osint-browser-x.timer','umraniye-osint-sirali.service','umraniye-osint-sirali.timer','umraniye-osint-deneme.service','umraniye-osint.service','umraniye-telegram.service']
TABLES=['facebook_keywords','common_keyword_groups','common_keyword_members','common_keyword_state']

def states():
    result={}
    for unit in UNITS:
        try:
            p=subprocess.run(['systemctl','show',unit,'--property=LoadState,ActiveState,SubState,ExecMainStartTimestampMonotonic,NRestarts,LastTriggerUSec'],capture_output=True,text=True,timeout=5)
            result[unit]=dict(line.split('=',1) for line in p.stdout.splitlines() if '=' in line)
        except (OSError,subprocess.TimeoutExpired): result[unit]={'observation':'unavailable'}
    return result

def read_snapshot(database,app,manifest):
    database=Path(database).resolve(strict=True);app=Path(app).resolve(strict=True)
    for relative,expected in manifest.items():
        p=(app/relative).resolve(strict=True)
        if not p.is_relative_to(app) or hashlib.sha256(p.read_bytes()).hexdigest()!=expected:
            raise RuntimeError('reviewed_filter_version_changed:'+relative)
    con=sqlite3.connect(database.as_uri()+'?mode=ro',uri=True,timeout=3)
    con.row_factory=sqlite3.Row
    try:
        con.execute('PRAGMA query_only=ON');con.execute('BEGIN')
        tables={t:[dict(r) for r in con.execute('SELECT * FROM '+t)] for t in TABLES}
        tables['workspace_settings']=[dict(r) for r in con.execute('SELECT id,data FROM workspace_settings WHERE id=?',('location-dictionary',))]
        row=con.execute('SELECT data FROM lab_config WHERE id=?',('platform-watch-sources',)).fetchone()
        setting=json.loads(row['data']) if row else {}
        sources=[r for r in setting.get('sources',[]) if r.get('provider')=='x' and r.get('enabled') in (True,1) and not r.get('removedAt')]
        # No token/cookie/source state is exported. Explicit whitelist only.
        sources=[{k:r.get(k) for k in ('id','provider','handle','url','label','institutional','enabled','aliases')} for r in sources]
        tables['workspace_settings']=[r for r in tables['workspace_settings'] if r['id']=='location-dictionary']
        old=[];cutoff=(dt.datetime.now(dt.timezone.utc)-dt.timedelta(hours=24)).isoformat()
        for r in con.execute('SELECT data FROM lab_items WHERE published_at>=? ORDER BY published_at DESC LIMIT 10000',(cutoff,)):
            try:
                e=json.loads(r['data'])
                if (e.get('platform') or e.get('provider'))!='x':continue
                found=re.search(r'/(?:status|statuses)/(\d+)',str(e.get('url','')))
                if found:old.append({'id':found[1],'publishedAt':e.get('publishedAt')})
            except (ValueError,TypeError):continue
        return {'at':dt.datetime.now(dt.timezone.utc).isoformat(),'revision':tables['common_keyword_state'][0]['revision'],'tables':tables,'sources':sources,'existingX':old,'referenceWindowHours':24,'referenceTruncated':len(old)>=10000,'existingCoverageComparable':False}
    finally:con.close()

def write_state(dfd,name,text,uid=-1,gid=-1):
    """Root-safe write into a service-writable dir: no symlink follow, fchown on fd, atomic rename via dir_fd."""
    tmp=name.rsplit('.',1)[0]+'.tmp'
    try:os.unlink(tmp,dir_fd=dfd)
    except FileNotFoundError:pass
    fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=dfd)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as stream:os.fchown(stream.fileno(),uid,gid);stream.write(text)
        os.replace(tmp,name,src_dir_fd=dfd,dst_dir_fd=dfd)
    except BaseException:
        try:os.unlink(tmp,dir_fd=dfd)
        except FileNotFoundError:pass
        raise
def open_state(path):return os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--database',required=True);ap.add_argument('--app',required=True);ap.add_argument('--state',required=True);ap.add_argument('--owner');a=ap.parse_args()
    state=Path(a.state);state.mkdir(parents=True,exist_ok=True,mode=0o700)
    manifest=json.loads((Path(__file__).parent/'rules-manifest.json').read_text())
    before=states();snapshot=read_snapshot(a.database,a.app,manifest)
    uid=gid=-1
    if a.owner:
        import pwd
        who=pwd.getpwnam(a.owner);uid,gid=who.pw_uid,who.pw_gid
    dfd=open_state(state)
    try:
        write_state(dfd,'snapshot.json',json.dumps(snapshot,ensure_ascii=False),uid,gid)
        write_state(dfd,'service-observation.json',json.dumps({'before':before,'after':states(),'normalOldRoundObserved':False}),uid,gid)
    finally:os.close(dfd)
    print(json.dumps({'snapshotReady':True,'sources':len(snapshot['sources']),'revision':snapshot['revision'],'productionWrites':0}))
if __name__=='__main__':main()
