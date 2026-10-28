#!/bin/bash
# Run a Playwright test script on the VM: run-test.sh <script.js> [extra env assignments...]
# Tests live in /opt/vipers/tests (uploaded as tests.tgz); screenshots land in /opt/vipers/tests/out.
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || source /tmp/00-guard.sh
set +e
PW_IMAGE=mcr.microsoft.com/playwright:v1.48.2-noble
mkdir -p /opt/vipers/tests && tar -xzf /tmp/tests.tgz -C /opt/vipers/tests 2>/dev/null
find /opt/vipers/tests -maxdepth 1 -name '*.js' -exec sed -i 's/\r$//' {} +
cd /opt/vipers/tests
[ -d node_modules/playwright ] || docker run --rm -v /opt/vipers/tests:/t -w /t $PW_IMAGE npm i --silent --no-audit --no-fund playwright@1.48.2 >/dev/null 2>&1
source /opt/vipers/secrets/addons.env
source /opt/vipers/secrets/vipers.env
HOSTS=$(grep ^DEMO_HOSTS /opt/vipers/edge/edge.env | cut -d= -f2 | tr -d ' ')
BASE="https://${HOSTS%%,*}"
docker run --rm --ipc=host -v /opt/vipers/tests:/t -w /t \
  -e BASE="$BASE" -e GATE_CODE="$GATE_CODE" -e OWNER_PW="$OPENMRS_OWNER_PASSWORD" -e CRATER_OWNER_PW="$CRATER_OWNER_PASSWORD" \
  $(for kv in "${@:2}"; do echo "-e $kv"; done) \
  $PW_IMAGE node "$1"
