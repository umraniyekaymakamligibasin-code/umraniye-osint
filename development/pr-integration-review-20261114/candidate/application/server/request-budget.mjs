// Separate windows prevent normal traffic from resetting the login budget.
export function createRequestBudget({now=Date.now,maxEntries=10000}={}) {
  const buckets=new Map();
  // kind: true/'login' (login attempts), 'media' (static files and thumbnails), anything else = API/page budget.
  // Media has its own window so a page with many images cannot exhaust the API budget shared by an office IP.
  return {limited(ip,kind=false) {
    const type=kind===true||kind==='login'?'login':kind==='media'?'media':'all',login=type==='login';
    const time=now(),key=type+':'+ip,window=login?900000:60000;
    let state=buckets.get(key);
    if(!state||time>=state.expires) {
      if(buckets.size>=maxEntries)for(const [k,v]of buckets)if(time>=v.expires)buckets.delete(k);
      // Fail closed for new identities at capacity, without evicting login limits.
      if(!buckets.has(key)&&buckets.size>=maxEntries)return true;
      state={expires:time+window,count:0};buckets.set(key,state);
    }
    return ++state.count>(login?25:type==='media'?1200:240);
  },get size(){return buckets.size;}};
}
