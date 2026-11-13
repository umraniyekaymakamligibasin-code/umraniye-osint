const governorPage='https://www.facebook.com/umraniyekaymakamligi/';
export function isGovernorActivity(e){
 if(!e||!['facebook'].includes(e.platform||e.provider)||e.facebookManaged!==true||e.institutionalContext!==true||e.priorityLevel!=='P3'||e.notificationEligible!==false)return false;
 try{const u=new URL(e.url);if(u.protocol!=='https:'||u.username||u.password||u.port||!['facebook.com','www.facebook.com','m.facebook.com'].includes(u.hostname))return false;
  if(/^\/umraniyekaymakamligi\/posts\//i.test(u.pathname))return true;
  if(['/permalink.php','/story.php'].includes(u.pathname)&&u.searchParams.get('id')==='100069283686696'&&u.searchParams.get('story_fbid'))return true;
  return String(e.institutionalSourceUrl||'').toLowerCase().replace(/\/?$/,'/')===governorPage&&/^\/(?:reel|videos)\/\d+\/?$/.test(u.pathname);
 }catch{return false;}
}
export function governorDisplayTime(e,now=Date.now()){
 const timestamp=Date.parse(e.publishedAt);return isGovernorActivity(e)&&Number.isFinite(timestamp)&&now-timestamp>=-60000&&now-timestamp<=48*3600000;
}
