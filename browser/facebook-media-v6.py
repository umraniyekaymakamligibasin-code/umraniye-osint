"""Public permalink text and visible media OCR; never guesses publication time."""
import asyncio,json,shutil,os,re
from facebook_live_v4 import extract,page_url,post_url

async def enrich(context,post,source):
    page=await context.new_page();process=None
    try:
        await page.goto(post['url'],wait_until='domcontentloaded',timeout=8000)
        await page.wait_for_timeout(700)
        docs=[]
        for raw in await page.locator('script[type="application/json"]').all_text_contents():
            try:docs.append(json.loads(raw))
            except ValueError:pass
        for p in extract(docs,source)[0]:
            if p['facebookPostId']==post['facebookPostId'] and len(p['description'])>len(post['description']):
                post['description']=p['description'];post['title']=p['description'][:240]
        # Only an article containing this post's permalink and matching page author.
        articles=page.locator('[role="article"]')
        for article in (await articles.all())[:8]:
            links=await article.locator('a[href]').evaluate_all('(nodes)=>nodes.map(n=>n.href)')
            if not any(post_url(u)==post_url(post['url']) for u in links):continue
            if not any((page_url(u) or '').lower()==source['url'].lower() for u in links):continue
            more=article.get_by_role('button',name=re.compile(r'^(Daha fazlasını gör|Daha fazla gör|Daha fazla|See more)$',re.I)).first
            expanded=False
            if await more.count():
                await more.click(timeout=1500);await page.wait_for_timeout(400);expanded=True
            messages=await article.locator('[data-ad-preview="message"], [data-ad-comet-preview="message"]').all_text_contents()
            body=next((t.strip() for t in messages if t.strip()),'')
            if len(body)>len(post['description']):post['description']=body[:3000];post['title']=body[:240]
            if body:
                post['fullText']=max([body,post['description']],key=len)[:12000];post['textStatus']='storage_limited' if len(body)>12000 else 'expanded' if expanded and len(body)>=len(post['description']) else 'not_verified_complete'
            if await more.count():post['textStatus']='partial_text'
            image=None
            for candidate in (await article.locator('img').all())[:12]:
                box=await candidate.bounding_box()
                if box and box['width']>=180 and box['height']>=100:
                    image=candidate;break
            if image is not None:
                post['mediaStatus']='visible_image';post['postType']='image_or_video_poster'
                from urllib.parse import urlsplit
                src=await image.get_attribute('src') or ''
                parsed=urlsplit(src)
                if parsed.scheme=='https' and (parsed.hostname or '').endswith('.fbcdn.net'):post['mediaUrl']=src
                if not post['description'].strip() and shutil.which('tesseract'):
                    png=await image.screenshot(timeout=2500)
                    process=await asyncio.create_subprocess_exec('tesseract','stdin','stdout','-l','tur+eng','--psm','11',stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL,env={**os.environ,'OMP_THREAD_LIMIT':'1'})
                    try:
                        stdout,_=await asyncio.wait_for(process.communicate(png),timeout=4)
                        post['ocrText']=stdout.decode('utf-8','replace').strip()[:2000];post['mediaStatus']='ocr_extracted' if post['ocrText'] else 'ocr_no_text'
                    except asyncio.TimeoutError:
                        process.kill();await process.wait();post['mediaStatus']='ocr_timeout'
                elif not shutil.which('tesseract'):post['mediaStatus']='ocr_unavailable'
            break
        post.setdefault('mediaStatus','no_matched_visible_media')
    except Exception as e:post['detailStatus']=type(e).__name__
    finally:
        if process is not None and process.returncode is None:
            process.kill();await process.wait()
        await page.close()
    return post
