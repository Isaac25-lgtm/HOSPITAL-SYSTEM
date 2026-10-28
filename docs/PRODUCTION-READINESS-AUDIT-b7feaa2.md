# VIPERS HOSPITAL — production-readiness audit
28 October 2026, Africa/Kampala. Repository: Isaac25-lgtm/HOSPITAL-SYSTEM. Reviewed main: **b7feaa2e41111feb21965d9865a891b50972048e**, confirmed through the connected GitHub commit API and matching local HEAD. Application code and cloud resources were not changed.

## Summary

| Severity | Count |
|---|---:|
| Critical | 1 — conditional on use with real patient records |
| High | 8 |
| Medium | 15 |
| Low | 1 |
| Total | 25 grouped findings |

The 46 historical review rows below are not 46 additional findings.

| Use | Verdict | Blocking items / conditions |
|---|---|---|
| Shared public demo, fictional data | **READY WITH CONDITIONS** | Disposable fictional data only; isolate provisioning permissions, constrain signup abuse/cost and repair false security/acceptance passes. This is not verification of current live service health. |
| Self-service five-day hospital trials, fictional data | **NOT READY** | First-boot isolation/error handling, inherited controller identity, registry recovery admission, and deletion/expiry guarantees need fixes and fault-injection tests. |
| Real hospital, real patient records | **NOT READY** | No enforceable production profile; privacy, identity, recovery, platform and clinical-validation gates remain. |

Meaningful improvements are present: malformed chat-body handling, byte-safe gate comparison, synchronous same-process signup reservations, retained slots during failed deletion, billing-token revocation, and constrained AI page/role context. These do not establish production readiness.

## Scope and evidence

Repository-wide review covered custom services, proxy, browser layer, operations, configuration, test design and documentation. **This does not satisfy the requested certified literal every-line/every-artifact coverage:** some large reads were truncated and not every screenshot/binary was visually inspected. The findings are grounded in the identified source and local reproductions. Upstream application source and built images are outside this checkout. The original 46-finding report was not supplied; historical numbering uses the descriptions in the team's response document.

Actually run:

- Unit AI suite with APP set to the absolute edge/addons path: **17/17 passed**, exit 0. Includes JSON null/array/string/malformed JSON, process survival, Unicode gate input, rejected question resent as history, and cache context cases.
- Unit trial suite with absolute APP: **14/14 passed**, exit 0, not the documented 15. Includes concurrent same-username signups, capacity with a consistent initial registry, refused/retried deletion, orphan adoption and token checks.
- Existing docs/audit-support/reproduce.js: **four defects reproduced**: name forwarded to fake AI, six mock servers against cap three after registry loss, lost deletion verifier on adoption, and continued first boot after a failed piped check. Its exit 0 means defects were reproduced, not that the product passed.
- Actual branding functions executed with a minimal DOM adapter: Mary Crater in a protected TD stayed unchanged; a protected clinical note containing “Report successfully uploaded” was changed to “Saved successfully”. Function-level test, not a live browser.
- Syntax/parsing: **77 JS, 23 shell, 20 JSON and 3 PowerShell files** passed. Shell CRLF was normalized in memory. No PHP, Caddy or Compose native validation was run.
- Negative control: the actual enclosing backup test expression succeeds on valid large gzip data. An inner short-read SIGPIPE is **not** reported as a backup defect.
- Reachable Git history searched for selected API/private-key signatures without exposing values: no matches. This limited pattern search is not exhaustive secret clearance. Public demo passwords are intentionally committed.

Not run: live Playwright acceptance, cloud IAM queries, real provider calls, actual first-boot/network isolation, clean Ubuntu installation, database restores, VM reboots, disk-full tests or destructive deletion. Historical screenshots/results and reported cloud verification are unverified evidence, not fresh runs. No real patient database was inspected. No claim of full upstream vulnerability coverage is made.

## Critical findings

### C01 — No enforceable production boundary
**Type:** missing control/design limitation. **CARRIED OVER:** 01, 12, 15, 36. Sources: [scripts/05-demo-accounts.sh:17](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/05-demo-accounts.sh:17>), [scripts/guard.sh:24](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/guard.sh:24>), [edge/addons/public/vipers.js:476](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/public/vipers.js:476>), [scripts/reset-demo.sh:9](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/reset-demo.sh:9>).

The default kit creates publicly known shared accounts, weakens password policy, pauses stale-visit closure and restores demo identities through the guard. A tenant marker prevents some demo operations, but no distinct production profile refuses them. **Scenario:** installing this kit for live records exposes them through demo logins; removing those accounts may be undone by the guard. Shared trial identities cannot attribute actions to individual staff. Critical severity applies to real-record deployment, not deliberate fictional demo access.

**Fix:** separate validated production mode that refuses demo identities/cards, demo reset/expiry/repair jobs and weak policy; named staff and reviewed privileges. **Proof test:** production rejects every demo/default login and an attempted demo timer/script; actions remain attributable to individual staff.

## High findings

### H01 — First boot does not isolate the copied stack before startup
**Type:** code defect. **CARRIED OVER:** 02. Sources: [scripts/tenant-firstboot.sh:29](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/tenant-firstboot.sh:29>), [scripts/tenant-firstboot.sh:31](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/tenant-firstboot.sh:31>), [scripts/tenant-firstboot.sh:45](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/tenant-firstboot.sh:45>), [edge/docker-compose.edge.yml:11](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/docker-compose.edge.yml:11>).

Docker is awaited before quarantine rules are installed; copied containers can autostart. The block covers TCP 80/443, while Caddy publishes UDP 443 too. Rule-install failures are unchecked. **Scenario:** a copied demo stack starts before isolation; where cloud rules/routing/certificates permit QUIC, the TCP-only block is insufficient. This is a source-level exposure path, not a reproduced live intrusion.

**Fix:** quarantine in cloud networking from instance creation, prevent copied service autostart until sanitised, cover all exposed protocols/address families and verify effective rules. **Proof test:** continuous external TCP/QUIC probes throughout boot and all failure paths never reach copied authentication.

### H02 — Piped setup checks do not abort the parent
**Type:** code defect. **CARRIED OVER:** 02, 33. Sources: [scripts/tenant-firstboot.sh:9](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/tenant-firstboot.sh:9>), [scripts/tenant-firstboot.sh:54](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/tenant-firstboot.sh:54>), [scripts/tenant-firstboot.sh:127](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/tenant-firstboot.sh:127>).

Under set -u alone, fail() inside q ... | need exits the pipeline subprocess. **Reproduced:** HTTP 403 was followed by CONTINUED_AFTER_FAILED_CHECK and parent exit 0. Later independent login checks catch some failures, but do not prove every role, sync-user or policy change. **Scenario:** password-policy rejection is followed by readiness publication.

**Fix:** evaluate status and call fail in the parent, use strict propagation/error traps and verify final state before release. **Proof test:** each mutating API call independently returns 403/500; no configured marker, ready response or public access is allowed.

### H03 — Trial identity defaults to controller identity
**Type:** missing control/design limitation. **CARRIED OVER:** 04. Sources: [edge/addons/trial.js:20](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:20>), [edge/addons/trial.js:164](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:164>), [docs/SECURITY-AUDIT.md:15](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/docs/SECURITY-AUDIT.md:15>).

Absent TRIAL_SA, a trial inherits the controller service account with cloud-platform scope. Documentation describes broad controller instance-management rights; deployed IAM was not queried. **Scenario:** if IAM matches documentation, a compromised tenant able to access its metadata token gains controller project permissions. Scope alone does not grant those permissions, but identity reuse defeats isolation.

**Fix:** require a separate minimal trial identity, restrict workload metadata access, and bound controller permissions. **Proof test:** tenant token cannot list/manage other VMs, modify metadata or change IAM; only approved secret access succeeds.

### H04 — Realistic personal text reaches external AI
**Type:** code defect/design limitation. **CARRIED OVER:** 05, 18. Sources: [edge/addons/server.js:126](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/server.js:126>), [edge/addons/server.js:190](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/server.js:190>), [edge/addons/server.js:233](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/server.js:233>), [AI_INTEGRATION.md:21](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/AI_INTEGRATION.md:21>).

Regex filtering recognises selected forms, not personal data generally. **Reproduced:** “For Alice Nalongo, explain the workspace sequence for arranging a future outpatient slot.” was forwarded intact to the fake provider. The same limitations affect history. Vocabulary membership does not establish that screen text is nonpersonal. **Scenario:** staff include a name without the expected introducer and the provider receives it despite absolute privacy claims.

**Fix:** external AI off for real records until approved; prefer server-owned task/help context and treat detection only as defence in depth. **Proof test:** inspect all outbound payloads across varied fictional names, languages, identifiers, screen labels, histories and clinical narratives against the approved data-flow specification.

### H05 — Registry recovery admits signups before reconciliation
**Type:** code defect. **CARRIED OVER:** 07, 08. Sources: [edge/addons/trial.js:132](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:132>), [edge/addons/trial.js:231](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:231>), [edge/addons/trial.js:263](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:263>).

Admission checks memory while startup reconciliation waits 30 seconds. **Reproduced:** three existing labelled instances plus three immediate signups produced six mock servers despite cap three. Registry-only username uniqueness has the same recovery gap.

**Fix:** block admission until successful reconciliation and use durable reservations; fail closed on cloud-listing failure. **Proof test:** immediate concurrent signups after missing/corrupt/stale registry create no extra servers and no duplicate active usernames.

### H06 — Hardening can return success after account changes fail
**Type:** code defect. **CARRIED OVER:** 11. Sources: [scripts/04-harden.sh:6](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/04-harden.sh:6>), [scripts/04-harden.sh:29](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/04-harden.sh:29>), [scripts/04-harden.sh:42](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/04-harden.sh:42>), [scripts/04-harden.sh:59](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/04-harden.sh:59>).

Under set +e, setpw failures are not accumulated. Final failure status checks defaults for superman and registration only. Admin authentication failure is specially tolerated. **Scenario:** doctor/lab/reports password change fails while deployment continues with a successful script result.

**Fix:** accumulate every required change/verification failure and distinguish transport failure, lockout and rejection; verify dependent-service authentication. **Proof test:** fail each account rotation independently and require nonzero exit plus blocked publication.

### H07 — Fresh install starts services before file mounts exist
**Type:** code defect/documentation. **CARRIED OVER:** 23. Sources: [DEPLOYMENT.md:78](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/DEPLOYMENT.md:78>), [scripts/docker-compose.vipers.yml:15](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/docker-compose.vipers.yml:15>), [scripts/docker-compose.vipers.yml:27](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/docker-compose.vipers.yml:27>), [scripts/04-harden.sh:47](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/04-harden.sh:47>), [scripts/06-crater.sh:97](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/06-crater.sh:97>).

The first vipers up uses file binds for reports/Crater configuration produced by later scripts. **Scenario:** on an empty host, short bind syntax creates a directory or startup fails before the scripts intended to create the files. A clean Docker install was not run.

**Fix:** generate/validate mount files before startup or use a minimal bootstrap override; reject missing file binds. **Proof test:** install from an empty Ubuntu disk without /opt/vipers or /tmp leftovers, then repeat idempotently.

### H08 — Recovery copies share the primary disk
**Type:** design limitation. **CARRIED OVER:** 14. Sources: [scripts/backup.sh:13](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/backup.sh:13>), [scripts/reset-demo.sh:21](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/reset-demo.sh:21>), [CLOUD_COSTS.md:15](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/CLOUD_COSTS.md:15>).

The implemented backup target is local. **Scenario:** disk loss/deletion removes records and recovery copies. An external backup process may exist, but no evidence was supplied. Clinical recovery objectives/restores are unproven.

**Fix:** encrypted off-host recovery under separate access/retention controls, defined RPO/RTO and clean-host restore drills. **Proof test:** recover records, documents, billing/sync and configuration after destroying a disposable primary disk.

## Medium findings

### M01 — Adopted trials cannot verify self-delete tokens
**Type:** code defect. **NEW**, new delete flow. Sources: [edge/addons/trial.js:241](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:241>), [edge/addons/trial.js:317](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:317>).

Adoption reconstructs records without deleteHash, which deletion requires. **Reproduced:** missing hash and deletion response 403. **Scenario:** healthy trial survives registry loss but cannot delete itself. **Fix:** recover an independently stored verifier or securely re-enrol deletion credentials. **Proof test:** lose a ready trial's registry, recover, then accept the correct existing credential and reject wrong credentials.

### M02 — Ready publication tolerates failed metadata scrubbing
**Type:** code defect/design limitation. **CARRIED OVER:** 20. Sources: [edge/addons/trial.js:188](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:188>), [edge/addons/trial.js:207](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:207>), [edge/addons/trial.js:348](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:348>).

Ready is set before scrub succeeds; failure logs/retries but leaves a ready URL. **Scenario:** password/delete token remain in metadata after a permissions failure while users enter the trial. **Fix:** verified scrubbing as a readiness condition and alert/revoke prolonged failure. **Proof test:** deny/timeout scrub, require no ready publication, then verify actual metadata absence after success.

### M03 — Expiry does not independently guarantee data deletion
**Type:** design limitation. **CARRIED OVER:** 10. Sources: [edge/addons/trial.js:22](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:22>), [scripts/03-edge.sh:28](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/03-edge.sh:28>), [scripts/tenant-firstboot.sh:26](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/tenant-firstboot.sh:26>), [scripts/09-expiry.sh:16](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/09-expiry.sh:16>).

Controller lifetime is optional and not populated by the installer. Tenant shutdown timer failure is ignored. Poweroff leaves the disk until the controller deletes it. **Scenario:** a late trial outlives the controller shutdown and storage persists past advertised expiry. **Fix:** independent durable cleanup, explicit controller lifetime and verified timer. **Proof test:** controller down, tenant reboot and timer failure still lead to access termination and verified resource cleanup.

### M04 — Security and acceptance tests can falsely pass
**Type:** code defect/test quality. **CARRIED OVER:** 30, with **NEW** examples. Sources: [scripts/security-check.sh:28](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/security-check.sh:28>), [scripts/security-check.sh:36](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/security-check.sh:36>), [scripts/final-acceptance.sh:7](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/final-acceptance.sh:7>), [tests/wf-admin.js:50](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/tests/wf-admin.js:50>), [tests/wf-ux.js:49](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/tests/wf-ux.js:49>), [tests/wf-doctor.js:85](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/tests/wf-doctor.js:85>), [tests/wf-trial-delete.js:31](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/tests/wf-trial-delete.js:31>).

Firewall PASS is hardcoded; failed requests count as “not 200/not true”; unrelated 400/500 can pass permission checks. Final acceptance ignores run-all status and always writes DONE. UX accepts a null hit-test result; an empty save toast passes the immediate doctor check. Delete UI tests prove acceptance, not resource disappearance. **Fix:** precise outcomes, unknown-is-failure, expected per-suite assertions and aggregate exit status. **Proof test:** offline service, HTTP 500, missing button, failed mobile test and refused cloud deletion all fail overall acceptance. The repaired run-all empty-results rejection is a real improvement.

### M05 — Diagnosis fallback truncates and suppresses retries
**Type:** code defect/clinical presentation. **CARRIED OVER:** 32. Sources: [edge/addons/public/vipers.js:735](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/public/vipers.js:735>), [edge/addons/public/vipers.js:736](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/public/vipers.js:736>), [edge/addons/public/vipers.js:754](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/public/vipers.js:754>).

Only ten Conditions are fetched; refuted entries are filtered after that cap and no next page is followed. The attempted-load marker is set before fetch and survives failure. **Scenario:** newer refuted diagnoses hide an older valid diagnosis, leaving “No diagnosis”; transient failure prevents retry on that element. **Fix:** pagination/explicit scope, retry/error states and mark success only after validated response. **Proof test:** >10 mixed-status entries, transient failure, patient switch and repeat view.

### M06 — Stock phrase rewriting bypasses clinical exclusions
**Type:** code defect/clinical presentation. **FIX INTRODUCED A NEW PROBLEM**, original 16. Sources: [edge/addons/public/vipers.js:102](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/public/vipers.js:102>), [edge/addons/public/vipers.js:114](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/public/vipers.js:114>), [edge/addons/public/vipers.js:123](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/public/vipers.js:123>).

stockPhrase permits text excluded by brandable. **Reproduced:** a clinical TD note changed “Report successfully uploaded” to “Saved successfully”. This demonstrates display alteration, not a database write. Mary Crater remained unchanged in the protected test. **Fix:** unconditional clinical-content exclusion and exact UI-component targeting. **Proof test:** all replacement phrases remain byte-for-byte unchanged in notes/names/diagnoses, while intended UI labels still change.

### M07 — Currency migration races live writers
**Type:** code defect. **CARRIED OVER:** 19. Sources: [scripts/06-crater.sh:27](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/06-crater.sh:27>), [scripts/06-crater.sh:34](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/06-crater.sh:34>).

The no-ledger precondition is outside the transaction; writers are not stopped. Refusal only prints text and SQL runs under set +e. **Scenario:** an invoice is created after preflight and before row swap, changing the meaning of an existing amount. **Fix:** exclusive maintenance migration, locked preconditions, fail-stop errors, rollback and verified postconditions. **Proof test:** concurrent invoice creation either blocks the migration or preserves all currency/amount meanings.

### M08 — AI limits are per-process estimates, not account hard caps
**Type:** design limitation. **CARRIED OVER:** 22. Sources: [edge/addons/server.js:58](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/server.js:58>), [edge/addons/server.js:244](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/server.js:244>), [edge/addons/server.js:253](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/server.js:253>).

Fixed reservations and local usage do not enforce a shared provider-account ceiling across VMs, corruption, persistence failure or billed provider errors. **Scenario:** several trial VMs independently consume the same account beyond advertised lifetime limits. Provider-side caps are unverified. **Fix:** shared/provider limits and conservative durable accounting. **Proof test:** parallel instances, damaged counters, disk full and provider failures cannot exceed the approved account budget.

### M09 — Builds/configuration are not reproducible
**Type:** design limitation. **CARRIED OVER:** 17, 40. Sources: [edge/caddy/Dockerfile:1](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/caddy/Dockerfile:1>), [edge/addons/Dockerfile:1](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/Dockerfile:1>), [scripts/11-inpatient.sh:64](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/11-inpatient.sh:64>), [scripts/01b-get-bahmni.sh:8](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/01b-get-bahmni.sh:8>).

Base tags float, the Caddy module is unpinned, ADT config comes from master, and an existing upstream clone is not release-verified. **Scenario:** rebuilding the same kit changes code/config behaviour. No assertion that deployed images are currently vulnerable is made without inventory/scanning. **Fix:** digests/commits, approved vendored config, provenance checks, SBOM and scanning. **Proof test:** clean builds resolve identical approved inputs and pass compatibility/security checks.

### M10 — Signup abuse controls are not durable
**Type:** design limitation. **CARRIED OVER:** 34. Sources: [edge/addons/trial.js:337](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:337>), [edge/addons/server.js:82](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/server.js:82>).

Per-IP in-memory limits do not establish hospital identity or survive restart. **Scenario:** distributed signups occupy all three spaces and incur charges. **Fix:** verified/invited admission, durable global quotas, operator release and budget enforcement. **Proof test:** distributed/post-restart attempts cannot capture capacity without approved admission.

### M11 — Account deletion retains identifying controller records
**Type:** code defect/documentation. **NEW**, related to 35. Sources: [edge/addons/trial.js:225](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:225>), [edge/addons/trial.js:227](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:227>), [edge/addons/trial.js:348](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:348>).

Deleted records retain hospital/username/timestamps in trials.json, the known status ID still returns details, and logs include names. Corrupt-registry snapshots have no purge routine. **Scenario:** VM deletion is presented as account/data deletion while controller identifiers persist indefinitely. **Fix:** defined minimal retention, purge/anonymisation and accurate deletion scope. **Proof test:** after deletion and retention expiry, records/logs/backups contain only approved audit information.

### M12 — Restore accepts an incomplete manifest-less backup
**Type:** code defect. **CARRIED OVER:** 26. Sources: [scripts/reset-demo.sh:13](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/reset-demo.sh:13>), [scripts/reset-demo.sh:14](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/reset-demo.sh:14>), [scripts/reset-demo.sh:23](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/reset-demo.sh:23>), [scripts/backup.sh:31](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/backup.sh:31>).

Only two dumps are required; manifest, sync dump and document archives are optional. Publication removes the previous backup before moving the new one. **Scenario:** an incomplete copied baseline restores database references without documents; interruption can remove the prior same-name copy. **Fix:** mandatory versioned manifest/completeness checks and versioned/atomic publication. **Proof test:** omit each component or interrupt replacement; restore refuses before stopping services and previous recovery remains usable.

### M13 — Password rotation/reboot recovery is not crash-consistent
**Type:** code defect. **NEW**, related to 02, 13, 28. Sources: [scripts/tenant-firstboot.sh:82](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/tenant-firstboot.sh:82>), [scripts/tenant-firstboot.sh:86](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/tenant-firstboot.sh:86>), [scripts/tenant-firstboot.sh:35](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/tenant-firstboot.sh:35>).

OpenMRS password changes before its local secret file is updated. **Scenario:** reboot in between strands setup with the old password. Later failed address reconfiguration can also fall through to “already configured” and exit 0. **Fix:** journal/recover phased rotation and propagate readdress errors while retaining quarantine. **Proof test:** terminate/reboot after every mutation and require safe resume and correct credentials/addresses.

### M14 — Pre-create metadata failure can strand a capacity slot
**Type:** code defect. **NEW**. Sources: [edge/addons/trial.js:138](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:138>), [edge/addons/trial.js:144](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:144>), [edge/addons/trial.js:170](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:170>), [edge/addons/trial.js:217](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:217>).

Failure in whoami leaves a creating reservation with an empty zone; refresh skips it, and timeout deletion uses a zone-empty path. **Scenario:** three discovery failures consume all spaces although no insert was submitted. **Fix:** distinguish never-submitted from uncertain creates and recover placement before cleanup. **Proof test:** fail discovery, restore metadata, sweep and release never-submitted reservations without deleting unrelated resources.

### M15 — Guard ignores ownership and intentional maintenance stops
**Type:** code defect/design limitation. **NEW**, related to 39. Sources: [scripts/guard.sh:18](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/guard.sh:18>), [scripts/guard.sh:21](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/guard.sh:21>), [scripts/vipers.sh:12](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/vipers.sh:12>), [vipers.ps1:24](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/vipers.ps1:24>).

Unhealthy scanning covers all Docker containers; stopped app containers are restarted irrespective of operator intent. **Scenario:** an unrelated service is restarted or a maintenance stop is reversed next timer run. **Fix:** Compose-label scoping and persistent desired-state/maintenance control. **Proof test:** unrelated unhealthy container is untouched; intentional stop survives guard cycles until explicitly resumed.

## Low findings

### L01 — Documentation contradicts implementation and itself
**Type:** documentation. **NEW/current inconsistency**. Sources: [README.md:8](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/README.md:8>), [AI_INTEGRATION.md:28](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/AI_INTEGRATION.md:28>), [docs/SECURITY-AUDIT.md:15](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/docs/SECURITY-AUDIT.md:15>), [docs/AUDIT-RESPONSE-2026-10-28.md:12](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/docs/AUDIT-RESPONSE-2026-10-28.md:12>), [docs/audit-support/reproduce.js:1](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/docs/audit-support/reproduce.js:1>).

README says no passwords while public demo passwords are committed. AI documentation says the VM identity has only secret access; security documentation describes compute administration. Unit-trial totals say 15 versus 14 executed. “Names cannot pass” and isolation “before anything starts” are unsupported. The reproduction harness's exit 0 must not become a passing release gate. **Fix:** versioned generated evidence, precise credential terminology and bounded claims. **Proof test:** documentation aligns with actual configuration/test counts; successful defect reproduction blocks release.

## Reverification of the historical 46 findings

VERIFIED FIXED means the described source-level remedy is coherent, with local execution where noted. It does not verify deployed infrastructure. Numbering follows the team's response descriptions; the original audit text was not available.

| # | Status | Evidence / assessment |
|---|---|---|
| 01 | NOT FIXED | [scripts/05-demo-accounts.sh:17](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/05-demo-accounts.sh:17>): no production/demo boundary; C01. |
| 02 | FIX INTRODUCED A NEW PROBLEM | [scripts/tenant-firstboot.sh:54](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/tenant-firstboot.sh:54>): isolation/verification added but parent continues on failed pipeline; H01/H02/M13. |
| 03 | VERIFIED FIXED | [scripts/crater-hospital-user.php:45](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/crater-hospital-user.php:45>): billing tokens/sessions/remember tokens revoked and checked; not run on real DB. |
| 04 | PARTLY FIXED | [edge/addons/trial.js:164](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:164>): optional separate identity, unsafe fallback remains. |
| 05 | PARTLY FIXED | [edge/addons/server.js:190](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/server.js:190>): targeted history/context cases pass; realistic name bypass remains. |
| 06 | VERIFIED FIXED | [edge/addons/server.js:223](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/server.js:223>), [edge/addons/server.js:99](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/server.js:99>): malformed bodies and Unicode rejection pass locally. |
| 07 | PARTLY FIXED | [edge/addons/trial.js:132](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:132>): same-process reservations work; recovery admission cap fails. |
| 08 | PARTLY FIXED | [edge/addons/trial.js:49](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:49>), [edge/addons/trial.js:263](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:263>): atomic registry/adoption added; startup admission/delete verifier recovery incomplete. |
| 09 | PARTLY FIXED | [edge/addons/trial.js:221](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:221>): delete retry/disappearance tested; insert at line 156 does not await waitOp despite broad claim. |
| 10 | PARTLY FIXED | [scripts/tenant-firstboot.sh:26](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/tenant-firstboot.sh:26>): poweroff attempted; no independent disk deletion/controller deadline enforcement. |
| 11 | PARTLY FIXED | [scripts/04-harden.sh:42](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/04-harden.sh:42>): record successful changes; aggregate account-failure handling still incomplete. |
| 12 | NOT FIXED | [scripts/tenant-firstboot.sh:89](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/tenant-firstboot.sh:89>): shared union-role account remains. |
| 13 | PARTLY FIXED | [scripts/tenant-firstboot.sh:78](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/tenant-firstboot.sh:78>): owner/sync rotation exists, copied DB secrets remain; crash consistency absent. |
| 14 | NOT FIXED | [scripts/backup.sh:13](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/backup.sh:13>): implemented backups local-only. |
| 15 | PARTLY FIXED | [scripts/reset-demo.sh:9](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/reset-demo.sh:9>): tenant reset guard exists; production lifecycle profile absent. |
| 16 | FIX INTRODUCED A NEW PROBLEM | [edge/addons/public/vipers.js:114](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/public/vipers.js:114>): Mary Crater preserved; stock phrase bypass alters protected text. |
| 17 | NOT FIXED | [scripts/02-configure.sh:51](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/02-configure.sh:51>): image tag override does not supply a supported-platform/digest plan. |
| 18 | NOT FIXED | [AI_INTEGRATION.md:21](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/AI_INTEGRATION.md:21>): no supplied evidence of real-data processor/privacy approval; cannot infer approval from code. |
| 19 | PARTLY FIXED | [scripts/06-crater.sh:27](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/06-crater.sh:27>): preflight/transaction added, writer race and error handling remain. |
| 20 | PARTLY FIXED | [edge/addons/trial.js:188](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:188>): scrub awaited/retried; readiness still available on failure. |
| 21 | VERIFIED FIXED | [edge/addons/server.js:239](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/server.js:239>): contextual first-question cache; history/role cases pass. |
| 22 | PARTLY FIXED | [edge/addons/server.js:244](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/server.js:244>): reservations/persistence added; account-wide budget unproven. |
| 23 | PARTLY FIXED | [scripts/02-configure.sh:5](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/02-configure.sh:5>): folder resolution fixed, clean mount order remains broken. |
| 24 | VERIFIED FIXED | [scripts/02-configure.sh:42](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/02-configure.sh:42>), [scripts/02-configure.sh:73](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/02-configure.sh:73>): safe newline append/reports secret restoration present. |
| 25 | VERIFIED FIXED | [scripts/07-branding.sh:12](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/07-branding.sh:12>): committed overlays installed when expected kit layout is packaged. |
| 26 | PARTLY FIXED | [scripts/backup.sh:28](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/backup.sh:28>), [scripts/reset-demo.sh:13](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/reset-demo.sh:13>): validation exists, restore completeness still optional. |
| 27 | VERIFIED FIXED | [scripts/backup.sh:10](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/backup.sh:10>), [scripts/reset-demo.sh:10](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/reset-demo.sh:10>), [scripts/guard.sh:12](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/guard.sh:12>): shared lock/setup skip. |
| 28 | PARTLY FIXED | [scripts/tenant-firstboot.sh:35](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/tenant-firstboot.sh:35>), [edge/addons/trial.js:203](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:203>): address following added, failed recovery can still exit successfully. |
| 29 | PARTLY FIXED | [scripts/11-inpatient.sh:43](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/11-inpatient.sh:43>): per-bed reconciliation added; final check counts beds instead of verifying all expected identities/coordinates. |
| 30 | PARTLY FIXED | [scripts/run-all.sh:34](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/run-all.sh:34>): failed/empty results fail; security/final orchestration still false-passes. |
| 31 | VERIFIED FIXED | [edge/addons/server.js:85](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/server.js:85>): denied attempts not appended. |
| 32 | PARTLY FIXED | [edge/addons/public/vipers.js:742](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/public/vipers.js:742>): status filter/patient guard added; pagination/retry gap remains. |
| 33 | PARTLY FIXED | [scripts/tenant-firstboot.sh:127](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/tenant-firstboot.sh:127>): policy attempted; failure does not stop parent. |
| 34 | NOT FIXED | [edge/addons/trial.js:337](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:337>): no durable verified admission. |
| 35 | NOT FIXED | [scripts/tenant-firstboot.sh:164](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/tenant-firstboot.sh:164>): public hospital/username metadata persists; M11 adds retention issue. |
| 36 | NOT FIXED | [scripts/05-demo-accounts.sh:26](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/05-demo-accounts.sh:26>): default stale-visit pause remains. |
| 37 | PARTLY FIXED | [edge/addons/trial.js:250](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:250>): sweep non-overlap/deadlines added; public status refresh not deduplicated/rate-limited. |
| 38 | VERIFIED FIXED | [edge/addons/trial.js:254](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/trial.js:254>): background readiness refresh independent of browser. |
| 39 | PARTLY FIXED | [scripts/guard.sh:21](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/guard.sh:21>): unhealthy restart added, ownership/maintenance scope missing. |
| 40 | NOT FIXED | [edge/caddy/Dockerfile:1](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/caddy/Dockerfile:1>): floating build inputs remain. |
| 41 | VERIFIED FIXED | [edge/addons/server.js:293](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/edge/addons/server.js:293>): per-IP gate failures, no global lockout. |
| 42 | VERIFIED FIXED | [scripts/backup.sh:16](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/backup.sh:16>), [scripts/backup.sh:32](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/backup.sh:32>): free-space and timestamp retention checks present, not fault-tested. |
| 43 | VERIFIED FIXED | [scripts/06-crater.sh:82](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/06-crater.sh:82>): canonical item/old-name handling present; live catalogue not queried. |
| 44 | PARTLY FIXED | [scripts/run-test.sh:9](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/run-test.sh:9>), [scripts/03-edge.sh:10](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/03-edge.sh:10>): test unpack opt-in; stale edge/ops archives operator-managed. |
| 45 | VERIFIED FIXED | [scripts/01-install-docker.sh:9](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/01-install-docker.sh:9>): host tools checked before Docker-installed branch. |
| 46 | VERIFIED FIXED | [scripts/02-configure.sh:6](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/02-configure.sh:6>), [scripts/02-configure.sh:35](<F:/MY FILES/DATA SCIENCE/2CLINIC SYSTEM/vipers-hospital-deploy/scripts/02-configure.sh:35>): private umask/temp environment file/rename present. |

## Additional security assessment

The delete flow has useful controls: hospital-mode check, server-side password verification, random token, SHA-256 verifier, timing-safe comparison and wrong-token refusal. A 202 is acceptance, not deletion. Password knowledge authorises it without a browser session. No cross-trial deletion bypass was demonstrated. Explicit CSRF controls are absent, but password/token requirements mean absence alone is not a demonstrated exploit.

Metadata delivery of root scripts makes metadata-modification permission a code-execution boundary. No concrete hospital-name shell/SQL/XSS injection was established in the reviewed quoted paths. Provider output is rendered as text. Upstream APIs remain out of scope. Readiness probe IP comes from Compute, not signup text; no arbitrary signup-controlled SSRF was demonstrated. Internal TLS verification and helper SSH host-key checking are disabled: verify the corresponding network/IAP trust assumptions before production. AI requests lack staff-session authorisation when the demo gate is disabled, making public provider spending an intentional design exposure needing budget control.

The checked-in mock cloud completes operations immediately and does not execute first boot, Docker, firewall, real IAM or actual database revocation. Its passing token tests are useful but do not prove those paths. The fake AI provider's narrow examples prove only those examples, not general privacy or medical-policy compliance.

## Requirements before real-hospital go-live

A policy not visible in this repository is **missing evidence**, not proof it does not exist. Require accountable owners to provide:

- **Code/platform:** enforced production mode, blocking fixes, approved pinned/scanned image inventory, reproducible clean install, migration/rollback and patch process. Verify actual image/module versions rather than assuming a tag establishes patch coverage.
- **Access:** named staff, reviewed clinical API privilege matrix, distinct service/owner users, restricted remote administration, appropriate administrator MFA control, session revocation, onboarding/offboarding and protected attributable audit logs.
- **Infrastructure:** separate controller/tenant permissions, proven first-boot quarantine, constrained metadata/egress, verified TLS/DNS, capacity/disk controls. Availability architecture must meet agreed objectives; high availability is not presumed mandatory for every clinic.
- **Recovery:** encrypted off-host backup, access/retention policy, demonstrated clean-host restore, agreed RPO/RTO and recovery of attachments, billing/sync, configuration and required secrets; backup-failure alerts and downtime procedures.
- **Clinical/financial validation:** clinician/cashier approval of identity, allergies, diagnoses, units, prescriptions, order/result linkage, amended results, admission/transfer/discharge, receipts, totals/refunds, dates and multi-user behaviour. Validate Fahrenheit/Celsius handling, estimated DOB, invoice patient ID, diagnosis visit/status scope, two-patients-per-bed configuration, dark-mode colours, unsaved-note loss and network retries. These are validation gates, not assertions that each workflow is broken.
- **Privacy/legal:** controller/processor responsibilities, lawful health-data handling, notices, retention/access/breach procedures, processor contracts and appropriate PDPO registration evidence. Johannesburg hosting and external AI require documented cross-border processing basis/safeguards. Review against the [official Act](https://fia.go.ug/sites/default/files/downloads/Data-Protection-and-Privacy-Act-2019.pdf), [PDPO Regulations including regulation 30](https://pdpo.go.ug/media/2022/03/Data_Protection_and_Privacy_Regulations-2021.pdf), and [PDPO registration guidance](https://pdpo.go.ug/media//2022/01/20102021105143-Registration_Classification_and_Guidance_Notes.pdf). Obtain responsible privacy/legal review; this is not a legal compliance determination.
- **Operations/support:** named support owner, escalation/coverage, service/backup/expiry/deletion alerts, incident response, vulnerability management, staff training and paper/downtime reconciliation. Supplied evidence does not establish those controls operate.

## Top 10 fixes, in order

1. Quarantine trials before copied services start, including QUIC and other exposed paths (H01).
2. Repair first-boot parent error handling and crash-consistent rotation; fault-test every step (H02, M13).
3. Require and verify isolated low-privilege trial IAM (H03).
4. Gate signups on successful reconciliation and recover never-submitted reservations (H05, M14).
5. Restore recovered deletion verifiers, scrub before ready, and independently enforce expiry/deletion (M01–M03).
6. Keep external AI off for real records and establish an approved data-flow boundary (H04).
7. Make hardening/security/final acceptance fail on unknown or failed outcomes (H06, M04).
8. Prove clean installation and complete off-host restoration (H07–H08, M12).
9. Eliminate clinical-text rewriting and validate diagnosis pagination/retry (M05–M06).
10. Establish production profile, staff identities, pinned/scanned inputs, privacy evidence and clinical/operational sign-off (C01, M09).

