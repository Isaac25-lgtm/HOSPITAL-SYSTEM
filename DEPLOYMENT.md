# VIPERS HOSPITAL – deployment guide

Covers: (A) the current Google Cloud demo, (B) a fresh install on Hetzner or any Ubuntu server, (C) the offline on-site install.

## Architecture

```
Internet ──HTTPS──► Caddy (Let's Encrypt, ports 80/443 only)
                      ├─ /vipers-gate/*, /vipers-assets/*  → vipers-addons (gate page, help, logos)
                      ├─ /vipers-ai/*   (after gate)       → vipers-addons → DeepSeek
                      ├─ demo.<host>    (after gate)       → Bahmni proxy (Apache) → OpenMRS 2.0.1, Bahmni 2.0 apps,
                      │                                       lab, appointments, documents, reports
                      └─ billing.<host> (after gate)       → Crater (nginx + PHP)
      Caddy injects vipers.css + vipers.js into HTML pages: branding, help, walkthrough, Ask Vipers AI.
Internal only: openmrsdb (MySQL 8), reportsdb, craterdb, crater-atomfeed(-db), template-service …
```

- Official release: **Bahmni/bahmni-docker tag `2.0.0-lite`**, commit `3215b5a1c6aa036d07f10e60950bdec5866bb410`, profile `bahmni-lite` (18 services). The release `.env` is untouched; overrides live in `.env.vipers` and `docker-compose.vipers.yml`.
- **Security patch:** `OPENMRS_IMAGE_TAG=2.0.1` (Bahmni advisory of 8 Oct 2026: SQL injection and path traversal fixes; image published 2026-10-08). All other images stay on the release's `2.0.0-lite` tags; unreleased `-NNN` build tags are not used.
- Bahmni's own TLS ports are bound to `127.0.0.1` (8443 Bahmni, 8444 Crater); only Caddy is public.
- Bahmni code is **not modified**. Branding uses Bahmni's white-label config (an overlay re-applied on every start) plus the injected layer.

## Kit layout (this folder)

| Path | Purpose |
|---|---|
| `scripts/00-guard.sh` | every script refuses to run unless on the expected Linux server |
| `scripts/01-install-docker.sh` | Docker Engine + Compose, 4 GB swap, log rotation, timezone |
| `scripts/01b-get-bahmni.sh` | clone `2.0.0-lite` on the server, pull images (OpenMRS 2.0.1) |
| `scripts/02-configure.sh` | generate secrets (root-only), build `.env.vipers` (UGX, Kampala, Crater branding, hostnames); stages the files mounted into containers (`stage-mounts.sh`) so they exist before the first start |
| `scripts/docker-compose.vipers.yml` | localhost-only ports, restart policies, white-label overlay hook |
| `scripts/vipers.sh` | server command `vipers up/down/restart/ps/logs/health/dc` |
| `scripts/04-harden.sh` | replace OpenMRS default passwords (superman, admin, stock users) |
| `scripts/05-demo-accounts.sh` | demo roles + accounts, demo password policy, privilege fixes, location name (idempotent) |
| `scripts/06-crater.sh` (+ `crater-demo-user.php`) | UGX currency, company profile + logo, cashier role/user, price list |
| `scripts/07-branding.sh` | white-label overlay (logos, tiles, help link) |
| `scripts/03-edge.sh` | Caddy + vipers-addons, hostnames, gate code |
| `scripts/08-install-ops.sh` | guard timer (15 min self-heal + DNS switch) and nightly backup |
| `scripts/backup.sh`, `reset-demo.sh` | backup / restore databases and documents |
| `scripts/run-test.sh`, `run-all.sh`, `tests/*.js` | Playwright acceptance tests (run on the server) |
| `edge/` | Caddyfile, Caddy build, vipers-addons service (gate, help, AI), brand assets, `help.json` |
| `vm.ps1`, `vipers.ps1` | manage the cloud VM from Windows |

## (A) Operating the Google Cloud demo

| | |
|---|---|
| Project / VM | `vipers-hospital-demo` / `vipers-hospital-vm`, africa-south1-a, e2-standard-4 (4 vCPU, 16 GB), Ubuntu 24.04, 80 GB balanced disk |
| Public IP | 34.35.115.102 (static) |
| URLs | https://demo.34-35-115-102.sslip.io and https://billing.34-35-115-102.sslip.io → automatically also **demo./billing.motionimprints.tech** once A records point to 34.35.115.102 |
| Access | SSH only through Google IAP; ports 80/443 public; databases not exposed |
| Secrets | on the VM in `/opt/vipers/secrets/` (root-only); DeepSeek key in Secret Manager |

From this folder on Windows:
```powershell
.\vipers.ps1 status        # health
.\vipers.ps1 logs openmrs  # logs of one service
.\vipers.ps1 restart       # restart the app        (.\vipers.ps1 restart caddy  for one service)
.\vipers.ps1 vm-stop       # pause compute billing   (.\vipers.ps1 vm-start; ready ~5 min later)
.\vipers.ps1 reset-demo    # back to the clean demo dataset
```
Self-healing: `vipers-guard.timer` runs every 15 minutes. It restarts stopped containers, restores demo accounts, roles and passwords in OpenMRS and Crater, and switches to the motionimprints.tech hostnames once DNS is in place. Nightly backup runs at 02:30 EAT (`/opt/vipers/backups/nightly-<day>`). A clean `baseline` backup holds the starting demo dataset.

Owner (super-admin) passwords: `sudo cat /opt/vipers/secrets/vipers.env` on the VM (`.\vipers.ps1 ssh`). They are never printed by the scripts or stored in this kit.

## (B) Fresh install on Hetzner (or any Ubuntu 24.04 x86-64 server)

Minimum: **4 vCPU, 16 GB RAM, 80 GB SSD**. Reachable on 80/443 with a DNS name.

```bash
# copy this folder to the server (e.g. scp -r vipers-hospital-deploy root@server:/root/), then on the server:
cd /root/vipers-hospital-deploy/scripts
export VIPERS_EXPECTED_HOST=$(hostname) PUBLIC_IP=<server ip>
cp ../scripts/00-guard.sh /tmp/
bash 01-install-docker.sh
bash 01b-get-bahmni.sh
BILLING_HOST=billing.example.org bash 02-configure.sh                       # also stages the mounted config files (stage-mounts.sh)
install -m 755 vipers.sh /usr/local/bin/vipers && vipers up         # first OpenMRS start: 10-20 min
until curl -sk https://127.0.0.1:8443/openmrs/ws/rest/v1/session | grep -q authenticated; do sleep 20; done
bash 04-harden.sh && bash 05-demo-accounts.sh
tar -czf /tmp/edge.tgz -C ../edge . && DOMAIN=example.org bash 03-edge.sh   # installs edge + brand assets
bash 07-branding.sh                                                          # needs the assets from 03
cp crater-demo-user.php /tmp/ && bash 06-crater.sh                           # uploads the logo from 03
echo 'AI_API_KEY=<key>' >> /opt/vipers/secrets/addons.env && DOMAIN=example.org bash 03-edge.sh   # optional AI
tar -czf /tmp/scripts.tgz -C . . && bash 08-install-ops.sh
# optional demo data: see tests/seed.js (bash run-test.sh seed.js), then: bash backup.sh baseline
```
Notes for non-Google servers: the AI key comes from `AI_API_KEY` in `/opt/vipers/secrets/addons.env` (root-only). Re-run `03-edge.sh` after adding it. For hostnames, edit `03-edge.sh` (`DOMAIN`, `PUBLIC_IP`) or set them as environment variables.

## (C) Offline on-site install (no internet at the facility)

1. **Before travelling**, on a connected machine with Docker (e.g. the Hetzner server), save all images to a USB disk:
   ```bash
   cd /opt/vipers/bahmni-docker/bahmni-lite
   vipers dc config --images | sort -u > images.txt   # includes vipers/caddy and vipers/addons
   docker save $(cat images.txt) | gzip > /media/usb/vipers-images.tar.gz   # ~5-6 GB
   cp -r /opt/vipers/bahmni-docker /root/vipers-hospital-deploy /media/usb/
   ```
   Also copy the Ubuntu Docker `.deb` packages if the site server has no internet (`apt-get download docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin`).
2. **At the site:** `docker load < vipers-images.tar.gz`, copy `bahmni-docker` to `/opt/vipers/`, then follow (B) **skipping** `01b-get-bahmni.sh` and the image builds.
3. **HTTPS on a LAN:** Let's Encrypt needs the internet. In `edge/Caddyfile`, add `tls internal` inside the two site blocks and use a local name (e.g. `DEMO_HOSTS=vipers.local`), or terminate TLS on the hospital's own certificate.
4. Set `GATE_ENABLED=false` (`GATE_ENABLED=false bash 03-edge.sh`); the tester gate is only for the public demo.
5. AI: `AI_ENABLED=false` (the default when no key or Google Cloud is present). Help, tips, walkthrough and `/vipers-assets/help.html` work offline.
6. Run `05-demo-accounts.sh` with `KEEP_VISITS_OPEN=0` (or skip it) so OpenMRS keeps closing stale visits, and don't install `09-expiry.sh`.
7. **Replace demo accounts** with real staff accounts and **remove the demo password policy** (`security.passwordMinimumLength` etc. back to defaults). The football-club passwords are for the demo only.
8. Fonts: Bahmni 2.0 loads the IBM Plex font from a CDN; offline it falls back to system fonts (cosmetic only).
