#!/bin/bash
# Replace publicly known OpenMRS default passwords. Idempotent.
#  - superman + admin (atomfeed sync user)  -> private owner password (secrets/vipers.env)
#  - stock demo users from the release DB   -> random passwords (not retired, so nothing that relies on them breaks)
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || source /tmp/00-guard.sh
set +e
source /opt/vipers/secrets/vipers.env
API=https://127.0.0.1:8443/openmrs/ws/rest/v1
NEW="$OPENMRS_OWNER_PASSWORD"
auth_ok() { [ "$(curl -sk -u "$1:$2" "$API/session" | jq -r .authenticated)" = "true" ]; }
code() { curl -sk -o /dev/null -w '%{http_code}' "$@"; }

if ! auth_ok superman "$NEW"; then
  auth_ok superman Admin123 && echo "superman: changing default -> HTTP $(code -u superman:Admin123 -H 'Content-Type: application/json' -d "{\"oldPassword\":\"Admin123\",\"newPassword\":\"$NEW\"}" "$API/password")"
fi
auth_ok superman "$NEW" || { echo "ABORT: cannot authenticate as superman"; exit 1; }

USERS=$(curl -sk -u "superman:$NEW" "$API/user?v=custom:(uuid,username,systemId)&limit=100")
uuid_of() { echo "$USERS" | jq -r --arg s "$1" '.results[] | select(.systemId==$s or .username==$s) | .uuid' | head -1; }
setpw() { echo "$1: HTTP $(code -u "superman:$NEW" -H 'Content-Type: application/json' -d "{\"newPassword\":\"$2\"}" "$API/password/$(uuid_of "$1")")"; }

auth_ok admin "$NEW" && echo "admin: already hardened" || setpw admin "$NEW"

STOCK=/opt/vipers/secrets/stock-users.env
touch "$STOCK"; chmod 600 "$STOCK"
for S in registration doctor "Lab Manager" "Lab System" "Reports User"; do
  [ -z "$(uuid_of "$S")" ] && continue
  KEY=$(echo "$S" | tr ' a-z' '_A-Z')
  grep -q "^$KEY=" "$STOCK" && { echo "$S: already randomised"; continue; }
  PW="Stk$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | head -c 18)7"
  setpw "$S" "$PW" && echo "$KEY=$PW" >> "$STOCK"
done

# The reports service logs in as reports-user (systemId "Reports User"): hand it the new password through
# a template whose password line reads ${REPORTS_SERVICE_PASSWORD} (mounted by docker-compose.vipers.yml).
TPL=/opt/vipers/branding/bahmni-reports.properties.template; mkdir -p /opt/vipers/branding
if [ ! -f "$TPL" ]; then
  docker run --rm --entrypoint cat "bahmni/reports:${REPORTS_IMAGE_TAG:-1.2.0}" /etc/bahmni-reports/bahmni-reports.properties.template \
    | sed 's#^openmrs.service.password=.*#openmrs.service.password=${REPORTS_SERVICE_PASSWORD}#' > "$TPL"
fi
RP=$(grep '^REPORTS_USER=' "$STOCK" | cut -d= -f2-)
ENVF=/opt/vipers/bahmni-docker/bahmni-lite/.env.vipers
if [ -n "$RP" ] && ! grep -q "^REPORTS_SERVICE_PASSWORD=$RP\$" "$ENVF"; then
  sed -i '/^REPORTS_SERVICE_PASSWORD=/d' "$ENVF"; echo "REPORTS_SERVICE_PASSWORD=$RP" >> "$ENVF"
  vipers dc up -d reports >/dev/null 2>&1 && echo "reports service given the new reports-user password"
fi

auth_ok superman Admin123 && echo "WARNING: superman/Admin123 still works" || echo "check: superman/Admin123 rejected"
auth_ok registration Admin123 && echo "WARNING: registration/Admin123 still works" || echo "check: registration/Admin123 rejected"
echo "admin login (may stay locked up to 5 min after failed sync attempts):"; auth_ok admin "$NEW" && echo "  admin OK" || echo "  admin not yet accepted (lockout window)"
