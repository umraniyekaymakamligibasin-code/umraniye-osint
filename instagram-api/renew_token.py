"""Interactive, local-only replacement of the Instagram API credential."""
import getpass
import importlib.util
import json
import os
import pathlib
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
    token = getpass.getpass('Yeni Meta erisim anahtari (ekranda gorunmez): ').strip()
    if not token or any(c.isspace() for c in token):
        raise SystemExit('Bos/gecersiz giris; degisiklik yapilmadi.')
    s = importlib.util.spec_from_file_location('worker', '/opt/umraniye-osint-instagram-api/worker.py')
    w = importlib.util.module_from_spec(s)
    s.loader.exec_module(w)
    try:
        identity = w.graph(credentials['igUserId'], token, {'fields':'id'})
        if str(identity.get('id')) != str(credentials['igUserId']):
            raise ValueError('identity_mismatch')
        targets = json.loads(pathlib.Path('/opt/umraniye-osint-browser/.instagram-v60/targets.json').read_text())
        handles = w.active_handles(targets)
        if handles:
            check = w.graph(credentials['igUserId'], token, {'fields':'business_discovery.username('+handles[0]+'){username}'})
            if str((check.get('business_discovery') or {}).get('username','')).lower() != handles[0].lower():
                raise ValueError('discovery_permission_missing')
    except w.MetaError as e:
        raise SystemExit('Dogrulama basarisiz: Meta '+str(e.code)+'/'+str(e.subcode)+'. Degisiklik yapilmadi.')
    except Exception:
        raise SystemExit('Hesap/API yetkisi dogrulanamadi. Degisiklik yapilmadi.')
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
