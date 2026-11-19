#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""One bounded sequential OSINT collection round. No crawler modifications."""
from __future__ import annotations
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

CFG=Path('/etc/umraniye-osint-sirali.json')
BASE=Path('/var/lib/umraniye-osint-sirali')
STATE=BASE/'durum.json'
LOCK=Path('/run/umraniye-osint-sirali.lock')

def log(event, **fields):
    print(json.dumps({'event':event,'at':dt.datetime.now(dt.timezone.utc).isoformat(),**fields},ensure_ascii=False), flush=True)

def atomic_json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    fd,tmp=tempfile.mkstemp(prefix='.osint-sirali-',dir=str(path.parent))
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as fh:
            json.dump(value,fh,ensure_ascii=False,indent=2)
            fh.flush(); os.fsync(fh.fileno())
        os.chmod(tmp,0o600);os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)

def active_state(service):
    p=subprocess.run(['systemctl','show',service,'--property=ActiveState','--value'],capture_output=True,text=True,timeout=10)
    if p.returncode:raise RuntimeError('systemctl_status:'+service)
    return p.stdout.strip()

def run_round():
    if os.geteuid()!=0:raise RuntimeError('root_required')
    with open(LOCK,'a+',encoding='utf-8') as fh:
        try:fcntl.flock(fh.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            log('cycle_overlap_prevented');return 0
        plan=json.loads(CFG.read_text('utf-8'))
        jobs=plan['jobs']
        if not jobs or [x['name'] for x in jobs if x['name']!='instagram_media']!=['x','instagram','facebook']:
            raise RuntimeError('invalid_scan_plan')
        state=json.loads(STATE.read_text('utf-8')) if STATE.exists() else {'round':0}
        state['round']=int(state.get('round',0))+1
        state['startedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
        state['phase']='running'
        state['lastRound']={'ok':[],'failed':[],'skipped':[]}
        atomic_json(STATE,state)
        log('sequential_cycle_started',round=state['round'],jobs=[j['name'] for j in jobs])
        # Do not start anything if a manual/external trigger is already active.
        # This also catches orphaned prior scans after a systemctl client timeout.
        running={j['name']:active_state(j['service']) for j in jobs}
        busy={k:v for k,v in running.items() if v not in ('inactive','failed')}
        if busy:
            state['phase']='external_or_prior_scan_active'
            state['lastRound']['skipped'].append({'reason':'worker_busy','units':busy})
            state['completedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
            atomic_json(STATE,state)
            log('sequential_cycle_skipped_busy',busy=busy)
            return 0
        for job in jobs:
            name=job['name'];service=job['service']
            if name=='instagram_media':
                # Do not scan the supplementary API reader on every fast round.
                last=float(state.get('lastMediaAttemptUnix',0))
                if time.time()-last < 180:
                    state['lastRound']['skipped'].append({'name':name,'reason':'media_interval'})
                    continue
                state['lastMediaAttemptUnix']=time.time()
            # Safety re-check protects against manual starts between steps.
            status_map={j['name']:active_state(j['service']) for j in jobs}
            busy={k:v for k,v in status_map.items() if v not in ('inactive','failed')}
            if busy:
                state['lastRound']['skipped'].append({'name':name,'reason':'other_worker_busy','units':busy})
                log('sequential_cycle_stopped_for_busy',busy=busy)
                break
            log('sequential_job_started',provider=name,service=service)
            started=time.monotonic()
            try:
                p=subprocess.run(['systemctl','start','--wait',service],capture_output=True,text=True,timeout=240)
                status=active_state(service)
                result={'name':name,'seconds':round(time.monotonic()-started,1),'activeState':status}
                if p.returncode or status != 'inactive':
                    result.update({'rc':p.returncode,'error':(p.stderr or p.stdout)[-240:]})
                    state['lastRound']['failed'].append(result)
                    log('sequential_job_failed',**result)
                    # In case a start returned but service keeps running, no overlap.
                    if status not in ('inactive','failed'):break
                else:
                    state['lastRound']['ok'].append(result)
                    log('sequential_job_completed',**result)
            except subprocess.TimeoutExpired:
                state['lastRound']['failed'].append({'name':name,'error':'systemctl_wait_timeout_240s'})
                log('sequential_job_timeout',provider=name,service=service)
                # Never force-kill an in-flight collector. Retry when inactive.
                break
            except Exception as exc:
                state['lastRound']['failed'].append({'name':name,'error':type(exc).__name__})
                log('sequential_job_exception',provider=name,errorType=type(exc).__name__)
                break
            finally:
                atomic_json(STATE,state)
            time.sleep(2)
        state['completedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
        state['phase']='completed' if not state['lastRound']['failed'] else 'completed_with_errors'
        atomic_json(STATE,state)
        log('sequential_cycle_completed',round=state['round'],**{'success':len(state['lastRound']['ok']),'failures':len(state['lastRound']['failed']),'skipped':len(state['lastRound']['skipped'])})
    return 0

if __name__=='__main__':
    try:sys.exit(run_round())
    except Exception as exc:
        log('sequential_controller_error',errorType=type(exc).__name__,detail=str(exc)[:200])
        sys.exit(1)
