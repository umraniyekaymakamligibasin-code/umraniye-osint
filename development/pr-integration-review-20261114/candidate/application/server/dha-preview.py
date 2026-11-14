import re, html, subprocess
from urllib.parse import urljoin

BASE = "https://www.dha.com.tr"
ARCHIVE = BASE + "/istanbul/umraniye-haber/"

def fetch(url):
    return subprocess.check_output(
        ["curl", "-fsSL", "--proto", "=https", "--proto-redir", "=https", "--max-redirs", "5", "--max-time", "15", url],
        text=True, timeout=20
    )

page = fetch(ARCHIVE)
cards = re.split(r'<div class="news__item\b', page)[1:]
found = 0

for card in cards:
    m = re.search(
        r'<a href="(/[^"]+)" title="([^"]+)"[^>]*class="news__link"',
        card
    )
    if not m:
        continue

    title = html.unescape(m.group(2))
    if not any(x in title.casefold() for x in ("ümraniye", "dudullu")):
        continue

    url = urljoin(BASE, m.group(1))
    article = fetch(url)
    date = re.search(r'"datePublished"\s*:\s*"([^"]+)"', article)
    if not date:
        continue

    print("HABER:", title)
    print("YAYIN:", date.group(1))
    print("KAYNAK:", url)
    print("---")

    found += 1
    if found == 3:
        break

print("DOGRULANAN HABER:", found)
