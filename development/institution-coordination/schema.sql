-- Draft for the separate institutional coordination module. NOT applied.
-- Apply only as an additive migration to the isolated DENEME database.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS coord_institutions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  institution_group TEXT NOT NULL CHECK (institution_group IN ('district_admin','public_agency','municipality','utility','regional_agency','local_partner')),
  mandate_note TEXT NOT NULL DEFAULT '',
  official_reference_url TEXT,
  approval_status TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft','pending','approved','rejected','suspended')),
  approval_reference TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  email_enabled INTEGER NOT NULL DEFAULT 0 CHECK (email_enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (enabled = 0 OR (approval_status = 'approved' AND approval_reference IS NOT NULL)),
  CHECK (email_enabled = 0 OR enabled = 1)
);

CREATE TABLE IF NOT EXISTS coord_topics (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  sensitivity TEXT NOT NULL DEFAULT 'ordinary' CHECK (sensitivity IN ('ordinary','restricted','high')),
  approval_status TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft','pending','approved','rejected','suspended')),
  approval_reference TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (enabled = 0 OR (approval_status = 'approved' AND approval_reference IS NOT NULL))
);

-- Positive grants only. A grant itself has a separate recorded approval basis.
CREATE TABLE IF NOT EXISTS coord_institution_topic_grants (
  institution_id TEXT NOT NULL REFERENCES coord_institutions(id) ON DELETE RESTRICT,
  topic_id TEXT NOT NULL REFERENCES coord_topics(id) ON DELETE RESTRICT,
  granted INTEGER NOT NULL DEFAULT 0 CHECK (granted IN (0,1)),
  approval_reference TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (institution_id, topic_id),
  CHECK (granted = 0 OR (approval_reference IS NOT NULL AND length(trim(approval_reference)) > 0))
);

CREATE TABLE IF NOT EXISTS coord_memberships (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES coord_institutions(id) ON DELETE RESTRICT,
  account_id TEXT NOT NULL REFERENCES team_accounts(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('institution_admin','case_worker','viewer')),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1)),
  approval_reference TEXT,
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (institution_id, account_id),
  CHECK (active = 0 OR (approval_reference IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_coord_memberships_account_active ON coord_memberships(account_id,active,institution_id);

-- A minimized, institution-specific projection; no raw post/body/PII is copied here.
CREATE TABLE IF NOT EXISTS coord_cases (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES coord_institutions(id) ON DELETE RESTRICT,
  topic_id TEXT NOT NULL REFERENCES coord_topics(id) ON DELETE RESTRICT,
  source_event_id TEXT NOT NULL,
  source_revision TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary_redacted TEXT NOT NULL,
  event_title TEXT,
  full_text TEXT,
  image_url TEXT,
  neighborhood TEXT,
  location_precision TEXT NOT NULL DEFAULT 'district' CHECK (location_precision IN ('district','neighborhood','approximate','withheld')),
  first_published_at TEXT,
  first_seen_at TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','received','assessing','actioning','resolved','dismissed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','important','urgent')),
  sensitivity TEXT NOT NULL DEFAULT 'ordinary' CHECK (sensitivity IN ('ordinary','restricted','high')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (institution_id,source_event_id,topic_id)
);
CREATE INDEX IF NOT EXISTS idx_coord_cases_tenant_recent ON coord_cases(institution_id,first_seen_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_coord_cases_tenant_status ON coord_cases(institution_id,status,first_seen_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS coord_case_sources (
  id TEXT PRIMARY KEY,
  coord_case_id TEXT NOT NULL REFERENCES coord_cases(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  published_at TEXT,
  added_at TEXT NOT NULL,
  UNIQUE (coord_case_id,source_url)
);

CREATE TABLE IF NOT EXISTS coord_case_history (
  id TEXT PRIMARY KEY,
  coord_case_id TEXT NOT NULL REFERENCES coord_cases(id) ON DELETE RESTRICT,
  institution_id TEXT NOT NULL REFERENCES coord_institutions(id) ON DELETE RESTRICT,
  actor_account_id TEXT NOT NULL REFERENCES team_accounts(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('view','status_change','note_added','assignment_updated','export')),
  from_value TEXT,
  to_value TEXT,
  note_redacted TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_coord_history_tenant_case ON coord_case_history(institution_id,coord_case_id,created_at DESC);

-- Address ciphertext only. Encryption key must remain outside SQLite.
CREATE TABLE IF NOT EXISTS coord_mail_recipients (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES coord_institutions(id) ON DELETE RESTRICT,
  address_ciphertext TEXT NOT NULL,
  key_version TEXT NOT NULL,
  address_fingerprint TEXT NOT NULL,
  verified_at TEXT,
  verified_by TEXT,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (institution_id,address_fingerprint),
  CHECK (active = 0 OR (verified_at IS NOT NULL AND verified_by IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_coord_recipients_active ON coord_mail_recipients(institution_id,active,verified_at);

CREATE TABLE IF NOT EXISTS coord_mail_outbox (
  id TEXT PRIMARY KEY,
  coord_case_id TEXT NOT NULL REFERENCES coord_cases(id) ON DELETE RESTRICT,
  institution_id TEXT NOT NULL REFERENCES coord_institutions(id) ON DELETE RESTRICT,
  recipient_id TEXT NOT NULL REFERENCES coord_mail_recipients(id) ON DELETE RESTRICT,
  recipient_hash TEXT NOT NULL,
  template_code TEXT NOT NULL CHECK (template_code = 'initial-assignment'),
  dedupe_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'held' CHECK (state IN ('held','queued','sending','sent','dead','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
  next_attempt_at TEXT,
  lease_until TEXT,
  provider_idempotency_key TEXT NOT NULL UNIQUE,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  CHECK (state != 'sending' OR lease_until IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_coord_outbox_due ON coord_mail_outbox(state,next_attempt_at,created_at);
CREATE INDEX IF NOT EXISTS idx_coord_outbox_lease ON coord_mail_outbox(state,lease_until);

CREATE TABLE IF NOT EXISTS coord_routing_decisions (
  id TEXT PRIMARY KEY,
  source_event_id TEXT NOT NULL,
  source_revision TEXT NOT NULL DEFAULT '',
  institution_code TEXT,
  topic_code TEXT,
  result TEXT NOT NULL CHECK (result IN ('routed','no_route','ambiguous','conflicting_location','sensitive_withheld','unapproved_scope','below_threshold')),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reason_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (source_event_id,source_revision,institution_code,topic_code)
);
CREATE INDEX IF NOT EXISTS idx_coord_routing_recent ON coord_routing_decisions(created_at DESC,result);

CREATE TABLE IF NOT EXISTS coord_audit (
  id TEXT PRIMARY KEY,
  actor_account_id TEXT,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('central_admin','institution_user','system')),
  institution_id TEXT REFERENCES coord_institutions(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_coord_audit_tenant_recent ON coord_audit(institution_id,created_at DESC);

CREATE TABLE IF NOT EXISTS coord_portal_viewers (
 account_id TEXT PRIMARY KEY REFERENCES team_accounts(id) ON DELETE RESTRICT,
 active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
 approved_by TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
