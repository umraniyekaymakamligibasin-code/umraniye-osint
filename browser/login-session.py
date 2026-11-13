"""Admin-requested server browser. No passwords pass through the OSINT application."""
import asyncio, contextlib, os, pathlib, shutil, signal, subprocess, sys, time
from collector import bridge,profile_dir,profile_lock,network_guard,DATA

async def main(provider,logout=False):
    from playwright.async_api import async_playwright
    config=await asyncio.to_thread(bridge)
    account=next(a for a in config['accounts'] if a['provider']==provider)
    profile=profile_dir(account)
    if logout:
        with profile_lock(profile):
            for child in profile.iterdir():
                if child.name=='osint.lock':continue
                if child.is_dir() and not child.is_symlink():shutil.rmtree(child)
                else:child.unlink()
        return
    helpers=[];context=None
    try:
        with profile_lock(profile):
            env={**os.environ,'DISPLAY':':78'}
            helpers.append(subprocess.Popen(['Xvfb',':78','-screen','0','1280x900x24','-nolisten','tcp'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL));await asyncio.sleep(2)
            if helpers[0].poll() is not None:raise RuntimeError('display_busy')
            helpers.append(subprocess.Popen(['x11vnc','-display',':78','-localhost','-rfbport','5902','-nopw','-forever','-shared','-quiet'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
            helpers.append(subprocess.Popen(['websockify','--web=/usr/share/novnc','127.0.0.1:6080','127.0.0.1:5902'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
            await asyncio.sleep(1)
            if any(p.poll() is not None for p in helpers):raise RuntimeError('helper_failed')
            async with async_playwright() as pw:
                context=await pw.chromium.launch_persistent_context(str(profile),channel='chromium',headless=False,chromium_sandbox=True,env=env,locale='tr-TR',timezone_id='Europe/Istanbul',accept_downloads=False,viewport={'width':1280,'height':900})
                await context.route('**/*',lambda route:network_guard(route,interactive=True))
                page=context.pages[0] if context.pages else await context.new_page()
                # A slow platform must not tear down the desktop and all its assets.
                try:await page.goto(account['profileURL'],wait_until='domcontentloaded',timeout=40000)
                except Exception:print('OSINT_LOGIN navigation_failed',flush=True)
                await page.wait_for_event('close',timeout=20*60000)
    finally:
        for p in reversed(helpers):
            p.terminate()
            try:p.wait(timeout=1)
            except subprocess.TimeoutExpired:p.kill()
        if context:
            with contextlib.suppress(Exception):await asyncio.wait_for(context.close(),timeout=2)

if __name__=='__main__':
    os.umask(0o077)
    if len(sys.argv)<2 or sys.argv[1] not in ['x','facebook','instagram']:raise SystemExit(2)
    async def run():
        task=asyncio.create_task(main(sys.argv[1],'--logout' in sys.argv))
        loop=asyncio.get_running_loop()
        for sig in [signal.SIGTERM,signal.SIGINT]:loop.add_signal_handler(sig,task.cancel)
        with contextlib.suppress(asyncio.CancelledError):await task
    try:
        with profile_lock(DATA/'browser-global'):asyncio.run(run())
    except Exception as exc:
        message=str(exc).lower()
        code=str(exc) if isinstance(exc,RuntimeError) and str(exc) in ['display_busy','helper_failed'] else 'sandbox_failed' if 'sandbox' in message or 'user namespace' in message else 'startup_failed'
        print('OSINT_LOGIN '+code,flush=True)
        raise SystemExit(1)
