"""Bounded X DOM reader using the existing authorized browser session."""
import asyncio,json,time
X_EXTRACT=r'''() => {
 const seen=new Map();
 for(const article of document.querySelectorAll('article[data-testid="tweet"],article[role="article"]')){
  const own=n=>{const nested=n.closest('[data-testid="quoteTweet"],div[role="link"][tabindex="0"]');return n.closest('article')===article&&(!nested||!article.contains(nested));};
  const clock=[...article.querySelectorAll('time[datetime]')].find(n=>own(n));
  const link=clock?.closest('a[href]');if(!link)continue;
  let u;try{u=new URL(link.href)}catch{continue}
  const m=u.pathname.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)(?:\/.*)?$/);
  if(!m||!['x.com','www.x.com','twitter.com','www.twitter.com'].includes(u.hostname))continue;
  const text=[...article.querySelectorAll('[data-testid="tweetText"]')].filter(own).map(n=>n.innerText||n.textContent||'').join('\n').trim();
  if(!text)continue;
  const url='https://x.com/'+m[1]+'/status/'+m[2],username=article.querySelector('[data-testid="User-Name"]');
  const result={url,_pinned:/pinned|sabitlen|sabitled/i.test(article.querySelector('[data-testid="socialContext"]')?.innerText||''),sourceName:((username&&[...username.querySelectorAll('a[href]')].find(a=>{try{return new URL(a.href).pathname.toLowerCase()==='/'+m[1].toLowerCase()}catch{return false}})?.innerText)||'@'+m[1]).slice(0,100),authorHandle:m[1],title:text.slice(0,240),description:text.slice(0,3000),fullText:text.slice(0,6000),publishedAt:clock.getAttribute('datetime')};
  if(!seen.has(url)||seen.get(url).fullText.length<result.fullText.length)seen.set(url,result);
 }
 return [...seen.values()].slice(0,40);
}'''

async def read_x_posts(page,known_urls=None):
 started=time.monotonic();posts={};rounds=0;unchanged=0;known_urls=set(known_urls or ());boundary=False
 try:await page.wait_for_selector('article[data-testid="tweet"],article[role="article"] time[datetime]',timeout=8000)
 except Exception:
  print(json.dumps({'event':'x_reader_v1','status':'no_timed_articles','scrolls':0,'uniquePosts':0}),flush=True);return []
 for index in range(12 if known_urls else 5):
  for p in await page.evaluate(X_EXTRACT):
   if p['url'] not in posts or len(p['fullText'])>len(posts[p['url']]['fullText']):posts[p['url']]=p
  boundary=bool(known_urls.intersection(url for url,post in posts.items() if not post.get('_pinned')))
  if boundary or time.monotonic()-started>18 or len(posts)>=80 or unchanged>=2:break
  previous=len(posts);await page.mouse.wheel(0,850);rounds+=1;await page.wait_for_timeout(1100)
  current=await page.evaluate(X_EXTRACT)
  for p in current:
   if p['url'] not in posts or len(p['fullText'])>len(posts[p['url']]['fullText']):posts[p['url']]=p
  unchanged=unchanged+1 if len(posts)==previous else 0
 page._osint_reader_trace={'postsRead':len(posts),'datedPosts':len(posts),'checkpointReached':boundary,'timeBudgets':int(time.monotonic()-started>18 and not boundary)}
 print(json.dumps({'event':'x_reader_v1','status':'readable' if posts else 'no_readable_posts','scrolls':rounds,'uniquePosts':len(posts),'elapsedMs':round((time.monotonic()-started)*1000)}),flush=True)
 return list(posts.values())[:80]

NOTIFICATION_LINKS=r'''() => [...new Set([...document.querySelectorAll('[data-testid="primaryColumn"] a[href],main a[href]')].flatMap(a=>{try{const u=new URL(a.href),m=u.pathname.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)(?:\/.*)?$/);return u.protocol==='https:'&&['x.com','www.x.com','twitter.com','www.twitter.com'].includes(u.hostname)&&m?['https://x.com/'+m[1]+'/status/'+m[2]]:[]}catch{return []}}))].slice(0,200)'''

async def read_x_notifications(page,state_path,deadline=None):
 import pathlib,os,re
 started=time.monotonic();posts={};links=set();scrolls=0;unchanged=0;stop='scroll_limit';resolved=0;errors=0;abandoned=0;exhausted=[]
 # A caller deadline (monotonic) ends work early, but state is still saved and read posts are returned.
 detail_until=started+90 if deadline is None else min(started+90,deadline)
 scroll_until=started+60 if deadline is None else min(started+60,deadline-max(8,(deadline-started)*0.35))
 card_until=min(started+45,scroll_until)
 def thermal_pause():
  try:
   for folder in pathlib.Path('/sys/class/hwmon').glob('hwmon*'):
    if (folder/'name').read_text().strip()=='coretemp' and int((folder/'temp1_input').read_text())>=88000:return True
  except (OSError,ValueError):pass
  return False
 valid=lambda u:isinstance(u,str) and re.fullmatch(r'https://x\.com/[A-Za-z0-9_]+/status/\d+',u)
 state={'pending':[],'done':[],'attempts':{},'seen':[],'frontier':[],'retryAt':{}}
 try:
  if state_path.stat().st_size<4000000:
   saved=json.loads(state_path.read_text(encoding='utf-8'));state={'pending':[u for u in saved.get('pending',[]) if valid(u)][:2000],'done':[u for u in saved.get('done',[]) if valid(u)][-10000:],'attempts':saved.get('attempts',{}),'seen':[u for u in saved.get('seen',[]) if valid(u)][-10000:],'frontier':[u for u in saved.get('frontier',[]) if valid(u)][:3],'retryAt':saved.get('retryAt',{})}
 except (OSError,ValueError,TypeError,AttributeError):pass
 try:await page.wait_for_selector('[data-testid="primaryColumn"],main',timeout=7000)
 except Exception:stop='notification_view_unavailable'
 # UMRANIYE_X_NOTIFICATION_DIAG_V1
 try:
  _dom=await page.evaluate('() => {\n  const root = document.querySelector(\'[data-testid="primaryColumn"]\') || document.querySelector(\'main\');\n  const rows = root ? [...root.querySelectorAll(\'[data-testid="cellInnerDiv"],[data-testid="notification"]\')] : [];\n  let nested=0, article=0, missingTarget=0, shortText=0, eligible=0;\n  for (const row of rows) {\n    const cell=row.closest(\'[data-testid="cellInnerDiv"]\');\n    if (cell && cell!==row) {nested++;continue;}\n    if (row.querySelector(\'article[data-testid="tweet"],article[role="article"]\')) {article++;continue;}\n    const target=row.matches(\'[role="link"]\') ? row : row.querySelector(\'div[role="link"][tabindex="0"],[data-testid="notification"][role="link"]\');\n    if (!target || target.closest(\'button,[role="button"]\')) {missingTarget++;continue;}\n    if ((row.innerText||\'\').trim().length<4) {shortText++;continue;}\n    eligible++;\n  }\n  return {\n    route: location.pathname.slice(0,100),\n    primaryColumn: !!document.querySelector(\'[data-testid="primaryColumn"]\'),\n    rootFound: !!root,\n    rowCount: rows.length,\n    roleLinkCount: root ? root.querySelectorAll(\'[role="link"]\').length : 0,\n    notificationTestids: root ? root.querySelectorAll(\'[data-testid="notification"]\').length : 0,\n    articles: root ? root.querySelectorAll(\'article\').length : 0,\n    statusHrefCount: root ? [...root.querySelectorAll(\'a[href]\')].filter(a => /\\/status\\/\\d+/.test(a.getAttribute(\'href\')||\'\')).length : 0,\n    loginFields: !!document.querySelector(\'input[autocomplete="username"],input[type="password"]\'),\n    rootTextLength: root ? (root.textContent||\'\').length : 0,\n    skippedNested: nested,\n    skippedArticle: article,\n    skippedTarget: missingTarget,\n    skippedShort: shortText,\n    candidates: eligible\n  };\n}')
  print(json.dumps({'event':'x_notification_dom_diagnostic_v1',**_dom},ensure_ascii=False),flush=True)
 except Exception as _diag_error:
  print(json.dumps({'event':'x_notification_dom_diagnostic_error','type':type(_diag_error).__name__}),flush=True)
 old_frontier=set(state['frontier']);known=set(state['seen']);saved=saved if 'saved' in locals() else {};valid_card=lambda k:isinstance(k,str) and bool(re.fullmatch(r'[a-f0-9]{16}',k));old_keys=set(k for k in saved.get('frontierKeys',[]) if valid_card(k));seen_cards=set(k for k in saved.get('seenCards',[]) if valid_card(k));done_cards=set(k for k in saved.get('doneCards',[]) if valid_card(k));frontier_reached=not(old_frontier or old_keys);reached_at=0;bottom=[];bottom_keys=[];card_reads=0;card_attempts=0;card_errors=0;visited_cards=set();deferred_cards=set();last_read_keys=[]
 if stop!='notification_view_unavailable':
  for index in range(120):
   if index%5==0 and thermal_pause():stop='thermal_pause';break
   cards=await page.evaluate(NOTIFICATION_CARDS);seen_cards.update(cards)
   if cards:bottom_keys=cards[-3:]
   if old_keys and not frontier_reached and len(old_keys&set(cards))>=min(2,len(old_keys)):frontier_reached=True;reached_at=scrolls
   eligible_cards=[k for k in cards if k not in done_cards and k not in visited_cards]
   if eligible_cards and card_attempts<4 and time.monotonic()<card_until:
    key=eligible_cards[0];visited_cards.add(key);card_attempts+=1;post,non_post=await read_notification_card(page,key)
    if post:posts[post['url']]=post;card_reads+=1;done_cards.add(key);last_read_keys=(last_read_keys+[key])[-3:]
    elif non_post:done_cards.add(key)
    else:card_errors+=1
   deferred_cards.update(k for k in eligible_cards if k not in done_cards)
   for post in await page.evaluate(X_EXTRACT):posts[post['url']]=post
   visible=await page.evaluate(NOTIFICATION_LINKS);links.update(visible)
   if old_frontier and not frontier_reached and len(old_frontier&set(visible))>=min(2,len(old_frontier)):frontier_reached=True;reached_at=scrolls
   before=await page.evaluate('() => ({y:scrollY,h:document.documentElement.scrollHeight})')
   familiar=(bool(visible) and all(u in known for u in visible)) or (bool(cards) and all(k in done_cards for k in cards))
   await page.mouse.wheel(0,1800 if familiar and not frontier_reached else 900);scrolls+=1;await page.wait_for_timeout(350 if familiar and not frontier_reached else 850)
   for post in await page.evaluate(X_EXTRACT):posts[post['url']]=post
   found=await page.evaluate(NOTIFICATION_LINKS);previous=len(links);links.update(found)
   if found:bottom=found[-3:]
   if old_frontier and not frontier_reached and len(old_frontier&set(found))>=min(2,len(old_frontier)):frontier_reached=True;reached_at=scrolls
   after=await page.evaluate('() => ({y:scrollY,h:document.documentElement.scrollHeight})');moved=after['y']!=before['y'] or after['h']!=before['h']
   unchanged=unchanged+1 if not moved and len(links)==previous else 0
   if time.monotonic()>scroll_until:stop='time_budget';break
   if len(set(state['pending'])|links-set(state['done'])-set(posts))>=1900:stop='pending_queue_capacity';break
   # UMRANIYE_X_EMPTY_RECOVERY_V2_20261109
   if scrolls>=4 and unchanged>=4 and not cards and not posts and not links and not seen_cards:
    # One bounded reload per 15 minutes, never every cycle: protect CPU and X limits.
    _stamp=state_path.with_suffix('.osint_empty_retry')
    _recover=False
    try:
     _recover=(not _stamp.exists() or time.time()-_stamp.stat().st_mtime>900)
    except OSError:pass
    if _recover and time.monotonic()-started<17:
     try:
      _stamp.touch(mode=0o600,exist_ok=True)
      await page.reload(wait_until='domcontentloaded',timeout=6500)
      await page.wait_for_timeout(1200)
      _view=await page.evaluate('() => {\n const main=document.querySelector(\'[data-testid="primaryColumn"]\')||document.querySelector(\'main\');\n const raw=(main?.innerText||\'\').toLocaleLowerCase();\n let category=\'unknown\';\n if(/rate limit|too many requests|istek sınır|çok fazla istek/.test(raw))category=\'rate_limited\';\n else if(/something went wrong|try again|bir şeyler ters gitti|bir hata oluştu|yeniden dene/.test(raw))category=\'page_error\';\n else if(/no notifications|no new notifications|henüz bildirim|bildirimin yok|nothing to see here/.test(raw))category=\'explicitly_empty\';\n else if(/log in|sign in|giriş yap|oturum aç/.test(raw))category=\'login_required\';\n else if(raw.length<100)category=\'empty_or_shell\';\n return {route:location.pathname.slice(0,80),rootFound:!!main,\n  rowCount:main?.querySelectorAll(\'[data-testid="cellInnerDiv"],[data-testid="notification"]\').length||0,\n  statusHrefCount:main?[...main.querySelectorAll(\'a[href]\')].filter(a=>/\\/status\\/\\d+/.test(a.getAttribute(\'href\')||\'\')).length:0,\n  loginFields:!!document.querySelector(\'input[autocomplete="username"],input[type="password"]\'),\n  textLength:raw.length,category};\n}')
      print(json.dumps({'event':'x_notification_recovery_v2','reloaded':True,**_view},ensure_ascii=False),flush=True)
      # Retry normal card recognition after hydration; do not invent posts or timestamps.
      unchanged=0
      continue
     except Exception as _rec_exc:
      print(json.dumps({'event':'x_notification_recovery_v2','reloaded':False,'errorType':type(_rec_exc).__name__},ensure_ascii=False),flush=True)
    try:
     _view=await page.evaluate('() => {\n const main=document.querySelector(\'[data-testid="primaryColumn"]\')||document.querySelector(\'main\');\n const raw=(main?.innerText||\'\').toLocaleLowerCase();\n let category=\'unknown\';\n if(/rate limit|too many requests|istek sınır|çok fazla istek/.test(raw))category=\'rate_limited\';\n else if(/something went wrong|try again|bir şeyler ters gitti|bir hata oluştu|yeniden dene/.test(raw))category=\'page_error\';\n else if(/no notifications|no new notifications|henüz bildirim|bildirimin yok|nothing to see here/.test(raw))category=\'explicitly_empty\';\n else if(/log in|sign in|giriş yap|oturum aç/.test(raw))category=\'login_required\';\n else if(raw.length<100)category=\'empty_or_shell\';\n return {route:location.pathname.slice(0,80),rootFound:!!main,\n  rowCount:main?.querySelectorAll(\'[data-testid="cellInnerDiv"],[data-testid="notification"]\').length||0,\n  statusHrefCount:main?[...main.querySelectorAll(\'a[href]\')].filter(a=>/\\/status\\/\\d+/.test(a.getAttribute(\'href\')||\'\')).length:0,\n  loginFields:!!document.querySelector(\'input[autocomplete="username"],input[type="password"]\'),\n  textLength:raw.length,category};\n}')
     print(json.dumps({'event':'x_notification_empty_state_v2',**_view},ensure_ascii=False),flush=True)
    except Exception as _diag_exc:
     print(json.dumps({'event':'x_notification_empty_state_v2','diagnosticError':type(_diag_exc).__name__},ensure_ascii=False),flush=True)
    stop='empty_or_unreadable_notifications';break
   if scrolls>=20 and unchanged>=4:stop='end_of_feed';break
   if scrolls>=20 and frontier_reached and scrolls-reached_at>=(20 if old_frontier else 40):stop='increment_completed';break
 done=set(state['done'])|set(posts);existing=set(state['pending'])-done
 # Newest links win at capacity: a full queue of old or unreadable links must not block new notifications.
 pending=sorted(existing|(links-done),key=lambda u:int(u.rsplit('/',1)[-1]),reverse=True)[:2000]
 eligible=[u for u in pending if float(state['retryAt'].get(u,0))<=time.time()]
 # Bounded exact-post reads; pending URLs survive restarts. No second content database.
 selected=eligible[:7]+([eligible[-1]]if len(eligible)>7 else [])
 for url in dict.fromkeys(selected):
  if time.monotonic()>detail_until or thermal_pause():break
  try:
   await page.goto(url,wait_until='domcontentloaded',timeout=8000)
   await page.wait_for_selector('article[data-testid="tweet"] time[datetime],article[role="article"] time[datetime]',timeout=5000)
   exact=next((p for p in await page.evaluate(X_EXTRACT) if p['url']==url),None)
   if not exact:raise ValueError('exact_post_not_readable')
   posts[url]=exact;resolved+=1;pending.remove(url);done.add(url);state['attempts'].pop(url,None)
  except Exception:
   errors+=1;state['attempts'][url]=int(state['attempts'].get(url,0))+1
   if state['attempts'][url]>=3:state['retryAt'][url]=time.time()+900
   # Deleted/protected posts never resolve; stop retrying so they cannot occupy the queue forever.
   if state['attempts'][url]>=6:exhausted.append(url)
 # Abandon only when other posts were readable this round; a throttled or logged-out round must not drop links.
 if resolved:
  for url in exhausted:
   if url in pending:pending.remove(url);done.add(url);abandoned+=1
 state_path.parent.mkdir(parents=True,exist_ok=True);temp=state_path.with_suffix('.tmp')
 try:
  checkpoint=bottom if frontier_reached and bottom and stop!='pending_queue_capacity' else state['frontier']
  deferred_cards.difference_update(done_cards)
  checkpoint_keys=(last_read_keys or list(old_keys)) if deferred_cards else (bottom_keys if frontier_reached else list(old_keys))
  order=lambda values:sorted(values,key=lambda u:int(u.rsplit('/',1)[-1]))
  with temp.open('w',encoding='utf-8')as f:json.dump({'pending':pending,'done':order(done)[-10000:],'seen':order(known|links)[-10000:],'frontier':checkpoint,'attempts':{u:n for u,n in state['attempts'].items() if u in pending},'retryAt':{u:n for u,n in state['retryAt'].items() if u in pending},'seenCards':sorted(seen_cards)[-10000:],'doneCards':sorted(done_cards)[-10000:],'frontierKeys':checkpoint_keys,'updatedAt':time.time()},f)
  temp.chmod(0o600);os.replace(temp,state_path)
 finally:
  if temp.exists():temp.unlink()
 notice='readable' if posts else 'time_budget' if stop=='time_budget' else locals().get('_view',{}).get('category','unreadable')
 if notice=='explicitly_empty' and locals().get('_view',{}).get('rowCount',0)>1:notice='unreadable'
 if notice not in ('readable','explicitly_empty','login_required','rate_limited','page_error','time_budget'):notice='unreadable'
 page._osint_reader_trace={'postsRead':len(posts),'datedPosts':len(posts),'notificationStatus':notice,'timeBudgets':int(stop=='time_budget')}
 print(json.dumps({'event':'x_notifications_reader','status':'readable' if posts else 'no_dated_posts','minimumScrolls':20,'maximumScrolls':120,'scrolls':scrolls,'previousCheckpointFound':frontier_reached if old_frontier or old_keys else None,'checkpointSaved':bool(checkpoint or checkpoint_keys),'notificationCardsSeen':len(seen_cards),'notificationCardsOpened':card_attempts,'notificationCardPostsRead':card_reads,'notificationCardErrors':card_errors,'deferredNotificationCards':len(deferred_cards),'stopReason':stop,'notificationPostLinks':len(links),'detailPostsRead':resolved,'detailReadErrors':errors,'detailReadAbandoned':abandoned,'pendingPostLinks':len(pending),'uniqueDatedPosts':len(posts),'elapsedMs':round((time.monotonic()-started)*1000)}),flush=True)
 return list(posts.values())[:100]

NOTIFICATION_CARDS=r'''() => {
 const out=[],seen=new Set(),root=document.querySelector('[data-testid="primaryColumn"]')||document.querySelector('main');if(!root)return [];
 for(const row of root.querySelectorAll('[data-testid="cellInnerDiv"],[data-testid="notification"]')){
  const cell=row.closest('[data-testid="cellInnerDiv"]');if(cell&&cell!==row)continue;
  const hasOwnPost=[...row.querySelectorAll('article')].some(article=>[...article.querySelectorAll('time[datetime]')].some(clock=>{const nested=clock.closest('[data-testid="quoteTweet"],div[role="link"][tabindex="0"]');return clock.closest('article')===article&&(!nested||!article.contains(nested))&&/\/status\/\d+/.test(clock.closest('a[href]')?.getAttribute('href')||'');}));if(hasOwnPost)continue;
  const target=row.matches('[role="link"]')&&!row.closest('article')?row:[...row.querySelectorAll('div[role="link"][tabindex="0"],[data-testid="notification"][role="link"]')].find(node=>!node.closest('article')&&!node.closest('button,[role="button"]'));
  if(!target||target.closest('button,[role="button"]'))continue;
  const text=(row.innerText||'').replace(/\s+/g,' ').replace(/\b\d+\s*(?:saniye|dakika|saat|gün|sn|dk|sa|second|minute|hour|day|[smhd])(?:\s+önce|\s+ago)?\b/gi,'').trim();if(text.length<4)continue;
  const identity=text+'|'+[...row.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')).sort().join('|');
  let a=2166136261,b=2246822507;for(let i=0;i<identity.length;i++){a=Math.imul(a^identity.charCodeAt(i),16777619);b=Math.imul(b^identity.charCodeAt(i),3266489909);}
  const key=(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');if(seen.has(key))continue;seen.add(key);target.setAttribute('data-osint-notification-card',key);out.push(key);
 }
 return out.slice(0,100);
}'''

async def read_notification_card(page,key):
 """Open a notification's navigation wrapper, never a like/follow/message control."""
 import urllib.parse,re
 previous=page.url;position=await page.evaluate('() => scrollY');landed=False;stage='click'
 try:
  card=page.locator('[data-osint-notification-card="'+key+'"]').first
  point=await card.evaluate('''el=>{const r=el.getBoundingClientRect();for(const [x,y]of [[6,6],[r.width/2,6],[6,r.height/2],[r.width-6,r.height/2]]){const h=document.elementFromPoint(r.left+x,r.top+y);if(h&&el.contains(h)&&!h.closest('button,[role="button"],input,textarea,select,a'))return{x,y};}return null;}''')
  if not point:return None,False
  await card.click(position=point,timeout=3000)
  stage='navigation'
  try:await page.wait_for_url(re.compile(r'https://(?:www\.)?(?:x|twitter)\.com/[A-Za-z0-9_]+/status/\d+'),timeout=4000,wait_until='domcontentloaded')
  except Exception as error:
   print(json.dumps({'event':'x_notification_card_error','stage':stage,'reason':type(error).__name__}),flush=True)
   u=urllib.parse.urlsplit(page.url)
   return None, bool(page.url!=previous and u.hostname in ('x.com','www.x.com','twitter.com') and not '/status/' in u.path)
  u=urllib.parse.urlsplit(page.url);m=re.fullmatch(r'/([A-Za-z0-9_]+)/status/(\d+)(?:/.*)?',u.path)
  if u.hostname not in ('x.com','www.x.com','twitter.com','www.twitter.com')or not m:return None,False
  landed=True;canonical='https://x.com/'+m[1]+'/status/'+m[2]
  stage='post_dom';await page.wait_for_selector('article[data-testid="tweet"] time[datetime],article[role="article"] time[datetime]',timeout=4000,state='attached')
  stage='extract'
  return next((p for p in await page.evaluate(X_EXTRACT) if p['url']==canonical),None),False
 except Exception as error:
  print(json.dumps({'event':'x_notification_card_error','stage':stage,'reason':type(error).__name__}),flush=True);return None,False
 finally:
  if page.url!=previous:
   try:
    await page.go_back(wait_until='domcontentloaded',timeout=7000)
    if page.url.split('?',1)[0]!='https://x.com/notifications':await page.goto(previous,wait_until='domcontentloaded',timeout=7000)
    await page.wait_for_selector('[data-testid="primaryColumn"],main',timeout=4000)
    await page.evaluate('(y) => scrollTo(0,y)',position);await page.wait_for_timeout(500)
   except Exception:pass
