# X supplemental backup bridge

Existing browser-worker admission is reused with reader=twscrape-backup. Existing source, geo, priority, deduplication and Telegram delivery policy remain authoritative. Backup posts are limited to verified publication instants within 60 minutes. The browser-status row is neither read nor written by backup ingest; its status is recorded as x-backup-status.

Publisher uses a read-only shadow SQLite connection and a separate delivery ledger. It only acknowledges the existing bridge receipt, verifies accepted URLs in the existing storage, never follows redirects and sends the local authentication header only to hardcoded loopback. The isolated collection process receives no browser service key. The publisher is a separate hardened service with access limited to local networking, its own writable state and read-only input directories; X account database is inaccessible.

Installation validates current source hash, backs up source and the online database, runs offline publisher and backend admission checks, and restarts only the serving application once. It submits currently fresh, previously shadow-accepted real posts. Normal existing delivery policy applies; no synthetic test message is sent. Collection timer is enabled only after a real accepted URL is confirmed in existing storage. Otherwise timer and trigger are removed, leaving the manual integration for investigation.

The seven-minute interval is measured after completed collection, with up to 30 seconds scheduling spread. Existing X/Facebook/Instagram collector settings are not changed. X session restrictions/backoff remain in force. External authenticated browser rendering is not verified by this installer.

Rollback restores code and removes the supplemental timer/trigger. It preserves session and event databases and does not rewind delivery state.
