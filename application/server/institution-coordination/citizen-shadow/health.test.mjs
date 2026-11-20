import test from'node:test';import assert from'node:assert/strict';import{recoveryDecision}from'./health-policy.mjs';
test('healthy running system never restarted',()=>{assert.equal(recoveryDecision({now:1000000,lastRun:999000,active:false}).action,null);});
test('stalled idle worker is recovered',()=>assert.equal(recoveryDecision({now:2000000,lastRun:1}).action,'start_worker'));
test('active worker is not interrupted',()=>assert.equal(recoveryDecision({now:2000000,lastRun:1,active:true}).action,null));
test('disabled timer is automatically started',()=>assert.equal(recoveryDecision({now:2000000,lastRun:1999999,timerActive:false}).action,'start_timer'));
test('recoveries bounded to three per hour with ten minute spacing',()=>{assert.equal(recoveryDecision({now:4000000,lastRun:1,attempts:[3999999]}).action,null);assert.equal(recoveryDecision({now:4000000,lastRun:1,attempts:[800000,1600000,2400000]}).action,null);assert.equal(recoveryDecision({now:8000000,lastRun:1,attempts:[800000,1600000,2400000]}).action,'start_worker');});
