#!/bin/bash
# Restore the demo to a saved state (default: the clean "baseline" taken after seeding).
#   reset-demo.sh [backup-name]
# Checks the whole backup first (all parts present, checksums, archives readable) and only then stops the
# application containers, restores OpenMRS + Crater databases and document volumes, and restarts.
# The guard timer is held off (shared lock) for the whole restore.
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || { [ "$(uname -s)" = Linux ] || exit 1; }
set -euo pipefail
[ -f /opt/vipers/tenant/is-tenant ] && { echo "refusing: this is a hospital's trial server"; exit 1; }
exec 9>/run/vipers-ops.lock; flock -w 600 9 || { echo "another maintenance job is running"; exit 1; }
source /opt/vipers/secrets/vipers.env
NAME="${1:-baseline}"; D=/opt/vipers/backups/$NAME
for f in openmrs.sql.gz crater.sql.gz; do [ -s "$D/$f" ] || { echo "ABORT: $D/$f missing"; exit 1; }; done
if [ -f "$D/MANIFEST" ]; then (cd "$D" && sha256sum -c --quiet MANIFEST) || { echo "ABORT: checksum mismatch"; exit 1; }; fi
for f in "$D"/*.sql.gz; do gzip -t "$f" || { echo "ABORT: $f damaged"; exit 1; }; done
for f in "$D"/*.tgz; do [ -e "$f" ] && { tar -tzf "$f" >/dev/null || { echo "ABORT: $f damaged"; exit 1; }; }; done
cd /opt/vipers/bahmni-docker/bahmni-lite
trap 'echo "RESTORE FAILED - services left stopped; rerun reset-demo.sh or start them with: vipers up"' ERR
echo "backup verified; stopping application services (databases stay up)"
vipers dc stop openmrs crater-php crater-atomfeed reports template-service caddy >/dev/null
gunzip -c "$D/openmrs.sql.gz" | docker exec -i -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" bahmni-lite-openmrsdb-1 mysql -uroot openmrs
gunzip -c "$D/crater.sql.gz" | docker exec -i -e MYSQL_PWD="$CRATER_DB_PASSWORD" bahmni-lite-craterdb-1 mysql -ucrater crater
[ -s "$D/crater_atomfeed.sql.gz" ] && gunzip -c "$D/crater_atomfeed.sql.gz" | docker exec -i -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" bahmni-lite-crater-atomfeed-db-1 mysql -uroot crater_atomfeed
for f in "$D"/*.tgz; do
  [ -e "$f" ] || continue; v=$(basename "$f" .tgz)
  docker run --rm -v bahmni-lite_$v:/v -v "$D":/b:ro alpine:3 sh -c "rm -rf /v/* && tar -xzf /b/$v.tgz -C /v"
done
trap - ERR
vipers up >/dev/null
echo "restored '$NAME'. OpenMRS takes ~2-5 minutes to become available again."
