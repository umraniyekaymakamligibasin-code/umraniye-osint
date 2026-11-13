# Instagram publication date lineage repair

Observed aggregate evidence: 76 date-unverified decisions came from the legacy review file, none with a top-level publication date. The existing API queue contained exact-link publication evidence for 57. Of these 45 were older than 72 hours and 12 between three and 72 hours; 19 had no stored evidence. These counts are not a measurement of newly missed news.

The existing evaluator now joins missing dates from the private read-only API queue using exact canonical permalink, API collection provenance, matching media ID, and agreement between the stored queue timestamp and payload timestamp. Conflicting, future and naive timestamps are rejected. Existing dates, author, body and first discovery remain unchanged. The review file is not rewritten. Publication dates are never derived from discovery time.

Recovered old records use the existing three-hour archival decision. Any recently dated historical recovery is explicitly prevented from automatic approval/replay. This does not broaden the legacy classifier or affect new API admissions, Telegram routing, the news/social separation or collectors. Normal scheduled evaluation refreshes decision reasons after installation.

Eighteen isolated tests cover identity checks, conflicting/future/naive dates, no writes, unchanged metadata, and no historical approval. The existing classifier selftest also runs before install. The installer previews real aggregate evidence read-only, locks the existing evaluator, checks the exact file version, backs up the code, and atomically replaces one Python file. It restarts no services, makes no API calls and writes no database rows. Root access is required for installation and evidence preview.
