
import re
import time
import urllib.parse
import dateparser

DATE_RE = re.compile(
    r"^\s*(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+"
    r"(\d{4})\s+(Pazartesi|Salı|Çarşamba|Perşembe|"
    r"Cuma|Cumartesi|Pazar),\s*(\d{1,2}):(\d{2})\s*$",
    re.IGNORECASE
)

WEEKDAYS = {
    "pazartesi": 0, "salı": 1, "çarşamba": 2,
    "perşembe": 3, "cuma": 4, "cumartesi": 5,
    "pazar": 6
}

JS = r"""() => {

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

  const re = /^\s*\d{1,2}\s+(?:Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+20\d{2}\s+(?:Pazartesi|Salı|Çarşamba|Perşembe|Cuma|Cumartesi|Pazar),\s*\d{1,2}:\d{2}\s*$/i;
  const attrs = ['aria-describedby','aria-labelledby',
                 'aria-controls','aria-owns'];
  const anchors = [...document.querySelectorAll('a[href]')];
  const result = [];

  for (const el of document.querySelectorAll('div[aria-hidden="true"][id]')) {
    const date = (el.textContent || '').trim();
    if (!re.test(date) || !/^[A-Za-z0-9_-]+$/.test(el.id)) continue;

    const matching = [];
    for (const a of anchors) {
      const attr = attrs.find(k =>
        (a.getAttribute(k) || '').split(/\s+/).includes(el.id)
      );
      if (attr) matching.push({a,attr});
    }
    if (matching.length !== 1) continue;

    const {a,attr} = matching[0];
    let u;
    try { u = new URL(a.href); } catch { continue; }
    if (u.protocol !== 'https:' ||
        !['facebook.com','www.facebook.com','m.facebook.com'].includes(u.hostname))
      continue;

    let card = '';
    for (let p = a, depth = 0; p && depth < 28;
         p = p.parentElement, depth++) {
      const content = osintFbMessage(p);
      if (content.length < 80 || content.length > 1600 ||
          content.includes('Arama Sonuçları')) continue;

      const otherDates = [...p.querySelectorAll('div[aria-hidden="true"][id]')]
        .filter(n => re.test((n.textContent || '').trim()));
      if (otherDates.length > 1) continue;

      card = content;
      break;
    }

    if (!card) continue;
    result.push({id:el.id, attr, date, text:card});
    if (result.length >= 12) break;
  }

  // Kesin tarihli, dogrudan baglantili gonderiler icin yedek yol.
  const trDate = /^\s*\d{1,2}\s+(?:Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+20\d{2}(?:\s+(?:Pazartesi|Salı|Çarşamba|Perşembe|Cuma|Cumartesi|Pazar))?,?\s+\d{1,2}:\d{2}\s*$/iu;
  const isoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/i;

  function postURL(value) {
    try {
      const u = new URL(value);
      if (u.protocol !== 'https:' ||
          !['facebook.com','www.facebook.com','m.facebook.com'].includes(u.hostname))
        return null;
      if (/^\/[a-z0-9._-]+\/posts\/[a-z0-9]+\/?$/i.test(u.pathname) ||
          /^\/permalink\/[a-z0-9]+\/?$/i.test(u.pathname))
        return 'https://www.facebook.com' + u.pathname.replace(/\/$/,'');
    } catch {}
    return null;
  }

  function absoluteDates(node) {
    const dates = new Set();
    const fields = node.querySelectorAll(
      'time[datetime],abbr[data-utime],a[aria-label],a[title],' +
      'div[aria-label],div[title],span[aria-label],span[title]'
    );

    for (const el of [...fields].slice(0,70)) {
      const values = [
        el.getAttribute('datetime'),
        el.getAttribute('aria-label'),
        el.getAttribute('title')
      ];

      if (el.matches('time,abbr'))
        values.push(el.textContent);

      for (const raw of values) {
        const value = String(raw || '').trim();
        if (trDate.test(value) || isoDate.test(value))
          dates.add(value);
      }

      if (el.hasAttribute('data-utime')) {
        const raw = el.getAttribute('data-utime');
        if (/^\d{10}$/.test(raw || '')) {
          const seconds = Number(raw);
          if (seconds >= 1000000000 && seconds < 4102444800)
            dates.add(new Date(seconds * 1000).toISOString());
        }
      }
    }

    return [...dates];
  }

  let inspected = 0;
  const directSeen = new Set();

  for (const anchor of anchors) {
    if (++inspected > 350 || result.length >= 12) break;

    const url = postURL(anchor.href);
    if (!url || directSeen.has(url)) continue;

    for (let card = anchor, depth = 0;
         card && depth < 8;
         card = card.parentElement, depth++) {

      const text = (card.innerText || '')
        .replace(/\s+/g,' ').trim();

      if (text.length < 60 || text.length > 1600) continue;

      const urls = new Set(
        [...card.querySelectorAll('a[href]')]
          .map(a => postURL(a.href))
          .filter(Boolean)
      );

      // Birden cok farkli gonderi varsa tarih eslestirme.
      if (urls.size !== 1 || !urls.has(url)) continue;

      const dates = absoluteDates(card);

      // Birden fazla farkli tarih varsa belirsiz kabul et.
      if (dates.length !== 1) continue;

      result.push({
        url: url,
        date: dates[0],
        text: text,
        kind: 'direct_explicit_date'
      });
      directSeen.add(url);
      break;
    }
  }

  return result;
}"""

def _osint_original_parse_timestamp(value):
    if not isinstance(value, str):
        return None

    match = DATE_RE.fullmatch(value)
    if not match:
        return None

    parsed = dateparser.parse(
        value,
        languages=["tr"],
        settings={
            "TIMEZONE": "Europe/Istanbul",
            "RETURN_AS_TIMEZONE_AWARE": True
        }
    )

    if parsed is None or parsed.tzinfo is None:
        return None

    if parsed.weekday() != WEEKDAYS[match.group(4).casefold()]:
        return None

    if (parsed.hour, parsed.minute) != (
        int(match.group(5)), int(match.group(6))
    ):
        return None

    return parsed.isoformat(timespec="seconds")


# OSINT_EXPLICIT_DATE_V2
def parse_timestamp(value):
    import datetime
    import re
    from zoneinfo import ZoneInfo

    original=_osint_original_parse_timestamp(value)
    if original:
        return original

    if not isinstance(value,str) or len(value)>120:
        return None

    value=value.strip()
    local=ZoneInfo("Europe/Istanbul")

    # Saat dilimi acikca belirtilmis ISO yayin tarihi.
    if re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}"
        r"(?::\d{2}(?:\.\d{1,6})?)?"
        r"(?:Z|[+-]\d{2}:\d{2})",
        value,re.I
    ):
        try:
            d=datetime.datetime.fromisoformat(
                value.replace("Z","+00:00")
            )
            if d.tzinfo is None:
                return None
            return d.astimezone(local).isoformat(
                timespec="seconds"
            )
        except ValueError:
            return None

    months={
        "ocak":1,"şubat":2,"mart":3,"nisan":4,
        "mayıs":5,"haziran":6,"temmuz":7,"ağustos":8,
        "eylül":9,"ekim":10,"kasım":11,"aralık":12
    }
    weekdays={
        "pazartesi":0,"salı":1,"çarşamba":2,
        "perşembe":3,"cuma":4,"cumartesi":5,"pazar":6
    }

    match=re.fullmatch(
        r"(\d{1,2})\s+"
        r"(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|"
        r"Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)"
        r"\s+(\d{4})"
        r"(?:\s+(Pazartesi|Salı|Çarşamba|Perşembe|"
        r"Cuma|Cumartesi|Pazar))?"
        r",?\s+(\d{1,2}):(\d{2})",
        value,re.I
    )
    if not match:
        return None

    day,month,year,weekday,hour,minute=match.groups()

    try:
        d=datetime.datetime(
            int(year),months[month.casefold()],int(day),
            int(hour),int(minute),tzinfo=local
        )
        if weekday is not None:
            if d.weekday()!=weekdays[weekday.casefold()]:
                return None
        return d.isoformat(timespec="seconds")
    except (ValueError,KeyError):
        return None

def canonical_post_url(value):
    try:
        u = urllib.parse.urlsplit(value)
        if (u.scheme != "https" or u.hostname not in
            ("facebook.com", "www.facebook.com", "m.facebook.com")
            or u.port or u.username or u.password):
            return None

        if re.search(r"/(?:posts|permalink)/[A-Za-z0-9]+/?$", u.path):
            return "https://www.facebook.com" + u.path.rstrip("/")

        if u.path in ("/story.php", "/photo.php"):
            key = "story_fbid" if u.path == "/story.php" else "fbid"
            ids = urllib.parse.parse_qs(u.query).get(key, [])
            if len(ids) == 1 and re.fullmatch(r"[A-Za-z0-9]+", ids[0]):
                return (
                    "https://www.facebook.com" + u.path + "?" +
                    urllib.parse.urlencode({key: ids[0]})
                )
    except (ValueError, TypeError):
        pass
    return None

async def read_dated_posts(page, local_context, valid_date):
    output = []
    seen = set()
    search_url = page.url
    started = time.monotonic()

    for _ in range(2):
        if time.monotonic() - started > 15:
            break

        try:
            candidates = await page.evaluate(JS)
            import json
            print(json.dumps({
                "event":"facebook_explicit_date_scan",
                "candidates":len(candidates),
                "direct_urls":sum(
                    1 for row in candidates if row.get("url")
                )
            }),flush=True)
        except Exception:
            break

        options = []

        for row in candidates:
            timestamp = parse_timestamp(row.get("date", ""))
            body = row.get("text", "")
            key = (row.get("date", ""), body[:120])

            if not timestamp or not valid_date(timestamp):
                continue
            if not local_context(body):
                continue
            if key in seen:
                continue

            if row.get("url"):
                direct=canonical_post_url(row["url"])
                if direct:
                    seen.add(key)
                    output.append({
                        "url":direct,
                        "title":body[:240],
                        "description":body[:800],
                        "sourceName":"",
                        "publishedAt":timestamp
                    })
                continue

            options.append((timestamp, row, key))

        if not options:
            break

        options.sort(key=lambda item: item[0], reverse=True)
        timestamp, row, key = options[0]
        seen.add(key)

        try:
            attr = row["attr"]
            target_id = row["id"]
            if attr not in (
                "aria-describedby", "aria-labelledby",
                "aria-controls", "aria-owns"
            ):
                break

            selector = f'a[{attr}~="{target_id}"]'
            await page.locator(selector).first.click(timeout=8000)
            await page.wait_for_timeout(500)

            url = canonical_post_url(page.url)

            if not url:
                try:
                    await page.wait_for_url(
                        lambda u: canonical_post_url(str(u)) is not None,
                        timeout=3500
                    )
                except Exception:
                    pass
                url = canonical_post_url(page.url)

            if url:
                body = row["text"]
                output.append({
                    "url": url,
                    "title": body[:240],
                    "description": body[:800],
                    "sourceName": "",
                    "publishedAt": timestamp
                })

        except Exception:
            pass

        finally:
            if page.url != search_url:
                try:
                    await page.go_back(
                        wait_until="domcontentloaded",
                        timeout=8000
                    )
                except Exception:
                    try:
                        await page.goto(
                            search_url,
                            wait_until="commit",
                            timeout=8000
                        )
                    except Exception:
                        break

                await page.wait_for_timeout(800)
                await page.mouse.wheel(0, 650)
            else:
                break

    return output
