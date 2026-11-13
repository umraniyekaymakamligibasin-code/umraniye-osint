CREATE TABLE lab_config (id TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);
CREATE TABLE lab_items (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, data TEXT NOT NULL, published_at TEXT NOT NULL, collected_at TEXT NOT NULL);
CREATE INDEX lab_items_time ON lab_items(published_at);
CREATE TABLE lab_source_health (id TEXT PRIMARY KEY, status TEXT NOT NULL, item_count INTEGER NOT NULL DEFAULT 0, checked_at TEXT NOT NULL);
CREATE TABLE lab_outbox (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, data TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, created_at TEXT NOT NULL, sent_at TEXT, last_error TEXT NOT NULL DEFAULT '');
CREATE INDEX lab_outbox_due ON lab_outbox(status,next_at);
CREATE TABLE lab_runs (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT, status TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}');
