export function recoveryDecision({now,lastRun,active=false,timerActive=true,attempts=[]}){
 const recent=attempts.filter(t=>Number.isFinite(t)&&t>now-3600000);
 const stale=!lastRun||now-lastRun>600000;
 const allowed=recent.length<3&&(!recent.length||now-Math.max(...recent)>=600000);
 return{stale,attempts:recent,action:allowed?(!timerActive?'start_timer':stale&&!active?'start_worker':null):null,recoveryLimited:!allowed};
}
