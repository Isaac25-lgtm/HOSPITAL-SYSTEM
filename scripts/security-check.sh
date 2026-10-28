#!/bin/bash
# Security review checks for the demo server (read-only). Prints PASS/FAIL lines; never prints secret values.
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || source /tmp/00-guard.sh
set +e
FAILED=0
R() { if [ "$2" = 0 ]; then echo "PASS | $1${3:+ | $3}"; else echo "FAIL | $1${3:+ | $3}"; FAILED=1; fi; }
source "$(dirname "$0")/auth-check.sh"
HOST=$(grep '^DEMO_HOSTS=' /opt/vipers/edge/edge.env | cut -d= -f2- | cut -d, -f1 | tr -d ' ')
BASE="https://$HOST"

containers=$(docker ps --format '{{.Names}}'); R "Docker inventory available" $?
pub=$(docker ps --format '{{.Names}} {{.Ports}}' | grep -E '0\.0\.0\.0:|\[::\]:' | grep -v caddy)
R "Only Caddy publishes ports to the internet" $([ -z "$pub" ]; echo $?) "${pub:-other services bound to 127.0.0.1 or internal only}"
perm=$(stat -c '%a %U' /opt/vipers/secrets /opt/vipers/secrets/* | sort -u | tr '\n' ';')
[[ "$(stat -c '%a %U' /opt/vipers/secrets)" = "700 root" ]]; R "Secrets directory private and root-owned" $?
R "Secrets directory/files root-only" $(stat -c '%a' /opt/vipers/secrets/* | grep -qv '^600$'; [ $? -ne 0 ]; echo $?) "$perm"
K=$(gcloud secrets versions access latest --secret=deepseek-api-key --project=vipers-hospital-demo 2>/dev/null)
if grep -q '^AI_ENABLED=true$' /opt/vipers/edge/edge.env; then [ -n "$K" ]; R "AI secret available for log audit" $?; fi
source /opt/vipers/secrets/vipers.env
leak=0
for c in $(docker ps --format '{{.Names}}'); do
  L=$(docker logs "$c" 2>&1); [ "$?" = 0 ] || leak=1
  for s in "$K" "$OPENMRS_OWNER_PASSWORD" "$CRATER_OWNER_PASSWORD" "$MYSQL_ROOT_PASSWORD"; do
    [ -n "$s" ] && grep -qF -- "$s" <<<"$L" && { leak=1; echo "  secret value found in logs of $c"; }
  done
done
[ -z "$K" ] || { grep -qF -- "$K" /var/log/vipers-*.log 2>/dev/null && leak=1; }
unset K
R "No API key or owner/database password in any container or VIPERS log" $leak
for p in /opt/vipers/edge /opt/vipers/bahmni-docker/bahmni-lite/docker-compose*.yml; do :; done
grep -rIl -E 'sk-[a-f0-9]{20,}' /opt/vipers/edge /opt/vipers/scripts /opt/vipers/tests/*.js 2>/dev/null | head -3 > /tmp/k.txt
R "No API key in deployed code/assets" $([ -s /tmp/k.txt ]; [ $? -ne 0 ]; echo $?) "$(cat /tmp/k.txt)"
H=$(curl -fsSI --max-time 30 "$BASE/vipers-gate/"); R "HTTPS reachable" $?
for h in Strict-Transport-Security X-Robots-Tag Referrer-Policy; do R "HTTPS response has $h" $(grep -qi "^$h" <<<"$H"; echo $?); done
R "Server header hidden" $(grep -qi '^server:' <<<"$H"; [ $? -ne 0 ]; echo $?)
status=$(curl -s --max-time 30 -o /dev/null -w '%{http_code}' "$BASE/openmrs/ws/rest/v1/patient?q=a")
[[ "$status" = 401 || "$status" = 403 ]]; R "Bahmni API refuses requests without a session" $? "HTTP $status"
A="superman:$OPENMRS_OWNER_PASSWORD"; API=https://127.0.0.1:8443/openmrs/ws/rest/v1
omrs_auth superman "$OPENMRS_OWNER_PASSWORD" "$API"; R "Owner positive authentication control" $?
for u in superman admin registration; do
  omrs_auth "$u" Admin123 "$API"; rc=$?
  [[ "$rc" = 1 ]]; R "Default credential rejected: $u" $?
done
response=$(mktemp)
status=$(curl -sk --max-time 30 -o "$response" -w '%{http_code}' -H 'Accept: application/json' -H 'Content-Type: application/json' -d '{"username":"superman@bahmni.org","password":"Crater123","device_name":"x"}' https://127.0.0.1:8444/api/v1/auth/login)
[[ "$status" = 401 || "$status" = 422 ]] && jq -e 'has("token") | not' "$response" >/dev/null
R "Crater default credential explicitly rejected" $? "HTTP $status"
rm -f "$response"

n=$(curl -sk -u "$A" "$API/patient?q=a&limit=100&v=custom:(display)" | jq '.results | length')
echo "INFO | patients in system (all fictional demo/test records): $n"
# Query actual project rules. Unknown/permission denied is FAIL, never an assumed PASS.
PROJECT=$(curl -fsS --max-time 5 -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/project/project-id)
rules=$(gcloud compute firewall-rules list --project="$PROJECT" --format=json 2>/dev/null); rc=$?
if [ "$rc" = 0 ]; then
  echo "$rules" | jq -e '
    [.[] | select(.direction == "INGRESS" and (.disabled != true)) | . as $r |
      .allowed[]? | select(.IPProtocol == "all" or .IPProtocol == "tcp" or .IPProtocol == "6") |
      select((.ports == null) or any(.ports[]; . == "22" or (split("-") | length == 2 and (.[0]|tonumber) <= 22 and (.[1]|tonumber) >= 22))) | $r] |
    length > 0 and all(.[]; .sourceRanges == ["35.235.240.0/20"] and ((.sourceTags // []) | length == 0) and ((.sourceServiceAccounts // []) | length == 0))' >/dev/null
  rc=$?
fi
R "Project SSH allow rules restricted to IAP (effective policy still needs live verification)" "$rc"
exit "$FAILED"
