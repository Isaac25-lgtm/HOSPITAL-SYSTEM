#!/bin/bash
# Backup the demo databases + uploaded documents.  backup.sh [name]   (default name: timestamp)
# Files land in /opt/vipers/backups/<name>/. "baseline" is the clean demo starting state used by reset-demo.sh.
# A backup is written to <name>.partial, every part is verified, a MANIFEST with checksums is written, and only
# then is it moved into place: a failed run never leaves something that looks complete. Timestamped backups
# older than 14 days are pruned (named ones such as baseline/final/nightly-* are kept or rotate by name).
# NOTE: backups live on the server's own disk; copy them off the server for disaster recovery.
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || { [ "$(uname -s)" = Linux ] || exit 1; }
set -euo pipefail
exec 9>/run/vipers-ops.lock; flock -w 600 9 || { echo "another maintenance job is running"; exit 1; }
source /opt/vipers/secrets/vipers.env
NAME="${1:-$(date +%Y%m%d-%H%M)}"
B=/opt/vipers/backups; D=$B/$NAME; W=$D.partial
mkdir -p $B; chmod 700 $B
# need at least twice the size of the newest backup (or 2 GB) free
LAST=$(du -sm $(ls -dt $B/*/ 2>/dev/null | grep -v partial | head -1) 2>/dev/null | cut -f1); LAST=${LAST:-1000}
FREE=$(df -Pm $B | awk 'NR==2{print $4}')
[ "$FREE" -gt $(( LAST * 2 > 2000 ? LAST * 2 : 2000 )) ] || { echo "ABORT: only ${FREE} MB free"; exit 1; }
rm -rf "$W"; mkdir -p "$W"
dump() { docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" "$1" mysqldump -uroot --single-transaction --routines --triggers "$2" | gzip > "$W/$2.sql.gz"; }
dump bahmni-lite-openmrsdb-1 openmrs
docker exec -e MYSQL_PWD="$CRATER_DB_PASSWORD" bahmni-lite-craterdb-1 mysqldump -ucrater --single-transaction --no-tablespaces crater | gzip > "$W/crater.sql.gz"
docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" bahmni-lite-crater-atomfeed-db-1 mysqldump -uroot --single-transaction crater_atomfeed | gzip > "$W/crater_atomfeed.sql.gz"
VOLS="bahmni-document-images bahmni-patient-images bahmni-lab-results bahmni-uploaded-files crater-app-data"
for v in bahmni-clinical-forms bahmni-forms; do docker volume inspect bahmni-lite_$v >/dev/null 2>&1 && VOLS="$VOLS $v"; done
for v in $VOLS; do docker run --rm -v bahmni-lite_$v:/v:ro -v "$W":/b alpine:3 tar -czf /b/$v.tgz -C /v .; done
# verify every part, then publish
for f in "$W"/*.sql.gz; do gzip -t "$f"; [ "$(gunzip -c "$f" | head -c 100 | wc -c)" -gt 0 ]; done
for f in "$W"/*.tgz; do tar -tzf "$f" >/dev/null; done
(cd "$W" && sha256sum *.gz *.tgz > MANIFEST)
rm -rf "$D"; mv "$W" "$D"
find $B -maxdepth 1 -type d -regextype posix-extended -regex '.*/[0-9]{8}-[0-9]{4}' -mtime +14 -exec rm -rf {} +
ls -la "$D"
echo "backup '$NAME' complete"
