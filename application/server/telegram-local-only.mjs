// Explicit user policy: national agenda stays on the site, never goes to Telegram.
export function nationalTelegramBlocked(item){
 return item?.destination==='national'||item?.scope==='national'||item?.nationalCritical===true;
}
