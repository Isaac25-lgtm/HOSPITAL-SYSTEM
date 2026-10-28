# Confirmed audit defects — implementation and rollout

These changes address the confirmed demo/trial code defects. They have **not been deployed or proven on a fresh cloud hospital**. The historical production-readiness report remains a snapshot, not a claim that the new source is production approved. Claude's pre-existing spinner changes in vipers.js/vipers.css and spinner tests were preserved.

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
5. Keep free-text AI opt-in unset/false. Restart the add-on service to discard prior cache/config. If explicitly enabled for fictional trials, provider filters still do not guarantee privacy.
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
