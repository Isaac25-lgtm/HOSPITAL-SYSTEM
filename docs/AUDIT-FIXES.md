# Confirmed audit defects — implementation and rollout

These changes address the confirmed demo/trial code defects. They were deployed on 28 Oct 2026 and verified on real boots (see the rollout record and the final-sweep section below). The historical production-readiness report remains a snapshot, not a claim that the new source is production approved. Claude's pre-existing spinner changes in vipers.js/vipers.css and spinner tests were preserved.

## Implemented

- H01: new image preparation installs a required systemd quarantine before Docker, dropping inbound TCP/UDP 80/443 through INPUT/FORWARD for IPv4/IPv6. Failure prevents Docker startup. Provisioning refuses images without the verified `vipers-boot-sealed=v1` label. First boot checks the installed seal and keeps/reinstates it on error.
- H02/M13: strict error propagation, parent ERR handler, explicit HTTP checks, password rotation journal written/synced before mutation, resume with either journalled password, and atomic local secret replacement. Error paths leave the trial quarantined; the guard ignores unconfigured trials. Expiry poweroff uses a persistent timer and failures are no longer ignored.
- H05/M14: cloud reconciliation before every admission; failed discovery/listing creates no reservation; persisted create intent distinguishes never-submitted from uncertain requests; legacy zone-empty reservations can recover placement.
- M01/M02: only the deletion verifier persists in nonsecret instance metadata for registry reconstruction. Secret metadata removal is awaited and read back before readiness. Existing records acquire the verifier during scrubbing. Legacy instances whose secret was already scrubbed AND whose original registry is lost cannot recover that verifier automatically: recreate those fictional trials or perform controlled operator credential re-enrolment. Do not claim their old tokens are recoverable.
- M05/M06: diagnosis pagination validates same-origin FHIR links, rejects errors and retries; successful completion alone marks loaded. Clinical exclusions now apply before all text replacements, including stock phrases.
- M12: immutable backup generations plus atomic `.current` pointers; required checksummed CONTENTS/MANIFEST and all core dumps/document archives before restore. Old directories remain intact. Legacy manifest-less baselines must be regenerated with the new backup tool; restore intentionally refuses them.
- M15: guard scopes unhealthy containers to the bahmni-lite Compose project and honours `/opt/vipers/maintenance`. `vipers down` sets maintenance; successful `vipers up` clears it.
- H06/M04: all required hardening failures affect exit status; authentication distinguishes explicit rejection from unknown/server failure. Security checks query firewall evidence and fail on inaccessible evidence instead of hardcoding success. Final acceptance checks every JSON result and creates FAILED/nonzero instead of DONE on failure. API permission/clinical-save/hit-test assertions were tightened.
- H04/L01: **default free-text forwarding is off**. Static Help still answers standard questions. Explicit `AI_ALLOW_FREE_TEXT=true` is an acknowledged opt-in to residual identifier risk, not an anonymisation guarantee. Documentation now distinguishes public demo credentials from private secrets and corrects original trial-unit count 15 to 14. The expanded trial suite currently has 23 assertions.

## Required rollout

1. Use a **disposable builder** containing the current complete kit/scripts, separate from the live demo/controller. Run `VIPERS_IMAGE_BUILDER=1 VIPERS_EXPECTED_HOST=$(hostname) bash scripts/prepare-trial-image.sh`. Do not execute this quarantine preparation on the live controller.
2. Reboot/probe the builder externally throughout boot: TCP 80/443 and QUIC/UDP443 must remain unreachable while Docker starts. Verify a broken quarantine service prevents Docker startup. Inspect effective IPv4/IPv6 and cloud firewall rules, route interfaces, and systemd ordering.
3. Stop the builder and capture a fresh golden image. Only after those checks, label that image `vipers-boot-sealed=v1` and configure TRIAL_IMAGE. The provisioner now needs read access to that image and refuses the old unlabelled image. This deliberate refusal closes the unsafe old-image provisioning path.
4. Deploy add-on code and all helper scripts together. Do not ship only tenant-firstboot.sh: it requires trial-firewall.sh/auth-check.sh in the sealed image. Deploy backup-verify.sh with backup/reset scripts. Regenerate the baseline and verify the new complete backup before any restore.
5. Keep free-text AI opt-in unset/false for any real-data install. (The owner chose to enable it on the fictional-data demo and trials; that choice is set explicitly in edge.env and trial metadata.) Restart the add-on service to discard prior cache/config. If explicitly enabled for fictional trials, provider filters still do not guarantee privacy.
6. Create a fresh fictional hospital and inject failures at each setup stage; verify quarantine, no public/default authentication, billing revocation, effective password policy and safe resume after reboot. Deny metadata scrubbing and require no ready URL. Test controller restart/registry loss, capacity, self-delete and cloud-confirmed VM/disk disappearance. Refresh existing trial code or recreate fictional trials before treating them as covered.

No cloud IAM changes, production mode, off-host backup service, independent disk cleanup, provider-wide budgeting, pinned platform migration or admission-verification design is claimed here. These remain the separate design/production items identified by the user.

## Local verification commands

Run with APP set to the **absolute** edge/addons directory:

```text
node tests/unit-ai.js
node tests/unit-trial.js
node tests/unit-privacy.js
node tests/unit-overlay.js
python tests/unit-ops.py
```

AI unit: 17 checks against a fake provider with explicit free-text opt-in. Trial unit: 23 checks against a fake cloud, including registry-loss admission, scrub denial/readiness, recovered deletion and unsealed image refusal. Privacy unit verifies no free-text/history reaches a fake provider by default. Overlay unit covers protected clinical phrases and diagnosis retry/pagination. Ops unit exercises failed setup propagation and complete/missing/corrupt backup fixtures; HTTP auth cases skip when jq is unavailable locally. Syntax checks do not substitute for actual Ubuntu/systemd/Docker/cloud tests.

The old docs/audit-support/reproduce.js is a historical defect reproducer. It is not a release gate; exit zero originally meant a defect was reproduced. Use the regression suites above for the new implementation.

Executed locally after these changes: unit-ai 17/17, unit-trial 23/23; unit-privacy and unit-overlay passed. unit-ops passed parent-failure propagation, mocked IPv4/IPv6 TCP/UDP quarantine, complete/missing/corrupted backup fixtures and all shell parse checks. Its HTTP auth cases were explicitly skipped because this workstation has no jq. Changed JavaScript parses and git diff --check passed. No real provider request, cloud deployment, real firewall change, database restore or fresh trial acceptance run was performed.

## Rollout record (28 Oct 2026, evening) — what the real-boot verification found

Deployed to the main server first (add-on code, scripts, browser layer; free-text AI kept **on** for this fictional-data
demo/trials by the owner's decision via `AI_ALLOW_FREE_TEXT=true`, code default stays off). The sealed image was then
built on a disposable builder (`vipers-image-builder`, deleted afterwards) and verified with real reboots and external
TCP/UDP probes from the main server, using a test listener on 80/tcp, 443/tcp and 443/udp with an auto-restart policy.

The mocked unit tests passed, but the real boots exposed three problems, all fixed before the image was captured:

1. **Docker places its own FORWARD jumps above ours when it starts.** With hooks only in INPUT/FORWARD, a reboot test
   received 48 answers (TCP 80 and UDP 443 reached the listener). `trial-firewall.sh` now also creates `DOCKER-USER` before
   Docker starts and hooks the quarantine there (Docker always evaluates DOCKER-USER first and never rewrites it).
   After the fix: 234 TCP requests and 78 UDP packets across a hard reset, **0 answers**; drop counters 125 TCP / 19 UDP.
2. **An empty or broken seal script reported success.** The seal unit now has `ExecStartPost` checks that the rules exist
   (IPv4 and IPv6, including DOCKER-USER); a broken seal fails the unit and Docker does not start — verified: seal
   "failed", "Dependency failed for docker.service", 0 containers.
3. **Unit files written just before a crash/reset can be empty.** `prepare-trial-image.sh` now syncs and refuses empty
   unit/helper files.

Image `vipers-hospital-golden-v2` (family `vipers-hospital`, label `vipers-boot-sealed=v1`) also carries the In-Patient
`enableIPDFeature=false` setting and the edge rule that injects the VIPERS layer into cached legacy pages.
The main server's portal uses it (`TRIAL_IMAGE=vipers-hospital-golden-v2`).

Also on the main server: the existing manifest-less `baseline` backup is refused by the new restore; a new baseline must be
taken (`backup.sh baseline`) before `reset-demo.sh` can be used.

## Final sweep (Codex, ccabb65): fixes

| Finding | Fix |
|---|---|
| F02 completion crash window | `tenant-firstboot.sh` commits `configured`, the IP and a copy of `site.json` to disk (sync) **before** publishing readiness; a later boot republishes the committed state and never needs the scrubbed bootstrap password. |
| F03 failed edge became "ready" | `03-edge.sh` stops on any `vipers up` / recreate failure and checks Caddy and the add-on service are running; first boot requires a valid-certificate HTTPS answer (`curl -f`) before readiness, otherwise it stays quarantined and failed. |
| F07 refresh overwrote deletion | Each deletion bumps a generation counter; a refresh that started earlier never writes status afterwards. |
| F08 narrow seal postconditions | The seal unit checks the exact TCP and UDP drop rules on 80,443 and the ingress-interface hooks in INPUT, FORWARD and DOCKER-USER, for IPv4 and IPv6. |
| F09 fresh-install abort | Missing `edge.env` or key falls back to `false`; operator `TRIAL_*` settings now survive a regeneration of `edge.env` (previously `TRIAL_IMAGE` would have been dropped). |
| F10 broad table-cell exception | Only on the Appointments app, and never inside any other clinical container. |
| F11 hanging diagnosis request | 15-second timeout per page; a timeout is a failure and is retried. |
| F12 dated backups never expired | Default-named (timestamp) pointers expire after 14 days; named backups are kept. |
| F14 stale "no access" message | Only 401/403 answers that arrive while the current spinner is up count; 401 says the session may have ended, 403 says the role has no access. |
| F15 documentation | Corrected AUDIT-FIXES status, TRIAL-PORTAL admission order, removed "Care View" from help and the AI guide, clarified the free-text choice. |
| C01/F01 production boundary | `scripts/production-mode.sh`: one-way, verified switch (retire and prove demo accounts dead, production password policy, stale-visit task restarted, billing demo user locked and tokens revoked, free-text AI and trial portal off, role cards hidden). Demo scripts (`05-demo-accounts`, `reset-demo`, `09-expiry`) refuse to run on a production server; the guard keeps self-heal only. |
| F04/H03 trial identity | Provisioning refuses to run trials as the controller identity unless `TRIAL_ALLOW_CONTROLLER_SA=true` is set explicitly; set `TRIAL_SA` once the low-privilege account exists (needs the owner's IAM approval). |
| M10 admission | Durable daily cap `TRIAL_DAILY_MAX` (default 6) counted from the registry. |
| M11 retention | Deleted trials keep only id, VM name, dates and reason; logs no longer contain hospital or user names; status of a deleted space returns only "deleted". |
| M08 AI budget | Each trial server gets its own AI allowance (`TRIAL_AI_DAILY_TOKEN_LIMIT` 50 000 / `TRIAL_AI_TOTAL_TOKEN_LIMIT` 250 000 by default). Set a provider-side spending cap as well. |
| M07 currency migration | Billing app and sync are stopped during the swap, the empty ledger is re-checked, the swap runs in a transaction and is verified. |
| M09 reproducible builds | Caddy pinned to 2.11.7 and the replace-response plugin to a fixed commit; the add-on image pinned by digest; In-Patient configuration taken from the kit, never from upstream `master`. |
| F13 deletion monitoring | Sweep logs an ALERT when a trial is more than an hour past expiry and still exists. Independent deletion without the controller needs the IAM change. |
| F06/H08 off-host backups | Optional off-site copy: set `BACKUP_BUCKET=gs://...` in `/opt/vipers/secrets/backup.env` (needs a bucket and storage permission, i.e. the owner's approval). |

### End-to-end verification on image v3 (29 Oct 2026, 00:00-00:40)

`vipers-hospital-golden-v3` (label `vipers-boot-sealed=v1`; exact seal checks, fail-on-error edge, pinned Caddy/Node
images prebuilt). Seal reboot test: 126 TCP + 42 UDP external probes, 0 answers; 73 TCP / 12 UDP dropped after Docker started.

Watching live first-boot logs found two more defects, both fixed before the final run:
- **The billing-sync account was looked up by username "admin", but its username is empty (system ID "admin").** With the
  strict first boot every trial failed closed ("sync user missing"); the earlier lenient version had silently skipped the
  rotation, which would have broken patient-to-billing sync on those trials. Now found by system ID, like `04-harden.sh`.
- **`2> >(grep -v deprecat)` under `set -E`:** the ERR trap fired inside the helper when grep had nothing to print, failing a
  successful billing step. Replaced by a stderr file (also in `production-mode.sh`); the copied PHP file is removed as root.

Final run (`vh-qa-test-hospital-b2b4`): setup completed and committed; portal "ready" only after scrubbing; hospital login
works; demo.doctor/demo.nurse/superman/admin with public or default passwords refused; billing hospital login works and the
demo cashier is refused; password and delete token removed from instance metadata, delete verifier kept; seal hooks 0 after
setup (IPv4/IPv6); billing sync 0 authentication errors; trial AI allowance 50 000/day; In-Patient IPD off.
Reboot of the configured trial: seal re-applied at boot (3 hooks), "already configured" path lifted it (0 hooks), site
reachable from outside (200). Delete account in a browser 8/8; the server disappeared from the cloud; the portal answers
only `{"status":"deleted"}`; the registry record keeps no hospital, user, e-mail, IP or verifier; no names in the portal log.

### Regression after the 29 Oct review fixes (29 Oct 2026, 10:35-11:30)

Fixes for `CODE-REVIEW-2026-10-29.md` (R01-R09) deployed on the demo server, add-on image rebuilt. Response:
`CODE-REVIEW-2026-10-29-RESPONSE.md`.

| Suite | Result |
|---|---|
| run-all (admin, appointments/documents, billing, doctor, help/AI, In-Patient, lab, performance, reception, ux, walkthrough) | all pass after the fixes below (In-Patient 6/6, ux 28/28 on the repeat) |
| wf-perf | 7/7 (sign-in 46 s → normal; it failed before this round) |
| wf-billing (standalone, with the test patient's surname) | 6/6 |
| wf-mobile (phone `MOBILE=1` and desktop) | 6/6 and 6/6 |
| wf-reception | 6/6 |
| wf-qa-fixes / wf-cards / wf-loading / wf-spin-watchdog / wf-spin-audit | 14/14, 18/18, 3/3, 4/4, 82/82 |
| Unit: unit-trial / unit-trial-admission / unit-trial-recovery (new) / unit-ai / unit-overlay / unit-privacy / unit-ops.py | 25/25, 4/4, 5/5, 17/17, pass, pass, 8/8 |

Defects found by this regression and fixed:
- **Phones: the Login button of the manual sign-in form sat under the badge and ?/AI buttons.** A later redesign rule
  reset the 170 px room under the sign-in box to 40 px, and even 170 px did not help: the box overflows a one-screen-high
  wrapper, and overflow ignores margins. Now the 40 px applies to wide screens only, and on phones the wrapper grows with
  the box. Probe at 390x844: after scrolling, the element at the button's centre is the button (was the floating bar).
- Test timing exposed by the faster sign-in: the Ward Nurse tile check now waits for the Home tiles; the registration
  helper reopens the gender list if it opens before its options have loaded. Standalone wf-billing needs `LAST=`.

Afterwards: daily trial cap back to 6, test patients removed, new reset baseline (`baseline.current`, verified against its
manifest and checksums), obsolete image `vipers-hospital-golden-v2` deleted (v1 and v3 kept).
