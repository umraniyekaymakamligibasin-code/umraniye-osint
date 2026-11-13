"""Normalize only caption/date/author bound to the same public Reel container."""
import re
def normalize_reel(node,page_url,post_url):
    context=node.get('short_form_video_context')
    if not isinstance(context,dict) or not node.get('post_id'):return None
    videos=[context.get('video') or {},context.get('playback_video') or {},node.get('video') or {}]
    ids={str(v['id']) for v in videos if v.get('id') is not None}
    if len(ids)!=1:return None
    video_id=next(iter(ids))
    if not video_id.isdigit():return None
    owner=context.get('video_owner') or {}
    if not owner.get('id') or not page_url(owner.get('url','')):return None
    for video in videos:
        video_owner=video.get('owner') or {}
        if video_owner.get('id') and str(video_owner['id'])!=str(owner['id']):return None
    privacy=node.get('privacy_scope') or {}
    label=str(privacy.get('label') or privacy.get('description') or '').casefold()
    if label not in ('public','herkese açık'):return None
    if (context.get('fb_shorts_reshare_context') or {}).get('is_reshare') is True:return None
    url=next((u for v in (context.get('shareable_url'),(context.get('playback_video') or {}).get('permalink_url'),node.get('reporting_url')) if (u:=post_url(v or ''))),None)
    if not url or not re.search(r'/(?:reel|videos)/'+re.escape(video_id)+r'(?:/|$|\?)',url):return None
    ts=node.get('creation_time');message=node.get('message') or {}
    if isinstance(ts,bool) or not isinstance(ts,(int,float)) or not isinstance(message.get('text'),str):return None
    pid=str(node['post_id'])
    return {'__typename':'Story','post_id':pid,'actors':[owner],'creation_time':ts,'permalink_url':url,'comet_sections':{'content':{'story':{'post_id':pid,'message':message}}}}
