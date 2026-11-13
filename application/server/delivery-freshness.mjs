const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'});
export function deliveryFreshness(value,now=Date.now()){
 if(typeof value!=='string'||!value)return{allowed:false,reason:'publication_date_missing'};
 if(/^\d{4}-\d{2}-\d{2}$/.test(value))return{allowed:value===day.format(new Date(now)),reason:'publication_day_not_today'};
 if(!/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value))return{allowed:false,reason:'publication_date_invalid'};
 const ms=Date.parse(value);if(!Number.isFinite(ms))return{allowed:false,reason:'publication_date_invalid'};
 const age=now-ms;return{allowed:age>=-300000&&age<=86400000,reason:age< -300000?'publication_in_future':'publication_older_than_24h'};
}
