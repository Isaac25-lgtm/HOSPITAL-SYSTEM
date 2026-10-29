# Independent verification of Claude's review fixes

29 October 2026, Africa/Kampala. Reviewed the working-tree changes over `bb2566494d4d9635308551efdd682d6e6a0445f6`, Claude's pasted response, and `CODE-REVIEW-2026-10-29-RESPONSE.md`.

**Decision: the nine review findings have corresponding source fixes. Production readiness for real patient data is not established.** Fixing those findings does not close the separate deployment, recovery, access-control and clinical acceptance requirements.

| Finding | Independent check |
|---|---|
| R01 | Missing REPORTS_USER is tolerated explicitly in the configuration pipeline. Source verified. |
| R02 | All three login lookups fall back for empty usernames. Source verified. |
| R03 | Billing setup rejects production and tenant profiles; the PHP helper requires an explicit demo flag. Source verified. |
| R04 | Production switch now acquires the same maintenance lock used by the guard. Source verified for the reported guard race. |
| R05 | Volume cleanup uses find with mindepth 1, including hidden entries. Source verified; no database/volume restore performed. |
| R06 | Regeneration preserves AI limits; address-change first boot supplies tenant metadata limits. Source verified. |
| R07 | Generation check now precedes the missing-instance mutation. Recovery regression passed. |
| R08 | Reconciliation revives the existing VM record instead of appending a duplicate. Recovery regression passed. |
| R09 | New VM names are opaque. Recovery regression passed. This does not remove descriptive names from legacy records/logs. |

## Checks run independently

- `unit-trial.js`: 25/25 passed.
- `unit-trial-admission.js`: 4/4 passed.
- `unit-trial-recovery.js`: 5/5 passed.
- `unit-overlay.js`: all three reported checks passed.
- `git diff --check`: passed; Git emitted line-ending warnings only.
- `unit-ops.py`: initial strict-shell propagation check passed; suite then failed at the mocked firewall assertion (line 30). It is not counted as passed. This local result alone does not establish a live firewall failure.
- A read-only GCP SSH inspection was attempted but could not authenticate: the sandbox denied access needed by gcloud to open/create its credentials database. No live profile, configuration, deployed hashes, backup authentication or cloud IAM was independently confirmed.

## Requirements still preventing production sign-off

1. Prove the target install is in production mode, public/default demo access is disabled, free-text AI is off, and named staff have appropriate roles. The response describes deployment on the demo VM, not a completed production acceptance run.
2. Configure off-site backups and demonstrate a clean-host recovery of databases, documents and required configuration/secrets. The response explicitly lists the backup bucket/permission as outstanding. A local verified backup alone does not prove disaster recovery.
3. If self-service trials remain hosted, isolate their cloud identity from the controller. The response explicitly lists TRIAL_SA/IAM as outstanding. A standalone production install with no trial hosting has a different scope; validate its own runtime permissions.
4. Rebuild or comprehensively update the trial image before treating it as equivalent to current source. The response acknowledges older scripts remain in image v3; current metadata delivery compensates for some paths, not source/image parity.
5. Complete and retain deployment acceptance evidence, including production transition, restore and critical clinical/billing permissions and workflows. The response points to an AUDIT-FIXES.md section called "Regression after the 29 Oct review fixes"; that section was absent from the local file at verification time. The pasted transcript also says the regression was still running.

The atomfeed root-password question is documented by Claude as tested on the server. The independent review found consistent comments and unchanged credential use, but cannot promote that reported result to an independently verified result without server access.

No application code, production mode, cloud permissions or live data was changed by this verification. The historical review remains a record of the original findings; this file records the follow-up status.
