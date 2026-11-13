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
def main():
    os.umask(0o077);data=snapshot();p=STATE/'snapshot.json';t=p.with_suffix('.tmp');t.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8');t.chmod(0o600);who=pwd.getpwnam('osintfbshadow');os.chown(t,who.pw_uid,who.pw_gid);t.replace(p)
    context={'version':1,'sources':[]};original=DB.parent/'social-source-context.json'
    if original.is_file() and original.stat().st_size<=100000:
        value=json.loads(original.read_text())
        if value.get('version')==1:context['sources']=[{k:r.get(k) for k in ['provider','identity','enabled','scope']} for r in value.get('sources',[])[:300]]
    target=STATE/'social-source-context.json';temp=target.with_suffix('.tmp');temp.write_text(json.dumps(context,ensure_ascii=False));temp.chmod(0o600);os.chown(temp,who.pw_uid,who.pw_gid);temp.replace(target)
if __name__=='__main__':main()
