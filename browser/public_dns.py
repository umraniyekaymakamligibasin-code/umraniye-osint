"""Short lived, coalesced address validation; private targets remain forbidden."""
import asyncio, ipaddress, socket, time

class PublicDNS:
    def __init__(self):self.cache={};self.locks={}
    async def allowed(self, host):
        cached=self.cache.get(host)
        if cached and cached[0]>time.monotonic():return cached[1]
        lock=self.locks.setdefault(host,asyncio.Lock())
        async with lock:
            cached=self.cache.get(host)
            if cached and cached[0]>time.monotonic():return cached[1]
            try:
                addresses=await asyncio.to_thread(socket.getaddrinfo,host,443,type=socket.SOCK_STREAM)
                good=bool(addresses) and all(ipaddress.ip_address(r[4][0]).is_global for r in addresses)
            except (OSError,ValueError):good=False
            if len(self.cache)>=512:
                for key in list(self.cache):
                    if self.cache[key][0]<=time.monotonic():self.cache.pop(key,None)
                if len(self.cache)>=512:self.cache.pop(next(iter(self.cache)))
            self.cache[host]=(time.monotonic()+(60 if good else 5),good)
            return good
