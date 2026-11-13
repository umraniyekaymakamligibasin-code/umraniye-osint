CREATE TABLE IF NOT EXISTS coord_referrals (
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
