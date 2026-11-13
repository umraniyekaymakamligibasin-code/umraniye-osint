"""Resource policy for read-only automation; interactive login is unchanged."""
def skip_resource(kind,provider=None,interactive=False):
    if interactive:return False
    return kind in ('media','font') or kind=='image' and provider in ('x','instagram')

async def read_page(context,page=None):
    """Keep one automation tab; a new document discards previous route history."""
    if page is None:
        pages=list(context.pages)
        page=pages[0] if pages else await context.new_page()
        for extra in pages[1:]:await extra.close()
        return page
    replacement=await context.new_page()
    try:await page.close()
    except Exception:await replacement.close();raise
    return replacement

def merge_observation(total,part):
    for key in ('linksSeen','postsRead','datedPosts','oldPosts','missingDates','missingText','authorConflicts','routeErrors','timeBudgets'):
        value=part.get(key,0)
        if isinstance(value,int) and not isinstance(value,bool):total[key]=min(1000000,total.get(key,0)+max(0,value))
    reason=part.get('notificationStatus')
    if reason in ('readable','explicitly_empty','unreadable','login_required','rate_limited','page_error','time_budget'):
        total['notificationStatus']=reason
    for key,value in part.get('reasons',{}).items():
        if isinstance(key,str) and key.replace('_','').isalnum() and isinstance(value,int) and not isinstance(value,bool):
            reasons=total.setdefault('reasons',{});reasons[key]=min(1000000,reasons.get(key,0)+max(0,value))
