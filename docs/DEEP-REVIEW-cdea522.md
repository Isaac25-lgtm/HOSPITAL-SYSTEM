# Production follow-up review of cdea522

29 October 2026, Africa/Kampala. Exact reviewed commit: `cdea5225eff77490536a7a82f932c6c7ff74bd48`. Working tree was clean at the start. No application or deployed resources were changed during this review; only this report and isolated audit harnesses were added.

**Decision: R01–R09 remain addressed, but this commit cannot receive production sign-off for real patient data.** Three high-priority source issues and one medium-priority browser issue remain below. One of the three high-priority issues is carried over from the older audit, rather than a newly introduced regression. These are distinct from the cloud changes and operational acceptance work already acknowledged by the owner.

## Corrections to the earlier verification status

- The completed "Regression after the 29 Oct review fixes" section is now present in `docs/AUDIT-FIXES.md`. Its formerly missing status is closed. It records server-side unit and browser passes, performance 7/7, UX 28/28, cleanup and baseline verification.
- The server's reported `unit-ops.py` 8/8 result is acknowledged. The Windows runner's inability to execute its shell fixtures is not treated as a firewall or application failure.
- The local branch points to the supplied commit. A remote GitHub ref or deployed file hash was not independently queried in this run.
- Independently reran: trial 25/25, admission 4/4, recovery 5/5, and all three overlay checks. All passed. `git diff --check` passed.

## D01 — P1: a queued demo reset can run after production activation

Sources: `scripts/reset-demo.sh:11–12`, `scripts/production-mode.sh:21–33`.

Reset tests the production marker **before** acquiring the maintenance lock. Production mode acquires that lock before authenticating and writing its marker. A concrete interleaving is:

1. Production mode owns the lock and is still checking owner authentication; the marker has not been written yet.
2. Reset sees the old demo profile, passes its refusal check, and waits for the same lock.
3. Production mode retires demo accounts, sets production policy and finishes.
4. Reset acquires the released lock and restores its demo baseline without rechecking the now-production profile.

This can undo account retirement and password policy, replace data, and restart the application while `/opt/vipers/profile` still says production. R04 correctly serializes the guard; that fix does not protect this queued reset because its profile decision precedes the lock.

**Required fix:** acquire the lock before checking the profile, or recheck under the lock immediately before verification/mutation. Exercise this exact queued-reset interleaving on a disposable installation. A deterministic source-fragment harness is included in `docs/audit-support/deep-review-cdea522.py`; it models the profile changing while flock waits. It has not run successfully on this Windows shell runtime; the finding follows directly from the source ordering.

## D02 — P1: restore selects archives outside the verified inventory

Sources: `scripts/backup-verify.sh:7–20`, `scripts/reset-demo.sh:29–31`.

Verification checks required files, the entries in CONTENTS and the checksums in MANIFEST. It never rejects additional files in the directory. Restore then independently enumerates **all** `*.tgz` files instead of the verified inventory.

For example, add a stale or corrupted optional `bahmni-forms.tgz` to an otherwise valid backup directory without changing CONTENTS or MANIFEST. None of the verifier's checks reads or checksums it. Restore still selects it, empties the matching volume and extracts it. A corrupt extra archive fails only after databases have already been imported and that volume has been cleared; a valid stale archive silently restores unchecked data. This needs no compromised hash or malicious modification of the manifest.

**Required fix:** make the verified inventory authoritative for extraction, validate permitted volume names, and reject unexpected restore inputs before stopping services. Add a regression with both corrupt and valid unlisted optional archives. The Python audit harness creates these fixtures and calls the real verifier/loop selector, without running Docker or a restore; Linux execution remains required.

## D03 — P1, carried over: clean installation still starts file mounts before creating them

Sources: `DEPLOYMENT.md:78–83`, `scripts/docker-compose.vipers.yml:16,27`, `scripts/04-harden.sh:50–54`, `scripts/06-crater.sh:103–108`.

The documented clean-install sequence executes `vipers up` before hardening and billing setup create the two files mounted into reports and Crater nginx. Their bind sources are `/opt/vipers/branding/bahmni-reports.properties.template` and `/opt/vipers/branding/crater-nginx.conf`. The preceding install/fetch/configuration scripts do not create either file.

With the short bind syntax, absent host paths can be created as directories, producing a directory/file mismatch at container startup. Later scripts cannot simply write their generated template/config to those directories. An existing demo or golden-image test does not exercise this pristine-host sequence. Fixing R01's missing reports-password lookup does not fix these missing mount sources. This is the older H07 / historical finding 23, still visible in current source.

**Required fix:** stage the required configuration files before the first Compose start, fail explicitly on missing/wrong-type sources, and demonstrate installation from a clean host without inherited `/opt/vipers/branding` state. This review did not perform a new Docker installation.

## D04 — P2: the diagnosis timeout stops before the response body is read

Source: `edge/addons/public/vipers.js:814–818`, `:842`.

The fetch handler clears its 15-second abort timer as soon as response headers arrive, then awaits `r.json()`. If headers arrive but the body stalls, JSON reading has no remaining deadline. `data-vp-dx-loading` stays set and subsequent calls refuse to retry. A user can remain at the original "No diagnosis for this patient" placeholder while diagnosis retrieval is actually stuck.

**Required fix:** keep the deadline active through body consumption and clear it on every completion/error path. Verify retry after a body stall as well as a connection/header stall. **Independently reproduced** by executing the actual `adtDiagnoses()` function with an isolated DOM, controlled timers and a response whose body never completes. The existing overlay test does not provide AbortController/timers in its context and tests HTTP failure/pagination, so it does not cover this path.

## Reproduction and evidence limits

`node docs/audit-support/deep-review-cdea522.js` reproduced D04. It performs no network calls and has no real timers. Exit zero means the defect was observed; it is not a release gate.

`python docs/audit-support/deep-review-cdea522.py` is a Linux-capable fixture harness for D01/D02, containing no Docker/cloud/database operations. It could not get past the valid-backup control on this workstation because Git Bash initialization returned Windows exit code `3221225794` (`0xC0000142`), including for a bare `echo shell-ok`. Consequently D01/D02 are source-confirmed findings, not claimed Linux runtime reproductions. D03 is a source/documentation finding. D04 is runtime-reproduced against a fake environment.

The unit passes and server regression record support the fictional-data demo/trial workflows. They do not test these failure paths or certify the upstream applications. No live firewall, database restore, cloud IAM change or production transition was performed here.

## Remaining deployment acceptance

The owner's stated requirements still stand: isolate trial cloud identity if trials remain hosted, configure off-site backups and prove a clean-host recovery, run production-mode acceptance on the target install with named staff/appropriate permissions, and rebuild the trial image or otherwise establish deployed script parity. The latest baseline verifies backup structure/checksums; it does not by itself prove complete restoration.

Resolve D01–D03 before release, cover D04's stalled-body path, and retain the resulting clean-install/production-transition/recovery evidence. Fixes to R01–R09 and successful demo browser tests alone are insufficient for production sign-off.
