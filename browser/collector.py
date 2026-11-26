import scan_pacing
from source_checkpoints import known_urls as checkpoint_urls,observation as checkpoint_observation,commit as checkpoint_commit
from session_recovery import probe_paused
from reader_resources import skip_resource,read_page as resource_page,merge_observation
"""Bounded browser worker. No social API, password entry, stealth or challenge bypass."""
import argparse, asyncio, contextlib, datetime, hashlib, ipaddress, json, os, pathlib, re, socket, time, unicodedata, urllib.parse, urllib.request

ENDPOINT = 'http://127.0.0.1:3001/api/admin/integrations/browser-worker'
DATA = pathlib.Path(os.environ.get('OSINT_BROWSER_DATA', '/var/lib/umraniye-osint-deneme'))
HOSTS = {'x': {'x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'}, 'facebook': {'facebook.com', 'www.facebook.com', 'm.facebook.com'}, 'instagram': {'instagram.com', 'www.instagram.com'}}
from social_reader_repair import Health,source_plans,read_instagram,canonical,review,acknowledge,auth_gate
from x_search_queue import SearchQueue
from public_dns import PublicDNS
public_dns=PublicDNS()
from x_reader_v1 import read_x_posts,read_x_notifications
EXTRACT = r'''() => [...document.querySelectorAll('a[href]')].flatMap(a => {

// OSINT_FB_MESSAGE_V3_AST
function osintFbMessage(root){
  if(!root || !root.querySelectorAll)return '';

  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();

  function valid(text){
    if(text.length<30 || text.length>2000)return false;
    const words=text.match(/\p{L}+/gu)||[];
    if(words.length<6)return false;
    const count=words.filter(
      w=>w.toLowerCase()==='facebook'
    ).length;
    return count/words.length<0.4;
  }

  for(const selector of [
    '[data-ad-comet-preview="message"]',
    '[data-ad-preview="message"]',
    '[data-testid="post_message"]'
  ]){
    const texts=[...root.querySelectorAll(selector)]
      .slice(0,15)
      .map(n=>clean(n.innerText||n.textContent))
      .filter(valid);
    const unique=[...new Set(texts)];
    if(unique.length===1)return unique[0];
    if(unique.length>1)return '';
  }

  const fallback=[...root.querySelectorAll('[dir="auto"]')]
    .slice(0,100)
    .filter(n=>!n.closest(
      'header,nav,button,[role="button"],[role="navigation"]'
    ))
    .map(n=>clean(n.innerText||n.textContent))
    .filter(valid);

  const unique=[...new Set(fallback)];
  return unique.length===1?unique[0]:'';
}

 const href=a.href; if(!(/\/status\/\d+|\/posts\/|\/p\/|\/reel\/|story_fbid=|\/permalink\//.test(href)))return [];
 const article=a.closest('article,[role="article"]');if(!article)return [];
 const t=article.querySelector('time[datetime]'),abbr=article.querySelector('[data-utime]');
 const epoch=abbr?.getAttribute('data-utime');const publishedAt=t?.getAttribute('datetime')||(epoch&&/^\d{10}$/.test(epoch)?new Date(Number(epoch)*1000).toISOString():'');
 return [{url:href,sourceName:(article.querySelector('[data-testid="User-Name"]')?.innerText||article.querySelector('header,h2,h3')?.innerText||'').slice(0,100),title:(location.hostname.endsWith('facebook.com')?osintFbMessage(article):(article.innerText||'')).slice(0,240),description:(location.hostname.endsWith('facebook.com')?osintFbMessage(article):(article.innerText||'')).slice(0,location.hostname.endsWith('instagram.com')?3000:800),publishedAt}];
}).slice(0,60)'''
DETAIL = r'''() => {

// OSINT_FB_MESSAGE_V3_AST
function osintFbMessage(root){
  if(!root || !root.querySelectorAll)return '';

  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();

  function valid(text){
    if(text.length<30 || text.length>2000)return false;
    const words=text.match(/\p{L}+/gu)||[];
    if(words.length<6)return false;
    const count=words.filter(
      w=>w.toLowerCase()==='facebook'
    ).length;
    return count/words.length<0.4;
  }

  for(const selector of [
    '[data-ad-comet-preview="message"]',
    '[data-ad-preview="message"]',
    '[data-testid="post_message"]'
  ]){
    const texts=[...root.querySelectorAll(selector)]
      .slice(0,15)
      .map(n=>clean(n.innerText||n.textContent))
      .filter(valid);
    const unique=[...new Set(texts)];
    if(unique.length===1)return unique[0];
    if(unique.length>1)return '';
  }

  const fallback=[...root.querySelectorAll('[dir="auto"]')]
    .slice(0,100)
    .filter(n=>!n.closest(
      'header,nav,button,[role="button"],[role="navigation"]'
    ))
    .map(n=>clean(n.innerText||n.textContent))
    .filter(valid);

  const unique=[...new Set(fallback)];
  return unique.length===1?unique[0]:'';
}

 const articles=[...document.querySelectorAll('article,[role="article"]')];
 if(articles.length!==1)return {};
 const a=articles[0],t=a.querySelector('time[datetime]');
 const epoch=a.querySelector('[data-utime]')?.getAttribute('data-utime');
 return {title:(location.hostname.endsWith('facebook.com')?osintFbMessage(a):(a.innerText||'')).slice(0,240),description:(location.hostname.endsWith('facebook.com')?osintFbMessage(a):(a.innerText||'')).slice(0,800),
 publishedAt:t?.getAttribute('datetime')||(epoch&&/^\d{10}$/.test(epoch)?new Date(Number(epoch)*1000).toISOString():'')};
}'''

FB_EXTRACT = r'''(expectedURL = null) => {

// OSINT_FB_MESSAGE_V3_AST
function osintFbMessage(root){
  if(!root || !root.querySelectorAll)return '';

  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();

  function valid(text){
    if(text.length<30 || text.length>2000)return false;
    const words=text.match(/\p{L}+/gu)||[];
    if(words.length<6)return false;
    const count=words.filter(
      w=>w.toLowerCase()==='facebook'
    ).length;
    return count/words.length<0.4;
  }

  for(const selector of [
    '[data-ad-comet-preview="message"]',
    '[data-ad-preview="message"]',
    '[data-testid="post_message"]'
  ]){
    const texts=[...root.querySelectorAll(selector)]
      .slice(0,15)
      .map(n=>clean(n.innerText||n.textContent))
      .filter(valid);
    const unique=[...new Set(texts)];
    if(unique.length===1)return unique[0];
    if(unique.length>1)return '';
  }

  const fallback=[...root.querySelectorAll('[dir="auto"]')]
    .slice(0,100)
    .filter(n=>!n.closest(
      'header,nav,button,[role="button"],[role="navigation"]'
    ))
    .map(n=>clean(n.innerText||n.textContent))
    .filter(valid);

  const unique=[...new Set(fallback)];
  return unique.length===1?unique[0]:'';
}

 const fold = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ı/g, 'i');
 const months = ['ocak','subat','mart','nisan','mayis','haziran','temmuz','agustos','eylul','ekim','kasim','aralik'];
 function fullDay(value) {
  // Require an explicit year. Never turn "2 hours ago" or a day-only label into now.
  const match = fold(value).match(/(?:^|\s)(\d{1,2})\s+([a-z]+)\s+(\d{4})(?=$|[\s,])/);
  if (!match) return '';
  const month = months.indexOf(match[2]), day = Number(match[1]), year = Number(match[3]);
  if (month < 0 || year < 2004 || year > 2100) return '';
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return '';
  return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
 }
 function postKey(value) {
  try {
   const u = new URL(value, location.href);
   if (u.protocol !== 'https:' || !['facebook.com','www.facebook.com','m.facebook.com'].includes(u.hostname) || u.port || u.username || u.password) return null;
   const pathId = u.pathname.match(/\/(?:posts|permalink)\/([a-zA-Z0-9]+)/)?.[1];
   const id = u.searchParams.get('story_fbid') || pathId || (/^\/photo(?:\.php|\/|$)/.test(u.pathname) ? u.searchParams.get('fbid') : null);
   return id && /^[a-zA-Z0-9]+$/.test(id) ? id : null;
  } catch { return null; }
 }
 const expected = expectedURL ? postKey(expectedURL) : null;
 if (expectedURL && !expected) return [];
 const output = [], seen = new Set();
 for (const anchor of document.querySelectorAll('a[href]')) {
  const id = postKey(anchor.href);
  if (!id || (expected && id !== expected) || seen.has(id)) continue;
  const article = anchor.closest('article,[role="article"]');
  if (!article) continue;
  // Only date-bearing links owned by this article and matching this exact post.
  const labels = [...article.querySelectorAll('a[href]')]
   .filter(a => a.closest('article,[role="article"]') === article && postKey(a.href) === id)
   .flatMap(a => [a.getAttribute('aria-label'),a.getAttribute('title')]);
  const dates = [...new Set(labels.map(fullDay).filter(Boolean))];
  if (dates.length !== 1) continue; // Conflicting/ambiguous dates are not guessed.
  const body = osintFbMessage(article);
  if (body.length < 8) continue;
  seen.add(id);
  output.push({url:anchor.href,title:body.slice(0,240),description:body.slice(0,800),sourceName:(article.querySelector('header,h2,h3')?.innerText||'').slice(0,100),publishedAt:dates[0]});
  if (output.length >= 20) break;
 }
 return output;
}
'''

def fold(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', value).lower().replace('ı', 'i') if not unicodedata.combining(c))

def valid_post(url, provider):
    try:
        u=urllib.parse.urlsplit(url)
        if u.scheme != 'https' or u.hostname not in HOSTS[provider] or u.username or u.password or u.port: return False
    except (ValueError,KeyError):return False
    return bool(re.search({'x':r'/status/\d+', 'facebook':r'/posts/|/permalink/|/story\.php|/photo|/reel/|/videos/', 'instagram':r'^/(p|reel)/'}[provider],u.path) or provider=='facebook' and 'story_fbid=' in u.query)

def search_url(provider, word):
    if provider=='instagram' and re.fullmatch(r'https://www\.instagram\.com/[A-Za-z0-9_.]{1,40}/?',word):return word
    if provider=='x' and re.fullmatch(r'https://x\.com/[A-Za-z0-9_]{1,15}/?',word):return word
    if provider=='instagram' and word in ('__ig_activity__','__ig_following__'):return 'https://www.instagram.com/accounts/activity/' if word=='__ig_activity__' else 'https://www.instagram.com/'
    if provider=='x':return 'https://x.com/search?f=live&q='+urllib.parse.quote(word)
    if provider=='facebook':return 'https://www.facebook.com/search/top/?q='+urllib.parse.quote(word)
    tag=''.join(c for c in word if c.isalnum() or c=='_')
    return 'https://www.instagram.com/explore/tags/'+urllib.parse.quote(tag)+'/'

def challenge(text,url,has_password=False):
    text=fold(text[:12000]);path=urllib.parse.urlsplit(url).path
    if any(s in path for s in ['/challenge','/checkpoint','/account/access']):return 'challenge_required'
    if has_password or any(s in path for s in ['/login','/i/flow/login','/accounts/login']):return 'login_required'
    return None


def _osint_source_from_url(post):
    from urllib.parse import urlsplit
    import re
    p=dict(post)
    name=str(p.get("sourceName") or "").strip()
    if name and not re.fullmatch(
        r"Facebook hesabı(?:\s*·\s*Facebook)?",name,re.I
    ):
        return p
    try:
        u=urlsplit(str(p.get("url") or ""))
        if u.hostname not in (
            "facebook.com","www.facebook.com","m.facebook.com"
        ):
            return p
        m=re.match(r"/([A-Za-z0-9._-]{3,80})/posts/",u.path,re.I)
        if m:
            p["sourceName"]="@"+m.group(1)
    except (ValueError,TypeError):
        pass
    return p

# OSINT_SOURCE_QUALITY_V2
def _osint_placeholder(post):
    import re
    title=str(post.get("title") or "")
    description=str(post.get("description") or "")
    head=re.findall(r"[^\W\d_]+",title,re.UNICODE)[:18]
    words=re.findall(
        r"[^\W\d_]+",title+" "+description,re.UNICODE
    )
    leading=(
        len(head)>=12 and
        sum(w.casefold()=="facebook" for w in head)>=12
    )
    dominant=(
        len(words)>=10 and
        sum(w.casefold()=="facebook" for w in words)/len(words)>=0.65
    )
    return leading or dominant



def institutional_reference(post,config=None):
    try:
        u=urllib.parse.urlsplit(post.get('url',''))
        if u.hostname not in HOSTS['x'] or not re.fullmatch(r'/[A-Za-z0-9_]+/status/\d+/?',u.path):return False
        author=u.path.split('/')[1].lower();text=str(post.get('description') or post.get('title') or '')
        targets=[str(s.get('handle','')) for s in (config or {}).get('platformSources',[]) if s.get('provider')=='x' and s.get('institutional') and s.get('enabled') is True and not s.get('removedAt') and re.fullmatch(r'[A-Za-z0-9_]{1,15}',str(s.get('handle','')))]
        return any(author==t.lower() or re.search(r'(?<![A-Za-z0-9_])@?'+re.escape(t)+r'(?![A-Za-z0-9_])',text,re.I) for t in targets)
    except (ValueError,TypeError):return False

def geographic_candidate(title,description,config):
    def normalize(value):
        value=re.sub(r'[^a-z0-9]+',' ',fold(str(value)))
        value=re.sub(r'\b(?:caddesi(?:nde|nden|ne|nin)?|cadde|cad|cd)\b','cad',value)
        value=re.sub(r'\b(?:bulvari(?:nda|ndan|na|nin)?|bulvar|bulv|blv)\b','bulvar',value)
        return ' '.join(value.split())
    if not isinstance(config,dict):return False
    text=' '+normalize(str(title)+' '+str(description))+' '
    return any(' '+normalize(term)+' ' in text for term in config.get('geographicTerms',[]) if isinstance(term,str) and len(term)>3)

def cleaned(posts,provider,word,limit=20,trace=None):
    import json
    from collections import Counter

    result=[]
    seen=set()
    reasons=Counter()

    if isinstance(word,dict):
        words=[
            w for w in (word.get('keywords') or [])
            if isinstance(w,str) and w.strip()
        ]
        words += [
            w
            for group in (word.get('keywordGroups') or [])
            if isinstance(group,dict) and group.get('enabled',True)
            for w in (group.get('terms') or [])
            if isinstance(w,str) and w.strip()
        ]
        words=list(dict.fromkeys(words))
    else:
        words=[word] if isinstance(word,str) else word

    if provider=='x':
        def published_key(p):
            try:return datetime.datetime.fromisoformat(str(p.get('publishedAt','')).replace('Z','+00:00')).timestamp()
            except (ValueError,TypeError,OverflowError):return 0
        posts=sorted(posts,key=published_key,reverse=True)
    for post in posts:
        if limit is not None and len(result)>=limit:
            reasons['result_limit']+=1
            continue

        if not isinstance(post,dict):
            reasons['invalid_entry']+=1
            continue

        post=canonical(post,provider)
        title=post.get('title','')
        description=(post.get('fullText') or post.get('description','')) if provider=='x' else post.get('description','')
        url=post.get('url','')

        if not local_context(title,description) and not (provider=='x' and institutional_reference(post,word)) and not geographic_candidate(title,description,word):
            reasons['location_missing']+=1
            if provider in ('x','instagram') and reasons['location_reviewed']<2 and valid_post(url,provider) and valid_date(post.get('publishedAt')):
                try:
                    published=datetime.datetime.fromisoformat(str(post['publishedAt']).replace('Z','+00:00'))
                    age=(datetime.datetime.now(datetime.timezone.utc)-published).total_seconds()
                    if published.tzinfo and -300<=age<=10800 and 'umraniyespor' not in fold(str(title)+' '+str(description)):
                        review(DATA,provider,post,'location_missing')
                        reasons['location_reviewed']+=1
                except (ValueError,TypeError,OverflowError):pass
            continue

        if not valid_post(url,provider):
            reasons['invalid_url']+=1
            continue

        if url in seen:
            reasons['duplicate']+=1
            continue

        text=fold(str(title)+' '+str(description))
        if not any(fold(w) in text for w in words) and not (provider=='x' and institutional_reference(post,word)) and not geographic_candidate(title,description,word) and not (provider=='instagram' and local_context(title,description)):
            reasons['keyword_mismatch']+=1
            if provider in ('x','instagram') and reasons['keyword_reviewed'] < 2 and valid_date(post.get('publishedAt')) and 'umraniyespor' not in text:
                try:
                    timestamp=datetime.datetime.fromisoformat(str(post['publishedAt']).replace('Z','+00:00'))
                    if isinstance(timestamp,datetime.datetime) and timestamp.tzinfo is not None:
                        age=(datetime.datetime.now(datetime.timezone.utc)-timestamp).total_seconds()
                        if -300 <= age <= 10800:
                            review(DATA,provider,post,'keyword_mismatch')
                            reasons['keyword_reviewed']+=1
                except (ValueError,TypeError,OverflowError):pass
            continue

        if not valid_date(post.get('publishedAt')):
            reasons['date_missing_or_invalid']+=1
            review(DATA,provider,post,'date_missing_or_invalid')
            continue

        # FACEBOOK_LIVE_V4: exact publication instant, at most 60 minutes old.
        if provider=='facebook':
            try:
                raw_date=str(post.get('publishedAt') or '')
                if 'T' not in raw_date:
                    reasons['date_precision_insufficient']+=1
                    continue
                parsed=datetime.datetime.fromisoformat(raw_date.replace('Z','+00:00'))
                if parsed.tzinfo is None:
                    reasons['date_timezone_missing']+=1
                    continue
                age=(datetime.datetime.now(datetime.timezone.utc)-parsed).total_seconds()
                if not -60<=age<=3600:
                    reasons['outside_60_minutes']+=1
                    continue
            except (ValueError,TypeError):
                reasons['date_parse_failed']+=1
                continue

        if provider=='facebook' and _osint_placeholder(post):
            reasons['placeholder_text']+=1
            continue

        if provider=='facebook':
            post=_osint_source_from_url(post)

        seen.add(post['url'])
        if provider=='x':
            post={**post,'description':description[:3000]}
        result.append({
            k:str(post.get(k,''))[:limit]
            for k,limit in [
                ('url',600),('title',240),
                ('description',3000 if provider in ('x','instagram') else 800),('fullText',6000 if provider in ('x','instagram') else 0),('sourceName',100),
                ('publishedAt',60)
            ]
        })

    if trace is not None:
        for key,value in reasons.items():trace[key]=trace.get(key,0)+value
    print(json.dumps({
        'event':'browser_prefilter_breakdown',
        'provider':provider,
        'candidates':len(posts),
        'accepted':len(result),
        'reasons':dict(reasons)
    },ensure_ascii=False),flush=True)

    return result


def local_context(title,description=''):
    text=fold(str(title)+' '+str(description))
    # Only explicit place names in post text; author names and search terms are not evidence.
    return bool(re.search(r'(?<![\w@])(?:umraniye|dudullu|ihlamurkuyu|elmalikent|armaganevler|yamanevler)(?:deki|daki|den|dan|nin|nun|de|da|ye|ya|li)?(?![\w])',text)
                or re.search(r'(?<!\w)عمرانية(?!\w)',text))

def valid_date(value):
    if not isinstance(value,str):return False
    try:
        if re.fullmatch(r'\d{4}-\d{2}-\d{2}',value):
            parsed=datetime.date.fromisoformat(value)
            return parsed<=datetime.datetime.now(datetime.timezone.utc).date()
        parsed=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
        return parsed.tzinfo is not None and parsed<=datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=5)
    except (ValueError,TypeError):return False

def query_plan(provider,config,slot):
    import re
    if not isinstance(config,dict) or config.get('scope')!='umraniye_only' or config.get('nationalNewsEnabled') is not False:return []
    groups=[g for g in config.get('keywordGroups',[]) if g.get('enabled',True)]
    if not groups and not any(s.get('provider')==provider and s.get('enabled') for s in config.get('platformSources',[])):return []
    def terms(priority):
        return list(dict.fromkeys(w for g in groups if g.get('priority')==priority for w in g.get('terms',[]) if isinstance(w,str) and w.strip()))
    schedule=['P2','P2','P3','P2','P3','P4']
    level=schedule[slot%6]
    # Count occurrences of this priority, not wall-clock modulo term count (avoids starvation).
    tick=(slot//6)*schedule.count(level)+schedule[:slot%6].count(level)
    batches=[]
    for priority,index in [('P1',slot),(level,tick)]:
        words=terms(priority)
        if words:
            count=min(3 if provider=='x' else 1,len(words))
            batches.append([words[(index*count+i)%len(words)] for i in range(count)])
    # OSINT_FB_DIRECT_SOURCE_V1
    # Her uc turun birinde etkin bir Facebook sayfasini dogrudan tara.
    # Diger turlarda genel yerel olay aramasini koru.
    plans=[('Ümraniye',['Ümraniye'])]
    # OSINT_SOURCE_ROTATION_V2
    if provider=='facebook' and slot%2==1:
        try:
            import json
            import re
            from urllib.parse import urlsplit

            stored=json.loads(
                (DATA/'priority-sources.json').read_text(encoding='utf-8')
            )
            urls=[]

            for source in stored.get('sources',[]):
                if not isinstance(source,dict):
                    continue
                if source.get('provider')!='facebook':
                    continue
                if source.get('enabled') is not True:
                    continue

                address=str(source.get('url') or '').strip()
                u=urlsplit(address)

                if u.scheme!='https':
                    continue
                if u.hostname not in (
                    'facebook.com','www.facebook.com','m.facebook.com'
                ):
                    continue
                if u.username or u.password or u.port:
                    continue
                if u.query or u.fragment:
                    continue

                parts=[x for x in u.path.split('/') if x]
                if len(parts)!=1:
                    continue

                handle=parts[0]
                if not re.fullmatch(r'[A-Za-z0-9._-]{3,80}',handle):
                    continue
                if handle.lower() in (
                    'login','search','groups','pages',
                    'profile.php','watch','reel'
                ):
                    continue

                url='https://www.facebook.com/'+handle+'/'
                if url not in urls:
                    urls.append(url)

            if urls:
                index=(slot//2)%len(urls)
                plans[0]=(urls[index],['Ümraniye'])

        except (OSError,ValueError,TypeError,AttributeError):
            pass
    for batch in batches:
        if provider=='x':
            quoted=['"'+w.replace('"','').replace('\\','')+'"' for w in batch]
            query='("Ümraniye" OR "Umraniye" OR "Dudullu") ('+' OR '.join(quoted)+')'
        elif provider=='facebook':
            query=batch[0] if local_context(batch[0]) else 'Ümraniye '+batch[0]
        elif provider=='instagram':
            # Instagram hashtags cannot express a Boolean AND; content still passes local_context.
            query=batch[0] if local_context(batch[0]) else 'Ümraniye '+batch[0]
        else:return []
        plans.append((query,batch))
    watched=[s for s in config.get('platformSources',[]) if s.get('provider')==provider and s.get('enabled') is True]
    if provider=='x' and watched:
        own=watched[slot%len(watched)];handle=str(own.get('handle',''))
        selected=[plans[0]] if plans else []
        if re.fullmatch(r'[A-Za-z0-9_]{1,40}',handle):selected.append(('from:'+handle,['Ümraniye']))
        institutions=[s for s in watched if s.get('institutional') and s.get('mentions')]
        if institutions:
            target=institutions[slot%len(institutions)]['handle']
            if re.fullmatch(r'[A-Za-z0-9_]{1,15}',str(target)):selected.append(('(@'+target+' OR to:'+target+' OR url:x.com/'+target+'/status) -from:'+target,[target]))
        extras=plans[1:]
        if extras:
            priority=extras[(slot//2)%len(extras)]
            if len(selected)<3:selected.append(priority)
            elif slot%2==0:selected[-1]=priority
        plans=selected
    elif provider=='instagram' and watched:
        url=watched[slot%len(watched)].get('url','')
        if re.fullmatch(r'https://www\.instagram\.com/[A-Za-z0-9_.]{1,40}/?',url):plans=[(url,['Ümraniye'])]+plans[:2]
    return [('https://x.com/notifications',['Bildirimler'])]+plans[:3] if provider=='x' else plans[:3]


def bridge(payload=None):
    key=(DATA/'browser-service.key').read_bytes().hex()
    from bridge_payload import bounded_payload,encode
    if payload is not None:
        before=sum(len(r.get('posts',[])) for r in payload.get('results',[]));payload=bounded_payload(payload)
        after=sum(len(r.get('posts',[])) for r in payload.get('results',[]))
        if before!=after:print(json.dumps({'event':'bridge_payload_bounded','selected':after,'deferredInExistingQueue':before-after}),flush=True)
    req=urllib.request.Request(ENDPOINT, data=encode(payload) if payload is not None else None,headers={'X-OSINT-Browser-Key':key,'Content-Type':'application/json'})
    # Do not honor proxy env for the private loopback bridge.
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    from loopback_bridge import exchange_json
    return exchange_json(opener,req,timeout=45)

@contextlib.contextmanager
def profile_lock(folder):
    import fcntl
    folder.mkdir(parents=True,exist_ok=True,mode=0o700)
    with (folder/'osint.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        try:yield
        finally:fcntl.flock(lock,fcntl.LOCK_UN)

def profile_dir(account):return DATA/'browser-profiles'/hashlib.sha256(account['profileURL'].encode()).hexdigest()[:24]

async def network_guard(route,interactive=False,provider=None):
    u=urllib.parse.urlsplit(route.request.url)
    if u.scheme in ['data','blob','about']:return await route.continue_()
    if u.scheme!='https' or u.port not in (None,443):return await route.abort()
    domains=['x.com','twitter.com','twimg.com','t.co','facebook.com','fbcdn.net','fbsbx.com','instagram.com','cdninstagram.com','accounts.google.com','gstatic.com','googleusercontent.com','www.google.com','recaptcha.net']
    if interactive:domains+=['arkoselabs.com','funcaptcha.com','hcaptcha.com']
    allowed_host=bool(u.hostname) and (any(u.hostname==d or u.hostname.endswith('.'+d) for d in domains) or (interactive and u.hostname=='challenges.cloudflare.com'))
    if not allowed_host:
        if interactive and u.hostname:print('OSINT_LOGIN blocked_host '+u.hostname,flush=True)
        return await route.abort()
    if skip_resource(route.request.resource_type,provider,interactive):return await route.abort()
    if not await public_dns.allowed(u.hostname):return await route.abort()
    await route.continue_()

async def collect(pw,account,word,session_check=False):
    if account['provider']=='facebook':
        from facebook_public_v5 import collect_facebook
        return await collect_facebook(pw,account,word,DATA,network_guard,cleaned)
    started=time.monotonic();result={'provider':account['provider'],'profileURL':account['profileURL'],'status':'browser_error','posts':[],'terms':[],'readCount':0,'readerObservation':{},'prefilterReasons':{},'sourceReads':[]}
    health=Health(DATA,account['provider'])
    if health.remaining() and not session_check:
        result.update(status='time_budget',readerStatus='cooldown',retryInSeconds=health.remaining(),readCount=0)
        print(json.dumps({'event':'provider_waiting','provider':account['provider'],'retryInSeconds':health.remaining()}),flush=True)
        return result
    ig_queue_profile=account['profileURL']+('#ig-allowlist-v60' if account['provider']=='instagram' else '')
    queue=SearchQueue(DATA,ig_queue_profile) if account['provider'] in ('x','instagram') and not session_check else None
    if queue:
        result['posts'],result['queuePending']=queue.batch()
    slot_seconds=120 if account['provider']=='instagram' else 300
    plans=query_plan(account['provider'],word,int(time.time()//slot_seconds))
    if session_check:plans=[(account['profileURL'],['Oturum kontrolü'])]
    else:plans=source_plans(account['provider'],word,DATA,account['profileURL'],plans)
    if account['provider']=='instagram' and not session_check:
        # OSINT_INSTAGRAM_ALLOWLIST_V60
        from ig_allowlist_v60 import next_batch
        ig_targets=next_batch(DATA,count=3,advance=False)
        plans=[('https://www.instagram.com/'+name+'/', ['Ümraniye']) for name in ig_targets]
        print(json.dumps({'event':'instagram_profile_plan_v60','planned':len(plans),'mode':'explicit_allowlist_only'},ensure_ascii=False),flush=True)
    result['readerObservation']['routesPlanned']=len(plans)
    if queue and result['queuePending']>=100:
        # Keep reading the newest X notifications while old candidates drain.
        # Pause only broad keyword searches at the high watermark.
        plans=plans  # Continue direct sources and searches while the queue drains.
        result['queueMode']='sources_search_and_notifications'
    elif queue:
        result['queueMode']='search_and_notifications'
    try:
        with profile_lock(profile_dir(account)):
            context=await pw.chromium.launch_persistent_context(str(profile_dir(account)),channel='chromium',headless=True,args=['--autoplay-policy=user-gesture-required'],chromium_sandbox=True,locale='tr-TR',timezone_id='Europe/Istanbul',viewport={'width':1280,'height':900},accept_downloads=False,service_workers='block')
            ig_attempted=0
            try:
                await context.route('**/*',lambda route:network_guard(route,interactive=False,provider=account['provider']))
                context.on('response',health.observe)
                page=await resource_page(context)
                raw=[];completed=0;failed=0;ig_attempted=0
                for query,terms in plans:
                    if health.status:break
                    if time.monotonic()-started>(125 if account['provider']=='x' else 60):break
                    if account['provider']=='instagram' and not session_check:ig_attempted+=1
                    try:
                        if completed or failed:page=await resource_page(context,page)
                        page._osint_reader_trace={}
                        target=(query if session_check else query if account['provider']=='x' and query=='https://x.com/notifications' else query if account['provider']=='facebook' and re.fullmatch(r'https://www\.facebook\.com/[A-Za-z0-9._-]{3,80}/',query) else query if account['provider']=='instagram' and query=='https://www.instagram.com/' else search_url(account['provider'],query))
                        if account['provider']=='instagram' and not session_check:
                            target=query
                        if account['provider']=='facebook':
                            mode='source_page' if re.fullmatch(r'https://www\.facebook\.com/[A-Za-z0-9._-]{3,80}/',target) else 'search'
                            print(json.dumps({'event':'facebook_scan_mode','mode':mode}),flush=True)
                        await page.goto(target,wait_until='domcontentloaded',timeout=15000)
                        await page.wait_for_timeout(5000 if account['provider']=='facebook' else 2000)
                        blocked=await auth_gate(page)
                        if blocked:result['status']=blocked;return result
                        if account['provider']=='instagram' and not session_check:
                            from ig_allowlist_v60 import handles as allowed_handles
                            ig_route=urllib.parse.urlsplit(page.url)
                            ig_name=ig_route.path.strip('/').lower()
                            ig_valid=(ig_route.hostname in ('instagram.com','www.instagram.com') and
                                bool(re.fullmatch(r'[A-Za-z0-9._]{1,30}',ig_name)) and
                                ig_name in allowed_handles() and ig_route.path.rstrip('/')=='/'+ig_name)
                            if not ig_valid:
                                result['status']='browser_error'
                                result['readerObservation'].setdefault('reasons',{})['instagram_profile_not_allowed']=1
                                print(json.dumps({'event':'instagram_profile_blocked_v60','reason':'not_allowlisted'},ensure_ascii=False),flush=True)
                                failed+=1
                                continue
                        body='' if account['provider']=='instagram' and not session_check else await page.locator('body').inner_text(timeout=5000)
                        # OSINT_SOURCE_OBSERVABILITY_V1
                        if account['provider']=='facebook':
                            handle=(urllib.parse.urlsplit(target).path.strip('/')
                                    if mode=='source_page' else None)
                            landed=urllib.parse.urlsplit(page.url)
                            matched=(mode=='source_page' and
                                     landed.hostname in HOSTS['facebook'] and
                                     landed.path.strip('/').lower()==str(handle).lower())
                            print(json.dumps({
                                'event':'facebook_target_observed',
                                'mode':mode,
                                'sourceHandle':handle,
                                'urlMatchesTarget':bool(matched),
                                'blocked':blocked or None
                            },ensure_ascii=False),flush=True)
                        if blocked:result['status']=blocked;return result
                        own=page.locator('[data-testid="SideNav_AccountSwitcher_Button"]')
                        if account['provider']=='x' and await own.count():result['sessionName']=(await own.first.inner_text())[:100]
                        if account['provider']=='instagram' and 'instagram.com' in page.url and '/accounts/login' not in page.url and '/challenge' not in page.url:
                            marker=page.locator('a[href="/accounts/edit/"],a[href="/accounts/activity/"],a[href="/direct/inbox/"]')
                            if await marker.count():result['sessionName']='Instagram oturumu'
                        if session_check:
                            if health.status:
                                result.update(status='time_budget',readerStatus='platform_response_limited');return result
                            result['status']='session_ready' if result.get('sessionName') else 'session_unverified'
                            return result
                        if account['provider']=='instagram' and query=='__ig_following__':
                            tabs=page.get_by_text(re.compile(r'^(Following|Takip edilenler)$',re.I))
                            visible=False
                            for i in range(await tabs.count()):
                                if await tabs.nth(i).is_visible():
                                    await tabs.nth(i).click(timeout=2500);visible=True;break
                            if not visible:
                                print(json.dumps({'event':'instagram_following_unavailable'}),flush=True);continue
                            await page.wait_for_timeout(800)
                        found=[]
                        if account['provider']=='x':
                            if target=='https://x.com/notifications':
                                # Soft deadline: the reader stops, saves its checkpoint/pending links and returns what it read.
                                # Cancelling it at 30 s discarded all of that. The hard limit only guards an in-flight page
                                # operation and keeps the call inside the existing 150 s X round budget.
                                soft=min(30,max(5,128-(time.monotonic()-started)))
                                try:found.extend(await asyncio.wait_for(read_x_notifications(page,DATA/('x-notifications-'+hashlib.sha256(account['profileURL'].encode()).hexdigest()[:24]+'.json'),deadline=time.monotonic()+soft),timeout=soft+20))
                                except asyncio.TimeoutError:print(json.dumps({'event':'x_notifications_budget_reached','directSourcesAlreadyScanned':True}),flush=True)
                            else:found.extend(await read_x_posts(page))
                        elif account['provider']=='instagram':
                            found.extend(await read_instagram(page,DATA,challenge,deadline=started+68))
                            # UMRANIYE_IG_AUTO_CANDIDATE_V1
                            for _ig_c in found:
                                try:
                                    _ig_raw=str(_ig_c.get('publishedAt') or '')
                                    _ig_stamp=datetime.datetime.fromisoformat(_ig_raw.replace('Z','+00:00'))
                                    if _ig_stamp.tzinfo is None:continue
                                    _ig_age=(datetime.datetime.now(datetime.timezone.utc)-_ig_stamp.astimezone(datetime.timezone.utc)).total_seconds()
                                    if -60<=_ig_age<=10800 and _ig_c.get('url'):
                                        review(DATA,'instagram',_ig_c,'fresh_intelligence_candidate')
                                except (AttributeError,TypeError,ValueError,OverflowError,OSError):pass
                        else:
                            for _ in range(2):found.extend(await page.evaluate(EXTRACT))
                            if account['provider']=='facebook':found.extend(await page.evaluate(FB_EXTRACT))
                            await page.mouse.wheel(0,1000);await page.wait_for_timeout(1200)
                        if account['provider']=='facebook':found.extend(await page.evaluate(FB_EXTRACT))
                        if account['provider']=='facebook':
                            from facebook_click_reader import read_dated_posts
                            found.extend(await read_dated_posts(page,local_context,valid_date))
                        if account['provider']=='facebook':
                            handle=(urllib.parse.urlsplit(target).path.strip('/')
                                    if mode=='source_page' else None)
                            usable=[x for x in found if isinstance(x,dict)]
                            urls={str(x.get('url') or '') for x in usable
                                  if x.get('url')}
                            print(json.dumps({
                                'event':'facebook_page_candidates',
                                'mode':mode,
                                'sourceHandle':handle,
                                'rawCandidates':len(usable),
                                'uniqueUrls':len(urls),
                                'datedCandidates':sum(
                                    1 for x in usable if x.get('publishedAt')
                                )
                            },ensure_ascii=False),flush=True)
                        if not found and account['provider'] not in ('x','instagram'):
                            links=await page.locator('a[href]').evaluate_all('(links)=>links.map(a=>a.href)')
                            for link in list(dict.fromkeys(u for u in links if valid_post(u,account['provider'])))[:2]:
                                await page.goto(link,wait_until='domcontentloaded',timeout=10000)
                                if challenge(await page.locator('body').inner_text(timeout=5000),page.url,await page.locator('input[type="password"]').count()>0):result['status']='challenge_required';return result
                                if account['provider']=='facebook':
                                    await page.wait_for_timeout(1500)
                                    dated=await page.evaluate(FB_EXTRACT,link)
                                    found.extend(dated or [{'url':link,**await page.evaluate(DETAIL)}])
                                else:found.append({'url':link,**await page.evaluate(DETAIL)})
                        if account['provider']=='facebook':
                            date_fields=await page.evaluate('''() => ({
                                time_elements:document.querySelectorAll('time').length,
                                datetime_attributes:document.querySelectorAll('[datetime]').length,
                                utime_attributes:document.querySelectorAll('[data-utime]').length,
                                title_attributes:document.querySelectorAll('a[title]').length,
                                aria_labels:document.querySelectorAll('a[aria-label]').length,
                                jsonld_scripts:document.querySelectorAll('script[type="application/ld+json"]').length
                            })''')
                            print(json.dumps({
                                'event':'facebook_date_fields',
                                **date_fields
                            }),flush=True)
                            print(json.dumps({
                                'event':'facebook_date_diagnostic',
                                'found':len(found),
                                'with_date':sum(bool(p.get('publishedAt')) for p in found),
                                'without_date':sum(not p.get('publishedAt') for p in found),
                                'valid_urls':sum(valid_post(p.get('url',''),'facebook') for p in found)
                            }),flush=True)
                        result['sourceReads'].append(checkpoint_observation(query,found,getattr(page,'_osint_reader_trace',{})))
                        merge_observation(result['readerObservation'],getattr(page,'_osint_reader_trace',{}))
                        result['readerObservation']['routesCompleted']=completed+1
                        raw.extend(found);result['terms'].extend(terms);completed+=1
                        result['readCount']=max(result['readerObservation'].get('postsRead',0),len({p.get('url') for p in raw if isinstance(p,dict) and p.get('url')}))
                        if queue:
                            if account['provider']=='instagram':
                                ig_prepared=cleaned(found,account['provider'],word,limit=None,trace=result['prefilterReasons'])
                                print(json.dumps({'event':'instagram_filter_trace_v56',
                                    'detailFound':len(found),'afterLocalFilters':len(ig_prepared),
                                    'dated':sum(bool(p.get('publishedAt')) for p in found if isinstance(p,dict)),
                                    'rawCandidates':len(found)},ensure_ascii=False),flush=True)
                                queue.add(ig_prepared)
                            else:
                                queue.add(cleaned(found,account['provider'],word,limit=None,trace=result['prefilterReasons']))
                            result['posts'],result['queuePending']=queue.batch()
                            if account['provider']=='instagram':
                                print(json.dumps({'event':'instagram_queue_trace_v56','queuePending':result['queuePending'],'queueBatch':len(result['posts'])},ensure_ascii=False),flush=True)
                        else:result['posts']=cleaned(raw,account['provider'],word,trace=result['prefilterReasons'])
                    except PermissionError as error:
                        result['status']=str(error) if str(error) in ('login_required','challenge_required') else 'challenge_required';return result
                    except Exception as error:
                        result['readerObservation']['routeErrors']=result['readerObservation'].get('routeErrors',0)+1
                        failed+=1
                        print(json.dumps({'event':'provider_route_error','provider':account['provider'],'reason':type(error).__name__}),flush=True)
                result['status']='partial' if failed and completed else 'browser_error' if failed else 'collected' if result['posts'] else 'date_missing' if raw and any(not p.get('publishedAt') for p in raw) else 'no_visible_results' if not raw else 'filtered_no_eligible_posts' if result.get('readCount',0)>0 and all(isinstance(p,dict) and p.get('publishedAt') for p in raw) and any(valid_post(p.get('url',''),account['provider']) for p in raw if isinstance(p,dict)) else 'selector_changed'  # UMRANIYE_XIG_FILTERED_STATUS_V1
                if account['provider']=='instagram' and not failed and not result['posts'] and result['readerObservation'].get('postsRead',0)>0:result['status']='filtered_no_eligible_posts'
                return result
            except asyncio.CancelledError:
                result['status']='partial' if result['posts'] else 'time_budget';return result
            finally:
                await context.close()
                if account['provider']=='instagram' and not session_check:
                    from ig_allowlist_v60 import advance_batch
                    advance_batch(DATA,ig_targets,ig_attempted)
    except BlockingIOError:result['status']='profile_busy'
    except Exception as error:
        result['status']='browser_error'
        print(json.dumps({'event':'provider_reader_error','provider':account['provider'],'reason':type(error).__name__}),flush=True)
    finally:
        result['durationMs']=round((time.monotonic()-started)*1000)
        health.finish(result['status'])
    return result

async def run(login_index=None,provider=None,check_provider=None):
    from playwright.async_api import async_playwright
    config=await asyncio.to_thread(bridge)
    async with async_playwright() as pw:
        if login_index is not None:
            account=config['accounts'][login_index-1]
            with profile_lock(profile_dir(account)):
                context=await pw.chromium.launch_persistent_context(str(profile_dir(account)),headless=False,chromium_sandbox=True,locale='tr-TR',timezone_id='Europe/Istanbul',accept_downloads=False,viewport={'width':1280,'height':900})
                try:
                    await context.route('**/*',lambda route:network_guard(route,interactive=True))
                    page=context.pages[0] if context.pages else await context.new_page();await page.goto(account['profileURL'],wait_until='domcontentloaded',timeout=40000)
                    print('Platformun kendi ekranında giriş yapın. İşiniz bitince tarayıcı penceresini kapatın.',flush=True)
                    await page.wait_for_event('close',timeout=1800000)
                finally:await context.close()
            return
        if not config.get('automationEnabled') and not check_provider:print('browser_automation_disabled');return
        results=[];deadline=time.monotonic()+260;words=config
        for account in [a for a in config['accounts'] if (check_provider and a['provider']==check_provider) or (not check_provider and a.get('enabled',True) and (provider is None or a['provider']==provider))][:12]:
            remaining=deadline-time.monotonic()
            if remaining<=5:
                results.append({'provider':account['provider'],'profileURL':account['profileURL'],'status':'time_budget','posts':[]});continue
            if account.get('needsAttention') and not check_provider and account['provider'] in ('x','instagram'):
                health=Health(DATA,account['provider'])
                async def collect_session():
                    return await asyncio.wait_for(collect(pw,account,words,session_check=True),timeout=min(50,remaining))
                probe=await probe_paused(account,DATA,collect_session,health.remaining)
                results.append(probe)
                print(json.dumps({'event':'session_recovery_probe','provider':account['provider'],'status':probe['status'],'retryInSeconds':probe.get('retryInSeconds',0),'sessionVerified':probe['status']=='session_ready'}),flush=True)
                continue
            profile=config.get('keywordProfiles',{}).get(account['provider'])
            account_words={**words,'keywordGroups':profile,'keywords':list(dict.fromkeys(term for group in profile for term in group.get('terms',[])))} if isinstance(profile,list) else words
            try:results.append(await asyncio.wait_for(collect(pw,account,account_words,session_check=bool(check_provider)),timeout=min(100 if account['provider']=='facebook' else 150 if account['provider']=='x' else 80,remaining)))
            except asyncio.TimeoutError:results.append({'provider':account['provider'],'profileURL':account['profileURL'],'status':'time_budget','posts':[]})
            except Exception:results.append({'provider':account['provider'],'profileURL':account['profileURL'],'status':'browser_error','posts':[]})
        if not check_provider:
            for result in results:
                if result['provider'] in ('x','instagram') and not result.get('sessionProbe'):
                    result['posts'],result['queuePending']=SearchQueue(DATA,result['profileURL']+('#ig-allowlist-v60' if result['provider']=='instagram' else '')).batch()
                    if result['posts'] and result['status'] in ('time_budget','browser_error','no_visible_results'):result['status']='partial'
        if check_provider:
            for result in results:
                result['posts']=[]
                if result['status'] in ['collected','no_visible_results','date_missing','selector_changed']:result['status']='session_ready' if result.get('sessionName') else 'session_unverified'
        from bridge_payload import bounded_payload
        payload=bounded_payload({'revision':config['revision'],'groupRevision':config.get('groupRevision',0),'results':[{k:v for k,v in row.items() if k!='sourceReads'} for row in results],'sessionCheck':bool(check_provider)})
        output=await asyncio.to_thread(bridge,payload)
        if any(r.get('provider')=='instagram' for r in results):
            _ig=[r for r in results if r.get('provider')=='instagram']
            _receipts=[p for p in (output.get('receipts') or []) if isinstance(p,dict)] if isinstance(output,dict) else []
            print(json.dumps({'event':'instagram_bridge_trace_v56','sentToBridge':sum(len(r.get('posts') or []) for r in payload.get('results',[]) if r.get('provider')=='instagram'),'roundStatuses':[r.get('status') for r in _ig],'receipts':sum(1 for r in _receipts if r.get('provider')=='instagram'),'acknowledged':sum(len(r.get('acknowledgedUrls') or []) for r in _receipts if r.get('provider')=='instagram'),'retry':sum(len(r.get('retryUrls') or []) for r in _receipts if r.get('provider')=='instagram')},ensure_ascii=False),flush=True)
        if check_provider and scan_pacing.confirmed_session_receipt(check_provider,results,output):
            scan_pacing.manual_verified(DATA,check_provider)
        if not check_provider and isinstance(output,dict):
            for result in results:
                receipt=next((r for r in output.get('receipts',[]) if r.get('provider')==result['provider'] and r.get('profileURL')==result['profileURL']),None)
                if receipt and not receipt.get('retryUrls'):checkpoint_commit(DATA,result['provider'],result.get('sourceReads',[]))
                if result['provider'] in ('x','instagram'):acknowledge(DATA,result,output,lambda root,url:SearchQueue(root,url+('#ig-allowlist-v60' if result['provider']=='instagram' else '')))
        from social_reader_repair import write_json
        write_json(DATA/('social-last-round-'+(provider or 'all')+'.json'),{'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'results':[{k:r.get(k) for k in ('provider','status','readCount','queuePending','durationMs','readerStatus','retryInSeconds')} for r in results],'accepted':output.get('accepted',0),'rejected':output.get('rejected',0),'receipts':output.get('receipts',[])})
        if any(r['provider']=='facebook' for r in results):
            from facebook_live_v4 import atomic
            report_path=DATA/'facebook-live-v4-report.json'
            try:
                report=json.loads(report_path.read_text(encoding='utf-8'))
                report['ingestion']='existing_bridge_completed'
                report['acceptedTotal']=output['accepted']
                report['rejectedTotal']=output['rejected']
                report['facebookRejectionReasons']=next((r.get('rejectionReasons',{}) for r in output.get('results',[]) if r.get('provider')=='facebook'),{})
                atomic(report_path,report)
            except (OSError,ValueError):pass
        print(json.dumps({'event':'browser_round_completed','accepted':output['accepted'],'rejected':output['rejected'],'accounts':len(results)}))

if __name__=='__main__':
    os.umask(0o077);parser=argparse.ArgumentParser();parser.add_argument('--login-index',type=int);parser.add_argument('--provider',choices=['x','facebook','instagram']);parser.add_argument('--check-provider',choices=['x','facebook','instagram']);args=parser.parse_args()
    if args.login_index is not None and not 1<=args.login_index<=12:parser.error('Hesap sırası 1–12 olmalı')
    try:
        provider_lock=args.provider or args.check_provider
        with profile_lock(DATA/'browser-global'):
            ticket=scan_pacing.begin(DATA,args.provider) if args.provider and args.login_index is None and args.check_provider is None else None
            if args.provider and args.login_index is None and args.check_provider is None and ticket is None:raise SystemExit(0)
            try:asyncio.run(run(args.login_index,args.provider,args.check_provider))
            finally:
                if ticket:scan_pacing.finish(DATA,ticket,scan_pacing.completed_outcome(DATA,args.provider,ticket['started']))
    except BlockingIOError:print('browser_busy: another browser session is active')
    except Exception as exc:
        if args.provider=='instagram':
            import traceback as _ig_tb
            _frames=[{'file':os.path.basename(f.filename),'function':f.name,'line':f.lineno} for f in _ig_tb.extract_tb(exc.__traceback__)[-10:]]
            print(json.dumps({'event':'instagram_worker_exception_v61','exceptionType':type(exc).__name__,'frames':_frames},ensure_ascii=False),flush=True)
        if args.provider=='x':
            import traceback as _x_tb
            _frames=[{'file':os.path.basename(f.filename),'function':f.name,'line':f.lineno} for f in _x_tb.extract_tb(exc.__traceback__)[-8:]]
            print(json.dumps({'event':'x_worker_exception_v1','exceptionType':type(exc).__name__,'frames':_frames},ensure_ascii=False),flush=True)
        print('browser_worker_failed: servis, tarayıcı kurulumu ve sunucu köprüsünü kontrol edin')
        raise SystemExit(1)

# UMRANIYE_OSINT_GUVENLI_V2_20261109_COLLECTOR
