"""Pause on shared access restrictions; never rotate sessions or bypass checks."""
import time
def is_paused(state,generation,now=None):
    now=time.time() if now is None else now
    return (state.get('reason')=='rate_limited' or state.get('generation')==generation) and state.get('retryAt',0)>now
def access_state(observed,generation,now=None):
    now=time.time() if now is None else now
    blocked=[x for x in observed if x.get('status')=='blocked']
    verified=any(x.get('reasons',{}).get('account_verification_required') for x in blocked)
    limited=any(x.get('status')=='rate_limited' for x in observed)
    successes=any(x.get('status')=='readable' and not x.get('ingestError') for x in observed)
    reason='account_verification_required' if verified else 'rate_limited' if limited else 'shared_login_required' if len(blocked)>=4 and not successes else None
    delay=86400 if verified else 3600 if limited else 1800 if reason else 0
    return {'generation':generation,'reason':reason,'retryAt':now+delay if delay else 0,'checkedAt':now}
