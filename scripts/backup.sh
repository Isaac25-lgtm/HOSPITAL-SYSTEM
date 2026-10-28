#!/bin/bash
# Backup the demo databases + uploaded documents.  backup.sh [name]   (default name: timestamp)
# Immutable generations live in .versions/; <name>.current is an atomic pointer.
# Existing backups remain intact. Restore requires a complete checksummed inventory.
# NOTE: backups live on the server's own disk; copy them off the server for disaster recovery.
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || { [ "$(uname -s)" = Linux ] || exit 1; }
set -euo pipefail
exec 9>/run/vipers-ops.lock; flock -w 600 9 || { echo "another maintenance job is running"; exit 1; }
source /opt/vipers/secrets/vipers.env
NAME="${1:-$(date +%Y%m%d-%H%M)}"
[[ "$NAME" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'invalid backup name'; exit 1; }
B=/opt/vipers/backups; D=$B/$NAME.current
mkdir -p "$B/.versions"
W=$(mktemp -d "$B/.versions/$NAME-XXXXXXXX")
trap 'echo "backup incomplete: $W" >&2' ERR
source "$(dirname "$0")/backup-verify.sh"
mkdir -p $B; chmod 700 $B
# need at least twice the size of the newest backup (or 2 GB) free
LAST=1000
for current in "$B"/*.current; do
  if [[ -L "$current" && -d "$current" ]]; then
    size=$(du -smL "$current" | cut -f1)
    [[ "$size" -le "$LAST" ]] || LAST=$size
  fi
done
FREE=$(df -Pm $B | awk 'NR==2{print $4}')
[ "$FREE" -gt $(( LAST * 2 > 2000 ? LAST * 2 : 2000 )) ] || { echo "ABORT: only ${FREE} MB free"; exit 1; }
chmod 700 "$W"
dump() { docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" "$1" mysqldump -uroot --single-transaction --routines --triggers "$2" | gzip > "$W/$2.sql.gz"; }
dump bahmni-lite-openmrsdb-1 openmrs
docker exec -e MYSQL_PWD="$CRATER_DB_PASSWORD" bahmni-lite-craterdb-1 mysqldump -ucrater --single-transaction --no-tablespaces crater | gzip > "$W/crater.sql.gz"
docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" bahmni-lite-crater-atomfeed-db-1 mysqldump -uroot --single-transaction crater_atomfeed | gzip > "$W/crater_atomfeed.sql.gz"
VOLS="bahmni-document-images bahmni-patient-images bahmni-lab-results bahmni-uploaded-files crater-app-data bahmni-clinical-forms"
for v in bahmni-forms; do docker volume inspect bahmni-lite_$v >/dev/null 2>&1 && VOLS="$VOLS $v"; done
for v in $VOLS; do docker run --rm -v bahmni-lite_$v:/v:ro -v "$W":/b alpine:3 tar -czf /b/$v.tgz -C /v .; done
# verify every part, then publish
for f in "$W"/*.sql.gz; do gzip -t "$f"; [ "$(gunzip -c "$f" | head -c 100 | wc -c)" -gt 0 ]; done
for f in "$W"/*.tgz; do tar -tzf "$f" >/dev/null; done
(cd "$W" && printf '%s\n' *.sql.gz *.tgz CONTENTS > CONTENTS && sha256sum -- *.sql.gz *.tgz CONTENTS > MANIFEST)
verify_backup "$W"
sync -f "$W"
# Immutable generation, atomically replace only the pointer. Legacy directories remain intact.
LINK="$B/.$NAME-link-$$"
ln -s ".versions/$(basename "$W")" "$LINK"
mv -Tf "$LINK" "$D"
sync -f "$B"
find $B -maxdepth 1 -type d -regextype posix-extended -regex '.*/[0-9]{8}-[0-9]{4}' -mtime +14 -exec rm -rf {} +
# Prune old immutable generations only when no current pointer references them.
while IFS= read -r -d '' old; do
  used=0
  for current in "$B"/*.current; do [[ ! -L "$current" || "$(readlink -f "$current")" != "$old" ]] || used=1; done
  [[ "$used" = 1 ]] || rm -rf -- "$old"
done < <(find "$B/.versions" -mindepth 1 -maxdepth 1 -type d -mtime +14 -print0)
ls -la "$W"
echo "backup '$NAME' complete"
