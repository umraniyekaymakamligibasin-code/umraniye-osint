export function canonicalFacebookDisplay(e){
 const d=e?.facebookDecision;
 if((e?.platform||e?.provider)!=='facebook'||e.facebookManaged!==true||d?.version!=='facebook-display-v1'||d.display!==true||!d.sourceId||!d.sourcePageUrl)return false;
 try{const u=new URL(e.url),s=new URL(d.sourcePageUrl);const hosts=['facebook.com','www.facebook.com','m.facebook.com'];return u.protocol==='https:'&&s.protocol==='https:'&&hosts.includes(u.hostname)&&hosts.includes(s.hostname)&&!u.port&&!u.username&&!u.password&&!s.username&&!s.password&&Number.isFinite(Date.parse(e.publishedAt))&&/^\/(?:.*\/(?:posts|videos)\/[^/]+|reel\/\d+|videos\/\d+|permalink\/[A-Za-z0-9_-]+|permalink.php|story.php)\/?$/.test(u.pathname);}catch{return false;}
}
export function facebookDisplayWindow(e,now=Date.now()){
 const age=now-Date.parse(e.publishedAt);return canonicalFacebookDisplay(e)&&age>=-60000&&(age<=48*3600000||e.facebookDecision.existingEvent===true);
}
