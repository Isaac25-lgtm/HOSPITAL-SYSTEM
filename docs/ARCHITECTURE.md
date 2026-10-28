# Architecture

## Components on one server

```
Internet ──HTTPS──► Caddy (edge/Caddyfile, ports 80/443 only, Let's Encrypt via sslip.io / real domain)
   ├─ /vipers-trial*            → vipers-addons (trial portal; main server only)
   ├─ /vipers-assets/*, /vipers-gate/*, /vipers-ai/*  → vipers-addons (Node: assets, AI, legacy gate)
   ├─ demo.<host>  (everything else) → Bahmni proxy (Apache) → OpenMRS 2.0.1, Bahmni apps, Lab, Appointments, Reports
   └─ billing.<host>                → Crater (nginx + PHP)
   Caddy injects vipers.css + vipers.js into every HTML page (the "VIPERS layer").
Internal only: openmrsdb (MySQL 8), reportsdb, craterdb, crater-atomfeed(-db), template-service, bahmni-config …
```

- Upstream: `Bahmni/bahmni-docker` tag `2.0.0-lite` (18 services). Bahmni code is **never modified**. Overrides live in
  `.env.vipers`, `docker-compose.vipers.yml`, `docker-compose.edge.yml` and the configuration overlay.
- Bahmni's own TLS ports are bound to `127.0.0.1`; only Caddy is public. SSH only through Google IAP.

## The VIPERS layer (`edge/addons/public/vipers.js` + `vipers.css`)

Loaded on every page of every module (Bahmni 2.0 React screens, older AngularJS screens, Lab Entry, Crater). It:

- brands text/logos/titles and rewrites a few misleading upstream phrases (`TEXT_FIXES`);
- shows one-click **role cards** on the demo sign-in pages (fills and submits the stock form; ends any leftover session
  first because Bahmni hangs when signing in over an existing session);
- in **hospital mode** (`/vipers-assets/site.json` present) hides the cards, shows the trial notice and the hospital's sign-in;
- provides the "?" help panel, first-login tour, Ask Vipers AI panel, the evening-mode switch in the top bar, loading hint;
- patches upstream bugs: In-Patient bed pop-up request (stray comma → HTTP 400), ward Diagnoses panel (reads FHIR
  `Condition?category=encounter-diagnosis` because the ward screen only reads legacy obs diagnoses), Cancel button styling,
  empty language selector.

`vipers.css` holds the theme: Home tiles per module colour (`data-testid`), sign-in cards, older-screen classes
(`.opd-header-wrapper`, `.section-grid`, `.tab-item`, `.confirm`, `li.active-patient`, `.bed-assignment li.col`), Carbon
v11/v10 dropdown readability, phone layouts, the photo background on sign-in, Home and the trial portal (`nature-bg.jpg`, Unsplash License, credited on the About page) and evening mode (`html.vp-dark`).

## Configuration layering

1. Upstream release config (volume `bahmni-config`).
2. VIPERS overlay `/opt/vipers/branding/config-overlay/` copied over it on every start (white label, home tiles,
   clinical v2 dashboard, ADT app + i18n). Kit copy: `config-overlay/`.
3. OpenMRS metadata via REST in idempotent scripts (`05-demo-accounts.sh`, `10-qa-fixes.sh`, `11-inpatient.sh`).
4. `Cache-Control: no-cache` on `/bahmni_config/*` so configuration changes reach browsers immediately.

## Operations

- `vipers-guard.timer` (15 min, `scripts/guard.sh`): restart stopped containers; on the demo also restore demo accounts
  and switch to the real domain once DNS points here. On hospital servers only the container self-heal runs.
- Nightly backups, `reset-demo.sh`, `vipers-expiry.timer` (demo end date), `security-check.sh`.

## Hospital trial servers

See [TRIAL-PORTAL.md](TRIAL-PORTAL.md). Each hospital server is a full copy of the system (from the image
`vipers-hospital-golden`), configured at first boot by `scripts/tenant-firstboot.sh`.
