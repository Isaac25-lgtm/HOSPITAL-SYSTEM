# Response to the production-readiness audit of 28 October 2026

Audit: Codex review of commit `8645f3a` (46 findings). This page records what was changed for each finding, how it was
verified, and what remains open. The audit's verdict stands: **this layer is not ready for real patient data.** The fixes
below make the fictional-data demo and the hospital trial servers safer and more reliable; the production profile
(findings 01, 12, 14, 15, 17, 18) needs product and governance decisions first.

Verification added with this change:

- `tests/unit-ai.js`: runs the real AI proxy against a fake provider that records every outbound request (17 checks).
- `tests/unit-trial.js`: runs the real provisioner against a fake metadata server and Compute API (15 checks).
- `tests/wf-trial-delete.js`: a real hospital trial server in a browser (sign-in, TRIAL label, delete dialog, deletion).
- `scripts/run-all.sh` now exits non-zero when any suite fails or produces no results.

| # | Sev. | Status | What changed |
|---|---|---|---|
| 01 | Critical | Open (production) | Public demo access is intentional for the fictional-data demo. A production profile that refuses demo accounts, cards and demo automation is still to be built. |
| 02 | High | **Fixed** | `tenant-firstboot.sh` blocks ports 80/443 (host firewall, `INPUT` and `DOCKER-USER`) before anything starts, checks every HTTP status, verifies that **no** public demo password and no default password works and that the hospital login works, and only then opens the ports. Any failure leaves the ports closed, writes `hospital-failed` and the portal deletes the server. Setup is resumable (existing user: password reset; provider created only if missing). |
| 03 | High | **Fixed** | `crater-hospital-user.php` deletes all copied Sanctum tokens and sessions and clears remember-me tokens, then verifies; the billing sync service is recreated so it signs in afresh. |
| 04 | High | Partly | `TRIAL_SA` setting added so trial servers can run as a separate low-privilege service account (only Secret Manager access to the AI key). Creating that account is an IAM change awaiting the owner's approval; until then trials still use the main VM's account. |
| 05 | High | **Fixed** | Server validates every history entry (shape, length, privacy and scope checks); refused questions never enter browser history; the page title is no longer sent; screen labels pass only if every word appears in our own help text (patient names cannot); page and role come from server-owned lists; screen labels go in the user message, not the system instructions. Proven by `unit-ai.js`. |
| 06 | High | **Fixed** | Non-object JSON bodies get 400; every handler is awaited inside the error boundary; an `unhandledRejection` handler logs instead of exiting; gate codes and cookies are compared as bytes. Proven by `unit-ai.js` (null, array, string, number, broken JSON, Unicode gate code). |
| 07 | High | **Fixed** | Username and slot are reserved synchronously before any await. Proven: four simultaneous sign-ups with one username create one server; never more than three servers. |
| 08 | High | **Fixed** | Registry written via temp file + fsync + rename; a damaged file is kept aside; a failed save refuses the sign-up; every sweep reconciles with labelled cloud servers and adopts unknown ones (`vipers-trial-id` / `vipers-expires` labels). Proven by `unit-trial.js`. |
| 09 | High | **Fixed** | Compute operations are awaited to `DONE` and checked; records stay `deleting` (slot held) until the server is confirmed gone; refused deletes are retried; an uncertain create keeps its slot until resolved. Proven by `unit-trial.js`. |
| 10 | High | Partly | Each trial server now powers itself off at its expiry (transient systemd timer set on every boot), independent of the main server; `TRIAL_CONTROLLER_UNTIL` stops sign-ups that would outlive the controller. The disk is still deleted by the main server's sweep. |
| 11 | High | **Fixed** | `04-harden.sh` records a password only after the API accepted it **and** the new password signs in; recorded passwords are re-verified on every run; the script exits non-zero if a default password still works. |
| 12 | High | Open (production) | One shared hospital account is a trial design choice. Named staff accounts and least privilege belong to the production profile. |
| 13 | High | Partly | Each trial server now gets its own OpenMRS owner/sync password and Crater owner password at first boot (verified). Database passwords inside the private Docker network are still the image's copies. |
| 14 | High | Open (production) | Backups are local only (documented in `backup.sh`); off-host encrypted backups and a restore drill are production work. |
| 15 | High | Partly | `reset-demo.sh` refuses to run on a hospital trial server. A full production profile that disables trial/demo lifecycle jobs is still open. |
| 16 | High | **Fixed** | Branding no longer touches table cells, patient/diagnosis/observation/note containers or editable fields; elsewhere only interface chrome or short labels are rebranded. Verified live: "Mary Crater" in a table cell and a clinical note mentioning "Crater lake" stay unchanged, "Bahmni Help" becomes "VIPERS HOSPITAL Help". |
| 17 | High | Open (production) | Database release families are upstream Bahmni's choice; a supported-platform plan with image digests is needed before production. |
| 18 | High | Open (production) | Privacy approval, processor agreements and AI data-flow approval are governance items; keep external AI off for real data until approved. |
| 19 | High | **Fixed** | The currency swap now runs in a transaction and is refused when the billing database already has invoices, payments or estimates. |
| 20 | Medium | **Fixed** | Password (and the new delete token) removal from metadata is tracked separately from readiness, awaited to completion and retried on every refresh/sweep until confirmed. |
| 21 | Medium | **Fixed** | Cache used only for a first question; key includes page, role, exact question and the visible controls. Proven by `unit-ai.js`. |
| 22 | Medium | Partly | Tokens are reserved before dispatch, in-flight requests are capped, usage is written atomically and a damaged file is kept aside. Per-provider-account limits across VMs should also be set at the provider. |
| 23 | Medium | Partly | `02-configure.sh` resolves its own folder before changing directory. The bind-mount ordering on a completely fresh machine still needs a clean-install rehearsal. |
| 24 | Medium | **Fixed** (was live) | The release `.env` has no final newline, so appended settings were glued to the previous line and the reports password was silently missing on the main demo. `02-configure.sh` now restores the reports password on every regeneration and appends safely; verified on the server. |
| 25 | Medium | **Fixed** | `07-branding.sh` installs the committed clinical dashboard and In-Patient overlay files. |
| 26 | Medium | **Fixed** | Backups fail on any error, are written to `<name>.partial`, verified (gzip/tar, non-empty dumps), get a SHA-256 `MANIFEST`, and only then replace the old one. Reset verifies the whole backup before stopping anything. |
| 27 | Medium | **Fixed** | Guard, backup and reset share `/run/vipers-ops.lock`; the guard also skips while a trial setup runs. |
| 28 | Medium | **Fixed** | On later boots the trial server compares its address and re-applies hostnames; the portal follows the new address. |
| 29 | Medium | **Fixed** | Beds are reconciled one by one by bed number; the script fails if a ward is incomplete. |
| 30 | Medium | Partly | `run-all.sh` fails on any failed or empty suite. `security-check.sh` still needs status-precise checks and firewall/IAM queries. |
| 31 | Medium | **Fixed** | Denied requests are no longer stored by the rate limiter. |
| 32 | Medium | **Fixed** | The ward diagnoses fallback hides refuted/entered-in-error diagnoses, shows verification and clinical status, says it covers all visits, and ignores late responses after the user moved to another patient. |
| 33 | Medium | **Fixed** | Trial servers set the minimum password length back to 8 and forbid password = username. |
| 34 | Medium | Open | Abuse model for self-service sign-up (verification, durable admission control) is a product decision. |
| 35 | Medium | Open | `site.json` publishes the hospital name/username to prefill the sign-in; acceptable for trials, to be revisited. |
| 36 | Medium | Open | Visits are kept open on purpose for the demo; the production profile must restart the stale-visit task. |
| 37 | Medium | **Fixed** | Deadlines on metadata, Secret Manager and Compute calls; sweeps cannot overlap. |
| 38 | Medium | **Fixed** | The sweep refreshes readiness itself, so a closed browser tab no longer gets a healthy server deleted. |
| 39 | Medium | **Fixed** | The guard restarts containers that are running but unhealthy. |
| 40 | Medium | Open | Pin base-image digests and the Caddy module; produce an SBOM. |
| 41 | Medium | **Fixed** | Removed the global failure counter that could lock out correct gate codes (per-IP limit kept). |
| 42 | Medium | **Fixed** | Free-space check before a backup; timestamped backups older than 14 days are pruned. |
| 43 | Medium | **Fixed** | `06-crater.sh` uses the canonical name "Rapid test for malaria (RDT)" and treats the old name as present. |
| 44 | Low | Partly | `run-test.sh` no longer unpacks a leftover `/tmp/tests.tgz` unless asked. Edge/ops packages in `/tmp` remain operator-managed. |
| 45 | Low | **Fixed** | Host tools are installed whether or not Docker is already present. |
| 46 | Low | **Fixed** | `02-configure.sh` uses `umask 077` and builds `.env.vipers` in a private temp file replaced in one step. |

## New with this change: hospitals can delete their own account

A signed-in hospital sees **Delete account** in the top bar. The dialog asks for the account password, which the
hospital's server checks directly against OpenMRS; it then asks the main server to delete it with a per-server secret
token (created at sign-up, only its SHA-256 kept in the registry, removed from instance metadata once the server is
ready). The main server deletes the server and frees the slot. Verified end to end on a real trial server.
See `docs/TRIAL-PORTAL.md`.

## Also found and fixed while verifying

- **Older screens sometimes lost the VIPERS layer** (theme, help, Ask Vipers AI): the legacy apps fetch their own
  `index.html` in the background with `Accept: */*`; the edge only injected into requests that announce a page load, and the
  browser then reused that cached, un-injected copy for the real visit. `edge/Caddyfile` now also injects into `*.html`
  and `*/` documents (only when the first rule did not apply, so never twice; `vipers.js` also guards against a double
  load). `tests/wf-loading.js` passes again.
- **Stock-phrase fixes inside table cells**: after the finding-16 change, exact interface phrases (e.g. the misleading
  appointments sentence) inside table cells were no longer fixed. They are now applied everywhere outside editable
  fields; product-name branding still never touches clinical content.
- `tests/wf-qa-fixes.js` checked "Smoking status" on screen, which only appears once a value is recorded; it now checks the
  dashboard configuration the browser receives (vitals are still checked on screen).

Final verification (28 Oct 2026, evening): acceptance 114/114, QA fixes 14/14, sign-in cards 18/18, phone 6/6, loading 3/3,
`unit-ai.js` 17/17, `unit-trial.js` 15/15, and a real trial server end to end (fail-closed setup, demo/default passwords
refused, billing demo cashier refused, secrets removed from metadata, Delete account 8/8, server removed from the cloud).
