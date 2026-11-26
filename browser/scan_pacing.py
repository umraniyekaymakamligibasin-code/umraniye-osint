"""Minimum intervals inside the existing runner; no new daemon, timer or login retries."""
import datetime,json,math,pathlib,random,time,uuid
from social_reader_repair import write_json
INTERVALS={'x':300,'facebook':420,'instagram':600}
def stamp(value):return datetime.datetime.fromtimestamp(value,datetime.timezone.utc).isoformat()
def load(root,provider):
    if provider not in INTERVALS:raise ValueError('invalid_provider')
    path=pathlib.Path(root)/'scan-pacing'/(provider+'.json')
    try:
        if path.is_symlink() or path.stat().st_size>64000:raise ValueError('unsafe_pacing_file')
        state=json.loads(path.read_text(encoding='utf-8'))
        if state.get('version')!=1 or state.get('provider')!=provider:raise ValueError('invalid_pacing_state')
    except FileNotFoundError:state={'version':1,'provider':provider,'history':[]}
    return path,state
def number(value,default=0):return value if isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) else default
def begin(root,provider,clock=time.time):
    path,state=load(root,provider);current=clock();interval=INTERVALS[provider]
    if provider=='facebook':interval+=random.randint(0,300)
    last=number(state.get('lastStartedAt'))
    if last>current+300:
        state.update(lastStartedAt=current,nextDue=current+interval,clockAdjusted=True);write_json(path,state)
    due=number(state.get('nextDue'))
    if due>current:
        print(json.dumps({'event':'scan_waiting_interval','provider':provider,'retryInSeconds':math.ceil(due-current),'nextScanAt':stamp(due)}),flush=True);return None
    ticket={'provider':provider,'id':uuid.uuid4().hex,'started':current}
    state.update(runningAttempt=ticket['id'],lastStartedAt=current,lastAttemptAt=stamp(current),intervalSeconds=interval,nextDue=current+interval)
    write_json(path,state);return ticket
def finish(root,ticket,outcome,clock=time.time):
    provider=ticket['provider'];path,state=load(root,provider)
    if state.get('runningAttempt')!=ticket['id']:raise ValueError('pacing_attempt_changed')
    current=clock();status=outcome.get('status','worker_error');retry=number(outcome.get('retryInSeconds'));failures=int(number(state.get('failures')))
    failure=status in ('worker_error','browser_error','selector_changed','robots_denied') or status=='time_budget' and retry<=0
    failures=failures+1 if failure else 0;delay=INTERVALS[provider]
    if provider=='facebook' and not failure:delay+=random.randint(0,300)
    if failure:delay=max(delay,min(1800,60*2**min(failures,5)))
    if status in ('login_required','challenge_required','verification_paused'):delay=max(delay,1800)
    if status=='robots_denied':delay=max(delay,3600)
    if retry>0:delay=max(delay,retry)
    next_due=max(ticket['started']+delay,current+30) if not failure and not retry and status not in ('login_required','challenge_required','verification_paused') else current+delay
    row={'startedAt':stamp(ticket['started']),'completedAt':stamp(current),'status':status,'readCount':int(max(0,number(outcome.get('readCount'))))}
    state.update(runningAttempt=None,lastCompletedAt=stamp(current),lastStatus=status,nextDue=next_due,nextScanAt=stamp(next_due),failures=failures,history=([row]+state.get('history',[]))[:32])
    if row['readCount']>0 and status in ('collected','partial','filtered_no_eligible_posts'):state['lastContentReadAt']=stamp(current)
    write_json(path,state);return state
def manual_verified(root,provider,clock=time.time):
    path,state=load(root,provider);current=clock()
    state.update(nextDue=current,nextScanAt=stamp(current),lastVerifiedAt=stamp(current),failures=0)
    write_json(path,state)
def completed_outcome(root,provider,started):
    path=pathlib.Path(root)/('social-last-round-'+provider+'.json')
    try:
        data=json.loads(path.read_text(encoding='utf-8'));at=datetime.datetime.fromisoformat(data['at'].replace('Z','+00:00')).timestamp()
        if at<started:return {'status':'worker_error'}
        return next((r for r in data['results'] if r.get('provider')==provider),{'status':'worker_error'})
    except (OSError,ValueError,TypeError,KeyError):return {'status':'worker_error'}


def confirmed_session_receipt(provider,results,output):
    """Use the real bridge contract: ok + receipts, not absent result details."""
    if not isinstance(output,dict) or output.get('ok') is not True or not isinstance(output.get('receipts'),list):return False
    for row in results:
        if row.get('provider')!=provider or row.get('status')!='session_ready' or row.get('posts') or not str(row.get('sessionName') or '').strip():continue
        if any(isinstance(receipt,dict) and receipt.get('provider')==provider and receipt.get('profileURL')==row.get('profileURL') and not receipt.get('retryUrls') for receipt in output['receipts']):return True
    return False
