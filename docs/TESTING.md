# Testing

All tests are Playwright scripts in `tests/`, run **on the server** inside the official Playwright container
(`scripts/run-test.sh <test.js> [ENV=value…]`), against the public HTTPS URL. Helpers in `tests/lib.js`
(`login` reveals the hidden username/password form under the role cards).

## Suites

| Run | What it covers |
|---|---|
| `scripts/run-all.sh` | Reception (register, visit), Doctor (consultation: vitals, diagnosis, allergy, prescription, lab order, print), Lab (result entry, doctor sees it), Appointments + Documents, Billing (sync, invoice UGX, payment, receipt), Admin (tiles, audit, reports, form builder), walkthrough, Help + AI (static answers, DeepSeek fallback, refusals, rate limit, key secrecy), UX (overlap / scrolling at 1920, 1366, 820, 390 px), performance (6 concurrent staff), **inpatient** (Ward Nurse: admit, bed, Admitted list, transfer, discharge) |
| `wf-mobile.js` | Full patient journey at phone width |
| `wf-qa-fixes.js` | Regression checks for the 28 Oct 2026 QA fixes (dashboard vitals, Radiology removed, config caching, dropdowns, naming, AI invoice answer, billing branding, Mobile Money) |
| `wf-cards.js`, `wf-cards-switch.js`, `wf-cards-edge.js` | One-click sign-in for every role, role switching in one tab, signing in over a leftover session |
| `wf-loading.js` | "Loading VIPERS HOSPITAL…" hint from first paint, cleared after render |

Results: `/opt/vipers/tests/out/results/*.json` and `run.log`; screenshots in `/opt/vipers/tests/out/`.

Last full run (28 Oct 2026): **168 / 168 checks passed** (acceptance 114, phone 6, QA fixes 14, sign-in 31, loading 3).

`run-all.sh` exits non-zero when any suite fails or writes no results (a crashed suite is a failure, not a pass).

## Unit tests (no browser, no cloud, no real AI)

Run in the plain Node 22 image on the server:

```
docker run --rm -v /opt/vipers/edge/addons:/app:ro -v /opt/vipers/tests:/t:ro node:22-alpine node /t/unit-ai.js
docker run --rm -v /opt/vipers/edge/addons:/app:ro -v /opt/vipers/tests:/t:ro node:22-alpine node /t/unit-trial.js
```

| Test | What it proves |
|---|---|
| `unit-ai.js` | The real AI proxy against a fake provider that records every outbound request: malformed bodies get 400 and never stop the process; a Unicode gate code does not crash; a refused patient question never reaches the provider, now or later as history; patient names in screen labels/title are not forwarded; screen labels are kept out of the system instructions; no shared cache for follow-ups or other roles; client-supplied page/role text is replaced. |
| `unit-trial.js` | The real provisioner against a fake metadata server and Compute API: simultaneous sign-ups (same / different usernames) respect uniqueness and the cap; servers are labelled for reconciliation and receive the current add-on code; refused deletes keep their slot and are retried; deletion is confirmed; an unknown labelled server is adopted and deleted at expiry; hospital self-delete refuses a wrong token, accepts the right one, never stores the token. |

## Trial portal, end to end

1. Sign up a test hospital through the API (credentials generated on the server, `/opt/vipers/secrets/trial-qa.env`,
   root-only) and wait for `ready`.
2. Server-side checks: hospital login works; public demo passwords and default passwords are refused; password and delete
   token removed from the instance metadata; billing reachable.
3. `tests/wf-trial-delete.js BASE=<trial url> HUSER=… HPASS=… [DELETE=1]`: hospital sign-in notice, no role cards,
   TRIAL label, **Delete account** button, confirmation dialog (a wrong password is refused), and with
   `DELETE=1` the deletion itself; then confirm the server disappears from the cloud.

Later source fixes and local verification are tracked in [AUDIT-FIXES.md](AUDIT-FIXES.md); earlier live verification claims above apply to the historical deployment, not these changes.
