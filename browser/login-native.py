"""Human-controlled Chromium on the existing profile. No automation/challenge solver."""
import contextlib,os,pathlib,signal,socket,subprocess,sys,time
from collector import DATA,bridge,profile_dir,profile_lock
def stop(*args):raise KeyboardInterrupt
@contextlib.contextmanager
def wait_global(path):
    deadline=time.monotonic()+120;notice=time.monotonic()
    while True:
        manager=profile_lock(path)
        try:manager.__enter__();break
        except BlockingIOError:
            if time.monotonic()>deadline:raise RuntimeError('browser_busy')
            if time.monotonic()-notice>20:print('OSINT_LOGIN waiting_browser',flush=True);notice=time.monotonic()
            time.sleep(1)
    try:yield
    finally:manager.__exit__(None,None,None)

def main(provider):
    if provider not in ('x','facebook','instagram'):raise ValueError('invalid_provider')
    account=next(a for a in bridge()['accounts'] if a['provider']==provider)
    browsers=list(pathlib.Path('/opt/umraniye-osint-browser/browsers').glob('chromium-*/chrome-linux64/chrome'))
    browsers.sort(key=lambda p:int(p.parents[1].name.split('-')[-1]))
    if not browsers:raise RuntimeError('browser_missing')
    binary=browsers[-1]
    if binary.is_symlink() or not os.access(binary,os.X_OK):raise RuntimeError('invalid_browser')
    with wait_global(DATA/'browser-global'),profile_lock(profile_dir(account)):
        children=[]
        try:
            env={**os.environ,'DISPLAY':':78'}
            def launch(args):
                process=subprocess.Popen(args,env=env,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);children.append(process);return process
            display=launch(['Xvfb',':78','-screen','0','1280x900x24','-nolisten','tcp']);time.sleep(2)
            if display.poll() is not None:raise RuntimeError('display_busy')
            launch(['x11vnc','-display',':78','-localhost','-rfbport','5902','-nopw','-forever','-shared','-quiet'])
            launch(['websockify','--web=/usr/share/novnc','127.0.0.1:6080','127.0.0.1:5902']);time.sleep(1)
            if any(p.poll() is not None for p in children):raise RuntimeError('helper_failed')
            url={'x':'https://x.com/home','facebook':'https://www.facebook.com/','instagram':'https://www.instagram.com/'}[provider]
            # Ordinary installed Chromium, with its sandbox and native account verification.
            browser=launch([str(binary),'--user-data-dir='+str(profile_dir(account)),'--no-first-run','--no-default-browser-check','--disable-background-mode',url])
            deadline=time.monotonic()+1200
            while browser.poll() is None and time.monotonic()<deadline:time.sleep(.5)
            if browser.poll() is None:print('OSINT_LOGIN session_timeout',flush=True)
        finally:
            for process in reversed(children):
                if process.poll() is not None:continue
                process.terminate()
                try:process.wait(timeout=10)
                except subprocess.TimeoutExpired:process.kill();process.wait(timeout=3)
if __name__=='__main__':
    os.umask(0o077)
    for sig in (signal.SIGTERM,signal.SIGINT):signal.signal(sig,stop)
    try:main(sys.argv[1] if len(sys.argv)>1 else '')
    except KeyboardInterrupt:pass
    except Exception as error:
        code=str(error) if isinstance(error,RuntimeError) and str(error) in ('display_busy','helper_failed','browser_missing','invalid_browser','browser_busy') else 'startup_failed'
        print('OSINT_LOGIN '+code,flush=True);raise SystemExit(1)
