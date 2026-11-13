# OSINT GitHub workflow

The user requests that completed work in this project also be saved to their existing GitHub repository:
https://github.com/umraniyekaymakamligibasin-code/umraniye-osint

The live server is the source of truth. Its existing source-only sync runs from
/home/basin/.local/share/umraniye-github-sync/github_sync.py via cron every minute,
watching for stable changes during each run. It pushes to main without deploying
anything from GitHub back to the server. Do not force-push or replace this workflow
with a second competing writer.

After each completed implementation milestone, verify the sync status and compare
the mirror HEAD with origin/main using git ls-remote. Do not report a successful
upload merely because files were edited or committed locally.

Prepared, not yet installed institution source is mirrored separately under
development/institution-coordination. Its local source is work/institution-coordination-v3;
the server export source is /home/basin/.local/share/umraniye-github-sync/development.
When changing those drafts, transfer the reviewed source changes to that export
directory and verify their push, keeping them distinct from deployed application/.
The local draft export is not a continuous Windows file watcher.

Never upload passwords, tokens, private keys, actual credentials, environment files,
browser profiles, cookies, databases, raw user records, logs, or backups. Keep the
sync secret scanner enabled; investigate a rejection instead of bypassing it.
Source code implementing credential management is allowed only after inspection.

An existing checkout is located at
<yerel-klasör>/repository.
It may contain unrelated uncommitted work. Inspect its status before using it and
never stage, discard, overwrite, or publish another chat's unfinished changes.

Server access, where available, uses basin@<sunucu-ip>. Do not print SSH key
contents or assume old credentials remain valid. GitHub sync authorization does not
authorize unrelated changes to live services or data.
