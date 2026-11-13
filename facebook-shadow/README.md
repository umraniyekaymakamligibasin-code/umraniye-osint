# Facebook anonymous supplement V2

Uses the existing pinned fbgql vendor and venv. No browser, login, cookies, proxy,
paid API, or dependency installation. Only enabled Facebook sources are selected.

Each round permits up to 10 sources, 12 posts per source, 40 HTTP requests and 120
seconds of fetch time plus bounded filtering. Persistent round-robin rotation,
per-source backoff, and global pause on rate limiting or human verification.

The longest available text and first discovery time survive incomplete later
observations. One additional permalink lookup for a textless item is allowed
within the same budget. No text, date or location is invented. Raw candidates
expire after 72 hours; admission remains restricted to the last 60 minutes.

Current shared scope and quality rules, with reviewed dependency hashes, are
copied into this separate component. Public local-source context fields are
exported without credentials or browser state.

Publication uses the existing authenticated browser-worker endpoint, active-source
identity checks, shared admission and existing deduplication. Reader health remains
separate from the browser session. A separate publisher reads shadow data read-only
and records confirmed receipts in its own ledger. The reader receives no service key.

The completion-based five-minute timer is enabled only after a real bounded round
reads posts and authenticated local access works. Fresh-event publication and
external browser verification are reported separately; empty results are not
called a successful end-to-end integration.

Installation backs up code and the current database. Only the serving application
is restarted once. Existing X, Instagram, primary Facebook and Telegram settings
are preserved. No synthetic message or historical replay is requested.
