#!/bin/bash
# Source-only verifier; no service changes happen before this succeeds.
# volumes a backup may contain (bahmni-forms only where that volume exists); restore accepts nothing else
VIPERS_VOLUMES="bahmni-document-images bahmni-patient-images bahmni-lab-results bahmni-uploaded-files crater-app-data bahmni-clinical-forms bahmni-forms"
verify_backup() {
  local d=$1 f
  local required=(openmrs.sql.gz crater.sql.gz crater_atomfeed.sql.gz bahmni-document-images.tgz bahmni-patient-images.tgz bahmni-lab-results.tgz bahmni-uploaded-files.tgz crater-app-data.tgz bahmni-clinical-forms.tgz)
  [[ -s "$d/MANIFEST" && -s "$d/CONTENTS" ]] || { echo 'backup manifest/contents missing' >&2; return 1; }
  for f in "${required[@]}" CONTENTS; do
    [[ -s "$d/$f" ]] && grep -qxF -- "$f" "$d/CONTENTS" && grep -qE "^[a-f0-9]{64}  $f$" "$d/MANIFEST" || return 1
  done
  while IFS= read -r f; do
    [[ "$f" =~ ^[a-zA-Z0-9_-]+\.(sql\.gz|tgz)$ || "$f" = CONTENTS ]] || return 1
    [[ -s "$d/$f" ]] || return 1
    awk -v name="$f" '$2==name {n++} END {exit(n==1 ? 0 : 1)}' "$d/MANIFEST" || return 1
    case "$f" in *.sql.gz) gzip -t "$d/$f" || return 1;; *.tgz) tar -tzf "$d/$f" >/dev/null || return 1;; esac
  done < "$d/CONTENTS"
  # Refuse manifest paths outside the backup, even before sha256sum opens them.
  while IFS= read -r f; do
    [[ "$f" =~ ^[a-f0-9]{64}\ \ ([a-zA-Z0-9_-]+\.(sql\.gz|tgz)|CONTENTS)$ ]] || return 1
  done < "$d/MANIFEST"
  # nothing else in the folder: an unlisted archive is never checked, so it must never be restorable either
  for f in "$d"/* "$d"/.[!.]*; do
    [[ -e "$f" || -L "$f" ]] || continue
    [[ -f "$f" && ! -L "$f" ]] || { echo "backup contains a non-file entry: $(basename "$f")" >&2; return 1; }
    [[ "$(basename "$f")" = MANIFEST ]] || grep -qxF -- "$(basename "$f")" "$d/CONTENTS" || { echo "backup contains an unlisted file: $(basename "$f")" >&2; return 1; }
  done
  # every listed archive is a known volume
  while IFS= read -r f; do
    [[ "$f" != *.tgz ]] || [[ " $VIPERS_VOLUMES " = *" ${f%.tgz} "* ]] || { echo "backup lists an unknown volume: $f" >&2; return 1; }
  done < "$d/CONTENTS"
  (cd "$d" && sha256sum -c --quiet MANIFEST)
}
