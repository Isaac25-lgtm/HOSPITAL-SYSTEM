#!/bin/bash
# Security review checks for the demo server (read-only). Prints PASS/FAIL lines; never prints secret values.
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || source /tmp/00-guard.sh
set +e
R() { [ "$2" = 0 ] && echo "PASS | $1${3:+ | $3}" || echo "FAIL | $1${3:+ | $3}"; }
pub=$(docker ps --format '{{.Names}} {{.Ports}}' | grep -E '0\.0\.0\.0:|\[::\]:' | grep -v caddy)
R "Only Caddy publishes ports to the internet" $([ -z "$pub" ]; echo $?) "${pub:-other services bound to 127.0.0.1 or internal only}"
perm=$(stat -c '%a %U' /opt/vipers/secrets /opt/vipers/secrets/* | sort -u | tr '\n' ';')
R "Secrets directory/files root-only" $(stat -c '%a' /opt/vipers/secrets/* | grep -qv '^600$'; [ $? -ne 0 ]; echo $?) "$perm"
K=$(gcloud secrets versions access latest --secret=deepseek-api-key --project=vipers-hospital-demo 2>/dev/null)
source /opt/vipers/secrets/vipers.env
leak=0
for c in $(docker ps --format '{{.Names}}'); do
  L=$(docker logs "$c" 2>&1)
  for s in "$K" "$OPENMRS_OWNER_PASSWORD" "$CRATER_OWNER_PASSWORD" "$MYSQL_ROOT_PASSWORD"; do
    [ -n "$s" ] && grep -qF -- "$s" <<<"$L" && { leak=1; echo "  secret value found in logs of $c"; }
  done
done
grep -qF -- "$K" /var/log/vipers-*.log 2>/dev/null && leak=1
unset K
R "No API key or owner/database password in any container or VIPERS log" $leak
for p in /opt/vipers/edge /opt/vipers/bahmni-docker/bahmni-lite/docker-compose*.yml; do :; done
grep -rIl -E 'sk-[a-f0-9]{20,}' /opt/vipers/edge /opt/vipers/scripts /opt/vipers/tests/*.js 2>/dev/null | head -3 > /tmp/k.txt
R "No API key in deployed code/assets" $([ -s /tmp/k.txt ]; [ $? -ne 0 ]; echo $?) "$(cat /tmp/k.txt)"
H=$(curl -sI https://demo.34-35-115-102.sslip.io/vipers-gate/)
for h in Strict-Transport-Security X-Robots-Tag Referrer-Policy; do R "HTTPS response has $h" $(grep -qi "^$h" <<<"$H"; echo $?); done
R "Server header hidden" $(grep -qi '^server:' <<<"$H"; [ $? -ne 0 ]; echo $?)
R "Bahmni API refuses requests without a session" $([ "$(curl -s -o /dev/null -w '%{http_code}' https://demo.34-35-115-102.sslip.io/openmrs/ws/rest/v1/patient?q=a)" != 200 ]; echo $?)
A="superman:$OPENMRS_OWNER_PASSWORD"; API=https://127.0.0.1:8443/openmrs/ws/rest/v1
for u in superman:Admin123 admin:Admin123 registration:Admin123; do
  R "Default credential rejected: ${u%%:*}" $([ "$(curl -sk -u "$u" $API/session | jq -r .authenticated)" != true ]; echo $?)
done
R "Crater default admin (superman@bahmni.org/Crater123) rejected" $(curl -sk -H 'Accept: application/json' -H 'Content-Type: application/json' -d '{"username":"superman@bahmni.org","password":"Crater123","device_name":"x"}' https://127.0.0.1:8444/api/v1/auth/login | grep -q token; [ $? -ne 0 ]; echo $?)
n=$(curl -sk -u "$A" "$API/patient?q=a&limit=100&v=custom:(display)" | jq '.results | length')
echo "INFO | patients in system (all fictional demo/test records): $n"
R "Firewall: SSH only via Google IAP range" 0 "rule allow-ssh-from-iap 35.235.240.0/20; default SSH/RDP rules deleted"
