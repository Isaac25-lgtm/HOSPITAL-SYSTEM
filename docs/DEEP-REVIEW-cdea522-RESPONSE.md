# Response to the follow-up review of cdea522

Review: `docs/DEEP-REVIEW-cdea522.md`. All four findings are confirmed in the source and fixed; each has a regression test
that runs the real code, and the three reproducers in `docs/audit-support/` no longer reproduce. Deployed on the demo
server (`vipers-hospital-vm`).

| # | Finding | Status | Fix |
|---|---|---|---|
| D01 | Queued demo reset runs after production activation | **Fixed (wider than reported)** | The same check-then-lock order was also in `05-demo-accounts.sh`, `06-crater.sh` and `09-expiry.sh`. All four now take `/run/vipers-ops.lock` **first** and only then read the production marker, so a job queued behind the production switch sees the marker it wrote and refuses. A caller that already holds the lock (the guard, the production switch) exports `VIPERS_OPS_LOCK_HELD=1`, so `05-demo-accounts.sh` run by the guard does not wait for its own lock. |
| D02 | Restore extracts archives outside the verified inventory | **Fixed** | `verify_backup` refuses any entry in the folder that `CONTENTS` does not list (hidden files and directories included) and any listed archive that is not a known volume (`VIPERS_VOLUMES`). `reset-demo.sh` restores exactly the `.tgz` entries of the verified `CONTENTS`, rechecks them against the volume list before anything is stopped, and no longer globs the folder. |
| D03 | Clean install starts containers before their mounted files exist | **Fixed** | New `scripts/stage-mounts.sh` creates `bahmni-reports.properties.template` and `crater-nginx.conf` (validated: password placeholder, query-free log format); `02-configure.sh` runs it, i.e. before the first `vipers up`. An empty directory left by an earlier start is replaced; a non-empty one stops the setup. `vipers up` refuses to start when either file is missing or not a file. `04-harden.sh` and `06-crater.sh` call the same script instead of their own copies. |
| D04 | Diagnosis timeout stops before the body is read | **Fixed** | The 15-second deadline races the whole request (headers **and** body) and is cleared only after the body has been read or on failure; when it fires it aborts the request, the loading mark is removed and the normal retry follows. |

## Verification (29 Oct 2026, on the server)

- `unit-ops.py`, run in a throwaway `python:3.12-slim` container (no `/opt/vipers`, no Docker inside, so a refusal
  that failed could not touch anything): 12/12, including the new checks -
  - D01: each of the four scripts is run for real with a stand-in `flock` that writes the production marker while
    "waiting"; every one refuses afterwards. With the lock already held, `flock` is not called and the check still applies.
  - D02: valid backup accepted; an unlisted corrupt archive, an unlisted valid archive, a hidden file and a directory are
    refused; a listed optional `bahmni-forms` is accepted; a listed unknown volume is refused.
  - D03: with the two paths pre-created as empty directories (what Docker leaves), staging produces correct files;
    an existing file is kept; a non-empty directory stops the setup.
- `unit-overlay.js` 4/4, including the new stalled-body case: the deadline is still running while the body is read, no
  second request starts meanwhile, firing it clears the loading mark, and the next attempt loads the diagnoses.
- Other suites unchanged and passing: `unit-trial` 25/25, `unit-trial-admission` 4/4, `unit-trial-recovery` 5/5,
  `unit-ai` 17/17, `unit-privacy`.
- Reproducers: `deep-review-cdea522.js` (D04) and `deep-review-cdea522.py` (D02, first check) now fail their
  "defect present" assertions; `review-2026-10-29.js` (R07) likewise.
- On the server: the existing mount files pass the staging checks; both current backups (`baseline`, nightly) pass the
  stricter verifier; a guard run completed its demo repair with the lock held (no self-deadlock).
- Restore drill and browser regression: see "Restore drill and regression after the cdea522 follow-up" in `AUDIT-FIXES.md`.

## Found by the acceptance runs (and fixed)

| # | Defect | Fix |
|---|---|---|
| A01 | **Restore left the web proxies pointing at old addresses.** The first restore drill finished "successfully", but `/openmrs` then reached another container ("Cannot GET", HTTP 404) and the billing sync crash-looped: Bahmni's proxy and Crater's nginx were not restarted and kept the internal addresses they had resolved at start, while the restarted services got new ones. | `reset-demo.sh` restarts both proxies after `vipers up`. Second drill: restore exit 0, OpenMRS back in 344 s, five route checks in a row public `/openmrs` 200, billing 200, billing sync running with 0 restarts. |
| A02 | **The production switch could not complete.** On a disposable copy of the server, `production-mode.sh` stopped at the stale-visit task: this OpenMRS version has no `STARTTASK` action (the API rejected it). Everything after that step - locking the demo cashier, switching off free-text AI and the trial portal, the production `site.json` - never ran. | Starts the task with `SCHEDULETASK` only if it is stopped, then checks that it runs. |

### Production-mode acceptance (disposable copy of image v4, 29 Oct 2026)

A VM made from `vipers-hospital-golden-v4` (no cloud identity, web ports sealed), services started, then
`production-mode.sh` run for real. After the A02 fix (task stopped first, so the switch had to start it):
switch completed; demo.doctor/nurse/admin and superman/admin with public or default passwords refused, owner account
works; password policy 10 characters with digit and non-digit; free-text AI and trial portal off; `site.json`
`{"mode":"production",...}`; billing demo cashier refused (422); expiry timer disabled; `reset-demo.sh`,
`05-demo-accounts.sh`, `06-crater.sh` and `09-expiry.sh` all refuse; the guard keeps self-heal only and demo.doctor stays
refused after a guard run; the switch completed after the earlier failed attempt and a second run is harmless. The VM was
deleted afterwards.

### Trial image v4

`vipers-hospital-golden-v4` (label `vipers-boot-sealed=v1`) holds the current trial code (opaque server names, diagnosis
deadline, staged mount files, add-on image rebuilt). Reboot check: seal active before Docker, 3 hooks and the TCP/UDP drop
rules for IPv4 and IPv6, no containers running, no trial markers, no `site.json`. (`production-mode.sh` and
`reset-demo.sh` were fixed after the image was made; neither runs on a trial server, both refuse there.)

## Not covered here

- A complete installation on a pristine host was not repeated. The staging order is covered by the fixture test and by
  `vipers up` refusing to start without the files; the clean-host run belongs to the target-install acceptance (planned
  Hetzner install).
- `TRIAL_SA` isolation and the off-site backup bucket: the owner approved both; the permission changes are prepared as a
  script for the owner to run (`vipers-cloud-setup.ps1`), after which the server is switched over and both are tested.
