#!/bin/bash
# Source-only verifier; no service changes happen before this succeeds.
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
  (cd "$d" && sha256sum -c --quiet MANIFEST)
}
