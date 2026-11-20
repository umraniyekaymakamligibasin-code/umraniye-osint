CITIZEN ROUTING — LIVE STATUS, 20 NOVEMBER 2026

This directory began as a shadow-only evaluation package. Following explicit
owner authorization, a separate approved-only live worker is now installed at
/opt/umraniye-osint-deneme/server/institution-coordination/citizen-shadow.
Do not describe the current files as a purely undeployed shadow prototype.

Current catalogue: 1614 explicitly enumerated rules. Citizen tests: 1661 passed.
Additional institution API source/tenant regression: 1 passed; legacy tests: 24.
Ordinary-topic policy enabled 1079 topics and 1147 grants, only for institutions
already approved/enabled. Original restricted rules remain excluded; two separate
category-only incident projections can emit minimized fire/police summaries.
Those projections use category summaries without copying private names/addresses.
Original public source links remain available within existing institution rights.

umraniye-cit-routing.timer is enabled and active.
Each pass checks 25 latest posts plus a rotating 25-post backlog.
status.json and ledger.json store IDs, reasons, timestamps and counters, not
duplicate raw posts. Unresolved inputs remain in the original archive and are
automatically reassessed. There is no manual review queue.
Raw news are not deleted by this worker.

Locality distinguishes independently verified records from explicit textual
district evidence. District/neighborhood abbreviations are recognized; source
account names and street-only references are insufficient. Conflicting districts
stay unassigned. Strong text evidence never changes verified to true.
Only minimized district-level tasks may be projected for sensitive incidents.

Writes are explicit and transactional. The adapter rechecks fresh source text,
topic grants and institution approval in the same transaction. Stable task keys,
exact-text/day correlation and selected legacy-topic checks prevent covered
duplicate paths. This is not a claim of perfect semantic event deduplication.
The legacy worker remains active. Both workers now share a nonblocking system
lock; a busy round exits successfully and the next timer retries automatically.
Cross-engine duplicates must continue to be monitored. No Telegram/browser
collector changes are part of this worker.
No mail/outbox write exists in the new worker.

Latest real-data check:
- 796 archived posts, 796 tracked ledger IDs.
- 2 traffic projections already existed under the new worker.
- Reliability pass added 1 water-outage and 1 planned-power-notice projection.
- 7 existing projections were recognized instead of duplicated.
- Cross-engine same-event/same-institution groups: 0 at verification time.
- Site and authenticated portal/news/social APIs HTTP 200 after hardening.
- Facebook query identifiers are preserved; tracking/token query keys removed.
- Invalid publication dates are held, never replaced with invented dates.
- Atomic state writes and validated backup recovery survive checkpoint damage.
- Transaction rollback/retry and shared-lock contention/release were tested.

Known limits:
A deterministic phrase/rule engine is not unrestricted human language
understanding. Rule-fixture tests are not real-world accuracy statistics.
Ambiguous locations, insufficient text, unapproved institutions and unmatched
descriptions do not produce invented assignments. They stay archived and are
reassessed. Full coverage of all possible citizen descriptions is not guaranteed.
Authority labels are candidates and mandateVerified remains false; the owner
approved panel coordination mappings, not a legal finding about jurisdiction.

Tests use isolated in-memory databases. No V2/V4 ZIP contents were used.
Initial catalogue registration was additive, pending/disabled. Approval was a
separate owner-authorized policy action. Consistent backups preceded live writes.
