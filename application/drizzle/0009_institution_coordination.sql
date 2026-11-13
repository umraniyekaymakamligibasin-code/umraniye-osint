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

INSERT OR IGNORE INTO coord_portal_viewers(account_id,active,approved_by,updated_at) SELECT id,1,'existing-active-account',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM team_accounts WHERE active=1;

INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-UMR_KAYMAKAMLIK','UMR_KAYMAKAMLIK','Ümraniye Kaymakamlığı','district_admin',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-UMR_EMNIYET','UMR_EMNIYET','Ümraniye İlçe Emniyet Müdürlüğü','public_agency',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-UMR_ILCE_MEM','UMR_ILCE_MEM','Ümraniye İlçe Millî Eğitim Müdürlüğü','public_agency',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-UMR_ILCE_SAGLIK','UMR_ILCE_SAGLIK','Ümraniye İlçe Sağlık Müdürlüğü','public_agency',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-UMR_BELEDIYE','UMR_BELEDIYE','Ümraniye Belediyesi','municipality',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-IBB_ALTYAPI','IBB_ALTYAPI','İstanbul Büyükşehir Belediyesi — ilgili hizmet birimi','municipality',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-ISTANBUL_ITFAIYE','ISTANBUL_ITFAIYE','İstanbul İtfaiyesi','regional_agency',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-IETT','IETT','İETT Genel Müdürlüğü','regional_agency',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-METRO_ISTANBUL','METRO_ISTANBUL','Metro İstanbul AŞ','regional_agency',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-ISKI_UMR','ISKI_UMR','İSKİ — Ümraniye hizmet kapsamı','utility',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-AYEDAS_UMR','AYEDAS_UMR','AYEDAŞ — Ümraniye hizmet kapsamı','utility',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-IGDAS_UMR','IGDAS_UMR','İGDAŞ — Ümraniye hizmet kapsamı','utility',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-TURK_TELEKOM_UMR','TURK_TELEKOM_UMR','Türk Telekom — Ümraniye hizmet kapsamı','utility',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-TELEKOM_OPERATOR_UMR','TELEKOM_OPERATOR_UMR','İlgili yetkili telekom operatörü — kurum ve kapsam doğrulanacak','utility',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-UMR_ILCE_NUFUS','UMR_ILCE_NUFUS','Ümraniye İlçe Nüfus Müdürlüğü','public_agency',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-UMR_TAPU','UMR_TAPU','Ümraniye Tapu Müdürlüğü','public_agency',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-UMR_SGK','UMR_SGK','Ümraniye Sosyal Güvenlik Merkezi — kapsam doğrulanacak','public_agency',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-UMR_ISKUR','UMR_ISKUR','İŞKUR Ümraniye hizmet birimi — kapsam doğrulanacak','public_agency',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-UMR_ILCE_TARIM','UMR_ILCE_TARIM','Ümraniye için yetkili tarım ve orman birimi — kapsam doğrulanacak','public_agency',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-IBB_ATIK','IBB_ATIK','İBB atık yönetimi / ilgili yetkili birim','regional_agency',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-UMR_SYDV','UMR_SYDV','Ümraniye Sosyal Yardımlaşma ve Dayanışma Vakfı','public_agency',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-UMR_SHM','UMR_SHM','Ümraniye Sosyal Hizmet Merkezi','public_agency',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-UMR_AFET','UMR_AFET','İlçe afet koordinasyonunda yetkili birim','district_admin',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_institutions(id,code,display_name,institution_group,created_at,updated_at) VALUES('catalog-UMR_MUHTARLIK','UMR_MUHTARLIK','Ümraniye mahalle muhtarlıkları','local_partner',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-district_coordination','district_coordination','İlçe koordinasyonu','restricted',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-public_service_access','public_service_access','Kamu hizmetine erişim','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-multi_agency_incident','multi_agency_incident','Kurumlar arası koordinasyon','restricted',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-public_safety','public_safety','Kamu güvenliği','high',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-traffic_safety','traffic_safety','Trafik güvenliği','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-school_perimeter_safety','school_perimeter_safety','Okul çevresi güvenliği','high',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-school_facility','school_facility','Okul binası ve tesis','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-education_service_access','education_service_access','Eğitim hizmetine erişim','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-public_health_facility','public_health_facility','Kamu sağlık tesisi','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-health_service_access','health_service_access','Sağlık hizmetine erişim','high',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-waste_container','waste_container','Atık konteyneri','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-street_cleanliness','street_cleanliness','Sokak temizliği','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-municipal_roadside_asset','municipal_roadside_asset','Belediye yol ve kaldırım varlığı','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-parks_public_space','parks_public_space','Park ve kamusal alan','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-municipal_service_access','municipal_service_access','Belediye hizmetine erişim','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-ibb_road_maintenance','ibb_road_maintenance','İBB yol bakımı','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-drainage_public_space','drainage_public_space','Kamusal alan drenajı','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-metropolitan_service_access','metropolitan_service_access','Büyükşehir hizmetine erişim','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-fire_rescue','fire_rescue','Yangın ve kurtarma','high',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-hazardous_material_response','hazardous_material_response','Tehlikeli madde müdahalesi','high',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-bus_service_disruption','bus_service_disruption','Otobüs hizmet kesintisi','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-bus_stop_infrastructure','bus_stop_infrastructure','Otobüs durağı altyapısı','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-public_transport_safety','public_transport_safety','Toplu taşıma güvenliği','high',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-metro_service_disruption','metro_service_disruption','Metro hizmet kesintisi','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-metro_station_infrastructure','metro_station_infrastructure','Metro istasyonu altyapısı','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-water_leak','water_leak','Su kaçağı','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-water_outage','water_outage','Su kesintisi','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-sewer_overflow','sewer_overflow','Atık su taşması','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-water_infrastructure','water_infrastructure','Su altyapısı','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-power_outage','power_outage','Elektrik kesintisi','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-fallen_power_equipment','fallen_power_equipment','Devrilen elektrik ekipmanı','high',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-electrical_hazard','electrical_hazard','Elektrik tehlikesi','high',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-gas_outage','gas_outage','Doğalgaz kesintisi','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-gas_leak_public_hazard','gas_leak_public_hazard','Doğalgaz kaçağı ve kamusal tehlike','high',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-telecom_outage','telecom_outage','Telekom kesintisi','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-telecom_infrastructure','telecom_infrastructure','Telekom altyapısı','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-civil_registry_service_access','civil_registry_service_access','Nüfus hizmetine erişim','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-land_registry_service_access','land_registry_service_access','Tapu hizmetine erişim','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-social_security_service_access','social_security_service_access','Sosyal güvenlik hizmetine erişim','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-employment_service_access','employment_service_access','İstihdam hizmetine erişim','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-animal_health_public_agriculture','animal_health_public_agriculture','Hayvan sağlığı ve tarım','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-urban_animal_welfare','urban_animal_welfare','Kentsel hayvan refahı','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-metropolitan_waste_collection','metropolitan_waste_collection','Büyükşehir atık toplama','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-illegal_dumping_public_space','illegal_dumping_public_space','Kamusal alana kaçak atık dökümü','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-social_assistance_service_access','social_assistance_service_access','Sosyal yardıma erişim','high',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-social_service_access','social_service_access','Sosyal hizmete erişim','high',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-district_emergency_coordination','district_emergency_coordination','İlçe acil durum koordinasyonu','high',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-flooding','flooding','Su baskını','high',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-storm_damage','storm_damage','Fırtına hasarı','ordinary',datetime('now'),datetime('now'));
INSERT OR IGNORE INTO coord_topics(id,code,display_name,sensitivity,created_at,updated_at) VALUES('catalog-neighborhood_service_observation','neighborhood_service_observation','Mahalle hizmet gözlemi','ordinary',datetime('now'),datetime('now'));