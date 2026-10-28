#!/bin/bash
# Backup the demo databases + uploaded documents.  backup.sh [name]   (default name: timestamp)
# Files land in /opt/vipers/backups/<name>/. "baseline" is the clean demo starting state used by reset-demo.sh.
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || { [ "$(uname -s)" = Linux ] || exit 1; }
set -euo pipefail
source /opt/vipers/secrets/vipers.env
NAME="${1:-$(date +%Y%m%d-%H%M)}"
D=/opt/vipers/backups/$NAME; mkdir -p "$D"; chmod 700 /opt/vipers/backups
dump() { docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" "$1" mysqldump -uroot --single-transaction --routines --triggers "$2" | gzip > "$D/$2.sql.gz"; }
dump bahmni-lite-openmrsdb-1 openmrs
docker exec -e MYSQL_PWD="$CRATER_DB_PASSWORD" bahmni-lite-craterdb-1 mysqldump -ucrater --single-transaction --no-tablespaces crater | gzip > "$D/crater.sql.gz"
docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" bahmni-lite-crater-atomfeed-db-1 mysqldump -uroot --single-transaction crater_atomfeed 2>/dev/null | gzip > "$D/crater_atomfeed.sql.gz" || true
for v in bahmni-document-images bahmni-patient-images bahmni-lab-results bahmni-uploaded-files crater-app-data; do
  docker run --rm -v bahmni-lite_$v:/v:ro -v "$D":/b alpine:3 tar -czf /b/$v.tgz -C /v . 2>/dev/null || true
done
ls -la "$D"
echo "backup '$NAME' complete"
