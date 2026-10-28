#!/bin/bash
# Restore the demo to a saved state (default: the clean "baseline" taken after seeding).
#   reset-demo.sh [backup-name]
# Checks the whole backup first (all parts present, checksums, archives readable) and only then stops the
# application containers, restores OpenMRS + Crater databases and document volumes, and restarts.
# The guard timer is held off (shared lock) for the whole restore.
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || { [ "$(uname -s)" = Linux ] || exit 1; }
set -euo pipefail
[ -f /opt/vipers/tenant/is-tenant ] && { echo "refusing: this is a hospital's trial server"; exit 1; }
# a server switched to production mode (scripts/production-mode.sh) never runs demo tooling
[ "$(cat "${VIPERS_PROFILE_FILE:-/opt/vipers/profile}" 2>/dev/null)" = production ] && { echo "refusing: production server (no demo accounts, demo reset or demo expiry)"; exit 1; }
exec 9>/run/vipers-ops.lock; flock -w 600 9 || { echo "another maintenance job is running"; exit 1; }
source /opt/vipers/secrets/vipers.env
NAME="${1:-baseline}"
[[ "$NAME" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'invalid backup name'; exit 1; }
D=/opt/vipers/backups/$NAME
[[ ! -L "$D.current" ]] || D=$(readlink -f "$D.current")
source "$(dirname "$0")/backup-verify.sh"
verify_backup "$D" || { echo 'ABORT: incomplete or invalid backup'; exit 1; }

cd /opt/vipers/bahmni-docker/bahmni-lite
trap 'echo "RESTORE FAILED - services left stopped; rerun reset-demo.sh or start them with: vipers up"' ERR
echo "backup verified; stopping application services (databases stay up)"
vipers dc stop openmrs crater-php crater-atomfeed reports template-service caddy >/dev/null
gunzip -c "$D/openmrs.sql.gz" | docker exec -i -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" bahmni-lite-openmrsdb-1 mysql -uroot openmrs
gunzip -c "$D/crater.sql.gz" | docker exec -i -e MYSQL_PWD="$CRATER_DB_PASSWORD" bahmni-lite-craterdb-1 mysql -ucrater crater
gunzip -c "$D/crater_atomfeed.sql.gz" | docker exec -i -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" bahmni-lite-crater-atomfeed-db-1 mysql -uroot crater_atomfeed
for f in "$D"/*.tgz; do
  [ -e "$f" ] || continue; v=$(basename "$f" .tgz)
  docker run --rm -v bahmni-lite_$v:/v -v "$D":/b:ro alpine:3 sh -c "rm -rf /v/* && tar -xzf /b/$v.tgz -C /v"
done
trap - ERR
vipers up >/dev/null
echo "restored '$NAME'. OpenMRS takes ~2-5 minutes to become available again."
