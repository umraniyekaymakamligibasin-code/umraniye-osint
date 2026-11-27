import asyncio,json,sys
sys.path.insert(0,'/opt/umraniye-osint-browser')
import collector
from playwright.async_api import async_playwright
async def main():
 config=collector.bridge();account=next(a for a in config['accounts'] if a['provider']=='instagram')
 with collector.profile_lock(collector.DATA/'browser-global'),collector.profile_lock(collector.profile_dir(account)):
  async with async_playwright() as p:
   context=await p.chromium.launch_persistent_context(str(collector.profile_dir(account)),channel='chromium',headless=True,chromium_sandbox=True,locale='tr-TR',viewport={'width':1280,'height':900})
   try:
    page=context.pages[0] if context.pages else await context.new_page()
    await page.goto('https://www.instagram.com/accounts/edit/',wait_until='domcontentloaded',timeout=40000)
    await page.wait_for_timeout(2500)
    blocked=any(s in page.url for s in ['/accounts/login','/challenge','/checkpoint'])
    username=None
    if not blocked:
     field=page.locator('input[name="username"]')
     if await field.count():username=await field.first.input_value()
     if not username:
      links=await page.locator('a').evaluate_all("els=>els.filter(e=>/profil|profile/i.test(e.getAttribute('aria-label')||'')).map(e=>e.getAttribute('href'))")
      import re
      for href in links:
       if href and re.fullmatch(r'/[A-Za-z0-9_.]+/',href):username=href.strip('/');break
    print(json.dumps({'loginRequired':blocked,'username':username,'identityVerified':bool(username)},ensure_ascii=False))
   finally:await context.close()
try:asyncio.run(main())
except BlockingIOError:print(json.dumps({'status':'browser_busy_no_changes'}))
except Exception as e:print(json.dumps({'status':'identity_check_failed','errorType':type(e).__name__}))
