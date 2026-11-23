"""Interactive, local-only replacement of the Instagram API credential."""
import getpass
import importlib.util
import json
import os
import pathlib
import re
import shutil
import sqlite3
import subprocess
import sys
import time

def main():
    if os.geteuid() != 0 or not sys.stdin.isatty():
        raise SystemExit('Run with sudo in an interactive SSH terminal.')
    path = pathlib.Path('/etc/umraniye-osint-instagram-api/credentials.json')
    credentials = json.loads(path.read_text())
    token = getpass.getpass('Yeni Meta erisim anahtari (ekranda gorunmez): ')
    token = token.strip()
    # Some terminals include bracketed-paste delimiters in getpass input.
    if token.startswith('\x1b[200~') and token.endswith('\x1b[201~'):
        token = token[6:-6].strip()
    # Remove only matching outer quotation marks; never alter internal token bytes.
    if len(token) >= 2 and token[0] == token[-1] and token[0] in ('"', "'"):
        token = token[1:-1].strip()
    if not token or len(token) > 16384 or not token.isascii() or any(ord(c)<33 or ord(c)>126 for c in token):
        controls = sum(ord(c)<32 or ord(c)==127 for c in token)
        nonascii = sum(ord(c)>127 for c in token)
        spaces = sum(c.isspace() for c in token)
        raise SystemExit('Giris HTTP basligina uygun degil. Uzunluk='+str(len(token))+'; kontrol_karakteri='+str(controls)+'; ascii_disi='+str(nonascii)+'; bosluk='+str(spaces)+'. Anahtar gosterilmedi ve kaydedilmedi.')
    s = importlib.util.spec_from_file_location('worker', '/opt/umraniye-osint-instagram-api/worker.py')
    w = importlib.util.module_from_spec(s)
    s.loader.exec_module(w)
    def checked_graph(*args, **kwargs):
        for attempt in range(3):
            try:
                return w.graph(*args, **kwargs)
            except RuntimeError as error:
                if str(error) == 'http_400':
                    # Inspect only response structure, never print raw remote content or token.
                    import urllib.request, urllib.error, urllib.parse
                    url = w.GRAPH + str(args[0]) + '?' + urllib.parse.urlencode(args[2] if len(args)>2 else kwargs.get('params', {}))
                    request = urllib.request.Request(url, headers={'Authorization':'Bearer '+args[1]})
                    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), w.NoRedirect())
                    try:
                        with opener.open(request, timeout=18) as response:
                            return json.loads(response.read(4000000))
                    except urllib.error.HTTPError as response:
                        raw = response.read(65536)
                        kind = 'json' if 'json' in response.headers.get('Content-Type','').lower() else 'html' if 'html' in response.headers.get('Content-Type','').lower() else 'other'
                        try:
                            obj = json.loads(raw)
                        except (ValueError, UnicodeError):
                            obj = {}
                        err = obj.get('error') if isinstance(obj,dict) else None
                        if isinstance(err,dict):
                            raise w.MetaError(err) from None
                        low = raw.lower()
                        category = 'header_too_large' if b'header' in low and (b'large' in low or b'long' in low) else 'invalid_request' if b'bad request' in low else 'unclassified'
                        print('Guvenli tani: HTTP='+str(response.code)+'; yanit='+kind+'; sinif='+category+'; anahtar_uzunlugu='+str(len(token)))
                        response.close()
                    raise
                if str(error) not in ('http_429', 'http_500', 'http_502', 'http_503', 'http_504') or attempt == 2:
                    raise
                print('Meta gecici HTTP hatasi; yeniden deneniyor ('+str(attempt+1)+'/2).')
                time.sleep(2 * (attempt + 1))

    stage = 'instagram_hesap_kontrolu'
    try:
        identity = checked_graph(credentials['igUserId'], token, {'fields':'id'})
        if str(identity.get('id')) != str(credentials['igUserId']):
            raise ValueError('identity_mismatch')
        stage = 'yerel_kaynak_listesi'
        targets = json.loads(pathlib.Path('/opt/umraniye-osint-browser/.instagram-v60/targets.json').read_text())
        handles = w.active_handles(targets)
        if handles:
            stage = 'kaynak_okuma_yetkisi'
            check = checked_graph(credentials['igUserId'], token, {'fields':'business_discovery.username('+handles[0]+'){username}'})
            if str((check.get('business_discovery') or {}).get('username','')).lower() != handles[0].lower():
                raise ValueError('discovery_permission_missing')
    except w.MetaError as e:
        raise SystemExit('Dogrulama basarisiz: Meta '+str(e.code)+'/'+str(e.subcode)+'. Degisiklik yapilmadi.')
    except Exception as e:
        # Never display remote messages, URLs, credentials, or arbitrary exception text.
        reason = str(e) if (isinstance(e, ValueError) and str(e) in ('identity_mismatch', 'discovery_permission_missing', 'invalid_source_list', 'invalid_source_handle')) or (isinstance(e, RuntimeError) and re.fullmatch(r'http_[0-9]{3}', str(e))) else type(e).__name__
        detail = getattr(e, 'reason', None)
        if detail is not None:
            reason += '/' + type(detail).__name__
        raise SystemExit('Dogrulama durdu. Asama: '+stage+'; hata: '+reason+'. Anahtar kaydedilmedi; mevcut ayarlar degismedi.')
    # Never infer a new token's expiry from the previous token.
    credentials.update(token=token, expiresAt=None)
    subprocess.run(['systemctl','stop','umraniye-osint-instagram-api.timer'],check=True)
    try:
        subprocess.run(['systemctl','stop','umraniye-osint-instagram-api.service'],check=True)
        backup = path.with_name('credentials.backup-'+str(int(time.time()))+'.json')
        fd = os.open(backup, os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600)
        with os.fdopen(fd,'wb') as stream:
            stream.write(path.read_bytes())
        w.atomic(path, credentials)
        db = sqlite3.connect('/var/lib/umraniye-osint-instagram-api/queue.sqlite')
        try:
            db.execute("DELETE FROM health WHERE code='meta_error_110_2207013'")
            db.commit()
        finally:
            db.close()
        print('Anahtar dogrulandi ve kaydedildi; kaynaklar yeniden kontrol edilecek.')
    finally:
        subprocess.run(['systemctl','start','umraniye-osint-instagram-api.timer'],check=True)
    subprocess.run(['systemctl','start','umraniye-osint-instagram-api.service'],check=True)
    status = json.loads(pathlib.Path('/var/lib/umraniye-osint-instagram-api/status.json').read_text())
    print('Tarama sonucu:',status.get('status'),'Okunan kaynak:',status.get('readSources',0))

if __name__ == '__main__':
    main()
