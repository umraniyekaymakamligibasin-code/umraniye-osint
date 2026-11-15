"""Publish only whitelisted, non-secret API health fields for the application."""
import datetime,json,os,pathlib,pwd,re,secrets
APP_USER='osintdeneme'
SOURCE=pathlib.Path('/var/lib/umraniye-osint-instagram-api/status.json')
DEST=pathlib.Path('/var/lib/umraniye-osint-instagram-api-public/status.json')
def public_status(value):
    result={k:value[k] for k in ('at','completedAt','status','activeSources','pending','tokenExpiresAt','tokenRenewalDue','panelHealthUpdated','retryAt','pauseReason','pauseCode','sourceBudgetPerRound','deferredSources','waitingSources','attemptedSources','readSources','failedSources','lastContentReadAt') if k in value}
    result['waitingSourceStates']=[]
    for row in value.get('waitingSourceStates',[])[:200]:
        if isinstance(row,dict) and re.fullmatch(r'[a-z0-9_.]{1,30}',str(row.get('handle',''))):
            item={'handle':row['handle'],'reason':row.get('reason') if row.get('reason') in ('source_backoff','source_unavailable_to_api') else 'source_backoff'}
            for key in ('code','subcode'):
                if type(row.get(key)) is int:item[key]=row[key]
            try:
                instant=datetime.datetime.fromisoformat(str(row.get('retryAt','')).replace('Z','+00:00'))
                if instant.tzinfo:item['retryAt']=instant.isoformat()
            except ValueError:pass
            result['waitingSourceStates'].append(item)
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
    dfd=os.open(DEST.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        os.fchown(dfd,0,user.pw_gid);os.fchmod(dfd,0o750)
        temporary='.api-status-'+secrets.token_hex(8)
        fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=dfd)
        try:
            with os.fdopen(fd,'w',encoding='utf-8') as stream:
                os.fchown(stream.fileno(),0,user.pw_gid);os.fchmod(stream.fileno(),0o640)
                json.dump(value,stream,ensure_ascii=False);stream.flush();os.fsync(stream.fileno())
            os.replace(temporary,DEST.name,src_dir_fd=dfd,dst_dir_fd=dfd)
        finally:
            try:os.unlink(temporary,dir_fd=dfd)
            except FileNotFoundError:pass
    finally:os.close(dfd)
if __name__=='__main__':main()
