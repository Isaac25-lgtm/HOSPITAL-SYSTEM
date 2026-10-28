#!/bin/bash
# Final acceptance: phone suite + all desktop suites + security checks. Runs detached; writes DONE marker.
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || source /tmp/00-guard.sh
set +e
S=/opt/vipers/scripts; OUT=/opt/vipers/tests/out/results
mkdir -p $OUT; rm -f $OUT/DONE
bash $S/run-all.sh > /tmp/run-all.log 2>&1
bash $S/run-test.sh wf-mobile.js MOBILE=1 2>&1 | tee -a $OUT/run.log | grep '^RESULTS ' | tail -1 | sed 's/^RESULTS //' > $OUT/mobile.json
bash $S/security-check.sh 2>&1 | tee $OUT/security.txt | grep -E '^(PASS|FAIL)' \
  | jq -R -s -c 'split("\n") | map(select(length>0) | split(" | ") | {step: .[1], pass: (.[0]=="PASS"), note: (.[2] // "")})' > $OUT/security.json
date '+%F %T %Z' > $OUT/DONE
