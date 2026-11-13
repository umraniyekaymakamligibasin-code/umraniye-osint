"""Read-only Facebook source and central dictionary snapshot. Root pre-step only."""
import datetime as dt,hashlib,json,os,pwd,sqlite3
from pathlib import Path
HERE=Path(__file__).resolve().parent
APP=Path('/opt/umraniye-osint-deneme');DB=Path('/var/lib/umraniye-osint-deneme/osint.sqlite');STATE=Path('/var/lib/umraniye-osint-facebook-fbgql-deneme')
def snapshot(database=DB,app=APP):
    manifest=json.loads((HERE/'rules-manifest.json').read_text())
    for name,digest in manifest.items():
        if hashlib.sha256((app/name).read_bytes()).hexdigest()!=digest:raise RuntimeError('shared_filter_version_changed:'+name)
    c=sqlite3.connect(Path(database).resolve().as_uri()+'?mode=ro',uri=True,timeout=3);c.row_factory=sqlite3.Row
    try:
        c.execute('PRAGMA query_only=ON');c.execute('BEGIN')
        tables={t:[dict(r) for r in c.execute('SELECT * FROM '+t)] for t in ('facebook_keywords','common_keyword_groups','common_keyword_members','common_keyword_state')}
        tables['workspace_settings']=[dict(r) for r in c.execute('SELECT id,data FROM workspace_settings WHERE id=?',('location-dictionary',))]
        sources=[dict(r) for r in c.execute('SELECT source_id,page_name,page_url,page_id FROM facebook_sources WHERE enabled=? ORDER BY source_id',(1,))]
        old=[str(r[0]) for r in c.execute('SELECT stable_post_id FROM facebook_posts WHERE published_at>=?',((dt.datetime.now(dt.timezone.utc)-dt.timedelta(hours=24)).isoformat(),))]
        return {'at':dt.datetime.now(dt.timezone.utc).isoformat(),'revision':tables['common_keyword_state'][0]['revision'],'tables':tables,'sources':sources,'existingFacebookIds':old}
    finally:c.close()
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
    os.umask(0o077);data=snapshot();who=pwd.getpwnam('osintfbshadow');dfd=open_state(STATE)
    try:main_write(dfd,data,who.pw_uid,who.pw_gid)
    finally:os.close(dfd)
def main_write(dfd,data,uid,gid):
    write_state(dfd,'snapshot.json',json.dumps(data,ensure_ascii=False),uid,gid)
    context={'version':1,'sources':[]};original=DB.parent/'social-source-context.json'
    if original.is_file() and original.stat().st_size<=100000:
        value=json.loads(original.read_text())
        if value.get('version')==1:context['sources']=[{k:r.get(k) for k in ['provider','identity','enabled','scope']} for r in value.get('sources',[])[:300]]
    write_state(dfd,'social-source-context.json',json.dumps(context,ensure_ascii=False),uid,gid)
if __name__=='__main__':main()
