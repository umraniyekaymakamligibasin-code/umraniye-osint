"""Bounded recovery from a temporarily unavailable local application.

POST is retried only when the connection was refused before the request could be
accepted. Ambiguous timeouts/resets, authorization failures and HTTP POST errors
are never retried here; the existing durable queue retains unacknowledged work.
"""
import errno,json,time,urllib.error,urllib.parse

def exchange_json(opener,request,*,timeout=45,budget=50):
    parsed=urllib.parse.urlsplit(request.full_url)
    if parsed.scheme!='http' or parsed.hostname!='127.0.0.1' or parsed.port!=3001:
        raise ValueError('loopback_bridge_only')
    method=request.get_method();deadline=time.monotonic()+budget;attempt=0
    while True:
        remaining=deadline-time.monotonic()
        try:
            with opener.open(request,timeout=max(0.01,min(timeout,remaining))) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            retry=method=='GET' and error.code in (502,503,504)
            error.close()
            if not retry:raise
            failure=error
        except (urllib.error.URLError,TimeoutError,ConnectionError) as error:
            cause=error.reason if isinstance(error,urllib.error.URLError) else error
            refused=isinstance(cause,ConnectionRefusedError) or getattr(cause,'errno',None)==errno.ECONNREFUSED
            transient=refused or isinstance(cause,(TimeoutError,ConnectionResetError)) or getattr(cause,'errno',None) in (errno.ETIMEDOUT,errno.ECONNRESET)
            if not (refused or method=='GET' and transient):raise
            failure=error
        wait=min((1,2,3,5,8)[min(attempt,4)],deadline-time.monotonic())
        if wait<=0 or attempt>=9:raise failure
        attempt+=1
        print(json.dumps({'event':'local_bridge_wait','method':method,'attempt':attempt,'waitSeconds':round(wait,2)}),flush=True)
        time.sleep(wait)
