CONTINUOUS INSTITUTION DELIVERY — 22.11.2026

Live code: /opt/umraniye-osint-deneme/server/institution-coordination/citizen-shadow
Live database: /var/lib/umraniye-osint-deneme/osint.sqlite
Source of truth remains the server; existing server-to-GitHub synchronization
does not deploy local or GitHub changes to the server.

Runtime:
- umraniye-cit-routing.timer: bounded 25-job batches approximately each minute.
- umraniye-kurum-zamanlayici.service: OSINT_ROUTING_UNIFIED=1 delegates routing
  to the same pipeline. Its existing optional sender configuration is preserved.
- umraniye-cit-health.timer: five-minute health checks and bounded recovery.
- All routing entry points share the existing nonblocking flock.
- No main application restart was required for the delivery queue rollout.

SQLite delivery queue:
- delivery-queue.sql adds reference-only jobs, per-source case links and metadata.
- Source INSERT/changed data UPDATE enqueue automatically; unchanged data do not.
- Source DELETE by existing retention preserves cases and records waiting_source.
- Interrupted jobs recover after the two-minute lease; failures back off from
  one minute to six hours and remain eligible for a later retry.
- Code, catalog, approval, grant or location dictionary revision requeues work
  in bounded chunks. Unassigned events are reconsidered every six hours.
- Unchanged completed events are not repeatedly classified. Small rotating
  delivery audits check permissions, accessible accounts and source links.
- No second raw-news payload is stored in the new queue.
- status.json is an operational snapshot; ledger.json from the previous version
  is historical only. cit_delivery_jobs is the current durable work ledger.

Single decision path:
The 1,614-rule catalog and existing approved ordinary legacy topics use the
same engine.mjs Turkish language, locality and privacy checks. Approved legacy
phrases are fallback rules only, not a second independent writer. Legacy
fallbacks require problem evidence; institution visits are not enough.
Original sensitive legacy topics remain gated; minimized incident projections
preserve original source links within existing institution permissions.
The catalog size is not an accuracy score or proof of complete language coverage.

Transactional reconciliation:
Case projection, source changes, audit and queue acknowledgement commit together.
Changed evidence updates the existing automatic case; invalidated automatic tasks
are dismissed with an audit record. Recurrence can restore an automatic dismissal.
Human resolved/dismissed records and legacy records are preserved.
A shared event can retain multiple original source links without alternating
source revisions, duplicate cases or unnecessary reprocessing.

Health:
health.json and the systemd journal contain queue counts, overdue/error states,
source service results and delivery access checks; no secrets or raw post bodies.
A stalled idle router or stopped timer can be restarted, capped at three recovery
requests per hour with ten-minute spacing. An active worker is never interrupted.
The health worker does not dispatch email, Telegram or other notifications.

Verification:
1,683 citizen/queue/health tests, 24 legacy tests, and 1 separate institution API
source/tenant regression passed. Source validation: 149 JS files, 21 inline scripts.
Tests include close/reopen durability, lease recovery, transaction rollback,
retry delay, source corrections, shared-event deduplication, grant revocation,
human status preservation, missing-link repair and actual tenant API isolation.
Rule fixtures are not real-world precision/recall statistics.

Rollback:
Stop routing/health timers and workers first; restore backed-up source/unit files.
delivery-queue.down.sql removes only the new queue, links, metadata and triggers.
Original news, accounts, grants, institutional cases and their audit are retained.
Do not overwrite the live database with an old backup while ingestion continues.

Last full live verification:
911 archived news, 797 preserved institution cases, 913 queue references
(including two sources already removed by existing retention).
9 assigned-source jobs, 902 unassigned/reconsideration jobs, 2 waiting_source.
SQLite quick_check: ok. Verified idle round: examined=0, updated=0,
failed=0, deliveryAudit.requeued=0, inaccessible=0. These are a point-in-time
observation; unassigned records are not evidence that every event was routed.
