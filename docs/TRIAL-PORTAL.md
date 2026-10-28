# Hospital trial portal

Hospitals test the system in their **own private copy**: they open an account (hospital name, username, password), get a
server of their own with every module behind one login, and the server is **deleted after 5 days** with all its data.
At most **3** trial servers exist at once.

## Flow

1. `https://demo.<main-host>/` redirects to `/vipers-trial/` (portal page from `edge/addons/trial.js`).
2. **Open an account** → `POST /vipers-trial/api/signup`
   - validation (hospital 3-60 chars, username `^[a-z][a-z0-9._-]{2,29}$` not `demo.*`/reserved, password ≥ 8 incl. a letter, ≠ username);
   - unique username among active trials; capacity check (`TRIAL_MAX`, default 3); 5 sign-ups per IP per hour;
   - Compute Engine `instances.insert` (this VM's service account, metadata-server token): image `vipers-hospital-golden`,
     `e2-standard-4`, 80 GB **pd-standard**, same network tags, label `vipers-trial=1`, metadata
     `vipers-hospital|username|password|expires|billing-email` and a startup script.
3. The page polls `GET /vipers-trial/api/status?id=` every 15 s. The portal reads the instance IP, then waits until
   `https://demo.<ip>.sslip.io/vipers-assets/site.json` reports `mode: "hospital"`, marks the trial ready, **removes the
   password from the instance metadata**, and the page redirects to the hospital's sign-in.
4. **Log in to an existing account** → `POST /vipers-trial/api/find {username}` → redirect URL (or the waiting page while
   it is being prepared). The portal never lists hospitals.
5. Sweep every 10 min: delete expired servers; delete servers not ready after 40 minutes (frees the slot).
   Registry: `/data/trials.json` in the `addons-data` volume.

## First boot of a hospital server (`scripts/tenant-firstboot.sh`)

Runs on every boot, configures once (`/opt/vipers/tenant/configured`):

1. `is-tenant` marker (guard: no demo accounts, no DNS switch), `site.json` = `hospital-pending` **immediately** (switches
   off the copied portal/sweep and the role cards), removes any copied `trials.json`, disables the demo expiry timer.
2. Re-addresses the stack for its own IP (`02-configure.sh`, `03-edge.sh`; secrets kept).
3. Creates role **VIPERS Hospital** (union of the VIPERS role privileges; no infrastructure privileges) and the hospital
   user + provider; **retires every demo account** (their passwords are public).
4. Billing: hospital user (`<username>@vipers.trial`, same password, super admin), company name = hospital, demo cashier
   password randomised (`scripts/crater-hospital-user.php`).
5. Writes `site.json` (`mode: "hospital"`, hospital, username, billing e-mail, expiry).

## Image

`vipers-hospital-golden` (family `vipers-hospital`) is made from the main server's disk with the services stopped,
after `cleanup-test-data.sh` (six example patients remain). Re-create it after changes to the main server.

## Cost and limits

About USD 4 per hospital per day (e2-standard-4 + standard disk); 3 at once ≈ USD 12/day. Regional fast-disk quota
(250 GB) is why trial servers use standard disks.
