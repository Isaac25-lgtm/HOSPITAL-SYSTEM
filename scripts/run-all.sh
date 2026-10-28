#!/bin/bash
# Final acceptance run: every suite in order against the public HTTPS URL, results saved as JSON.
#   run-all.sh            -> /opt/vipers/tests/out/results/*.json + summary.txt
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || source /tmp/00-guard.sh
set +e
OUT=/opt/vipers/tests/out/results; mkdir -p $OUT; rm -f $OUT/*.json
RT="bash $(dirname "$0")/run-test.sh"; [ -f "$(dirname "$0")/run-test.sh" ] || RT="bash /tmp/run-test.sh"
save() { grep '^RESULTS ' | tail -1 | sed 's/^RESULTS //' > "$OUT/$1.json"; }
log() { tee -a $OUT/run.log; }
: > $OUT/run.log

echo "### reception" | log
$RT wf-reception.js 2>&1 | log | tee /tmp/rec.out | save reception
P=$(grep -o 'PATIENT_UUID=[0-9a-f-]*' /tmp/rec.out | cut -d= -f2)
LAST=$(grep -o 'Register new patient | [0-9]* ms; [A-Za-z]* [A-Za-z]*' /tmp/rec.out | awk '{print $NF}')
echo "test patient: $LAST $P" | log
echo "### doctor" | log;     $RT wf-doctor.js PATIENT=$P 2>&1 | log | save doctor
echo "### lab" | log;        $RT wf-lab.js PATIENT=$P 2>&1 | log | save lab
echo "### appt+docs" | log;  $RT wf-appt-docs.js PATIENT=$P LAST=$LAST 2>&1 | log | save appointments-documents
echo "### billing" | log;    $RT wf-billing.js LAST=$LAST 2>&1 | log | save billing
echo "### admin" | log;      $RT wf-admin.js 2>&1 | log | save admin
echo "### tour" | log;       $RT wf-tour.js 2>&1 | log | save walkthrough-session
echo "### ai" | log;         $RT wf-ai.js 2>&1 | log | save help-ai
echo "### ux" | log;         $RT wf-ux.js PATIENT=$P 2>&1 | log | save ux
echo "### perf" | log;       $RT wf-perf.js PATIENT=$P USERS=6 2>&1 | log | save performance
echo "### inpatient" | log;  $RT wf-inpatient.js PATIENT=$P 2>&1 | log | save inpatient
echo "$LAST $P" > $OUT/test-patient.txt
echo "### SUMMARY" | log
BAD=0
for f in $OUT/*.json; do
  n=$(basename $f .json); t=$(jq length $f 2>/dev/null || echo 0); p=$(jq '[.[] | select(.pass)] | length' $f 2>/dev/null || echo 0)
  echo "$n: $p/$t passed" | log
  # an empty or unreadable result file means the suite crashed: that is a failure, not a pass
  [ "$t" -gt 0 ] && [ "$p" = "$t" ] || BAD=1
done
[ "$BAD" = 0 ] && echo "RESULT: ALL PASSED" | log || { echo "RESULT: FAILURES (see above)" | log; exit 1; }
