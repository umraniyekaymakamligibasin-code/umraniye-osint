import datetime as dt,hashlib,json,os,pathlib,pwd,re,shutil,subprocess,sys,urllib.request
HERE=pathlib.Path(__file__).resolve().parent
DEST=pathlib.Path('/opt/umraniye-osint-facebook-fbgql-deneme');STATE=pathlib.Path('/var/lib/umraniye-osint-facebook-fbgql-deneme');USER='osintfbshadow';NAME='umraniye-osint-facebook-fbgql-deneme.service';UNIT=pathlib.Path('/etc/systemd/system')/NAME
def command(args,stage,timeout=180):
    print('ASAMA: '+stage,flush=True);p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    if p.returncode:
        detail=re.sub(r'https?://\S+','[URL]',p.stdout+'\n'+p.stderr)
        print(detail[-4500:]);raise RuntimeError(stage+': exit '+str(p.returncode))
    return p
def existing():
    return {u:subprocess.run(['systemctl','show',u,'--property=LoadState,ActiveState,ExecMainStartTimestampMonotonic,NRestarts'],capture_output=True,text=True,timeout=5).stdout.strip() for u in ['umraniye-osint-deneme.service','umraniye-osint.service','umraniye-osint-browser-facebook.service','umraniye-osint-sirali.timer']}
def main():
    if sys.platform!='linux' or os.geteuid()!=0:raise RuntimeError('Ubuntu sudo gerekli')
    os.umask(0o022)
    for p in (DEST,STATE,UNIT):
        if p.exists() or p.is_symlink():raise RuntimeError('Yeni bilesen yolu zaten var; uzerine yazilmadi: '+str(p))
    try:pwd.getpwnam(USER);raise RuntimeError('Yeni kullanici adi zaten var; sahiplik incelemesi gerekli')
    except KeyError:pass
    for p in [pathlib.Path('/opt/AGENTS.md'),pathlib.Path('/opt/umraniye-osint-deneme/AGENTS.md')]:
        if p.exists():raise RuntimeError('Sunucu talimati incelenmeli:'+str(p))
    before=existing()
    import prepare
    snapshot=prepare.snapshot() # reviewed module hashes + read-only real source catalogue
    command(['useradd','--system','--home-dir',str(STATE),'--shell','/usr/sbin/nologin',USER],'create_separate_user')
    shutil.copytree(HERE,DEST,ignore=shutil.ignore_patterns('__pycache__','*.pyc'));DEST.chmod(0o755)
    STATE.mkdir(mode=0o700);who=pwd.getpwnam(USER);os.chown(STATE,who.pw_uid,who.pw_gid)
    try:
        command(['python3','-m','venv','--without-pip',str(DEST/'venv')],'create_separate_venv')
        target=DEST/'venv/bin/python';bootstrap=DEST/'get-pip.py'
        with urllib.request.urlopen('https://bootstrap.pypa.io/get-pip.py',timeout=30) as r:
            if r.geturl()!='https://bootstrap.pypa.io/get-pip.py':raise RuntimeError('bootstrap_redirect_denied')
            data=r.read(5_000_001)
        if len(data)>5_000_000:raise RuntimeError('bootstrap_size')
        bootstrap.write_bytes(data)
        command([str(target),str(bootstrap),'--isolated','--no-cache-dir','--index-url','https://pypi.org/simple','pip==26.2.2'],'bootstrap_only_new_venv')
        command([str(target),'-m','pip','--isolated','install','--no-cache-dir','--index-url','https://pypi.org/simple','-r',str(DEST/'requirements.lock')],'pinned_dependencies',300)
        command([str(target),str(DEST/'test_reader.py')],'offline_reader_tests')
        command(['python3',str(DEST/'prepare.py')],'readonly_source_snapshot')
        command(['runuser','-u',USER,'--',str(target),str(DEST/'worker.py')],'dry_run_only')
        command(['systemd-analyze','verify',str(DEST/NAME)],'verify_new_unit')
        shutil.copyfile(DEST/NAME,UNIT);UNIT.chmod(0o644);command(['systemctl','daemon-reload'],'register_disabled_unit')
        report={'result':'facebook_fbgql_shadow_installed_not_started','at':dt.datetime.now(dt.timezone.utc).isoformat(),'activeSources':len(snapshot['sources']),'upstreamCommit':'28e03ae84012be44d37a67014fcfcfcc420c9ee9','source':'https://github.com/bsho5/fbgql','browserStarted':False,'cookiesUsed':False,'productionWrites':0,'telegramWrites':0,'liveReadOnServerVerified':False,'newServiceEnabled':False,'existingServiceMutations':[],'existingBefore':before,'existingAfter':existing(),'nextCommand':'sudo systemctl start '+NAME,'stopCommand':'sudo systemctl stop '+NAME}
        (STATE/'installation-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');(STATE/'installation-report.json').chmod(0o600)
        print(json.dumps(report,ensure_ascii=False,indent=2))
    except Exception:
        if UNIT.exists():UNIT.unlink();subprocess.run(['systemctl','daemon-reload'],capture_output=True)
        print('Yeni bilesen tamamlanamadi; eski Facebook okuyucusu degistirilmedi. Ayrinti yukarida.');raise
if __name__=='__main__':
    try:main()
    except Exception as e:print('KURULAMADI: '+(str(e) if isinstance(e,RuntimeError) else type(e).__name__));sys.exit(1)
