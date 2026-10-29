# Clinic system code review — 29 October 2026

Reviewed base: `bb2566494d4d9635308551efdd682d6e6a0445f6`. Scope: custom Node services, browser overlay, edge routing, configuration, deployment/operations scripts, regression tests and previous audit responses. Upstream Bahmni/OpenMRS/Crater application source, deployed containers and cloud configuration are not present for inspection. This is a source review, not live acceptance or a certification of every upstream component.

**Result: nine actionable findings (four P1, five P2), plus one credential-mapping question requiring deployed Compose evidence.** Several earlier fixes are effective, but the production transition and recovery paths still have gaps. Application code and live resources were not changed. A concurrent removal of the browser cache-wipe code in `vipers.js` was observed and preserved; `tests/probe-login-slow.js` was already untracked at the start.

## Findings

### R01 — P1: fresh configuration aborts before publishing its environment

Source: `scripts/02-configure.sh:73`.

`00-guard.sh` enables `set -euo pipefail`. The reports-password lookup assigns the result of `grep ... stock-users.env | cut ...` without accepting a missing file/key. On the documented fresh-install sequence, `04-harden.sh` has not yet created `stock-users.env`; grep exits nonzero, the pipeline fails and configuration exits before moving `.env.vipers.tmp` into place. An existing stock-users file without REPORTS_USER has the same problem. This blocks a new installation even though reports credentials are intentionally optional at this point.

Fix: tolerate an absent reports entry explicitly, while keeping errors fatal for required configuration. Verify a fresh filesystem, an empty stock-users file and an existing reports password.

### R02 — P1: empty OpenMRS usernames still break hardening

Sources: `scripts/04-harden.sh:28`, `:40`, `:63`.

The code chooses the login with `.username // .systemId`. In jq, `//` falls back for null/false, not an empty string. The rollout record establishes that the sync account has username `""` and systemId `"admin"`. Consequently, password-change verification can authenticate with an empty username; the final default-password loop always marks this expected account missing. The script returns failure on that known account shape even when `auth_ok admin "$NEW"` succeeds. The first-boot lookup was repaired separately, but the general hardening script retains this defect.

Fix: choose a nonempty username, otherwise systemId, consistently throughout hardening. Exercise the actual jq/auth path using the known empty-username admin fixture.

### R03 — P1: billing setup bypasses production and tenant restrictions

Sources: `scripts/06-crater.sh:3`, `:75–79`; `scripts/crater-demo-user.php:14–24`.

`production-mode.sh` locks the public billing cashier, but `06-crater.sh` checks neither the production profile nor the tenant marker. Re-running the documented billing configuration on either a production install or a hospital trial invokes the PHP helper, which explicitly restores the cashier password to public value `everton`. Production mode therefore does not enforce its promised demo-account boundary across all setup entry points. The same script also rewrites company details to fictional demo details.

Fix: reject demo billing setup on production and tenant profiles before any mutation; apply the same boundary to the standalone PHP helper or isolate demo identity creation behind a guarded entry point. Verify rejection leaves accounts and company details unchanged.

### R04 — P1: production transition races an already-running demo guard

Sources: `scripts/production-mode.sh:29–90`; `scripts/guard.sh:18–20`, `:34–44`; `scripts/05-demo-accounts.sh:6`, `:14–29`.

Guard/backup/reset share `/run/vipers-ops.lock`, but production mode never acquires it. A guard that passed its production check before the marker was written can keep running `05-demo-accounts.sh` while production mode retires accounts, strengthens password policy and restarts stale-visit closure. That earlier demo run can subsequently weaken the policy or stop the stale-visit task again. Its following billing helper can also restore the cashier after production mode has checked/locked it. A one-time profile check does not synchronize in-flight work.

Fix: serialize the entire production transition with maintenance jobs, and ensure mutation entry points check the profile under the same synchronization. Test with a paused guard/demo mutation resumed during the transition.

### R05 — P2: restored volumes retain files absent from the backup

Source: `scripts/reset-demo.sh:30`.

Restore clears each volume with `rm -rf /v/*`. Shell `*` does not select dotfiles/directories, so hidden files added after the baseline survive restoration whenever the archive has no corresponding entry to overwrite. Restore reports success with a mixture of baseline and later state. This affects a generic document/application-volume restore, including the billing application data volume.

Fix: clear all entries below the verified volume mount, including hidden entries, without removing the mount itself. Test a volume containing visible and hidden files absent from its backup.

### R06 — P2: an IP change raises a trial's AI allowance

Sources: `scripts/tenant-firstboot.sh:59–67`, `:209–211`; `scripts/03-edge.sh:40–41`.

Initial configuration supplies per-trial AI limits from metadata (defaults 50,000/day and 250,000 total). On a later boot with a changed ephemeral IP, the configured path reruns `03-edge.sh` without those settings. That script regenerates the limits from its larger controller defaults (250,000/day and 1,500,000 total), rather than preserving the existing values. A stop/start can silently multiply the intended per-trial budget.

Fix: preserve validated existing limits during regeneration or supply authoritative tenant limits on every configuration path. Verify a configured trial retains its exact limits after an address change.

### R07 — P2: missing-instance refresh bypasses deletion generation checks

Source: `edge/addons/trial.js:240–243`.

The generation check protects most writes after a refresh awaits the cloud, but the `!inst` branch writes `failed` and returns before checking `superseded()`. For a record older than five minutes, start a refresh, complete deletion, then deliver a late 404 to that refresh: it overwrites confirmed `deleted` with `failed`. The status endpoint subsequently loses its deleted response contract. Existing regression coverage only exercises another refresh completion path.

Fix: validate the generation immediately after the instance lookup, before every mutation, including absence handling. **Reproduced against the real module with fake cloud responses.**

### R08 — P2: recovered trials can be hidden by an older duplicate ID

Sources: `edge/addons/trial.js:298–307`, `:412`.

Reconciliation only recognizes an existing record if it holds a slot. If a failed record's VM is discovered later (for example after a delayed/uncertain create or a missing-instance response), reconciliation appends another record using the same labelled trial ID. `/api/status` uses `find(id)` and selects the original failed record forever, even while the replacement record tracks a live instance and can become ready. Recovery restores resource accounting but not the hospital's status/polling workflow.

Fix: reconcile a VM/trial ID into one authoritative record, or make an explicit replacement that all lookups use. **Duplicate creation and stale status response reproduced against the real module with fake cloud responses.**

### R09 — P2: deletion still retains the hospital name through the VM name

Sources: `edge/addons/trial.js:163–165`, `:209`, `:284–287`.

VM names embed `slugify(hospital)`. Deletion blanks `hospital`, username and slug, but deliberately keeps `vm`; creation/deletion/error logs also print that VM name. A distinctive hospital name therefore remains in the registry and logs after the purported identifying-data cleanup. This contradicts comments and rollout claims that names no longer appear in logs/deleted records. It does not expose a password or patient record.

Fix: use opaque instance names for new trials and define handling/retention for existing descriptive VM names. Verify with a distinctive hospital name, checking every retained field and log string rather than only `hospital`/`username` properties.

## Additional question requiring deployment evidence

`scripts/backup.sh:32` and `scripts/reset-demo.sh:27` authenticate to the atomfeed database as root with `MYSQL_ROOT_PASSWORD`, although `02-configure.sh:27,57` generates and exports a separate `CRATER_ATOMFEED_DB_ROOT_PASSWORD`. If upstream Compose maps that separate variable to the atomfeed root user, backup fails authentication and restore fails after the other two databases have already been imported. Inspect the rendered Compose mapping and verify with a disposable database before selecting the credential. The local upstream checkout has no HEAD/source, so this dependency mapping is not classified as a runtime-confirmed finding here.

## Verification and limits

- `node tests/unit-trial.js`: passed with APP pointing to the local add-on directory and TEMP/TMP redirected to a writable workspace folder.
- `node tests/unit-trial-admission.js`: passed with the same environment.
- `node tests/unit-overlay.js`: passed.
- `node docs/audit-support/review-2026-10-29.js`: reproduced R07 and R08. This is a defect reproducer: exit zero means both bugs were observed, not that the implementation is correct. It uses an in-memory filesystem and fake cloud; it performs no real network calls, writes or provisioning.
- AI/privacy suites: inconclusive here. The child service logged successful startup, but local loopback requests returned connection failures; the AI suite then crashed on its missing captured-provider response. These are not counted as successful privacy checks or evidence of an application privacy regression.
- Shell suite: its initial strict-shell failure test passed, but the broader run could not complete because the local Git Bash runtime failed with `NtCreateDirectoryObject ... 0xC0000022`. Initial attempts also hit sandbox temporary-directory permissions; redirecting temp files fixed the Node registry tests. Shell findings above are source-traced; they were not exercised against Ubuntu/Docker/systemd.
- No live AI provider, cloud operation, database import, production transition, firewall change or browser workflow was run. Existing live evidence is historical. A tested production switch and clean-host restore remain necessary before relying on these paths.

Prioritize R01–R04, settle the atomfeed credential mapping, then run a disposable install/restore/production-transition acceptance test. Broader existing design questions (staff identity, cloud IAM isolation, off-host recovery and clinical validation) remain outside the fixes claimed by this review.
