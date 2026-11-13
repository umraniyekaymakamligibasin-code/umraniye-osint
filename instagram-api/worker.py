"""Instagram Graph API -> existing OSINT bridge. Standard library; no browser."""
import datetime as dt
import fcntl
import json
import os
import pathlib
import re
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request

VERSION = '1'
GRAPH = 'https://graph.facebook.com/v27.0/'
BRIDGE = 'http://127.0.0.1:3001/api/admin/integrations/browser-worker'
HANDLE = re.compile(r'^[a-z0-9_.]{1,30}$')
LINK = re.compile(r'^https://(?:www\.)?instagram\.com/(?:p|reel)/[A-Za-z0-9_-]+/?$')


def now():
    return time.time()


def iso(value=None):
    return dt.datetime.fromtimestamp(now() if value is None else value, dt.timezone.utc).isoformat()


def atomic(path, value):
    path = pathlib.Path(path)
    temp = path.with_suffix(path.suffix + '.tmp')
    with temp.open('w', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(temp, 0o600)
    os.replace(temp, path)


class MetaError(Exception):
    def __init__(self, error):
        self.code = error.get('code')
        self.subcode = error.get('error_subcode')
        self.details = str(error.get('message') or '')
        # No URLs, tokens or raw remote response enter status files/journal.
        super().__init__('meta_error_' + str(self.code) + '_' + str(self.subcode))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def json_request(url, headers=None, payload=None, timeout=18):
    allowed = urllib.parse.urlsplit(url)
    if not (allowed.scheme == 'https' and allowed.hostname == 'graph.facebook.com' and allowed.port in (None, 443)) and url != BRIDGE:
        raise ValueError('request_destination_denied')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    request = urllib.request.Request(url, data=None if payload is None else json.dumps(payload, ensure_ascii=False).encode(), headers=headers or {})
    try:
        with opener.open(request, timeout=timeout) as response:
            raw = response.read(4_000_001)
            if len(raw) > 4_000_000:
                raise ValueError('response_too_large')
            result = json.loads(raw)
    except urllib.error.HTTPError as error:
        try:
            raw = json.loads(error.read(65536))
        except Exception:
            raise RuntimeError('http_' + str(error.code)) from None
        finally:
            error.close()
        if isinstance(raw, dict) and isinstance(raw.get('error'), dict) and allowed.hostname == 'graph.facebook.com':
            raise MetaError(raw['error']) from None
        raise RuntimeError('http_' + str(error.code)) from None
    if not isinstance(result, dict):
        raise ValueError('response_not_object')
    if isinstance(result.get('error'), dict):
        raise MetaError(result['error'])
    return result


def graph(path, token, params=None):
    url = GRAPH + path
    if params:
        url += '?' + urllib.parse.urlencode(params)
    return json_request(url, {'Authorization': 'Bearer ' + token} if token else {})


def active_handles(targets):
    if targets.get('version') != 1 or not isinstance(targets.get('accounts'), list):
        raise ValueError('invalid_source_list')
    values = []
    for account in targets['accounts']:
        handle = account.get('handle', '')
        if not isinstance(handle, str) or not HANDLE.fullmatch(handle):
            raise ValueError('invalid_source_handle')
        if account.get('enabled') is True and handle not in values:
            values.append(handle)
    return values


def normalized(post, handle):
    text = str(post.get('caption') or '').strip()
    url = str(post.get('permalink') or '')
    if not LINK.fullmatch(url):
        return None, 'invalid_url'
    try:
        instant = dt.datetime.fromisoformat(post['timestamp'].replace('Z', '+00:00'))
        if instant.tzinfo is None:
            raise ValueError()
        published = instant.timestamp()
    except (KeyError, TypeError, ValueError):
        return None, 'date_missing'
    if published > now() + 300:
        return None, 'future_date'
    if len(text) < 8:
        return None, 'text_missing'
    return {'url': url, 'title': re.sub(r'\s+', ' ', text)[:240],
            'description': text[:3000], 'fullText': text[:6000],
            'sourceName': '@' + handle, 'publishedAt': iso(published),
            'collectionMethod': 'instagram_graph_api', 'apiMediaId': str(post.get('id', ''))}, None


class Worker:
    def __init__(self, directory, credentials, bridge_key, targets):
        self.directory = pathlib.Path(directory)
        self.credentials = credentials
        self.bridge_key = bridge_key
        self.handles = active_handles(targets)
        self.db = sqlite3.connect(self.directory / 'queue.sqlite')
        self.db.execute('CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY,handle TEXT NOT NULL,url TEXT,published REAL,discovered REAL NOT NULL,status TEXT NOT NULL,data TEXT)')
        self.db.execute('CREATE TABLE IF NOT EXISTS health(handle TEXT PRIMARY KEY,retry_at REAL NOT NULL,failures INTEGER NOT NULL,code TEXT)')
        self.db.execute('CREATE TABLE IF NOT EXISTS control(key TEXT PRIMARY KEY,value TEXT NOT NULL)')
        self.db.commit()

    def control(self, key, value=None):
        if value is not None:
            self.db.execute('INSERT OR REPLACE INTO control VALUES(?,?)', (key, json.dumps(value)))
            self.db.commit()
        row = self.db.execute('SELECT value FROM control WHERE key=?', (key,)).fetchone()
        return json.loads(row[0]) if row else None

    def panel_enabled(self):
        config = json_request(BRIDGE, {'X-OSINT-Browser-Key': self.bridge_key})
        return config.get('automationEnabled') is True and any(
            a.get('provider') == 'instagram' and a.get('enabled') is not False
            for a in config.get('accounts', []))

    def discover(self, handle, cursor=None):
        modifier = '.after(' + cursor + ')' if cursor else ''
        if cursor and not re.fullmatch(r'[A-Za-z0-9_=\-]+', cursor):
            raise ValueError('invalid_cursor')
        fields = 'business_discovery.username(' + handle + '){username,media.limit(25)' + modifier + '{id,caption,permalink,timestamp,media_type}}'
        result = graph(self.credentials['igUserId'], self.credentials['token'], {'fields': fields})
        source = result.get('business_discovery') or {}
        if str(source.get('username', '')).lower() != handle.lower():
            raise ValueError('source_identity_mismatch')
        return source.get('media') or {'data': []}

    def remember(self, handle, post):
        media_id = str(post.get('id') or '')
        if not media_id.isdigit():
            return 'invalid_id'
        old = self.db.execute('SELECT status FROM posts WHERE id=?', (media_id,)).fetchone()
        if old and old[0] not in ('text_missing', 'date_missing', 'future_date', 'invalid_url'):
            return 'known'
        item, reason = normalized(post, handle)
        published = None
        if item:
            published = dt.datetime.fromisoformat(item['publishedAt']).timestamp()
        status = reason or 'pending'
        if item and published < self.credentials['enabledSince']:
            status = 'baseline'
        elif item and now() - published > 3600:
            status = 'stale'
        self.db.execute('INSERT OR REPLACE INTO posts VALUES(?,?,?,?,?,?,?)',
                        (media_id, handle, post.get('permalink'), published, now(), status,
                         json.dumps(item, ensure_ascii=False) if item else None))
        self.db.commit()
        return status

    def drain(self):
        # Recheck current source state and freshness, including after a local outage.
        self.db.execute("UPDATE posts SET status='stale' WHERE status='pending' AND published<?", (now() - 3600,))
        self.db.commit()
        if not self.handles:
            return {'status': 'no_active_sources', 'submitted': 0}
        marks = ','.join('?' for _ in self.handles)
        rows = self.db.execute("SELECT id,url,data FROM posts WHERE status='pending' AND handle IN (" + marks + ') ORDER BY published DESC LIMIT 20', self.handles).fetchall()
        if not rows:
            return {'status': 'no_fresh_pending', 'submitted': 0}
        posts = []
        for row in rows:
            candidate = json.loads(row[2])
            if len(json.dumps(posts + [candidate], ensure_ascii=False).encode()) > 50000:
                break
            posts.append(candidate)
        receipt, match = self.submit(posts, len(posts))
        if match is None:
            return {'status': 'panel_collection_disabled', 'submitted': 0}
        # A permanent policy rejection is also acknowledged by the existing bridge.
        # Never acknowledge merely because the HTTP request returned 200.
        acknowledged = set(match.get('acknowledgedUrls') or []) - set(match.get('retryUrls') or [])
        sent = {p['url'] for p in posts}
        for media_id, url, data in rows:
            if url in acknowledged and url in sent:
                self.db.execute("UPDATE posts SET status='acknowledged' WHERE id=?", (media_id,))
        self.db.commit()
        return {'status': 'bridge_acknowledged', 'submitted': len(posts), 'acknowledged': len(acknowledged & sent),
                'accepted': receipt.get('accepted', 0), 'rejected': receipt.get('rejected', 0)}

    def submit(self, posts, read_count, status='collected'):
        headers = {'X-OSINT-Browser-Key': self.bridge_key, 'Content-Type': 'application/json'}
        config = json_request(BRIDGE, headers)
        account = next((a for a in config.get('accounts', []) if a.get('provider') == 'instagram'), None)
        if not config.get('automationEnabled') or not account or account.get('enabled') is False:
            return {}, None
        result = {'provider': 'instagram', 'profileURL': account['profileURL'], 'status': status,
                  'sessionName': 'Instagram Graph API', 'readCount': read_count, 'posts': posts,
                  'terms': ['Instagram Graph API'], 'readerObservation': {'postsRead': read_count, 'datedPosts': read_count}}
        payload = {'revision': config['revision'], 'groupRevision': config.get('groupRevision', 0), 'results': [result]}
        receipt = json_request(BRIDGE, headers, payload, timeout=45)
        match = next((r for r in receipt.get('receipts', []) if r.get('provider') == 'instagram' and r.get('profileURL') == account['profileURL']), None)
        if not receipt.get('ok') or match is None:
            raise ValueError('bridge_receipt_missing')
        return receipt, match

    def run(self):
        started = now()
        report = {'at': iso(), 'transport': 'instagram_graph_api', 'activeSources': len(self.handles),
                  'sources': [], 'ingestion': [], 'browserStarted': False}
        report['tokenExpiresAt'] = iso(self.credentials['expiresAt']) if self.credentials.get('expiresAt') else None
        report['tokenRenewalDue'] = bool(self.credentials.get('expiresAt') and self.credentials['expiresAt'] - now() < 7 * 86400)
        fingerprint = __import__('hashlib').sha256(self.credentials['token'].encode()).hexdigest()
        gate = self.control('global_pause') or {}
        if gate.get('fingerprint') == fingerprint and (gate.get('authRequired') or gate.get('retryAt', 0) > now()):
            report['status'] = 'token_renewal_required' if gate.get('authRequired') else 'api_backoff'
            report['retryAt'] = iso(gate['retryAt']) if gate.get('retryAt') else None
            report['pauseReason'] = 'token_renewal_required' if gate.get('authRequired') else 'meta_rate_limit'
            report['pauseCode'] = gate.get('code')
            report['pending'] = self.db.execute("SELECT count(*) FROM posts WHERE status='pending'").fetchone()[0]
            if gate.get('authRequired'):
                try:
                    self.submit([], 0, 'login_required')
                except Exception:
                    pass
            return report
        if self.credentials.get('expiresAt') and self.credentials['expiresAt'] <= now():
            report['status'] = 'token_expired'
            try:
                self.submit([], 0, 'login_required')
            except Exception:
                pass
            return report
        report['tokenExpiresAt'] = iso(self.credentials['expiresAt']) if self.credentials.get('expiresAt') else None
        report['tokenRenewalDue'] = bool(self.credentials.get('expiresAt') and self.credentials['expiresAt'] - now() < 7 * 86400)
        if not self.panel_enabled():
            report['status'] = 'panel_paused'
            return report
        rotation = int(self.control('rotation') or 0) % max(1, len(self.handles))
        all_order = self.handles[rotation:] + self.handles[:rotation]
        order = all_order[:3]
        report['sourceBudgetPerRound'] = 3
        report['deferredSources'] = max(0, len(all_order)-len(order))
        attempted = 0
        for handle in order:
            if now() - started > 150:
                report['timeBudgetReached'] = True
                break
            health = self.db.execute('SELECT retry_at,failures,code FROM health WHERE handle=?', (handle,)).fetchone()
            if health and health[0] > now():
                match = re.fullmatch(r'meta_error_(\d+)_(\d+)', str(health[2]))
                report['sources'].append({'handle': handle, 'status': 'backoff', 'retryAt': iso(health[0]), 'code': int(match[1]) if match else None, 'subcode': int(match[2]) if match else None})
                continue
            attempted += 1
            row = {'handle': handle, 'read': 0, 'newPending': 0, 'status': 'readable', 'reasons': {}}
            try:
                cursor = None
                for page in range(3):
                    media = self.discover(handle, cursor)
                    posts = media.get('data') or []
                    if not isinstance(posts, list):
                        raise ValueError('invalid_media_response')
                    row['read'] += len(posts)
                    for post in posts:
                        status = self.remember(handle, post)
                        row['reasons'][status] = row['reasons'].get(status, 0) + 1
                        row['newPending'] += status == 'pending'
                    cursor = (media.get('paging') or {}).get('cursors', {}).get('after')
                    # Do not assume API result order: inspect all bounded pages.
                    if not cursor or len(posts) < 25:
                        break
                    if now() - started > 150:
                        row['paginationDeferred'] = True
                        break
                else:
                    row['paginationLimitReached'] = bool(cursor)
                self.db.execute('DELETE FROM health WHERE handle=?', (handle,))
                self.db.commit()
            except MetaError as error:
                row.update(status='api_error', code=error.code, subcode=error.subcode)
                if error.code == 190:
                    self.control('global_pause', {'fingerprint': fingerprint, 'authRequired': True})
                    report['status'] = 'token_renewal_required'
                    try:
                        self.submit([], 0, 'login_required')
                    except Exception:
                        pass
                    report['sources'].append(row)
                    break
                if error.code in (4, 17, 32, 613):
                    retry_at = now() + 3600
                    self.control('global_pause', {'fingerprint': fingerprint, 'retryAt': retry_at, 'code': error.code})
                    report.update(retryAt=iso(retry_at), pauseReason='meta_rate_limit', pauseCode=error.code)
                    report['status'] = 'api_rate_limited'
                    report['sources'].append(row)
                    break
                failures = (health[1] if health else 0) + 1
                wait = 86400 if error.subcode == 2207013 else min(86400, 300 * 2 ** min(failures, 8))
                self.db.execute('INSERT OR REPLACE INTO health VALUES(?,?,?,?)', (handle, now()+wait, failures, str(error)))
                self.db.commit()
            except Exception as error:
                row.update(status='read_error', errorType=type(error).__name__)
            report['sources'].append(row)
            time.sleep(0.5)
        self.control('rotation', rotation + max(1, attempted))
        total_read = sum(r.get('read', 0) for r in report['sources'])
        if total_read and report.get('status') != 'token_renewal_required':
            try:
                _, receipt = self.submit([], total_read, 'filtered_no_eligible_posts')
                report['panelHealthUpdated'] = receipt is not None
            except Exception:
                report['panelHealthUpdated'] = False
        for _ in range(0 if report.get('status') == 'token_renewal_required' else 4):
            try:
                outcome = self.drain()
                report['ingestion'].append(outcome)
                if outcome.get('submitted', 0) == 0 or outcome.get('acknowledged', 0) == 0:
                    break
            except Exception as error:
                report['ingestion'].append({'status': 'bridge_pending_retry', 'errorType': type(error).__name__})
                break
        # Six-month approximation for the private dedup queue only; main retention is unchanged.
        self.db.execute('DELETE FROM posts WHERE discovered<?', (now()-184*86400,))
        self.db.commit()
        report['pending'] = self.db.execute("SELECT count(*) FROM posts WHERE status='pending'").fetchone()[0]
        report.setdefault('status', 'completed')
        return report


def main():
    directory = pathlib.Path(os.environ.get('STATE_DIRECTORY', '/var/lib/umraniye-osint-instagram-api'))
    credentials_dir = pathlib.Path(os.environ['CREDENTIALS_DIRECTORY'])
    with (directory / 'run.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        try:
            credentials = json.loads((credentials_dir / 'token.json').read_text())
            targets = json.loads((credentials_dir / 'targets.json').read_text())
            key = (credentials_dir / 'bridge.key').read_bytes().hex()
            worker = Worker(directory, credentials, key, targets)
            try:
                report = worker.run()
            finally:
                worker.db.close()
        except Exception as error:
            report = {'at': iso(), 'status': 'collector_error', 'errorType': type(error).__name__}
        report['completedAt'] = iso()
        atomic(directory / 'status.json', report)
        print(json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
