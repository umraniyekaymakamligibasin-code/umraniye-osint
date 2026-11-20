CREATE TABLE IF NOT EXISTS cit_delivery_jobs(
 event_id TEXT PRIMARY KEY,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','processing','done','retry','waiting_source')),
 generation INTEGER NOT NULL DEFAULT 1,
 attempts INTEGER NOT NULL DEFAULT 0,
 priority INTEGER NOT NULL DEFAULT 0,
 available_at INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER,
 claim_token TEXT,
 policy_version TEXT NOT NULL DEFAULT '',
 source_revision TEXT,
 outcome TEXT,
 error_code TEXT,
 updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS cit_jobs_due ON cit_delivery_jobs(state,priority DESC,available_at,event_id);
CREATE INDEX IF NOT EXISTS cit_jobs_policy ON cit_delivery_jobs(state,policy_version,event_id);
CREATE TABLE IF NOT EXISTS cit_delivery_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cit_case_links(
 event_id TEXT NOT NULL,case_id TEXT NOT NULL REFERENCES coord_cases(id),
 topic_code TEXT NOT NULL,institution_code TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1,source_revision TEXT NOT NULL,
 previous_status TEXT,auto_status_at TEXT,verified_at INTEGER NOT NULL,
 PRIMARY KEY(event_id,case_id)
);
CREATE INDEX IF NOT EXISTS cit_links_case ON cit_case_links(case_id,active);
CREATE TRIGGER IF NOT EXISTS cit_source_insert AFTER INSERT ON lab_items BEGIN
 INSERT INTO cit_delivery_jobs(event_id,priority) VALUES(NEW.id,1)
 ON CONFLICT(event_id) DO UPDATE SET state='pending',priority=1,generation=generation+1,attempts=0,available_at=0,error_code=NULL;
END;
CREATE TRIGGER IF NOT EXISTS cit_source_update AFTER UPDATE OF data ON lab_items WHEN NEW.data IS NOT OLD.data BEGIN
 INSERT INTO cit_delivery_jobs(event_id,priority) VALUES(NEW.id,1)
 ON CONFLICT(event_id) DO UPDATE SET state='pending',priority=1,generation=generation+1,attempts=0,available_at=0,error_code=NULL;
END;
CREATE TRIGGER IF NOT EXISTS cit_source_delete AFTER DELETE ON lab_items BEGIN
 UPDATE cit_delivery_jobs SET state='waiting_source',generation=generation+1,claim_token=NULL,lease_until=NULL,outcome='source_removed_by_retention' WHERE event_id=OLD.id;
END;
