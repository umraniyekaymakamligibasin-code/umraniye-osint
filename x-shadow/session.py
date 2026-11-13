"""One manually supplied independent session, entered only in a real terminal."""
import argparse, asyncio, getpass, json, os, re, sys
from pathlib import Path
from worker import locked,isolated_environment

async def add(state):
    if not sys.stdin.isatty():raise RuntimeError('interactive_terminal_required')
    if (state/'accounts.sqlite').exists():raise RuntimeError('session_already_exists_no_automatic_replacement')
    print('Mevcut OSINT hesabından FARKLI, size ait ayrı X hesabının oturumunu kullanın. Şifre gerekmez.')
    if input('Ayrı hesap olduğunu onaylamak için AYRI yazın: ').strip()!='AYRI':raise RuntimeError('cancelled')
    username=input('Ayrı X kullanıcı adı (@ olmadan): ').strip()
    if not re.fullmatch(r'[A-Za-z0-9_]{1,15}',username):raise RuntimeError('invalid_username')
    token=getpass.getpass('Ayrı oturum auth_token (gizli): ').strip();ct0=getpass.getpass('Ayrı oturum ct0 (gizli): ').strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]{20,1024}',token) or not re.fullmatch(r'[A-Za-z0-9_-]{20,2048}',ct0):raise RuntimeError('invalid_cookie_format')
    isolated_environment()
    from twscrape import API
    from twscrape.logger import logger
    logger.remove()
    api=API(str(state/'accounts.sqlite'),raise_when_no_account=True,wait_timeout=0)
    await api.pool.add_account_cookies(username,json.dumps({'auth_token':token,'ct0':ct0}))
    (state/'accounts.sqlite').chmod(0o600)
    print('Ayrı oturum yalnız yeni hesap deposuna kaydedildi. Henüz canlı okuma yapılmadı.')

def main():
    os.umask(0o077);a=argparse.ArgumentParser();a.add_argument('--state',default='/var/lib/umraniye-osint-x-twscrape-deneme');args=a.parse_args();state=Path(args.state);state.mkdir(mode=0o700,parents=True,exist_ok=True)
    try:
        with locked(state/'round.lock'):asyncio.run(add(state))
    except Exception:print('Oturum eklenemedi; ayrı oturum biçimini ve terminali kontrol edin. Gizli değerler yazdırılmadı.');return 1
    return 0
if __name__=='__main__':sys.exit(main())
