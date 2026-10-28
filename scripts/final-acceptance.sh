#!/bin/bash
# Final acceptance: phone suite + all desktop suites + security checks. Runs detached; writes DONE marker.
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || source /tmp/00-guard.sh
set -uo pipefail
BAD=0
S=/opt/vipers/scripts; OUT=/opt/vipers/tests/out/results
mkdir -p $OUT; rm -f $OUT/DONE $OUT/FAILED
bash $S/run-all.sh > /tmp/run-all.log 2>&1 || BAD=1
bash $S/run-test.sh wf-mobile.js MOBILE=1 2>&1 | tee -a $OUT/run.log | grep '^RESULTS ' | tail -1 | sed 's/^RESULTS //' > $OUT/mobile.json || BAD=1
bash $S/security-check.sh 2>&1 | tee $OUT/security.txt | grep -E '^(PASS|FAIL)' \
  | jq -R -s -c 'split("\n") | map(select(length>0) | split(" | ") | {step: .[1], pass: (.[0]=="PASS"), note: (.[2] // "")})' > $OUT/security.json || BAD=1
for f in "$OUT"/*.json; do
  jq -e 'type == "array" and length > 0 and all(.[]; .pass == true)' "$f" >/dev/null || BAD=1
done
if [ "$BAD" != 0 ]; then date '+%F %T %Z' > "$OUT/FAILED"; exit 1; fi
date '+%F %T %Z' > "$OUT/DONE"
