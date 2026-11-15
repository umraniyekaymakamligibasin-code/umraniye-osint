"""Owner-controlled login to the exact persistent Facebook scanner profile."""
import asyncio,contextlib,json,os,pathlib,signal,socket,subprocess,time,urllib.parse

def session_ready(url,cookies,password_visible,feed_visible):
    u=urllib.parse.urlsplit(url)
    names={c.get('name') for c in cookies if c.get('domain','').lstrip('.') in ('facebook.com','www.facebook.com') and (c.get('expires',-1)==-1 or c.get('expires',0)>time.time())}
    return u.scheme=='https' and u.hostname in ('www.facebook.com','facebook.com') and u.path in ('','/') and not password_visible and feed_visible and {'c_user','xs'}<=names

def can_release_pacing(state,access,now):
    return state.get('lastStatus') in ('login_required','challenge_required','verification_paused') and not (access.get('reason')=='rate_limited' and access.get('retryAt',0)>now)

async def main():
    from collector import bridge,profile_dir,profile_lock,network_guard,DATA
    from facebook_live_v4 import atomic
    from playwright.async_api import async_playwright
    account=next(a for a in (await asyncio.to_thread(bridge))['accounts'] if a['provider']=='facebook')
    folder=profile_dir(account);helpers=[];context=None;last_ready=0;stable=0;cancelled=False
    report={'sessionVerified':False,'sameScannerProfile':True,'profileFingerprint':folder.name,'credentialsExported':False,'messagesSent':0}
    try:
        with profile_lock(DATA/'browser-global'),profile_lock(folder):
            env={**os.environ,'DISPLAY':':78'}
            def start(args):
                p=subprocess.Popen(args,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);helpers.append(p);return p
            start(['Xvfb',':78','-screen','0','1280x900x24','-nolisten','tcp']);await asyncio.sleep(2)
            if helpers[0].poll() is not None:raise RuntimeError('display_busy')
            start(['x11vnc','-display',':78','-localhost','-rfbport','5902','-nopw','-forever','-shared','-quiet'])
            start(['websockify','--web=/usr/share/novnc','127.0.0.1:6080','127.0.0.1:5902'])
            for _ in range(30):
                if any(p.poll() is not None for p in helpers):raise RuntimeError('desktop_helper_failed')
                try:
                    with socket.create_connection(('127.0.0.1',6080),timeout=.2):pass
                    with socket.create_connection(('127.0.0.1',5902),timeout=.2):pass
                    break
                except OSError:await asyncio.sleep(.2)
            else:raise RuntimeError('desktop_ports_not_ready')
            async with async_playwright() as pw:
                context=await pw.chromium.launch_persistent_context(str(folder),channel='chromium',headless=False,chromium_sandbox=True,env=env,locale='tr-TR',timezone_id='Europe/Istanbul',accept_downloads=False,viewport={'width':1280,'height':900})
                await context.route('**/*',lambda route:network_guard(route,interactive=True,provider='facebook'))
                page=context.pages[0] if context.pages else await context.new_page()
                try:await page.goto('https://www.facebook.com/',wait_until='domcontentloaded',timeout=40000)
                except Exception:print('Facebook sayfasi gecikti; uzak ekranda kontrol edin.',flush=True)
                print('FACEBOOK SUNUCU EKRANI HAZIR. Ac: http://127.0.0.1:16082/vnc.html?autoconnect=1&resize=scale&path=websockify',flush=True)
                print('Giris ve dogrulamayi kendin tamamla. Ana sayfa gorunup OTURUM DOGRULANDI yazinca uzak ekranin ICINDEKI Chromium penceresini kapat. CMD acik kalsin.',flush=True)
                deadline=time.monotonic()+1200;announced=False
                while context.pages and time.monotonic()<deadline:
                    try:
                        current=context.pages[0]
                        password=current.locator('input[type="password"]')
                        visible=await password.count()>0 and await password.first.is_visible()
                        feed=await current.locator('[role="feed"],[role="article"],[role="navigation"]').count()>0
                        ready=session_ready(current.url,await context.cookies('https://www.facebook.com/'),visible,feed)
                        stable=stable+1 if ready else 0
                        if stable>=2:
                            last_ready=time.monotonic()
                            if not announced:print('OTURUM DOGRULANDI. Simdi uzaktaki Chromium penceresini kapatabilirsin.',flush=True);announced=True
                        if not ready:last_ready=0
                    except Exception:
                        if not context.pages:break
                        stable=0
                    await asyncio.sleep(1)
                report['sessionVerified']=bool(last_ready and time.monotonic()-last_ready<10 and not context.pages)
                with contextlib.suppress(Exception):await context.close()
                context=None
    except asyncio.CancelledError:
        cancelled=True
    except Exception as error:
        print("FACEBOOK_GIRIS_HATASI "+type(error).__name__,flush=True)
    finally:
        # Close Chromium first so cookies flush before restoring normal collection.
        if context:
            with contextlib.suppress(Exception):await asyncio.wait_for(context.close(),timeout=15)
        for p in reversed(helpers):
            if p.poll() is None:
                p.terminate()
                try:p.wait(timeout=3)
                except subprocess.TimeoutExpired:p.kill();p.wait()
        if cancelled:report['sessionVerified']=False
        if report['sessionVerified']:
            from scan_pacing import load,manual_verified
            _,pacing=load(DATA,'facebook')
            try:access=json.loads((DATA/'facebook-access-state-v63.json').read_text())
            except (OSError,ValueError):access={}
            if can_release_pacing(pacing,access,time.time()):manual_verified(DATA,'facebook')
        report['at']=time.time();atomic(DATA/'facebook-session-recovery-result.json',report)
    print(json.dumps(report),flush=True)

if __name__=='__main__':
    os.umask(0o077)
    async def run():
        task=asyncio.create_task(main());loop=asyncio.get_running_loop()
        for sig in (signal.SIGHUP,signal.SIGINT,signal.SIGTERM):loop.add_signal_handler(sig,task.cancel)
        await task
    asyncio.run(run())
