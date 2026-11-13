CREATE TABLE IF NOT EXISTS coord_event_jobs (
 job_key TEXT PRIMARY KEY,
 event_id TEXT NOT NULL,
 policy_version TEXT NOT NULL,
 event_json TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('queued','processing','completed','dead')),
 attempts INTEGER NOT NULL DEFAULT 0,
 available_at TEXT NOT NULL,
 lease_until TEXT,
 decision_json TEXT,
 created_at TEXT NOT NULL,
 completed_at TEXT
);
CREATE INDEX IF NOT EXISTS coord_event_jobs_due ON coord_event_jobs(state,available_at);
