// Separate windows prevent normal traffic from resetting the login budget.
export function createRequestBudget({now=Date.now,maxEntries=10000}={}) {
  const buckets=new Map();
  return {limited(ip,login=false) {
    const time=now(),key=(login?'login:':'all:')+ip,window=login?900000:60000;
    let state=buckets.get(key);
    if(!state||time>=state.expires) {
      if(buckets.size>=maxEntries)for(const [k,v]of buckets)if(time>=v.expires)buckets.delete(k);
      // Fail closed for new identities at capacity, without evicting login limits.
      if(!buckets.has(key)&&buckets.size>=maxEntries)return true;
      state={expires:time+window,count:0};buckets.set(key,state);
    }
    return ++state.count>(login?25:240);
  },get size(){return buckets.size;}};
}
