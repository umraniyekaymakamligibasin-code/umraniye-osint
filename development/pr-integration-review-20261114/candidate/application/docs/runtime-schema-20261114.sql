-- Schema only; no rows or credentials.
CREATE UNIQUE INDEX `case_records_event_id_unique` ON `case_records` (`event_id`);
CREATE INDEX coord_event_jobs_due ON coord_event_jobs(state,available_at);
CREATE INDEX facebook_posts_fingerprint ON facebook_posts(fingerprint);
CREATE INDEX facebook_posts_source_time ON facebook_posts(source_id,published_at DESC);
CREATE INDEX facebook_posts_time ON facebook_posts(first_seen_at DESC);
CREATE INDEX facebook_runs_time ON facebook_scan_runs(started_at DESC);
CREATE INDEX idx_coord_audit_tenant_recent ON coord_audit(institution_id,created_at DESC);
CREATE INDEX idx_coord_cases_tenant_recent ON coord_cases(institution_id,first_seen_at DESC,id DESC);
CREATE INDEX idx_coord_cases_tenant_status ON coord_cases(institution_id,status,first_seen_at DESC,id DESC);
CREATE INDEX idx_coord_history_tenant_case ON coord_case_history(institution_id,coord_case_id,created_at DESC);
CREATE INDEX idx_coord_memberships_account_active ON coord_memberships(account_id,active,institution_id);
CREATE INDEX idx_coord_outbox_due ON coord_mail_outbox(state,next_attempt_at,created_at);
CREATE INDEX idx_coord_outbox_lease ON coord_mail_outbox(state,lease_until);
CREATE INDEX idx_coord_recipients_active ON coord_mail_recipients(institution_id,active,verified_at);
CREATE INDEX idx_coord_routing_recent ON coord_routing_decisions(created_at DESC,result);
CREATE INDEX institutional_sessions_expiry ON institutional_sessions(expires_at);
CREATE INDEX lab_items_time ON lab_items(published_at);
CREATE INDEX lab_outbox_due ON lab_outbox(status,next_at);
CREATE INDEX osint_stability_facebook_public_url ON facebook_posts(json_extract(data,'$.canonical_url'));
CREATE INDEX `personal_activity_account_time` ON `personal_activity` (`account_id`,`created_at`);
CREATE UNIQUE INDEX `personal_records_account_event_unique` ON `personal_records` (`account_id`,`event_id`);
CREATE UNIQUE INDEX `team_accounts_username_unique` ON `team_accounts` (`username`);
CREATE TABLE `admin_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
CREATE TABLE `alert_log` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL
);
CREATE TABLE `alert_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`alert_id` text NOT NULL
);
CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`created_at` text NOT NULL
);
CREATE TABLE `briefings` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`slot` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL
);
CREATE TABLE `case_history` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
CREATE TABLE `case_records` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`assignee` text DEFAULT '' NOT NULL,
	`due_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
, `latitude` real, `longitude` real, `location_note` text DEFAULT '' NOT NULL, `event_data` text DEFAULT '{}' NOT NULL);
CREATE TABLE common_keyword_groups(id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL,priority TEXT NOT NULL,context TEXT NOT NULL,family TEXT NOT NULL,position INTEGER NOT NULL);
CREATE TABLE common_keyword_members(keyword_id INTEGER NOT NULL REFERENCES facebook_keywords(id),group_id TEXT NOT NULL REFERENCES common_keyword_groups(id),provider TEXT NOT NULL,enabled INTEGER NOT NULL,origin TEXT NOT NULL,PRIMARY KEY(keyword_id,group_id,provider));
CREATE TABLE common_keyword_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL);
CREATE TABLE coord_account_credentials (
 institution_id TEXT PRIMARY KEY REFERENCES coord_institutions(id),
 account_id TEXT NOT NULL UNIQUE REFERENCES team_accounts(id),
 sealed TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE coord_audit (
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
CREATE TABLE coord_case_history (
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
CREATE TABLE coord_case_sources (
  id TEXT PRIMARY KEY,
  coord_case_id TEXT NOT NULL REFERENCES coord_cases(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  published_at TEXT,
  added_at TEXT NOT NULL,
  UNIQUE (coord_case_id,source_url)
);
CREATE TABLE coord_cases (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES coord_institutions(id) ON DELETE RESTRICT,
  topic_id TEXT NOT NULL REFERENCES coord_topics(id) ON DELETE RESTRICT,
  source_event_id TEXT NOT NULL,
  source_revision TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary_redacted TEXT NOT NULL,
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
CREATE TABLE coord_event_jobs (
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
CREATE TABLE coord_institution_topic_grants (
  institution_id TEXT NOT NULL REFERENCES coord_institutions(id) ON DELETE RESTRICT,
  topic_id TEXT NOT NULL REFERENCES coord_topics(id) ON DELETE RESTRICT,
  granted INTEGER NOT NULL DEFAULT 0 CHECK (granted IN (0,1)),
  approval_reference TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (institution_id, topic_id),
  CHECK (granted = 0 OR (approval_reference IS NOT NULL AND length(trim(approval_reference)) > 0))
);
CREATE TABLE coord_institutions (
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
CREATE TABLE coord_mail_outbox (
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
CREATE TABLE coord_mail_recipients (
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
CREATE TABLE coord_memberships (
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
CREATE TABLE coord_portal_viewers (
 account_id TEXT PRIMARY KEY REFERENCES team_accounts(id) ON DELETE RESTRICT,
 active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
 approved_by TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE coord_referrals (
 id TEXT PRIMARY KEY,
 source_case_id TEXT NOT NULL REFERENCES coord_cases(id),
 target_case_id TEXT NOT NULL REFERENCES coord_cases(id),
 source_institution_id TEXT NOT NULL REFERENCES coord_institutions(id),
 target_institution_id TEXT NOT NULL REFERENCES coord_institutions(id),
 actor_account_id TEXT NOT NULL REFERENCES team_accounts(id),
 mode TEXT NOT NULL CHECK(mode IN ('transfer','support')),
 created_at TEXT NOT NULL,
 UNIQUE(source_case_id,target_institution_id)
);
CREATE TABLE coord_routing_decisions (
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
CREATE TABLE coord_topics (
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
CREATE TABLE facebook_keywords(id INTEGER PRIMARY KEY,term TEXT NOT NULL,normalized TEXT NOT NULL UNIQUE,group_name TEXT NOT NULL CHECK(group_name IN ('konum','olay')),enabled INTEGER NOT NULL DEFAULT 1, aliases TEXT NOT NULL DEFAULT '[]');
CREATE TABLE facebook_post_matches(post_id TEXT NOT NULL REFERENCES facebook_posts(stable_post_id),keyword_id INTEGER NOT NULL REFERENCES facebook_keywords(id) ON DELETE CASCADE,PRIMARY KEY(post_id,keyword_id));
CREATE TABLE facebook_posts(stable_post_id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES facebook_sources(source_id),published_at TEXT,first_seen_at TEXT NOT NULL,last_seen_at TEXT NOT NULL,fingerprint TEXT,data TEXT NOT NULL);
CREATE TABLE facebook_scan_runs(id TEXT PRIMARY KEY,source_id TEXT NOT NULL,started_at TEXT NOT NULL,ended_at TEXT,status TEXT NOT NULL,read_count INTEGER NOT NULL DEFAULT 0,new_count INTEGER NOT NULL DEFAULT 0,error_code TEXT);
CREATE TABLE facebook_sources(source_id TEXT PRIMARY KEY,page_name TEXT NOT NULL,page_url TEXT NOT NULL UNIQUE,page_id TEXT,enabled INTEGER NOT NULL DEFAULT 1,access_method TEXT NOT NULL DEFAULT 'graph_api',access_status TEXT NOT NULL DEFAULT 'ERİŞİM GEREKLİ',local_context INTEGER NOT NULL DEFAULT 0,last_attempt_at TEXT,last_success_at TEXT,last_post_at TEXT,last_post_id TEXT,last_error_code TEXT,last_error_message TEXT,collected_count INTEGER NOT NULL DEFAULT 0,next_retry_at TEXT,initialized_at TEXT);
CREATE TABLE go_live_preserved_rows(table_name TEXT NOT NULL,source_key TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(table_name,source_key));
CREATE TABLE ig_intelligence_decisions
            (url TEXT PRIMARY KEY, decision TEXT NOT NULL, reason TEXT NOT NULL, score INTEGER NOT NULL,
             published_at TEXT, source_name TEXT, examined_at TEXT NOT NULL, origin TEXT NOT NULL);
CREATE TABLE institutional_pin(id INTEGER PRIMARY KEY CHECK(id=1),salt TEXT NOT NULL,hash TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,default_pin INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL);
CREATE TABLE institutional_pin_limits(owner_key TEXT PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0,locked_until INTEGER NOT NULL DEFAULT 0);
CREATE TABLE institutional_reviews(record_id TEXT NOT NULL REFERENCES lab_items(id) ON DELETE CASCADE,source_key TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'BEKLIYOR',priority TEXT NOT NULL DEFAULT 'P3',note TEXT NOT NULL DEFAULT '',decision TEXT NOT NULL DEFAULT '',actor TEXT NOT NULL,updated_at TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(record_id,source_key));
CREATE TABLE institutional_sessions(token_hash TEXT PRIMARY KEY,owner_binding TEXT NOT NULL,pin_version INTEGER NOT NULL,last_seen INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE lab_config (id TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);
CREATE TABLE lab_items (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, data TEXT NOT NULL, published_at TEXT NOT NULL, collected_at TEXT NOT NULL);
CREATE TABLE lab_outbox (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, data TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, created_at TEXT NOT NULL, sent_at TEXT, last_error TEXT NOT NULL DEFAULT '');
CREATE TABLE lab_runs (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT, status TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}');
CREATE TABLE lab_source_health (id TEXT PRIMARY KEY, status TEXT NOT NULL, item_count INTEGER NOT NULL DEFAULT 0, checked_at TEXT NOT NULL);
CREATE TABLE lab_telegram_baseline(reference_hash TEXT PRIMARY KEY,created_at TEXT NOT NULL);
CREATE TABLE local_migrations(name TEXT PRIMARY KEY,checksum TEXT NOT NULL);
CREATE TABLE `login_guard` (
	`user_id` text PRIMARY KEY NOT NULL,
	`failures` integer NOT NULL,
	`reset_at` integer NOT NULL
);
CREATE TABLE `members` (
	`email` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
CREATE TABLE osint_content_moderation (
        key TEXT PRIMARY KEY,event_id TEXT,url TEXT,title TEXT,stream TEXT,
        state TEXT NOT NULL,actor TEXT,reason TEXT,created_at TEXT,updated_at TEXT
      );
CREATE TABLE osint_content_moderation_audit (
        id TEXT PRIMARY KEY,actor TEXT,action TEXT,target TEXT,created_at TEXT
      );
CREATE TABLE osint_editorial_approvals (
   item_key TEXT PRIMARY KEY, original_url TEXT NOT NULL, platform TEXT NOT NULL,
   title TEXT NOT NULL, description TEXT NOT NULL, source_name TEXT NOT NULL,
   published_at TEXT NOT NULL, approved_at TEXT NOT NULL, approved_by TEXT NOT NULL
 );
CREATE TABLE `personal_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`event_id` text NOT NULL,
	`title` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text NOT NULL
);
CREATE TABLE `personal_records` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`event_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'unread' NOT NULL,
	`saved` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`viewed_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
, `operation_id` text DEFAULT '' NOT NULL);
CREATE TABLE `refresh_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL
);
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE TABLE `team_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`name` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`password_hash` text NOT NULL,
	`salt` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
CREATE TABLE `team_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
CREATE TABLE `workspace_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL
);