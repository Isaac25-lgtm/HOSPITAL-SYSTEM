# Response to the code review of 29 October 2026

Review: `docs/CODE-REVIEW-2026-10-29.md` (base `bb25664`). All nine findings are confirmed in the source and fixed; the
credential question is settled on the live server. Fixes are deployed on the demo server (`vipers-hospital-vm`).

| # | Finding | Status | Fix |
|---|---|---|---|
| R01 | Fresh configuration aborts on a missing reports entry | **Fixed** | `02-configure.sh` reads `REPORTS_USER` with `(grep -s … \|\| true)`; an absent file or key gives an empty value instead of ending the script under `set -e`. |
| R02 | Empty OpenMRS username breaks hardening | **Fixed** | All three lookups in `04-harden.sh` use `if (.username // "") != "" then .username else .systemId end`, so the sync account (username `""`, system ID `admin`) is handled correctly. |
| R03 | Billing setup bypasses production/trial boundary | **Fixed** | `06-crater.sh` refuses on a production profile or a trial server before changing anything. The demo cashier helper `crater-demo-user.php` refuses unless its caller sets `VIPERS_DEMO_BILLING=1`; only `06-crater.sh` and the guard do, after their own production/trial checks. |
| R04 | Production switch races a running guard | **Fixed** | `production-mode.sh` holds `/run/vipers-ops.lock` for the whole switch (waits up to 15 min). A guard run already in progress finishes first; a later one takes the lock, then sees the production marker and keeps self-heal only. |
| R05 | Restore keeps hidden files | **Fixed** | `reset-demo.sh` clears each volume with `find /v -mindepth 1 -delete` (hidden entries included, mount point kept) before extracting. |
| R06 | IP change raises a trial's AI allowance | **Fixed** | `03-edge.sh` resolves each limit as explicit value, else the current `edge.env` value, else the default; the first-boot address-change path also passes the trial's own limits and free-text setting from metadata. |
| R07 | Late 404 overwrites a confirmed deletion | **Fixed** | `refresh()` checks the deletion generation immediately after the instance lookup, before any write (including the missing-instance branch). |
| R08 | Recovered server duplicates the record | **Fixed** | Reconciliation revives the existing record for that server (one record per id, status/polling follow it). A record whose deletion was already confirmed is set to `deleting` again, never brought back. |
| R09 | Hospital name kept in the VM name | **Fixed** | New servers are named `vh-trial-<random id>`; the hospital name no longer appears in server names, the registry or logs. Servers created earlier keep their descriptive name until they are deleted (at most five days). |
| Q | Atomfeed database credential | **Settled, no change** | Tested on the server: `MYSQL_ROOT_PASSWORD` signs in to the atomfeed database as root, `CRATER_ATOMFEED_DB_ROOT_PASSWORD` is refused. Backup and restore use the right one; the nightly backup completes. Comments added in both scripts. |

## Verification (29 Oct 2026, on the server)

- Unit suites (node:22-alpine): `unit-trial` 25/25, `unit-trial-admission` 4/4, **new `unit-trial-recovery` 5/5** (R07, the
  revived record and its status answer, re-deletion of a deleted server, opaque names), `unit-ai` 17/17, `unit-overlay` and
  `unit-privacy` pass, `unit-ops.py` 8/8.
- Codex's reproducer `docs/audit-support/review-2026-10-29.js` no longer reproduces: its first assertion now sees
  `deleted` instead of `failed` (it exits non-zero by design once the defect is gone).
- Shell checks with real fixtures: R01 missing file / missing key / present key; R02 jq selection gives
  `admin`, `x1`, `superman` for the three account shapes; R05 hidden files and directories removed, mount kept; R06
  no file → default, existing 50 000 kept, explicit value wins, invalid value → default; R03 refusal on the production profile.
- Browser regression: see `AUDIT-FIXES.md`, "Regression after the 29 Oct review fixes".

## Also fixed in this round

- **Sign-in looked slow in automated tests (46 s).** `site.json` does not exist on the demo server; its 404 over HTTP/3
  was never reported as finished to the test browser, so "network idle" never came. The add-on service now answers `{}`
  when no `site.json` is published (same meaning: demo mode).
- The one-time "clear site data" code in `vipers.js` was removed; it could stall a first visit and is no longer needed.
- Phones: the Login button of the manual sign-in form was covered by the floating buttons (CSS margin overridden, and
  ineffective inside a one-screen wrapper); fixed and probed at 390x844. Details in `AUDIT-FIXES.md`.

## On the independent verification (`PRODUCTION-VERIFICATION-2026-10-29.md`)

- **Regression evidence:** the section "Regression after the 29 Oct review fixes" is now in `AUDIT-FIXES.md`; it was
  written after the run finished.
- **`unit-ops.py` failing at the mocked firewall check:** the check runs fake `iptables`/`ip` scripts through `PATH`; the
  Windows/Git Bash sandbox could not execute them (the same runtime failed in the first review). On the Linux server the
  suite passes 8/8, including that check.
- **Production sign-off:** agreed - fixing R01-R09 does not by itself make an install ready for real patient data. Still
  required, as listed: a production-mode acceptance run on the target install with named staff accounts; off-site backups
  and a clean-host restore drill; `TRIAL_SA` isolation if trials stay hosted; an image rebuild for source/image parity.

## Remaining (needs the owner)

- `TRIAL_SA`: a separate low-privilege service account for trial servers (IAM change).
- Off-site backups: a storage bucket for `BACKUP_BUCKET` (bucket + permission).
- The trial image `vipers-hospital-golden-v3` still holds older copies of `03-edge.sh`, `06-crater.sh` and the demo cashier
  helper. Trials are not affected: the current first-boot script is delivered at sign-up and passes the AI limits itself,
  and the guard on a trial runs self-heal only. The next image rebuild picks up the new copies.
