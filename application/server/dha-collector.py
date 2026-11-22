import sys
import re
import html
import json
import hashlib
import sqlite3
import subprocess
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from urllib.parse import urljoin

BASE = "https://www.dha.com.tr"
PAGES = [
    BASE + "/istanbul/umraniye-haber/",
    BASE + "/haberleri/umraniye",
]
DB = "/var/lib/umraniye-osint-deneme/osint.sqlite"
SOURCE = "dha-direct"
LOCAL = ZoneInfo("Europe/Istanbul")
NOW = datetime.now(LOCAL)
CUTOFF = (NOW - timedelta(days=7)).date()

def fetch(url):
    if not url.startswith(BASE + "/"):
        raise ValueError("Izin verilmeyen adres")
    return subprocess.check_output(
        ["curl", "-fsSL", "--max-time", "18",
         "--max-filesize", "2000000", url],
        text=True, timeout=23
    )

def candidates():
    found = {}
    # Her liste sayfası başarılıysa bir kez indirilir; yalnız hata durumunda bir kez
    # yeniden denenir (önceden PAGES + PAGES ile her sayfa koşulsuz iki kez çekiliyordu).
    for page_url in PAGES:
        page = None
        for _attempt in range(2):
            try:
                page = fetch(page_url)
                break
            except Exception as exc:
                print("KAYNAK HATASI:", page_url, str(exc)[:100])
        if page is None:
            continue

        blocks = re.split(r'<div class="news__item\b', page)[1:]

        for block in blocks:
            m = re.search(
                r'<a href="(/[^"]+)" title="([^"]+)"'
                r'[^>]*class="news__link"',
                block
            )
            if not m:
                continue

            title = html.unescape(m.group(2)).strip()
            folded = title.casefold()

            if not any(term in folded for term in
                       ("ümraniye", "umraniye", "dudullu")):
                continue

            plain = html.unescape(re.sub(r"<[^>]*>", " ", block))
            dm = re.search(
                r'\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b',
                plain
            )
            if not dm:
                continue

            try:
                listing_day = datetime(
                    int(dm[3]), int(dm[2]), int(dm[1])
                ).date()
            except ValueError:
                continue

            if listing_day < CUTOFF or listing_day > NOW.date():
                continue

            url = urljoin(BASE, m.group(1))
            if not url.startswith(BASE + "/"):
                continue

            found[url] = (listing_day, title)

    return sorted(
        [(day, title, url) for url, (day, title) in found.items()],
        reverse=True
    )

def article_data(title, url):
    page = fetch(url)

    m = re.search(
        r'"datePublished"\s*:\s*"([^"]+)"',
        page
    )
    if not m:
        return None

    published = datetime.fromisoformat(m.group(1))
    if published.tzinfo is None:
        return None

    if published.astimezone(LOCAL).date() < CUTOFF:
        return None

    d = re.search(
        r'"description"\s*:\s*"((?:\\.|[^"\\])*)"',
        page
    )

    description = title
    if d:
        try:
            description = json.loads('"' + d.group(1) + '"')
        except (ValueError, TypeError):
            pass

    description = re.sub(
        r'\s+', ' ',
        html.unescape(re.sub(r'<[^>]+>', ' ', str(description)))
    ).strip()[:350]

    timestamp = published.astimezone(timezone.utc)
    iso = timestamp.isoformat(
        timespec="milliseconds"
    ).replace("+00:00", "Z")

    return iso, description

def main():
    entries = candidates()
    print("DHA YEREL HABER ADAYLARI:", len(entries))

    if not entries:
        raise RuntimeError("Guncel yerel haber bulunamadi")

    dry = "--dry-run" in sys.argv
    checked = added = 0

    db = sqlite3.connect(DB, timeout=20) if not dry else None

    try:
        for _, title, url in entries:
            item_id = "dha-" + hashlib.sha256(
                url.encode()
            ).hexdigest()[:24]

            if db and db.execute(
                "SELECT 1 FROM lab_items WHERE id=?",
                (item_id,)
            ).fetchone():
                continue

            if checked >= (3 if dry else 8):
                break

            checked += 1

            try:
                data = article_data(title, url)
            except Exception as exc:
                print("HABER OKUMA HATASI:", str(exc)[:120])
                continue

            if not data:
                continue

            published_at, description = data

            print("HABER:", title)
            print("YAYIN:", published_at)
            print("LINK:", url)

            if dry:
                continue

            timestamp = datetime.now(timezone.utc).isoformat(
                timespec="milliseconds"
            ).replace("+00:00", "Z")

            record = {
                "id": item_id,
                "sourceId": SOURCE,
                "sourceName": "Demirören Haber Ajansı (DHA)",
                "title": title,
                "description": description,
                "url": url,
                "publishedAt": published_at,
                "datePrecision": "minute",
                "collectedAt": timestamp,
                "firstSeenAt": timestamp,
                "social": False,
                "priorityLevel": "P3",
                "notificationEligible": False,
                "sources": [{
                    "sourceId": SOURCE,
                    "sourceName": "Demirören Haber Ajansı (DHA)",
                    "url": url,
                    "publishedAt": published_at
                }]
            }

            with db:
                result = db.execute(
                    """INSERT OR IGNORE INTO lab_items
                    (id,source_id,data,published_at,collected_at)
                    VALUES (?,?,?,?,?)""",
                    (item_id, SOURCE, json.dumps(
                        record, ensure_ascii=False
                    ), published_at, timestamp)
                )
                added += result.rowcount

        if db:
            with db:
                db.execute(
                    """INSERT INTO lab_source_health
                    (id,status,item_count,checked_at)
                    VALUES (?,?,?,?)
                    ON CONFLICT(id) DO UPDATE SET
                    status=excluded.status,
                    item_count=excluded.item_count,
                    checked_at=excluded.checked_at""",
                    (
                        SOURCE,
                        "healthy" if entries else "no_match",
                        added,
                        datetime.now(timezone.utc).isoformat()
                    )
                )

        print("OKUNAN:", checked)
        if not dry:
            print("YENI KAYIT:", added)
    finally:
        if db:
            db.close()

if __name__ == "__main__":
    main()
