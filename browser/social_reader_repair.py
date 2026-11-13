"""Provider-local cooldowns, canonical capture and read-only review storage."""
import asyncio,datetime,hashlib,json,os,pathlib,re,tempfile,time,urllib.parse,email.utils

def write_json(path,value):
    path=pathlib.Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    fd,name=tempfile.mkstemp(dir=path.parent,prefix='.social-')
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as out:
            json.dump(value,out,ensure_ascii=False);out.flush();os.fsync(out.fileno())
        os.chmod(name,0o600);os.replace(name,path)
    finally:pathlib.Path(name).unlink(missing_ok=True)

def load_json(path,default):
    try:return json.loads(pathlib.Path(path).read_text(encoding='utf-8'))
    except FileNotFoundError:return default

def canonical(post,provider):
    post=dict(post);u=urllib.parse.urlsplit(str(post.get('url') or ''))
    if u.scheme!='https' or u.username or u.password or u.port:return post
    if provider=='instagram' and u.hostname in ('instagram.com','www.instagram.com'):
        m=re.fullmatch(r'/(?:p|reel)/([A-Za-z0-9_-]+)/?',u.path)
        if m:post['url']='https://www.instagram.com/'+('reel' if u.path.startswith('/reel/') else 'p')+'/'+m[1]+'/'
    elif provider=='x' and u.hostname in ('x.com','www.x.com','twitter.com','www.twitter.com'):
        m=re.fullmatch(r'/([A-Za-z0-9_]+)/status/(\d+)(?:/.*)?',u.path)
        if m:post['url']='https://x.com/'+m[1]+'/status/'+m[2]
    return post

def _review_unlocked(root,provider,post,reason):
    if provider not in ('x','instagram'):return
    club=' '.join(str(post.get(k) or '') for k in ('title','description','fullText','sourceName')).casefold().replace('ü','u').replace('\u0307','')
    if 'umraniyespor' in club:return
    post=canonical(post,provider);url=str(post.get('url') or '')
    u=urllib.parse.urlsplit(url)
    if u.scheme!='https' or u.hostname not in ('x.com','www.instagram.com'):return
    path=pathlib.Path(root)/(provider+'-review.json');state=load_json(path,{'items':{}})
    key=hashlib.sha256(url.encode()).hexdigest();previous=state['items'].get(key,{})
    if reason=='keyword_mismatch' and previous.get('reason')==reason and previous.get('lastSeenAt'):
        try:
            last=datetime.datetime.fromisoformat(previous['lastSeenAt'].replace('Z','+00:00'))
            if last.tzinfo and (datetime.datetime.now(datetime.timezone.utc)-last).total_seconds()<1800:return
        except (ValueError,TypeError):pass
    stamp=datetime.datetime.now(datetime.timezone.utc).isoformat()
    state['items'][key]={k:str(post.get(k) or '')[:6000] for k in ('url','title','description','fullText','sourceName','publishedAt','mediaAlt')}
    state['items'][key].update(reason=reason,locationStatus='review_required',locationVerified=False,firstSeenAt=previous.get('firstSeenAt',stamp),lastSeenAt=stamp)
    state['items']=dict(sorted(state['items'].items(),key=lambda pair:pair[1]['lastSeenAt'],reverse=True)[:1000]);write_json(path,state)

def source_plans(provider,config,root,profile,original):
    sources=[s for s in config.get('platformSources',[]) if s.get('provider')==provider and s.get('enabled') is True]
    urls=[]
    for s in sources:
        handle=str(s.get('handle') or '').strip().lstrip('@')
        if not handle:
            try:handle=urllib.parse.urlsplit(str(s.get('url') or '')).path.strip('/')
            except ValueError:continue
        if re.fullmatch(r'[A-Za-z0-9_]{1,15}' if provider=='x' else r'[A-Za-z0-9_.]{1,40}',handle):
            if handle.lower() not in ('home','explore','accounts','notifications','search','direct','p','reel'):
                urls.append(('https://x.com/' if provider=='x' else 'https://www.instagram.com/')+handle+'/')
    urls=list(dict.fromkeys(urls));path=pathlib.Path(root)/('source-cursor-'+provider+'-'+hashlib.sha256(profile.encode()).hexdigest()[:20]+'.json')
    state=load_json(path,{'cursor':0});cursor=int(state.get('cursor',0));count=min(2 if provider=='x' else 1,len(urls))
    selected=[(urls[(cursor+i)%len(urls)],['Ümraniye']) for i in range(count)] if urls else []
    write_json(path,{'cursor':cursor+count})
    if provider=='x':
        searches=[p for p in original if p[0]!='https://x.com/notifications' and not p[0].startswith(('from:','https:'))]
        plans=selected+(searches[:1] or [('Ümraniye',['Ümraniye'])])+[('https://x.com/notifications',['Bildirimler'])]
    else:
        plans=selected+[('__ig_following__',['Takip edilenler']),('__ig_activity__',['Bildirimler'])]
    print(json.dumps({'event':'independent_source_plan','provider':provider,'directSources':count,'routes':len(plans)},ensure_ascii=False),flush=True)
    return plans

class Health:
    def __init__(self,root,provider):
        self.path=pathlib.Path(root)/('social-cooldown-'+provider+'.json');self.provider=provider
        self.state=load_json(self.path,{});self.status=0;self.retry=0
    def remaining(self):return max(0,int(float(self.state.get('retryAt',0))-time.time()))
    def observe(self,response):
        u=urllib.parse.urlsplit(response.url);domain={'x':'x.com','instagram':'instagram.com'}[self.provider]
        if not (u.hostname==domain or u.hostname=='www.'+domain):return
        if response.status==429:
            self.status=429;raw=response.headers.get('retry-after','')
            try:self.retry=max(self.retry,int(raw))
            except (ValueError,TypeError):
                try:self.retry=max(self.retry,int(email.utils.parsedate_to_datetime(raw).timestamp()-time.time()))
                except (ValueError,TypeError,OverflowError):pass
        elif response.status==403 and response.request.is_navigation_request() and not self.status:self.status=403
    def finish(self,status):
        failures=int(self.state.get('failures',0));delay=0;reason=None
        if self.status==429:
            failures+=1;delay=max(self.retry,min(21600,900*2**min(failures-1,4)));reason='rate_limit'
        elif self.status==403:
            failures+=1;delay=1800;reason='access_denied'
        elif status in ('login_required','challenge_required'):
            failures+=1;delay=1800;reason=status
        elif status in ('browser_error','time_budget'):
            failures+=1;delay=min(600,60*2**min(failures-1,4));reason='transient_reader_error'
        else:failures=0
        self.state={'failures':failures,'reason':reason,'retryAt':time.time()+delay if delay else 0,'updatedAt':time.time()};write_json(self.path,self.state)
        if delay:print(json.dumps({'event':'provider_cooldown','provider':self.provider,'reason':reason,'delaySeconds':delay}),flush=True)

def acknowledge(root,result,output,queue_class):
    receipts=output.get('receipts',[]) if isinstance(output,dict) else []
    receipt=next((r for r in receipts if r.get('provider')==result['provider'] and r.get('profileURL')==result['profileURL']),None)
    if not receipt:return 0
    urls=set(receipt.get('acknowledgedUrls',[]));posts=[p for p in result['posts'] if p['url'] in urls]
    queue_class(root,result['profileURL']).acknowledge(posts)
    print(json.dumps({'event':'queue_receipt','provider':result['provider'],'acknowledged':len(posts),'retry':len(receipt.get('retryUrls',[]))}),flush=True)
    return len(posts)

IG_DETAIL=r'''expected=>{
 const code=u=>{try{return new URL(u,location.href).pathname.match(/^\/(?:p|reel)\/([A-Za-z0-9_-]+)/)?.[1]}catch{return null}};
 if(code(location.href)!==expected)return {};
 const articles=[...document.querySelectorAll('article')];
 const article=articles.find(a=>[...a.querySelectorAll('a[href]')].some(x=>code(x.href)===expected))||(articles.length===1?articles[0]:null);
 let description=(article?.querySelector('h1')?.innerText||'').trim(),publishedAt=article?.querySelector('time[datetime]')?.getAttribute('datetime')||'';
 const meta=document.querySelector('meta[property="og:description"]')?.content||'';
 if(!description){const m=meta.match(/:\s*["“]([\s\S]+)["”]\s*\.?$/);if(m)description=m[1].trim();}
 for(const script of document.querySelectorAll('script[type="application/ld+json"]')){
  try{const parsed=JSON.parse(script.textContent);const nodes=Array.isArray(parsed)?parsed:[parsed,...(parsed['@graph']||[])];
   for(const n of nodes)if(code(n.url||n.mainEntityOfPage?.['@id']||n.mainEntityOfPage)===expected){description=String(n.articleBody||n.caption||description||n.description||'');publishedAt=String(n.datePublished||n.uploadDate||publishedAt);}
  }catch{}
 }
   // OSINT_IG_DATE_V55: publication time with evidence, never guessed.
  const dateEvidence={source:'none',domTimeCandidates:0,metaTimeCandidates:0,embeddedMatches:0};
  const validIso=v=>{
    const s=String(v||'').trim();
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(s))return '';
    const t=Date.parse(s);
    return Number.isFinite(t)&&t>=Date.UTC(2010,0,1)&&t<=Date.now()+300000?new Date(t).toISOString():'';
  };
  const validEpoch=v=>{
    if(!/^\d{10,13}$/.test(String(v??'')))return '';
    const n=Number(v),ms=n<1e11?n*1000:n;
    return Number.isSafeInteger(ms)&&ms>=Date.UTC(2010,0,1)&&ms<=Date.now()+300000?new Date(ms).toISOString():'';
  };
  if(validIso(publishedAt)){
    publishedAt=validIso(publishedAt);
    dateEvidence.source='original';
  }else{
    publishedAt='';
    // Only DOM timestamps in this exact post's article, or a UNIQUE main-page clock.
    const articleTimes=article?[...article.querySelectorAll('time[datetime]')]:[];
    const mainTimes=[...(document.querySelector('main')?.querySelectorAll('time[datetime]')||[])];
    const domTimes=articleTimes.length?articleTimes:mainTimes;
    const domDates=[...new Set(domTimes.map(x=>validIso(x.getAttribute('datetime'))).filter(Boolean))];
    dateEvidence.domTimeCandidates=domDates.length;
    if(domDates.length===1){publishedAt=domDates[0];dateEvidence.source='dom_time';}
    if(!publishedAt){
      // A publication-specific meta value is acceptable only if singular.
      const metaNodes=[...document.querySelectorAll('meta[property="article:published_time"],meta[itemprop="datePublished"],meta[property="video:release_date"]')];
      const dates=[...new Set(metaNodes.map(x=>validIso(x.getAttribute('content'))).filter(Boolean))];
      dateEvidence.metaTimeCandidates=dates.length;
      if(dates.length===1){publishedAt=dates[0];dateEvidence.source='publication_meta';}
    }
    if(!publishedAt){
      // Embedded Instagram JSON: require exact post shortcode AND timestamp in that same object.
      // Bound parsing and traversal to avoid heavy CPU and memory usage.
      const found=[];
      const scripts=[...document.querySelectorAll('script[type="application/json"]')].slice(0,35);
      let visited=0;
      for(const script of scripts){
        const body=script.textContent||'';
        if(!body||body.length>1200000||!body.includes(expected))continue;
        let parsed;try{parsed=JSON.parse(body)}catch{continue}
        const stack=[parsed];
        while(stack.length&&visited++<7000){
          const item=stack.pop();
          if(!item||typeof item!=='object')continue;
          if(!Array.isArray(item)){
            const mediaCode=item.shortcode||item.code||item.media_code;
            if(mediaCode===expected){
              const date=validEpoch(item.taken_at_timestamp||item.taken_at||item.media_taken_at||item.published_at)
                  ||validIso(item.datePublished||item.publishedAt);
              if(date)found.push(date);
            }
          }
          for(const value of Object.values(item)){
            if(value&&typeof value==='object'&&stack.length<8500)stack.push(value);
          }
        }
        if(visited>=7000)break;
      }
      const dates=[...new Set(found)];
      dateEvidence.embeddedMatches=dates.length;
      if(dates.length===1){publishedAt=dates[0];dateEvidence.source='matching_embedded_media';}
    }
  }
const handle=[...(article?.querySelectorAll('header a[href]')||[])].map(a=>{try{return new URL(a.href).pathname.match(/^\/([A-Za-z0-9_.]+)\/$/)?.[1]}catch{}}).find(Boolean);
 return {__dateEvidence:dateEvidence,url:'https://www.instagram.com/'+(location.pathname.startsWith('/reel/')?'reel':'p')+'/'+expected+'/',title:description.slice(0,240)||'Instagram paylaşımı',description:description.slice(0,3000),fullText:description.slice(0,6000),sourceName:handle?'@'+handle:'Instagram',publishedAt,mediaAlt:[...(article?.querySelectorAll('img[alt]')||[])].map(n=>n.alt).join(' ').slice(0,2000)};
}'''

# OSINT_IG_AUTHOR_PROOF_V57
# Followed membership must be proven before inspecting a single post detail.
# Do not infer membership from the Following feed alone or from absent Follow buttons.
async def ig_v56_verified_followed(page, deadline=None):
    import urllib.parse
    started=time.monotonic()
    remaining=lambda: max(0.0,(deadline or (started+64))-time.monotonic())
    followed=set()
    stage='route'
    verified=False
    try:
        here=urllib.parse.urlsplit(page.url)
        if (here.hostname not in ('www.instagram.com','instagram.com')
                or here.path not in ('','/')
                or urllib.parse.parse_qs(here.query).get('variant')!=['following']):
            raise ValueError('not_following_route')

        stage='own_profile'
        # Instagram sidebar is not consistently enclosed in <nav>; inspect
        # only explicit, visible "Profile/Profil" navigation controls outside main.
        # OSINT_IG_OWN_PROFILE_V58
        # Discover only the logged-in account's explicit Profile navigation.
        # Fallback is Instagram's own Edit Profile screen, not another account's posts.
        # Never log handles, cookies or private account details.
        own=''
        probe={'navHits':0,'namedControls':0,'editFields':0,'strategy':'none'}
        own_probe=await page.evaluate(r"""() => {
          const allowed=new Set(['instagram.com','www.instagram.com']);
          const excluded=new Set(['explore','reels','direct','accounts','stories','p','reel','about','following','privacy','terms']);
          const getName=a=>{
            const x=[a.getAttribute('aria-label'),a.getAttribute('title'),a.getAttribute('data-testid'),a.innerText,
              ...[...a.querySelectorAll('svg[aria-label],img[alt],span[title]')].map(n=>n.getAttribute('aria-label')||n.getAttribute('alt')||n.getAttribute('title'))];
            return x.filter(Boolean).join(' ').toLowerCase();
          };
          const matches=s=>/(^|[^a-zğüşıöç])(profile|profil|profilim|my profile)([^a-zğüşıöç]|$)/i.test(s);
          const names=new Set();let navHits=0;
          for(const a of document.querySelectorAll('a[href]')){
            if(a.closest('main,article,[role=dialog]'))continue;
            let u;try{u=new URL(a.href,location.href)}catch{continue}
            if(!allowed.has(u.hostname))continue;
            const m=u.pathname.match(/^\/([A-Za-z0-9._]{1,30})\/$/);
            if(!m||excluded.has(m[1].toLowerCase()))continue;
            const label=getName(a);
            if(!matches(label))continue;
            navHits++;names.add(m[1]);
          }
          return {own:names.size===1?[...names][0]:'',navHits};
        }""")
        probe['navHits']=int(own_probe.get('navHits') or 0)
        own=str(own_probe.get('own') or '')
        if own:probe['strategy']='navigation'
        # Accessibility-based fallback for dynamically rendered sidebar links.
        if not own and remaining()>28:
            matches=page.get_by_role('link',name=re.compile(r'^(?:Profile|Profil|Profilim|My profile)$',re.I))
            count=min(await matches.count(),4)
            probe['namedControls']=count
            handles=set()
            for i in range(count):
                href=await matches.nth(i).get_attribute('href')
                if not href:continue
                m=re.fullmatch(r'/([A-Za-z0-9._]{1,30})/',href)
                if m and m.group(1).lower() not in ('explore','reels','direct','accounts','stories','p','reel','about','following'):
                    handles.add(m.group(1))
            if len(handles)==1:
                own=next(iter(handles));probe['strategy']='accessible_link'
        # An explicit Profile navigation button can be used to open *own* page.
        if not own and remaining()>27:
            buttons=page.get_by_role('button',name=re.compile(r'^(?:Profile|Profil|Profilim|My profile)$',re.I))
            if await buttons.count()==1:
                try:
                    await buttons.first.click(timeout=2000)
                    await page.wait_for_timeout(500)
                    u=urllib.parse.urlsplit(page.url)
                    m=re.fullmatch(r'/([A-Za-z0-9._]{1,30})/',u.path)
                    if u.hostname in ('www.instagram.com','instagram.com') and m and m.group(1).lower() not in ('explore','reels','direct','accounts','stories','p','reel','about','following'):
                        own=m.group(1);probe['strategy']='profile_button'
                except Exception:pass
        # As a final fallback read the current user's username from Instagram's
        # own account edit screen; it does not inspect a third-party post.
        if not own and remaining()>26:
            try:
                await page.goto('https://www.instagram.com/accounts/edit/',wait_until='domcontentloaded',timeout=7000)
                loc=urllib.parse.urlsplit(page.url)
                if loc.hostname in ('www.instagram.com','instagram.com') and not loc.path.startswith('/accounts/login'):
                    found=await page.evaluate(r"""() => {
                       const els=[...document.querySelectorAll('input[name=username],input[name="username"],input[autocomplete="username"],input[aria-label="Username"],input[aria-label="Kullanıcı adı"]')];
                       const values=[...new Set(els.map(x=>String(x.value||'').trim()).filter(x=>/^[A-Za-z0-9._]{1,30}$/.test(x)))];
                       return {count:els.length,own:values.length===1?values[0]:''};
                    }""")
                    probe['editFields']=int(found.get('count') or 0)
                    if found.get('own'):
                        own=str(found['own']);probe['strategy']='own_edit_page'
            except Exception:
                pass
        # Only coarse diagnostics are logged (never usernames or page text).
        print(json.dumps({'event':'instagram_own_profile_probe_v58',
          'navHits':probe['navHits'],'namedControls':probe['namedControls'],
          'editFields':probe['editFields'],'strategy':probe['strategy'],
          'resolved':bool(own)},ensure_ascii=False),flush=True)
        if not own:
            raise ValueError('own_profile_unverified')
        if remaining()<23:
            raise ValueError('time_budget_before_following')

        stage='own_following_link'
        await page.goto('https://www.instagram.com/'+own+'/',wait_until='domcontentloaded',timeout=10000)
        own_route=urllib.parse.urlsplit(page.url)
        if own_route.hostname not in ('www.instagram.com','instagram.com') or own_route.path.rstrip('/')!='/'+own:
            raise ValueError('own_profile_redirected')
        await page.wait_for_timeout(400)
        # OSINT_IG_FOLLOWING_LINK_V59
        # Own profile verified above; only the FollowING counter is permitted.
        # "Followers"/"Takipçiler" is never used as a membership source.
        # Do not navigate to any third-party profile or post.
        profile_url='https://www.instagram.com/'+own+'/'
        following_label=re.compile(
            r'(?i)(?:\bfollowing\b|\btakip edilen(?:ler)?\b|'
            r'\btakip ettik(?:lerin|lerim|leri|ler)?\b|\btakip\b)'
        )
        await page.wait_for_timeout(1200)
        try:
            await page.locator('main header').first.wait_for(state='visible',timeout=3500)
        except Exception:
            pass
        # Instagram has used anchor links, accessible controls and plain
        # clickable counter spans in different layouts.
        probes=[
            ('href', page.locator(
                'header a[href*="/following"],main header a[href*="/following"],'
                'main a[href$="/following/"]'
            )),
            ('link', page.locator('main header,header').get_by_role(
                'link',name=following_label)),
            ('button', page.locator('main header').get_by_role(
                'button',name=following_label)),
            ('counter', page.locator('main header,header').locator(
                'a,[role="link"],li,span'
            ).filter(has_text=following_label))
        ]
        attempts=0
        selected='none'
        for label,items in probes:
            if selected!='none' or attempts>=4 or remaining()<13:break
            count=min(await items.count(),6)
            for i in range(count):
                if attempts>=4 or remaining()<13:break
                candidate=items.nth(i)
                try:
                    if not await candidate.is_visible():continue
                    # The href candidate must point to this owner's Following
                    # list, never another user's Following list.
                    href=await candidate.get_attribute('href')
                    if href:
                        u=urllib.parse.urlsplit(urllib.parse.urljoin(profile_url,href))
                        if u.hostname not in ('www.instagram.com','instagram.com') or u.path.rstrip('/')!='/'+own+'/following':
                            continue
                    attempts+=1
                    await candidate.click(timeout=1700)
                    await page.wait_for_timeout(400)
                    probe_dialog=page.locator('[role="dialog"]').first
                    if await probe_dialog.count() and await probe_dialog.is_visible():
                        headings=await probe_dialog.locator('h1,h2,h3,[role="heading"]').all_inner_texts()
                        if any(re.search(r'following|takip edilen|takip ettik',h,re.I) for h in headings):
                            selected=label
                            break
                    # A wrong popup/control is NOT evidence of following.
                    # Reset to the verified account's own page before retry.
                    await page.goto(profile_url,wait_until='domcontentloaded',timeout=7000)
                    await page.wait_for_timeout(350)
                except Exception:
                    # Never treat a failed click as membership proof.
                    try:
                        await page.goto(profile_url,wait_until='domcontentloaded',timeout=7000)
                    except Exception:
                        pass
        if selected=='none' and remaining()>=12:
            # Instagram may support the dedicated own Following route.
            # A route alone is NOT proof: a verified Following dialog is required.
            try:
                await page.goto(profile_url+'following/',wait_until='domcontentloaded',timeout=7000)
                await page.wait_for_timeout(650)
                u=urllib.parse.urlsplit(page.url)
                probe_dialog=page.locator('[role="dialog"]').first
                if (u.hostname in ('www.instagram.com','instagram.com')
                        and await probe_dialog.count() and await probe_dialog.is_visible()):
                    headings=await probe_dialog.locator('h1,h2,h3,[role="heading"]').all_inner_texts()
                    if any(re.search(r'following|takip edilen|takip ettik',h,re.I) for h in headings):
                        selected='own_following_route'
            except Exception:
                pass
        print(json.dumps({'event':'instagram_following_control_probe_v59',
            'attempts':attempts,'method':selected,'dialogVerified':selected!='none'},
            ensure_ascii=False),flush=True)
        if selected=='none':
            raise ValueError('following_list_unavailable')

        stage='following_list'
        dialog=page.locator('[role="dialog"]').first
        try:
            await dialog.wait_for(state='visible',timeout=5000)
        except Exception:
            raise ValueError('following_dialog_unavailable')
        headings=await dialog.locator('h1,h2,h3,[role="heading"]').all_inner_texts()
        if not any(re.search(r'following|takip edilen|takip ettik',x,re.I) for x in headings):
            # A heading must identify the list; arbitrary row text is not proof.
            raise ValueError('following_dialog_unverified')

        stage='membership'
        stable=0
        for _ in range(20):
            if remaining()<10 or time.monotonic()-started>35:break
            found=await dialog.evaluate(r"""d => {
              const out=[];
              const exclude=new Set(['explore','reels','direct','accounts','stories','p','reel','about','following']);
              for(const a of d.querySelectorAll('a[href]')){
                let m;try{
                  const url=new URL(a.href,location.href);
                  if(!['www.instagram.com','instagram.com'].includes(url.hostname))continue;
                  m=url.pathname.match(/^\/([A-Za-z0-9._]{1,30})\/$/);
                }catch{continue}
                if(!m||exclude.has(m[1].toLowerCase()))continue;
                let confirmed=false;
                for(let row=a.parentElement,depth=0;row&&depth<6;row=row.parentElement,depth++){
                  const box=row.getBoundingClientRect();
                  if(box.height<28||box.height>180)continue;
                  const controls=[...row.querySelectorAll('button,[role=button]')];
                  if(controls.some(b=>/^(following|takiptesin|takip ediliyor|takiptesiniz)$/i.test((b.innerText||b.getAttribute('aria-label')||'').trim()))){
                    confirmed=true;break;
                  }
                }
                if(confirmed)out.push(m[1].toLowerCase());
              }
              const scrollers=[...d.querySelectorAll('*')].filter(x=>x.scrollHeight>x.clientHeight+80&&x.clientHeight>100);
              scrollers.sort((a,b)=>(b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight));
              if(scrollers[0])scrollers[0].scrollTop=scrollers[0].scrollHeight;
              return [...new Set(out)];
            }""")
            previous=len(followed)
            followed.update(x for x in found if re.fullmatch(r'[A-Za-z0-9._]{1,30}',str(x)))
            stable=stable+1 if previous==len(followed) else 0
            if stable>=4:break
            await page.wait_for_timeout(400)
        if not followed:
            raise ValueError('membership_no_verified_rows')

        stage='restore_following'
        await page.goto('https://www.instagram.com/?variant=following',wait_until='domcontentloaded',timeout=10000)
        await page.wait_for_timeout(850)
        state=await page.evaluate(r"""() => {
          const label=e=>(e.innerText||e.textContent||e.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ');
          const match=e=>/^(following|takip edilenler|takip ettiklerin|takip ettiklerim)$/i.test(label(e));
          const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.top<innerHeight&&r.bottom>0};
          return [...document.querySelectorAll('[role=tab][aria-selected=true],a[aria-current=page],button[aria-pressed=true],[data-state=active],header h1,main h1')].some(e=>visible(e)&&match(e));
        }""")
        location=urllib.parse.urlsplit(page.url)
        verified=bool(state and location.hostname in ('www.instagram.com','instagram.com')
            and location.path in ('','/')
            and urllib.parse.parse_qs(location.query).get('variant')==['following'] and followed)
        if not verified:raise ValueError('following_feed_unverified')
    except Exception as exc:
        followed.clear()
        reason=str(exc) if isinstance(exc,ValueError) else type(exc).__name__
        # Log reason codes only, never handles, posts, cookies or URLs.
        safe={'not_following_route','own_profile_unverified','time_budget_before_following',
              'own_profile_redirected','following_list_unavailable','following_dialog_unavailable',
              'following_dialog_unverified','membership_no_verified_rows','following_feed_unverified'}
        print(json.dumps({'event':'instagram_author_membership_error_v57',
           'stage':stage,'reason':reason if reason in safe else type(exc).__name__},ensure_ascii=False),flush=True)
    print(json.dumps({'event':'instagram_followed_membership_v56',
           'verified':bool(verified),'handles':len(followed),
           'action':'ALLOW_VERIFIED_AUTHORS' if verified else 'NO_POSTS_READ'},ensure_ascii=False),flush=True)
    print(json.dumps({'event':'instagram_followed_membership_v57',
           'verified':bool(verified),'handles':len(followed),
           'action':'ALLOW_VERIFIED_AUTHORS' if verified else 'NO_POSTS_READ'},ensure_ascii=False),flush=True)
    return followed if verified else set()

# OSINT_IG_PROFILE_READER_V60
# OSINT_IG_PROFILE_READER_FRESH_V90
# OSINT_IG_PROFILE_READER_CAPTION_V80
# Media shortcode creation times are approximations, not publication timestamps.
def ig_v90_shortcode_created_time(code):
    import datetime
    alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    if not isinstance(code,str) or not 8<=len(code)<=12:return None
    n=0
    for ch in code:
        index=alphabet.find(ch)
        if index<0:return None
        n=(n<<6)|index
    if n<=0 or n>=2**64:return None
    ms=(n>>23)+1314220021721
    try:
        stamp=datetime.datetime.fromtimestamp(ms/1000,datetime.timezone.utc)
    except (ValueError,OverflowError,OSError):return None
    if stamp.year<2014:return None
    return stamp

async def ig_v60_profile_reader(page,root,handle,deadline=None):
    import urllib.parse, json, re, time
    from ig_allowlist_v60 import handles as allowed_handles
    started=time.monotonic()
    counters={'attempts':0,'links':0,'prefixed':0,'canonical':0,
              'foreign':0,'nav':0,'intent':0,'images':0,'matched':0,
              'detailPosts':0,'datedPosts':0,'authorMismatch':0,
              'authorUnverified':0,'authorGridEvidence':0,'authorDomEvidence':0,'dateMissing':0,'descriptionMissing':0,
              'detailErrors':0,'modalAttempts':0,'modalRecovered':0,'captionProbes':0,
              'ageKnown':0,'oldSkipped':0,'futureSkipped':0,'freshCandidates':0,'dateProbes':0,
              'freshAccepted':0,'pageTimeUsed':0,'estimatedTimeUsed':0}
    if handle not in allowed_handles():
        print(json.dumps({'event':'instagram_final_blocked','reason':'not_allowlisted'}),flush=True)
        return []
    def correct_profile():
        u=urllib.parse.urlsplit(page.url)
        return (u.hostname in ('instagram.com','www.instagram.com')
            and u.path.rstrip('/').lower()=='/'+handle.lower()
            and handle in allowed_handles())
    if not correct_profile():
        print(json.dumps({'event':'instagram_final_blocked','reason':'profile_route_mismatch'}),flush=True)
        return []

    # This is intentionally restricted to main; no Explore, suggestions, search,
    # follower widgets, external domains, or guessed shortcodes are considered.
    PROFILE_JS = r"""expectedHandle => {
      const roots=[...document.querySelectorAll('main,[role="main"]')];
      const out=[],seen=new Set();
      const stats={prefixed:0,canonical:0,foreign:0,nav:0,intent:0,images:0,matched:0};
      for(const root of roots){
        stats.images+=root.querySelectorAll('img').length;
        for(const a of root.querySelectorAll('a[href]')){
          const raw=a.getAttribute('href')||'';
          let u;try{u=new URL(raw,location.href)}catch{stats.nav++;continue}
          if(u.protocol==='intent:'){stats.intent++;continue}
          if(u.protocol!=='https:'&&u.protocol!=='http:'){stats.nav++;continue}
          if(!['instagram.com','www.instagram.com'].includes(u.hostname)){stats.nav++;continue}
          const m=u.pathname.match(/^\/(?:(\w[\w.]{0,29})\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})\/?$/i);
          if(!m){stats.nav++;continue}
          const prefix=(m[1]||'').toLowerCase();
          if(prefix&&prefix!==expectedHandle.toLowerCase()){
            stats.foreign++;continue;
          }
          if(prefix)stats.prefixed++;else stats.canonical++;
          const kind=m[2]==='reels'?'reel':m[2];
          const code=m[3];
          if(seen.has(code))continue;
          seen.add(code);
          out.push({url:'https://www.instagram.com/'+kind+'/'+code+'/',code,prefixMatched:!!prefix});
        }
      }
      const loc=new URL(location.href);
      const profileRoute=['instagram.com','www.instagram.com'].includes(loc.hostname)
        &&loc.pathname.replace(/\/$/,'').toLowerCase()==='/'+expectedHandle.toLowerCase();
      const login=!!document.querySelector('input[name="username"],input[name="password"],form[action*="login"]');
      const mainText=(roots[0]?.innerText||'').toLowerCase();
      const privacy=/this account is private|bu hesap gizli/.test(mainText);
      const empty=/no posts yet|henüz hiç gönderi yok|henüz gönderi yok/.test(mainText);
      return {links:profileRoute?out.slice(0,24):[],stats,profileRoute,login,privacy,empty};
    }"""

    snapshot={'links':[],'stats':{}}
    for attempt in range(1,5):
        counters['attempts']=attempt
        if not correct_profile():
            print(json.dumps({'event':'instagram_final_blocked','reason':'route_changed'}),flush=True)
            return []
        try:
            snapshot=await page.evaluate(PROFILE_JS,handle)
        except Exception as exc:
            print(json.dumps({'event':'instagram_final_dom_error','errorType':type(exc).__name__}),flush=True)
            return []
        if snapshot.get('links') or snapshot.get('login') or snapshot.get('privacy') or snapshot.get('empty'):
            break
        if deadline and time.monotonic()>deadline-13:break
        if time.monotonic()-started>13:break
        if attempt>1:await page.mouse.wheel(0,600)
        await page.wait_for_timeout(1300)
    # OSINT_IG_LATEST_FIRST_V10: pinned older items may appear before new posts.
    # Decode media creation age only for ranking; never
    # turn first discovery into a fabricated publication timestamp.
    links=snapshot.get('links') or []
    def priority(row):
        stamp=ig_v90_shortcode_created_time(str(row.get('code') or ''))
        return stamp.timestamp() if stamp is not None else -1
    links=sorted(links,key=priority,reverse=True)[:24]
    counters['links']=len(links)
    for key in ('prefixed','canonical','foreign','nav','intent','images'):
        counters[key]=int(snapshot.get('stats',{}).get(key,0))
    print(json.dumps({'event':'instagram_final_grid',**{k:counters[k] for k in
          ('attempts','links','prefixed','canonical','foreign','nav','intent','images')},
          'routeOK':bool(snapshot.get('profileRoute')),
          'login':bool(snapshot.get('login')),
          'private':bool(snapshot.get('privacy')),
          'noPosts':bool(snapshot.get('empty'))},ensure_ascii=False),flush=True)

    # Only the *opened post page* may provide author, caption and publishedAt.
    # The profile URL alone does not prove the post's author.
    POST_JS = r"""params => {
  const {code, handle, allowProfileDialog=false} = params;
  const loc = new URL(location.href);
  if (!['instagram.com', 'www.instagram.com'].includes(loc.hostname)) return {};
  const postRoute = loc.pathname.match(/^\/(?:[A-Za-z0-9._]{1,30}\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})\/?$/i);
  const dialog = document.querySelector('[role="dialog"]');
  const profileDialog = allowProfileDialog && !!dialog && loc.pathname.replace(/\/$/,'').toLowerCase() === '/' + handle.toLowerCase();
  if ((!postRoute || postRoute[1] !== code) && !profileDialog) return {};

  const prop = k => document.querySelector('meta[property="' + k + '"]')?.content || '';
  const metaName = k => document.querySelector('meta[name="' + k + '"]')?.content || '';
  // Profile metadata is about the PROFILE, not the clicked post.
  const postMetadata = !profileDialog || !!postRoute;
  const info = {
    ogTitle: postMetadata ? prop('og:title') : '',
    ogDescription: postMetadata ? prop('og:description') : '',
    pageDescription: postMetadata ? metaName('description') : '',
    twitterDescription: postMetadata ? metaName('twitter:description') : '',
    twitterTitle: postMetadata ? metaName('twitter:title') : ''
  };
  const contexts = [dialog, ...document.querySelectorAll('article'), document.querySelector('main')].filter(Boolean);
  const trim = v => typeof v==='string' ? v.trim() : '';
  const isCaption = v => {
    const s=trim(v);
    return s.length>=8 && s.length<12000 &&
      !/^(?:instagram|sign up|log in|giriş yap|kaydol|follow|takip et|beğen|reply|yanıtla|comments?|yorumlar|liked by|görüntüle)$/i.test(s);
  };
  const extractQuoted = value => {
    const s = trim(value);
    if(!s) return '';
    // Examples: "User on Instagram: \"Caption\"" and
    // "12 likes, 2 comments - handle on Nov 8, 2026: \"Caption\"."
    const m=s.match(/:\s*["“«]([\s\S]+?)["”»]\s*\.?\s*$/);
    return m ? trim(m[1]) : '';
  };
  const urlHandle = url => {
    try { const u=new URL(url,location.href);
      if(!['instagram.com','www.instagram.com'].includes(u.hostname))return '';
      return (u.pathname.match(/^\/([A-Za-z0-9._]{1,30})\/?$/)||[])[1]?.toLowerCase()||'';
    } catch {return ''}
  };
  const authors = new Set();
  for(const root of contexts.slice(0,3)){
    const header=root.querySelector('header');
    if(header) for(const a of header.querySelectorAll('a[href]')){
      const v=urlHandle(a.href);if(v)authors.add(v);
    }
  }
  for(const title of [info.ogTitle,info.twitterTitle]){
    let m=title.match(/\(@([A-Za-z0-9._]{1,30})\).*Instagram/i);
    if(!m)m=title.match(/^@?([A-Za-z0-9._]{1,30}) on Instagram\b/i);
    if(m)authors.add(m[1].toLowerCase());
  }
  for(const meta of [info.ogDescription,info.pageDescription]){
    const m=meta.match(/\s-\s([A-Za-z0-9._]{1,30})\s+on\s+[^:]+\s*:/i);
    if(m)authors.add(m[1].toLowerCase());
  }

  const data=[];
  for(const script of document.querySelectorAll('script[type="application/ld+json"]')){
    try{const parsed=JSON.parse(script.textContent||'null');
      function walk(x,d){
        if(!x||typeof x!=='object'||d>4)return;
        if(Array.isArray(x)){x.slice(0,20).forEach(v=>walk(v,d+1));return;}
        data.push(x);
        if(x['@graph'])walk(x['@graph'],d+1);
      }
      walk(parsed,0);
    }catch{}
  }
  const matchesCode=x=>[x.url,x.mainEntityOfPage?.url,x.mainEntityOfPage?.['@id'],x.identifier]
    .some(v=>String(v||'').includes(code));
  for(const x of data.filter(matchesCode)){
    const aa=Array.isArray(x.author)?x.author:[x.author];
    for(const a of aa){
      if(a && typeof a==='object'){
        const n=trim(String(a.alternateName||a.username||'')).replace(/^@/,'').toLowerCase();
        if(/^[a-z0-9._]{1,30}$/.test(n))authors.add(n);
        const u=urlHandle(a.url||'');if(u)authors.add(u);
      }
    }
  }
  const authorList=[...authors];
  const author=authorList.length===1 ? authorList[0] : '';

  let publishedAt='';
  for(const root of contexts){
    const iso=root.querySelector('time[datetime]')?.getAttribute('datetime')||'';
    if(iso){publishedAt=iso;break;}
  }
  if(!publishedAt)publishedAt=prop('article:published_time')||metaName('datePublished')||'';
  if(!publishedAt){
    for(const x of data.filter(matchesCode))if(x.datePublished){publishedAt=String(x.datePublished);break;}
  }

  const candidates=[];
  function add(text, method, weight){
    let v=trim(text).replace(/\s*\b(?:Daha fazla|More|Devamını oku)\s*$/i,'').trim();
    if(!isCaption(v))return;
    if(/\b(?:login|log in|sign up|giriş yap|kaydol)\b/i.test(v) && v.length<35)return;
    candidates.push({text:v.slice(0,4500),method,weight});
  }
  // A dialog may be outside <main>. Prefer it over unrelated articles.
  for(const root of contexts){
    // Avoid a generic profile/Instagram heading from the main navigation.
    if(root.tagName!=='MAIN' || root.querySelector('time[datetime]')){
      for(const h1 of root.querySelectorAll('h1'))add(h1.innerText,'h1',100);
    }
    const first=root.querySelector('ul > li:first-child, [role="list"] > [role="listitem"]:first-child');
    if(first){
      const text=trim(first.innerText);
      const fromUser=[...first.querySelectorAll('a[href]')].some(a=>urlHandle(a.href)===handle.toLowerCase());
      const lines=text.split('\n').map(trim).filter(Boolean);
      // A caption list-item is normally username, then the caption. Never
      // concatenate all comments; use only the first item.
      if(lines.length>=2 && (fromUser || lines[0].replace(/^@/,'').toLowerCase()===handle.toLowerCase())){
        add(lines.slice(1).join('\n'),'owner_first_li',115);
      }else if(lines.length===1 && fromUser){
        add(lines[0].replace(new RegExp('^@?'+handle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*','i'),'') ,'owner_li',90);
      }
    }
  }
  for(const x of data.filter(matchesCode)){
    add(x.caption,'jsonld_caption',110);
    add(x.articleBody,'jsonld_body',105);
    // Avoid generic description such as "Photo by Instagram" unless specific.
    if(x.description && x.description.length>25)add(x.description,'jsonld_description',65);
  }
  add(extractQuoted(info.ogTitle),'og_title',85);
  add(extractQuoted(info.ogDescription),'og_description',80);
  add(extractQuoted(info.pageDescription),'meta_description',80);
  add(extractQuoted(info.twitterDescription),'twitter_description',70);
  const best=candidates.sort((a,b)=>b.weight-a.weight||b.text.length-a.text.length)[0];
  const diag={
    dialog:!!dialog,articleCount:document.querySelectorAll('article').length,
    mainCount:document.querySelectorAll('main').length,
    postTimeCount:document.querySelectorAll('time[datetime]').length,
    ogDescLength:info.ogDescription.length,
    metaDescLength:info.pageDescription.length,
    ogTitleLength:info.ogTitle.length,
    pageH1Count:document.querySelectorAll('h1').length,
    liCount:document.querySelectorAll('li').length,
    visibleTextLength:trim((dialog||document.querySelector('main')||document.body)?.innerText).length,
    candidateMethods:[...new Set(candidates.map(x=>x.method))].slice(0,8),
    route:postRoute?'media':'profile-dialog'
  };
  return {author,publishedAt,description:best?.text||'',method:best?.method||'',authorSources:authorList.length,diag};
}"""

    # Verify original-post dates; a media-ID estimate is only a probe priority.
    from instagram_publication import prepare_probes,page_publication
    from source_checkpoints import recovery_window
    window_seconds=recovery_window(root,'instagram','https://www.instagram.com/'+handle+'/',initial=86400)
    candidates,remember_publication=prepare_probes(root,handle,links,ig_v90_shortcode_created_time,write_json,window=window_seconds)
    posts=[]
    examined=0
    for item in candidates:
        if deadline and time.monotonic()>deadline-9:break
        if time.monotonic()-started>37:break
        if handle not in allowed_handles():break
        try:
            code=str(item['code']);u=urllib.parse.urlsplit(item['url'])
            if examined>=4:break
            counters['dateProbes']+=1
            examined+=1
            if (u.scheme!='https' or u.hostname!='www.instagram.com' or
                not re.fullmatch(r'/(?:p|reel|tv)/[A-Za-z0-9_-]{5,}/',u.path)):
                continue
            await page.goto(item['url'],wait_until='domcontentloaded',timeout=8000)
            try:
                await page.locator('article time[datetime],main time[datetime]').first.wait_for(state='attached',timeout=2000)
            except Exception:pass
            # Expand just the caption control, not any social-action button.
            try:
                more=page.locator('article').get_by_text(re.compile(r'^(?:\.\.\.|…)?\s*(?:daha fazla|more)\s*$',re.I))
                if await more.count() and await more.first.is_visible():
                    await more.first.click(timeout=800)
            except Exception:pass
            detail=await page.evaluate(POST_JS,{"code":code,"handle":handle})
            if isinstance(detail,dict) and not (detail.get('publishedAt') and detail.get('description')):
                await page.wait_for_timeout(700)
                detail=await page.evaluate(POST_JS,{"code":code,"handle":handle})
            if not isinstance(detail,dict):detail={}
            # The modern React post can expose its caption in a dialog rather
            # than an article. If direct post navigation lacks data, return to
            # the same allowlisted profile and click ONLY its own grid tile.
            if isinstance(detail,dict) and not (detail.get('description') and detail.get('publishedAt')) and counters['modalAttempts']<2:
                counters['modalAttempts']+=1
                try:
                    profile='https://www.instagram.com/'+handle+'/'
                    await page.goto(profile,wait_until='domcontentloaded',timeout=8000)
                    check=urllib.parse.urlsplit(page.url)
                    if (check.hostname in ('instagram.com','www.instagram.com') and
                        check.path.rstrip('/').lower()=='/'+handle.lower() and
                        handle in allowed_handles()):
                        tile=page.locator('main a[href*="/p/'+code+'/"],main a[href*="/reel/'+code+'/"],main a[href*="/reels/'+code+'/"],main a[href*="/tv/'+code+'/"]')
                        if await tile.count():
                            await tile.first.click(timeout=2500)
                            await page.wait_for_timeout(850)
                            try:
                                more=page.locator('[role="dialog"]').get_by_text(re.compile(r'^(?:\.\.\.|…)?\s*(?:daha fazla|more)\s*$',re.I))
                                if await more.count() and await more.first.is_visible():
                                    await more.first.click(timeout=750)
                            except Exception:pass
                            modal=await page.evaluate(POST_JS,{'code':code,'handle':handle,'allowProfileDialog':True})
                            if isinstance(modal,dict):
                                if not isinstance(detail,dict):detail={}
                                if modal.get('description') and (not detail.get('description') or len(modal.get('description'))>len(detail.get('description'))):
                                    detail['description']=modal.get('description')
                                    detail['method']=modal.get('method')
                                if modal.get('publishedAt') and not detail.get('publishedAt'):
                                    detail['publishedAt']=modal.get('publishedAt')
                                if modal.get('author') and not detail.get('author'):
                                    detail['author']=modal.get('author')
                                if modal.get('description') and modal.get('publishedAt'):
                                    counters['modalRecovered']+=1
                except Exception as modal_err:
                    print(json.dumps({'event':'instagram_v8_modal_error','errorType':type(modal_err).__name__}),flush=True)
            if not detail:
                counters['detailErrors']+=1;continue
            if isinstance(detail,dict) and not detail.get('description') and counters['captionProbes']<2:
                counters['captionProbes']+=1
                dg=detail.get('diag') or {}
                # This diagnostic contains only element counts and metadata lengths.
                print(json.dumps({'event':'instagram_v8_caption_probe',
                    'diag':dg,'datePresent':bool(detail.get('publishedAt')),
                    'descriptionPresent':bool(detail.get('description'))},ensure_ascii=False),flush=True)
            try:
                # IG_DETAIL is an existing compatibility parser. It must not
                # decide post provenance and must never invent a timestamp.
                raw=await page.evaluate(IG_DETAIL,code)
            except Exception:raw={}
            post=raw if isinstance(raw,dict) else {}
            # Two independent, page-derived author parsers. Contradictions fail closed;
            # URL prefix by itself is never accepted as ownership evidence.
            authors={str(x).strip().lower().lstrip('@') for x in
                (detail.get('author'),post.get('handle'),post.get('author'),post.get('sourceHandle')) if x}
            # On Instagram, a profile grid's /handle/p/ permalink proves that
            # the item appeared on the selected allowed profile.  It does NOT
            # independently prove the upload author's identity. Keep these
            # meanings separate. A contradictory explicit author is rejected.
            grid_evidence=bool(item.get('prefixMatched'))
            if authors and authors!={handle}:
                counters['authorMismatch']+=1;continue
            if authors:
                counters['authorDomEvidence']+=1
            elif grid_evidence:
                counters['authorGridEvidence']+=1
            else:
                counters['authorUnverified']+=1;continue
            description=str(detail.get('description') or post.get('fullText') or post.get('description') or '').strip()
            pub=str(detail.get('publishedAt') or post.get('publishedAt') or '').strip()
            from datetime import datetime as _dt, timezone as _tz
            stamp=page_publication(pub)
            if stamp is None:
                counters['dateMissing']+=1
                review(root,'instagram',{**post,'url':item['url'],'sourceName':'@'+handle,'description':description,'publishedAt':None},'publication_date_missing')
                continue
            evidence='page_datetime'
            counters['ageKnown']+=1
            remember_publication(code,stamp)
            current_age=time.time()-stamp.timestamp()
            if current_age < -300:
                counters['futureSkipped']+=1;continue
            if current_age > window_seconds:
                counters['oldSkipped']+=1;continue
            counters['freshCandidates']+=1
            if not description:
                counters['descriptionMissing']+=1;continue
            counters['pageTimeUsed']+=1
            post['url']=item['url']
            post['title']=description[:240]
            post['description']=description[:3000]
            post['fullText']=description[:4000]
            post['publishedAt']=stamp.astimezone(_tz.utc).isoformat().replace('+00:00','Z')
            post['timeEvidence']=evidence
            post['discoveredAt']=_dt.now(_tz.utc).isoformat().replace('+00:00','Z')
            post['sourceName']='@'+handle
            post['handle']=handle
            post['sourceEvidence']=('post_author' if authors else 'allowlisted_profile_grid')
            # Explicit local location is evidence, not a generated claim.
            if re.search(r'\bdudullu\b|dudullu merkez camii',description,re.I):
                post['location']='Dudullu'
            counters['detailPosts']+=1
            counters['datedPosts']+=1
            counters['freshAccepted']+=1
            posts.append(post)
        except Exception as exc:
            counters['detailErrors']+=1
            print(json.dumps({'event':'instagram_final_post_error','errorType':type(exc).__name__}),flush=True)
    page._osint_reader_trace={'linksSeen':len(links),'postsRead':counters['authorDomEvidence']+counters['authorGridEvidence'],'datedPosts':counters['ageKnown'],'oldPosts':counters['oldSkipped'],'missingDates':counters['dateMissing'],'missingText':counters['descriptionMissing'],'authorConflicts':counters['authorMismatch'],'routeErrors':counters['detailErrors'],'reasons':{'older_than_window':counters['oldSkipped'],'missing_date':counters['dateMissing']}}
    print(json.dumps({'event':'instagram_final_reader',**{k:counters[k] for k in
        ('links','detailPosts','datedPosts','authorMismatch','authorUnverified',
        'authorGridEvidence','authorDomEvidence','dateMissing','descriptionMissing','detailErrors','modalAttempts','modalRecovered','captionProbes',
         'ageKnown','oldSkipped','futureSkipped','freshCandidates','freshAccepted','pageTimeUsed','estimatedTimeUsed','dateProbes')}},ensure_ascii=False),flush=True)
    return posts


async def read_instagram(page,root,check_challenge,deadline=None):
    # V6.0: Only explicitly enabled profiles. No Following-popup discovery.
    from ig_allowlist_v60 import handles as allowed_handles
    import urllib.parse
    u=urllib.parse.urlsplit(page.url)
    m=re.fullmatch(r'/([A-Za-z0-9._]{1,30})/',u.path)
    h=m.group(1).lower() if m else ''
    if u.hostname not in ('instagram.com','www.instagram.com') or h not in allowed_handles():
        print(json.dumps({'event':'instagram_profile_blocked_v60','reason':'not_allowlisted'},ensure_ascii=False),flush=True)
        return []
    return await ig_v60_profile_reader(page,root,h,deadline)
    # OSINT_INSTAGRAM_BUDGET_V51
    links={};start=time.monotonic();scrolls=0
    # OSINT_INSTAGRAM_CAPTION_V5
    async def expand_more(max_clicks=2):
        expanded=0
        controls=page.locator('main').get_by_text(
            re.compile(
                r'^(?:\.\.\.|…)?\s*'
                r'(?:more|daha fazla|daha fazlası|'
                r'devamı|devami|devamını oku|devamini oku)\s*$',
                re.I
            )
        )
        height=(page.viewport_size or {}).get('height',900)

        for k in range(min(await controls.count(),25)):
            if expanded>=max_clicks:
                break
            control=controls.nth(k)
            rect=await control.bounding_box()

            if (not rect or rect['y']<0
                    or rect['y']>height or rect['height']<2):
                continue

            try:
                await control.click(timeout=900)
                expanded+=1
            except Exception:
                continue

        if expanded:
            print(json.dumps({
                'event':'instagram_caption_expanded_v5',
                'expanded':expanded
            }),flush=True)

        return expanded
    # OSINT_INSTAGRAM_DOM_V4
    try:
        metrics=await page.evaluate('() => {\n const main=document.querySelector(\'main\');\n const elements=main\n   ? [...main.querySelectorAll(\'a[href]\')]\n   : [];\n const images=main\n   ? [...main.querySelectorAll(\'img\')]\n   : [];\n const paths=elements.map(a=>{\n   try{return new URL(a.href,location.href).pathname}\n   catch{return \'\'}\n });\n const text=(main?.innerText||\'\').toLowerCase();\n const body=(document.body?.innerText||\'\').toLowerCase();\n const modal=document.querySelector(\'[role="dialog"]\');\n const modalText=(modal?.innerText||\'\').toLowerCase();\n\n const has=(s,words)=>words.some(w=>s.includes(w));\n\n return {\n   pageType:location.pathname.startsWith(\'/accounts/\')\n     ? \'accounts\'\n     : location.pathname.startsWith(\'/challenge\')\n     ? \'challenge\'\n     : location.pathname.split(\'/\').filter(Boolean).length===1\n     ? \'profile\'\n     : \'other\',\n   mainAnchors:elements.length,\n   mainRoleLinks:main\n     ? main.querySelectorAll(\'[role="link"]\').length\n     : 0,\n   mainButtons:main\n     ? main.querySelectorAll(\'button,[role="button"]\').length\n     : 0,\n   postLinks:paths.filter(p=>p.startsWith(\'/p/\')).length,\n   reelLinks:paths.filter(p=>p.startsWith(\'/reel/\')).length,\n   storyLinks:paths.filter(p=>p.startsWith(\'/stories/\')).length,\n   mainImages:images.length,\n   largeImages:images.filter(\n     x=>x.clientWidth>=150 && x.clientHeight>=150\n   ).length,\n   clickableImages:images.filter(\n     x=>!!x.closest(\'a[href],[role="link"],[tabindex="0"]\')\n   ).length,\n   mainTextLength:text.length,\n   loginDialog:has(modalText,[\n     \'log in\',\'sign up\',\'giriş yap\',\'kaydol\'\n   ]),\n   privateNotice:has(text,[\n     \'this account is private\',\'bu hesap gizli\'\n   ]),\n   noPostsNotice:has(text,[\n     \'no posts yet\',\'henüz gönderi yok\'\n   ]),\n   unavailableNotice:has(body,[\n     "sorry, this page isn\'t available",\n     \'bu sayfa kullanılamıyor\'\n   ]),\n   loginPrompt:has(body,[\n     \'log in to instagram\',\'instagram hesabına giriş yap\'\n   ]),\n   loadingIndicators:document.querySelectorAll(\n     \'[role="progressbar"],[aria-busy="true"]\'\n   ).length\n };\n}')
        print(json.dumps(
            {'event':'instagram_dom_v4',**metrics},
            ensure_ascii=False
        ),flush=True)
    except Exception as error:
        print(json.dumps({
            'event':'instagram_dom_v4',
            'error':type(error).__name__
        }),flush=True)
    # OSINT_INSTAGRAM_PAGE_PROBE_V3
    try:
        probe=await page.evaluate('() => {\n  const paths = Array.from(\n    document.querySelectorAll(\'a[href]\')\n  ).map(a => {\n    try {\n      return new URL(a.href,location.href).pathname;\n    } catch {\n      return \'\';\n    }\n  });\n\n  const pathname=location.pathname;\n  const segments=pathname.split(\'/\').filter(Boolean);\n\n  const pageType=pathname.startsWith(\'/accounts/login\')\n    ? \'login\'\n    : pathname.startsWith(\'/challenge\')\n    ? \'challenge\'\n    : segments.length===1\n    ? \'profile\'\n    : \'other\';\n\n  return {\n    pageType,\n    anchors:paths.length,\n    postLinks:paths.filter(p=>p.startsWith(\'/p/\')).length,\n    reelLinks:paths.filter(p=>p.startsWith(\'/reel/\')).length,\n    mainPresent:!!document.querySelector(\'main\'),\n    loginForm:!!document.querySelector(\'input[type="password"]\'),\n    images:document.querySelectorAll(\'main img\').length\n  };\n}')
        print(json.dumps(
            {'event':'instagram_page_probe_v3',**probe},
            ensure_ascii=False
        ),flush=True)
    except Exception as error:
        print(json.dumps({
            'event':'instagram_page_probe_v3',
            'error':type(error).__name__
        }),flush=True)
    for _ in range(40):
        if deadline and time.monotonic()>deadline-30:break
        # Akis kaydirilirken Devami tiklanmaz; ayrinti sayfasinda acilir.
        for candidate in await page.locator('main article').evaluate_all(r"""(articles) => {
            const out=[];
            for(const a of articles){
              const header=a.querySelector('header');
              const author=[...(header?.querySelectorAll('a[href]')||[])].map(n=>{
                try{return new URL(n.href,location.href).pathname.match(/^\/([a-zA-Z0-9._]+)\/$/)?.[1]?.toLowerCase()||''}catch{return ''}
              }).find(Boolean);
              if(!author)continue;
              for(const n of a.querySelectorAll('a[href]')){
                let u;try{u=new URL(n.href,location.href)}catch{continue}
                if(u.hostname!=='www.instagram.com'&&u.hostname!=='instagram.com')continue;
                if(!/^\/(?:p|reel)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname))continue;
                out.push({url:u.href,author});
              }
            }
            return out;
        }"""):
            if candidate.get('author','').lower() not in ig_v56_allowed:
                continue
            url=candidate['url']
            try:
                p=canonical({'url':url},'instagram');u=urllib.parse.urlsplit(p['url']);m=re.fullmatch(r'/(?:p|reel)/([A-Za-z0-9_-]+)/',u.path)
                if u.hostname=='www.instagram.com' and m:links[m[1]]=p['url']
            except (ValueError,TypeError):pass
        if len(links)>=1 and scrolls>=12:break
        await page.mouse.wheel(0,1050);await page.wait_for_timeout(750);scrolls+=1
    print(json.dumps({'event':'instagram_deep_scan_v5','scrolls':scrolls,'discoveredLinks':len(links)},ensure_ascii=False),flush=True)
    print(json.dumps({'event':'instagram_followed_candidates_v56','verifiedLinks':len(links),'followedHandles':len(ig_v56_allowed)},ensure_ascii=False),flush=True)
    posts=[]
    for code,url in list(links.items())[:3]:
        if time.monotonic()-start>56 or deadline and time.monotonic()>deadline-5:break
        try:
            await page.goto(url,wait_until='domcontentloaded',timeout=6000)
            try:await page.locator('article time[datetime],main time[datetime]').first.wait_for(state='attached',timeout=2500)
            except Exception:pass
            blocked=await auth_gate(page)
            if blocked:raise PermissionError(blocked)
            await expand_more(3)
            post=await page.evaluate(IG_DETAIL,code)
            if post:
                # OSINT_IG_DATE_EVIDENCE_V55: diagnostics without post text or author information.
                evidence=post.pop('__dateEvidence',{}) if isinstance(post,dict) else {}
                print(json.dumps({'event':'instagram_date_evidence_v55',
                    'source':str(evidence.get('source','none')),
                    'domTimeCandidates':int(evidence.get('domTimeCandidates') or 0),
                    'metaTimeCandidates':int(evidence.get('metaTimeCandidates') or 0),
                    'embeddedMatches':int(evidence.get('embeddedMatches') or 0),
                    'hasPublishedAt':bool(post.get('publishedAt') if isinstance(post,dict) else False)},
                    ensure_ascii=False),flush=True)
                posts.append(post)
                if not post.get('description'):review(root,'instagram',post,'media_text_missing')
                elif not post.get('publishedAt'):review(root,'instagram',post,'date_missing')
        except PermissionError:raise
        except Exception as error:print(json.dumps({'event':'instagram_detail_error','reason':type(error).__name__}),flush=True)
    print(json.dumps({'event':'instagram_detail_reader','discoveredLinks':len(links),'detailPosts':len(posts),'datedPosts':sum(bool(p.get('publishedAt')) for p in posts)}),flush=True)
    return posts

FB_DOM=r'''expected=>{
 const normalize=value=>{try{const u=new URL(value,location.href);if(!['facebook.com','www.facebook.com','m.facebook.com'].includes(u.hostname))return '';return u.pathname.replace(/\/$/,'').toLowerCase()+(u.pathname==='/profile.php'?'?id='+u.searchParams.get('id'):'');}catch{return '';}};
 const expectedIdentity=normalize(expected),out=[];
 for(const article of document.querySelectorAll('article,[role="article"]')){
  const own=n=>n.closest('article,[role="article"]')===article;
  const message=[...article.querySelectorAll('[data-ad-comet-preview="message"],[data-ad-preview="message"],[data-testid="post_message"]')].filter(own).map(n=>n.innerText||n.textContent||'').sort((a,b)=>b.length-a.length)[0]||'';
  if(!message.trim())continue;
  for(const link of [...article.querySelectorAll('a[href]')].filter(own)){
   let u;try{u=new URL(link.href)}catch{continue}if(!['facebook.com','www.facebook.com','m.facebook.com'].includes(u.hostname))continue;
   const m=u.pathname.match(/\/(?:posts|reel|videos)\/(\d+)\/?$/),pid=m?.[1]||u.searchParams.get('story_fbid');if(!pid||!/^\d+$/.test(pid))continue;
   const sourceOwned=u.pathname.toLowerCase().startsWith(expectedIdentity+'/posts/')||[...article.querySelectorAll('h2 a[href],h3 a[href],header a[href]')].filter(own).some(a=>normalize(a.href)===expectedIdentity);
   if(!sourceOwned)continue;
   const clocks=[...article.querySelectorAll('time[datetime],[data-utime]')].filter(own);if(clocks.length!==1)continue;
   const clock=clocks[0],raw=clock.getAttribute('datetime'),epoch=clock.getAttribute('data-utime');
   const date=raw&&/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)?raw:/^\d{10}$/.test(epoch||'')?new Date(Number(epoch)*1000).toISOString():'';
   if(!date||!Number.isFinite(Date.parse(date)))continue;
   out.push({url:'https://www.facebook.com'+u.pathname+(u.searchParams.get('story_fbid')?'?'+new URLSearchParams({id:u.searchParams.get('id')||'',story_fbid:pid}):''),facebookPostId:pid,publishedAt:date,title:message.trim().slice(0,240),description:message.trim().slice(0,3000),fullText:message.trim().slice(0,12000),textStatus:/(?:…|\.\.\.|See more|Daha fazlasını gör)\s*$/i.test(message)?'partial_text':'visible_text',dateEvidence:'facebook_dom_time',readerVersion:'facebook-dom-fallback-v1',sourcePageUrl:expected});break;
  }
 }
 return out.slice(0,30);
}'''

async def facebook_dom_posts(page,source):
    rows=await page.evaluate(FB_DOM,source['url']);out=[]
    for row in rows:
        try:
            stamp=datetime.datetime.fromisoformat(row['publishedAt'].replace('Z','+00:00'))
            if stamp.tzinfo is None or stamp.timestamp()>time.time()+300:continue
            row['sourceName']=str(source.get('name') or 'Facebook');out.append(row)
        except (ValueError,TypeError,KeyError):continue
    return out

# UMRANIYE_OSINT_GUVENLI_V2_20261109_SOCIAL

async def auth_gate(page):
    """Inspect platform auth UI, never interpret post text as authentication instructions."""
    path=urllib.parse.urlsplit(page.url).path
    if any(part in path for part in ('/challenge','/checkpoint','/account/access')):
        return 'challenge_required'
    if any(part in path for part in ('/login','/i/flow/login','/accounts/login')):
        return 'login_required'
    passwords=page.locator('input[type="password"]')
    for index in range(min(5,await passwords.count())):
        if await passwords.nth(index).is_visible():return 'login_required'
    frames=page.locator('main iframe[src*="captcha"],main iframe[src*="arkoselabs"],[role="dialog"] iframe[src*="captcha"],[role="dialog"] iframe[src*="arkoselabs"]')
    for index in range(min(5,await frames.count())):
        if await frames.nth(index).is_visible():return 'challenge_required'
    return None


def review(root,provider,post,reason):
    if provider not in ('x','instagram'):return
    from review_retention import review_lock
    with review_lock(root,provider):return _review_unlocked(root,provider,post,reason)
