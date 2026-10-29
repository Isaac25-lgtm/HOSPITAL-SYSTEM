# Hospital trial portal

> Current code changes require a verified boot-sealed image and metadata scrub before readiness. See [AUDIT-FIXES.md](AUDIT-FIXES.md) for the mandatory rollout and remaining live verification; older deployment descriptions below are not proof these fixes are deployed.

Hospitals test the system in their **own private copy**: they open an account (hospital name, username, password), get a
server of their own with every module behind one login, and the server is **deleted after 5 days** with all its data,
or earlier if the hospital deletes it itself. At most **3** trial servers exist at once.

## Flow

1. `https://demo.<main-host>/` redirects to `/vipers-trial/` (portal page from `edge/addons/trial.js`).
2. **Open an account** → `POST /vipers-trial/api/signup`
   - validation (hospital 3-60 chars, username `^[a-z][a-z0-9._-]{2,29}$` not `demo.*`/reserved, password ≥ 8 incl. a letter, ≠ username);
   - admission first reconciles with the cloud (shared by simultaneous requests) and refuses unsealed images; the username
     and slot are then **reserved synchronously** (no await between check and reservation), so simultaneous requests cannot
     exceed the cap or reuse a username; the registry is saved atomically and a failed save refuses the sign-up;
     5 sign-ups per IP per hour and at most `TRIAL_DAILY_MAX` (default 6) new spaces per 24 hours, counted from the registry;
   - trial servers need a separate low-privilege identity (`TRIAL_SA`); running them as the controller's own identity is
     refused unless `TRIAL_ALLOW_CONTROLLER_SA=true` is set explicitly (the current demo does this until the IAM change is
     approved);
   - Compute Engine `instances.insert` (metadata-server token): image `vipers-hospital-golden`, `e2-standard-4`, 80 GB
     **pd-standard**, labels `vipers-trial=1`, `vipers-trial-id`, `vipers-expires`. Instance metadata carries the hospital
     details, the password and a per-server **delete token** (both removed once the server is ready), the current
     first-boot script, billing script and add-on code (so servers made from an older image run current logic), and the
     main server's address (`vipers-controller`) from which the server fetches the current web layer.
   - optional `TRIAL_SA` (separate low-privilege service account for trial servers) and `TRIAL_CONTROLLER_UNTIL` (no trial
     may outlive the main server; set on the demo to its power-off, 2026-11-08T05:47:00Z = 08:47 EAT).
3. The page polls `GET /vipers-trial/api/status?id=` every 15 s; the **background sweep (every 5 min) also checks
   readiness**, so closing the tab does not matter. Ready = `https://demo.<ip>.sslip.io/vipers-assets/site.json` reports
   `mode: "hospital"`. The password and delete token are then removed from the instance metadata (retried until confirmed).
4. **Log in to an existing account** → `POST /vipers-trial/api/find {username}` → redirect URL (or the waiting page while
   it is being prepared). The portal never lists hospitals.
5. Sweep: reconcile with the labelled servers that really exist (unknown ones are adopted, so a lost registry cannot leave
   a server running), refresh readiness, delete expired servers and servers not ready after 40 minutes. A record keeps its
   slot (`deleting`) until the cloud confirms the server is gone; refused deletes are retried.
   Registry: `/data/trials.json` in the `addons-data` volume.

## First boot of a hospital server (`scripts/tenant-firstboot.sh`) — fail closed

Runs on every boot; configures once (`/opt/vipers/tenant/configured`).

1. Every boot: `is-tenant` marker, demo expiry timer off, a timer that **powers the server off at its expiry** (works even
   if the main server is down). Later boots only follow an address change after a stop/start.
2. **Public ports 80/443 are blocked** (host firewall, `INPUT` and `DOCKER-USER`) before anything else; `site.json` =
   `hospital-pending`; the guard leaves the stack alone while setup runs.
3. Re-address the stack (`02-configure.sh`), start it, wait for OpenMRS.
4. Give this server its **own** OpenMRS owner/sync password and Crater owner password (the image copy is shared).
5. Role **VIPERS Hospital** (union of the VIPERS role privileges), hospital user (or password reset on a retry) and
   provider; **retire every demo account**; then **verify** that none of the public demo passwords and no default password
   signs in, and that the hospital account does. Password policy back to 8 characters.
6. Billing (`crater-hospital-user.php`): hospital user (`<username>@vipers.trial`, same password), company name, new
   owner password, demo cashier locked out, **all copied API tokens, sessions and remember-me tokens revoked**, verified.
7. Fetch the current web layer from the main server; install the current add-on code and the delete token
   (`/opt/vipers/secrets/addons.env`, root-only).
8. Only now **open the ports**, serve this server's own hostnames (certificate) and write `site.json` = `hospital`.
   Any failed step leaves the ports closed and writes `hospital-failed`; the portal deletes such servers after 40 minutes.

## Hospitals deleting their own account

After signing in, the hospital sees **Delete account** in the top bar (next to TRIAL). The dialog explains that the
account and all its data are deleted permanently and asks for the account password. Then:

1. `POST /vipers-trial/api/self-delete {password}` on the hospital's server: only in hospital mode; the password is checked
   directly against OpenMRS for the hospital account (Bahmni's session cookie is scoped to `/openmrs` and does not reach
   this endpoint; re-entering the password is the safer confirmation anyway). 5 attempts per hour.
2. That server calls `POST <main>/vipers-trial/api/delete {id, token}`. The main server compares the SHA-256 of the token
   with the one stored at sign-up, starts the deletion (same confirmed-delete path as expiry) and frees the slot.

Verified end to end on 28 Oct 2026 (`tests/wf-trial-delete.js` with `DELETE=1`): wrong password refused, right password
deletes, the server disappears from the cloud.

## Image

`vipers-hospital-golden` (family `vipers-hospital`) is made from the main server's disk with the services stopped,
after `cleanup-test-data.sh` (six example patients remain). Because first-boot logic, add-on code and the web layer are
delivered at sign-up, the image only needs re-creating for changes to Bahmni configuration, the Caddyfile or data.

## Cost and limits

About USD 4 per hospital per day (e2-standard-4 + standard disk); 3 at once ≈ USD 12/day. Regional fast-disk quota
(250 GB) is why trial servers use standard disks.
