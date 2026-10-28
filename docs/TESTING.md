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

## Trial portal

End-to-end: sign up a test hospital through the API, wait for the server to report ready, sign in with the hospital
account, check every module tile and the demo accounts being retired, then delete the server. Test credentials are
generated on the server (`/opt/vipers/secrets/trial-qa.env`, root-only).
