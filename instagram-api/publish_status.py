"""Publish only whitelisted, non-secret API health fields for the application."""
import datetime,json,os,pathlib,pwd,re,tempfile
APP_USER='osintdeneme'
SOURCE=pathlib.Path('/var/lib/umraniye-osint-instagram-api/status.json')
DEST=pathlib.Path('/var/lib/umraniye-osint-instagram-api-public/status.json')
def public_status(value):
    result={k:value[k] for k in ('at','completedAt','status','activeSources','pending','tokenExpiresAt','tokenRenewalDue','panelHealthUpdated','retryAt','pauseReason','pauseCode','sourceBudgetPerRound','deferredSources') if k in value}
    result['sources']=[]
    for row in value.get('sources',[])[:200]:
        if not isinstance(row,dict) or not re.fullmatch(r'[a-z0-9_.]{1,30}',str(row.get('handle',''))):continue
        item={k:row[k] for k in ('handle','status','read','newPending','retryAt','code','subcode','paginationLimitReached') if k in row}
        item['reasons']={k:n for k,n in row.get('reasons',{}).items() if re.fullmatch(r'[a-z_]{1,60}',k) and type(n) is int and 0<=n<=1000000}
        result['sources'].append(item)
    result['ingestion']=[{k:r[k] for k in ('status','submitted','acknowledged','accepted','rejected') if k in r} for r in value.get('ingestion',[])[:10] if isinstance(r,dict)]
    return result
def main():
    if os.geteuid()!=0:raise RuntimeError('root_export_only')
    if SOURCE.stat().st_size>512000:raise RuntimeError('status_size_limit')
    value=public_status(json.loads(SOURCE.read_text(encoding='utf-8')))
    if DEST.is_symlink() or DEST.parent.is_symlink():raise RuntimeError('unsafe_export_path')
    user=pwd.getpwnam(APP_USER)
    DEST.parent.mkdir(mode=0o750,exist_ok=True)
    os.chown(DEST.parent,0,user.pw_gid);os.chmod(DEST.parent,0o750)
    fd,temporary=tempfile.mkstemp(prefix='.api-status-',dir=DEST.parent)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as stream:
            json.dump(value,stream,ensure_ascii=False);stream.flush();os.fsync(stream.fileno())
        os.chown(temporary,0,user.pw_gid);os.chmod(temporary,0o640);os.replace(temporary,DEST)
    finally:pathlib.Path(temporary).unlink(missing_ok=True)
if __name__=='__main__':main()
