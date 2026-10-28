# Security and audit guide

Scope: a demonstration / trial deployment with **fictional data only**. It makes no claim of production-grade clinical
security or regulatory compliance (e.g. Uganda's Data Protection and Privacy Act). Please audit it with that context,
and flag anything that would block a production rollout.

## Trust boundaries

- **Public:** Caddy (80/443). Everything else listens on localhost or the Docker network. SSH only via Google IAP.
- **Demo server:** deliberately open: role cards sign in with shared demo accounts whose passwords are in
  `edge/addons/public/vipers.js` (`ACCOUNTS`). The guard restores those accounts every 15 minutes. Intended, but audit
  that the demo accounts cannot escalate (no `System Developer` / `Privilege Level: Full`; `05-demo-accounts.sh`
  checks this).
- **Hospital trial servers:** must NOT be reachable with the public demo passwords. `tenant-firstboot.sh` retires the demo
  OpenMRS users and randomises the Crater demo cashier. Please verify there is no window or path where they remain usable.
- **Cloud permissions:** the main VM's service account `vipers-vm` has `roles/compute.instanceAdmin.v1` on the project and
  `roles/iam.serviceAccountUser` on itself so the portal can create/delete trial servers. Every trial server runs with the
  same service account (needed for the AI key in Secret Manager). **A compromised trial server could therefore manage
  instances in the project.** This is the largest known risk; candidates: a separate low-privilege service account for
  trial servers with only `secretmanager.secretAccessor` on the AI secret, or no service account plus a key proxy.

## Sensitive code paths (please review closely)

| File | Why |
|---|---|
| `edge/addons/trial.js` | Unauthenticated public endpoints that create cloud servers: validation, rate limits, capacity, ID guessing, SSRF via the readiness probe (fetches `https://demo.<ip>.sslip.io/...` with the IP from the Compute API), metadata handling (the hospital password is passed in instance metadata until ready, then removed) |
| `scripts/tenant-firstboot.sh` | Runs as root at boot with values from instance metadata (hospital name, username, password) passed to `jq`, `curl` and `docker exec -e`: check quoting / injection |
| `scripts/crater-hospital-user.php` | Creates a Crater super admin from environment values |
| `edge/addons/server.js` | AI proxy: PII/medical filters, prompt construction (system guide + visible screen labels sent by the browser), rate limits, token ceilings, key never sent to the browser |
| `edge/addons/public/vipers.js` | Runs in every page with the user's session: XHR monkey-patch for the bed URL, FHIR fetch, form auto-fill, `innerHTML` uses (only static strings intended) |
| `edge/Caddyfile` | Routing, header policy (HSTS, Referrer-Policy, X-Robots-Tag), HTML injection, caching rules |

## Known gaps / accepted for the demo

- Shared demo accounts with public passwords on the demo server (by design).
- Trial passwords: minimum 8 characters; no e-mail verification; no CAPTCHA (rate limit 5 sign-ups per IP per hour plus the
  3-server cap). Abuse could keep all three slots busy for 5 days.
- The portal's `/api/find` reveals whether a username has an active trial (needed to redirect; rate-limited).
- Same database secrets on every trial server (they are copies of one image); each server is isolated, but a leak from one
  copy applies to all copies.
- Secrets in `/opt/vipers/secrets/` are root-only files on the VM disk (not a secrets manager), except the AI key.
- No WAF; Bahmni/OpenMRS/Crater upstream vulnerabilities apply (OpenMRS 2.0.1 includes the 8 Oct 2026 security fixes).

## How to verify quickly

- `scripts/security-check.sh` (ports, headers, API without session refused).
- `tests/wf-cards-edge.js` (sign-in over a leftover session), `tests/wf-ai.js` (key secrecy, refusals, rate limit).
