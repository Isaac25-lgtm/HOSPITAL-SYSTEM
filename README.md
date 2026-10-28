# VIPERS HOSPITAL

A branded, hardened and extended deployment of the open-source **Bahmni Lite 2.0** hospital system (OpenMRS +
Crater billing), built by Motion Imprints Technologies for hospital trials in Uganda. Everything here runs on top of
the **unmodified** upstream release: VIPERS adds an edge proxy, an in-page layer, configuration overlays, operations
scripts, an AI navigation helper, a self-service **hospital trial portal** and an automated acceptance-test suite.

> This repository contains **no passwords, keys or patient data**. Secrets are generated on each server at install time
> (`/opt/vipers/secrets/`, root-only) and the AI key lives in Google Secret Manager. All data is fictional.

## What it does

| Area | What VIPERS adds on top of Bahmni Lite 2.0 |
|---|---|
| Access | One-click role cards on the demo (no passwords); a self-service **trial portal**: each hospital opens an account and gets its **own server** (one login, every module), deleted automatically after 5 days, max 3 at once |
| Clinical | Inpatient care switched on (wards, 32 beds, admit / transfer / discharge, Ward Nurse role), dashboard shows all vitals, ward screens show diagnoses from the 2.0 consultation |
| Look | Full redesign (Home tiles, sign-in cards, all older screens, billing), clearer borders, evening (dark) mode, loading hints, readable dropdowns, phone layouts |
| Help | Contextual "?" help per screen, first-login tour, **Ask Vipers AI** (DeepSeek) with a whole-system guide, screen awareness, "Explain this screen", privacy and medical-advice filters, token ceilings |
| Billing | UGX, hospital price list, Mobile Money, consistent test names, branded invoices/receipts |
| Operations | Self-healing guard (15 min), nightly backups, reset to baseline, demo expiry, security checks |
| Quality | 170+ automated Playwright checks across every role, phone/tablet/laptop, performance and the trial portal |

## Repository layout

| Path | Purpose |
|---|---|
| `edge/Caddyfile` | Public HTTPS edge (Caddy): routing, caching rules, HTML injection of the VIPERS layer, trial portal front door |
| `edge/addons/server.js` | Node service: Ask Vipers AI backend, privacy/medical filters, rate limits, static assets, legacy access gate |
| `edge/addons/trial.js` | Hospital trial portal and provisioner (Compute Engine API): sign-up, status, log-in lookup, 5-day sweep |
| `edge/addons/help.js` | Help retrieval for the AI (static FAQ matching, context building) |
| `edge/addons/public/vipers.js` | In-page layer loaded on every page: branding, role cards, hospital mode, help, tour, AI panel, evening mode, small fixes for upstream bugs |
| `edge/addons/public/vipers.css` | The VIPERS theme and layout fixes for all Bahmni, Lab and Crater screens |
| `edge/addons/public/help.json`, `system-guide.txt` | Verified help per screen, FAQ, and the full system guide given to the AI |
| `edge/addons/public/trial.*` | Trial portal page assets |
| `config-overlay/` | Bahmni configuration overlays (e.g. clinical dashboard) applied on every start |
| `scripts/` | Install, configure, harden, demo accounts, inpatient, QA fixes, guard, backups, expiry, trial first boot |
| `tests/` | Playwright acceptance tests (run on the server in the official Playwright container) |
| `docs/` | Architecture, trial portal, testing, security / audit guide |
| `*.md` (root) | Deployment guide, known limitations, cloud costs, AI integration, demo access, test results, cleanup |

## Quick links

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - components, request flow, data, configuration layering
- [docs/TRIAL-PORTAL.md](docs/TRIAL-PORTAL.md) - how hospital accounts and their servers are created and deleted
- [docs/TESTING.md](docs/TESTING.md) - the acceptance suite and how to run it
- [docs/SECURITY-AUDIT.md](docs/SECURITY-AUDIT.md) - threat model, sensitive code paths and known gaps (**start here for an audit**)
- [DEPLOYMENT.md](DEPLOYMENT.md) - operating the Google Cloud demo, fresh installs, offline install
- [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) - what is upstream behaviour and not fixable at this layer
- [AI_INTEGRATION.md](AI_INTEGRATION.md), [CLOUD_COSTS.md](CLOUD_COSTS.md), [DEMO_CREDENTIALS.md](DEMO_CREDENTIALS.md)

## Running it

The kit is applied to an Ubuntu 24.04 server that runs the official `Bahmni/bahmni-docker` release
(`2.0.0-lite`, OpenMRS image 2.0.1). Every script refuses to run anywhere but the expected server (`scripts/00-guard.sh`).
In order: `01-install-docker.sh`, `01b-get-bahmni.sh`, `02-configure.sh`, `04-harden.sh`, `05-demo-accounts.sh`,
`06-crater.sh`, `07-branding.sh`, `03-edge.sh`, `08-install-ops.sh`, `10-qa-fixes.sh`, `11-inpatient.sh`.
See [DEPLOYMENT.md](DEPLOYMENT.md). From a Windows control PC, `vm.ps1` and `vipers.ps1` run commands on the server
through Google IAP (nothing is installed on the PC).

## Licences

Bahmni, OpenMRS and Crater are used under their upstream licences (see the in-app *About & licences* page,
`edge/addons/public/about.html`). VIPERS additions are by Motion Imprints Technologies.
