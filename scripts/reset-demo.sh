#!/bin/bash
# Restore the demo to a saved state (default: the clean "baseline" taken after seeding).
#   reset-demo.sh [backup-name]
# Checks the whole backup first (all parts present, checksums, archives readable) and only then stops the
# application containers, restores OpenMRS + Crater databases and document volumes, and restarts.
# The guard timer is held off (shared lock) for the whole restore.
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || { [ "$(uname -s)" = Linux ] || exit 1; }
set -euo pipefail
[ -f /opt/vipers/tenant/is-tenant ] && { echo "refusing: this is a hospital's trial server"; exit 1; }
# maintenance lock FIRST, profile check SECOND: a job queued behind the production switch must see the marker it wrote
# (a caller that already holds the lock, e.g. the guard, exports VIPERS_OPS_LOCK_HELD=1)
[ "${VIPERS_OPS_LOCK_HELD:-}" = 1 ] || { exec 9>"${VIPERS_OPS_LOCK:-/run/vipers-ops.lock}"; flock -w 600 9 || { echo "another maintenance job is running"; exit 1; }; export VIPERS_OPS_LOCK_HELD=1; }
# a server switched to production mode (scripts/production-mode.sh) never runs demo tooling
[ "$(cat "${VIPERS_PROFILE_FILE:-/opt/vipers/profile}" 2>/dev/null)" = production ] && { echo "refusing: production server (no demo accounts, demo reset or demo expiry)"; exit 1; }
source /opt/vipers/secrets/vipers.env
NAME="${1:-baseline}"
[[ "$NAME" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'invalid backup name'; exit 1; }
D=/opt/vipers/backups/$NAME
[[ ! -L "$D.current" ]] || D=$(readlink -f "$D.current")
source "$(dirname "$0")/backup-verify.sh"
verify_backup "$D" || { echo 'ABORT: incomplete or invalid backup'; exit 1; }
RESTORE_VOLS=$(sed -n 's/\.tgz$//p' "$D/CONTENTS")
for v in $RESTORE_VOLS; do
  case " $VIPERS_VOLUMES " in *" $v "*) ;; *) echo "ABORT: backup lists an unknown volume: $v"; exit 1;; esac
done

cd /opt/vipers/bahmni-docker/bahmni-lite
trap 'echo "RESTORE FAILED - services left stopped; rerun reset-demo.sh or start them with: vipers up"' ERR
echo "backup verified; stopping application services (databases stay up)"
vipers dc stop openmrs crater-php crater-atomfeed reports template-service caddy >/dev/null
gunzip -c "$D/openmrs.sql.gz" | docker exec -i -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" bahmni-lite-openmrsdb-1 mysql -uroot openmrs
gunzip -c "$D/crater.sql.gz" | docker exec -i -e MYSQL_PWD="$CRATER_DB_PASSWORD" bahmni-lite-craterdb-1 mysql -ucrater crater
# (the atomfeed database's root user uses MYSQL_ROOT_PASSWORD; CRATER_ATOMFEED_DB_ROOT_PASSWORD is not used by it - checked)
gunzip -c "$D/crater_atomfeed.sql.gz" | docker exec -i -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" bahmni-lite-crater-atomfeed-db-1 mysql -uroot crater_atomfeed
# only archives listed in the verified inventory, and only known volumes (checked before anything was stopped)
for v in $RESTORE_VOLS; do
  docker run --rm -v bahmni-lite_$v:/v -v "$D":/b:ro alpine:3 sh -c "find /v -mindepth 1 -delete && tar -xzf /b/$v.tgz -C /v"
done
trap - ERR
vipers up >/dev/null
# the web proxies (Bahmni's and Crater's nginx) were not stopped and still hold the internal addresses they resolved when
# they started; the services restarted above may have new ones (found by the 29 Oct restore drill: /openmrs reached
# another container). Restart them so they resolve again.
vipers dc restart proxy crater-nginx >/dev/null
# report back only when the system is usable: OpenMRS answers through the web proxy, and the first (slow) searches after a
# restart have been made once, so the next user does not meet a cold server
echo "restored '$NAME'; waiting for OpenMRS (usually 3-6 minutes)..."
for i in $(seq 1 90); do curl -sk -m 10 https://127.0.0.1:8443/openmrs/ws/rest/v1/session | grep -q '"authenticated"' && break; sleep 10; done
W=(-sk -m 120 -o /dev/null -u "superman:$OPENMRS_OWNER_PASSWORD")
curl "${W[@]}" "https://127.0.0.1:8443/openmrs/ws/rest/v1/bahmni/terminologies/concepts?limit=20&locale=en&term=malaria" || true
curl "${W[@]}" "https://127.0.0.1:8443/openmrs/ws/rest/v1/patient?q=test&v=default" || true
if curl -sk -m 10 https://127.0.0.1:8443/openmrs/ws/rest/v1/session | grep -q '"authenticated"'; then echo "ready: OpenMRS answering"
else echo "WARNING: OpenMRS not answering yet - check with: vipers health"; fi
