SHADOW ONLY — LOCAL EVALUATION PACKAGE

The default analyzer/CLI has no database, HTTP, email, Telegram, browser or
service integration. analyze(event, options) returns an in-memory plan.
Optional live-adapter.mjs is a separate, uninstalled DB projection adapter;
persistPlan refuses writes unless explicitly opted in. It rechecks the source,
permissions and sensitive-data gates inside an atomic transaction. It writes
only minimized cases, source links and an audit entry; never an outbox.
Existing institutions, grants, users and cases are not changed.
Optional catalog-registration.mjs provides a tested reversible data migration:
1610 new topics are pending/disabled and receive no grants. Rollback refuses
approved or used topics and is atomic. Neither migration direction ran live.
The caller supplies read-only approval snapshots; every new CIT topic remains
ineligible until explicitly approved and granted. Existing broad grants are NOT
silently mapped to new subtypes. Service authority labels are candidates, not
legal findings, and mandateVerified remains false.

No V2/V4 archive contents were used. The catalogue is newly authored and must
be reviewed as a new taxonomy rather than described as preserving old rules.
Titles are explicitly enumerated faults and service failures, not a generated
cross product. Different spelling or normalized paraphrases do not create codes.

Current audited count: 1610 distinct titles, 1390 panel candidate mappings.
Tests: node --test server/institution-coordination/citizen-shadow/*.test.mjs server/institution-coordination/citizen-shadow/test.mjs
1640 tests pass: every rule has positive, historical, simulation, resolved,
negated, absent-location and absent-grant checks. Also checks privacy, shared
canonical identity, per-panel duplicate keys and read-only SQL snapshots.
language.mjs supplies bounded Turkish phrase normalization, not full morphology.
integration.mjs consumes supplied snapshots, never opens a database. Legacy
topic grants must not be silently translated to CIT subtype grants.
cli.mjs reads a bounded JSON batch from stdin; --stats reports real coverage.
API: import {analyze} from './engine.mjs'; analyze(event, approvalSnapshot).
Rollback: remove only the newly added citizen-shadow directory locally.

Files:
catalog.mjs: combines the 169 original, 141 extended, 1300 domain rules.
extended-catalog.mjs, domain-catalog.mjs: explicitly authored catalogue data.
language.mjs: bounded Turkish normalization and clause state, bounded caches.
engine.mjs: pure decision planning, permissions, sensitivity and conflict gates.
integration.mjs: consumes actual-schema-shaped snapshots, no DB handle.
cli.mjs: bounded stdin JSON input / stdout JSON output, no installed timer.
test.mjs, coverage.test.mjs, acceptance.test.mjs: fixture-only tests.
audit.mjs: per-rule positive/negative/resolved diagnostics.
Existing scripts/test-server.mjs: Windows URL path correction via fileURLToPath.

No database schema changes are required. Tests use :memory:
SQLite and the existing coordination migration solely as a fixture schema.

Additional preparation tests: 4 live-adapter tests and 2 registration tests
passed. 1646 total tests across the new module suites. No live writer/timer
has been installed. readiness.py opens the specified live DB in read-only mode.

Operational limits before any future integration:
- Legal mandates are candidate descriptions, not legally verified assertions.
- All CIT topic approvals/grants must be explicit; broad legacy topic grants
  are not automatically inherited. Unmapped institutions/topics stay held.
- Names, diagnoses, children and sensitive events need authorized human review.
- Locality must come from a trusted reviewed locality object; an account name
  or a street alone never supplies verification. Unknown neighborhood withheld.
  The host passes neighborhoodNames from its reviewed geographic dictionary.
  The standalone engine does not import host files. Without that allowlist it
  returns district precision and omits the neighborhood.
- Cross-source eventIdentity/canonicalEventId must be supplied by a trusted
  correlator. Without it, stable post identity prevents same-post duplication;
  differently worded cross-source reports are not claimed to be deduplicated.
- Turkish handling is deterministic phrase/suffix normalization and explicit
  exclusions. It is not unrestricted semantic understanding of arbitrary text.
- Evaluate independent human-labelled real reports before production. Passing
  fixture tests measures programmed behavior, not real-world precision/recall.
- Existing accounts/cases/grants, scrapers, Telegram and sync untouched.
- No publication, push, live service restart or deployment is included.
