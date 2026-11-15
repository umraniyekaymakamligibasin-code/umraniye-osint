"""Stop repeated login attempts until the owner renews the same profile."""
import time

def is_paused(state,generation,now=None):
    now=time.time() if now is None else now
    if state.get('reason')=='rate_limited':return state.get('retryAt',0)>now
    if state.get('generation')!=generation:return False
    return state.get('requiresManualLogin') is True or state.get('retryAt',0)>now

def access_state(observed,generation,now=None):
    now=time.time() if now is None else now
    blocked=[x for x in observed if x.get('status')=='blocked']
    verified=any(x.get('reasons',{}).get('account_verification_required') for x in blocked)
    limited=any(x.get('status')=='rate_limited' for x in observed)
    successes=any(x.get('status')=='readable' and not x.get('ingestError') for x in observed)
    login=sum(bool(x.get('reasons',{}).get('login_required') or x.get('reasons',{}).get('login_or_checkpoint')) for x in blocked)
    reason='account_verification_required' if verified else 'rate_limited' if limited else 'shared_login_required' if login>=2 and not successes else 'shared_access_restricted' if len(blocked)>=4 and not successes else None
    manual=reason in ('account_verification_required','shared_login_required')
    delay=86400 if verified else 3600 if limited else 1800 if reason else 0
    return {'generation':generation,'reason':reason,'requiresManualLogin':manual,'retryAt':now+delay if delay else 0,'checkedAt':now}
