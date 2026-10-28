#!/bin/bash
# Restore the demo to a saved state (default: the clean "baseline" taken after seeding).
#   reset-demo.sh [backup-name]
# Stops the application containers, restores OpenMRS + Crater databases and document volumes, restarts.
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || { [ "$(uname -s)" = Linux ] || exit 1; }
set -euo pipefail
source /opt/vipers/secrets/vipers.env
NAME="${1:-baseline}"; D=/opt/vipers/backups/$NAME
[ -f "$D/openmrs.sql.gz" ] || { echo "no backup at $D"; exit 1; }
cd /opt/vipers/bahmni-docker/bahmni-lite
echo "stopping application services (databases stay up)"
vipers dc stop openmrs crater-php crater-atomfeed reports template-service caddy >/dev/null
gunzip -c "$D/openmrs.sql.gz" | docker exec -i -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" bahmni-lite-openmrsdb-1 mysql -uroot openmrs
gunzip -c "$D/crater.sql.gz" | docker exec -i -e MYSQL_PWD="$CRATER_DB_PASSWORD" bahmni-lite-craterdb-1 mysql -ucrater crater
[ -s "$D/crater_atomfeed.sql.gz" ] && gunzip -c "$D/crater_atomfeed.sql.gz" | docker exec -i -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" bahmni-lite-crater-atomfeed-db-1 mysql -uroot crater_atomfeed
for v in bahmni-document-images bahmni-patient-images bahmni-lab-results bahmni-uploaded-files crater-app-data; do
  [ -f "$D/$v.tgz" ] && docker run --rm -v bahmni-lite_$v:/v -v "$D":/b:ro alpine:3 sh -c "rm -rf /v/* && tar -xzf /b/$v.tgz -C /v"
done
vipers up >/dev/null
echo "restored '$NAME'. OpenMRS takes ~2-5 minutes to become available again."
