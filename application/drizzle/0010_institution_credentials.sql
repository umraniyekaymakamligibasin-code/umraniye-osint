CREATE TABLE IF NOT EXISTS coord_account_credentials (
 institution_id TEXT PRIMARY KEY REFERENCES coord_institutions(id),
 account_id TEXT NOT NULL UNIQUE REFERENCES team_accounts(id),
 sealed TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
