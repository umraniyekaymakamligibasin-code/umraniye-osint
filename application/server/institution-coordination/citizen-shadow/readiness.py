"""Read-only live schema/approval inspection. Never emits post bodies or secrets."""
import sqlite3,json,sys
from pathlib import Path
p=Path(sys.argv[1] if len(sys.argv)>1 else '/var/lib/umraniye-osint-deneme/osint.sqlite')
db=sqlite3.connect(p.resolve().as_uri()+'?mode=ro',uri=True)
db.execute('PRAGMA query_only=ON')
def count(sql):return db.execute(sql).fetchone()[0]
out={'databaseMode':'read_only','items':count('SELECT count(*) FROM lab_items'),'cases':count('SELECT count(*) FROM coord_cases'),
 'newTopics':count("SELECT count(*) FROM coord_topics WHERE code LIKE 'CIT-%'"),
 'approvedNewTopics':count("SELECT count(*) FROM coord_topics WHERE code LIKE 'CIT-%' AND enabled=1 AND approval_status='approved' AND approval_reference IS NOT NULL"),
 'newTopicGrants':count("SELECT count(*) FROM coord_institution_topic_grants g JOIN coord_topics t ON t.id=g.topic_id WHERE t.code LIKE 'CIT-%' AND g.granted=1"),
 'locality':{'trustedLocality':0,'legacyVerifiedLocal':0,'unverified':0},'canEnableNewRouting':False,'notificationsSent':0}
for data, in db.execute('SELECT data FROM lab_items'):
 try:e=json.loads(data)
 except (ValueError,TypeError):continue
 loc=e.get('locality') or {}
 if isinstance(loc,dict) and loc.get('district')=='Ümraniye' and loc.get('verified') is True:out['locality']['trustedLocality']+=1
 elif e.get('locationVerified') is True and e.get('districtScope')=='local':out['locality']['legacyVerifiedLocal']+=1
 else:out['locality']['unverified']+=1
out['blocks']=[]
if not out['approvedNewTopics']:out['blocks'].append('new_topic_approvals_missing')
if not out['newTopicGrants']:out['blocks'].append('new_topic_grants_missing')
out['liveWriterInstalled']=(Path(__file__).parent/'continuous.mjs').is_file() and Path('/etc/systemd/system/umraniye-cit-routing.service').is_file()
if not out['liveWriterInstalled']:out['blocks'].append('live_writer_not_installed')
out['canEnableNewRouting']=not out['blocks']
print(json.dumps(out,ensure_ascii=False));db.close()
