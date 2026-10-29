#!/bin/bash
# Replace publicly known OpenMRS default passwords. Idempotent.
#  - superman + admin (atomfeed sync user)  -> private owner password (secrets/vipers.env)
#  - stock demo users from the release DB   -> random passwords (not retired, so nothing that relies on them breaks)
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || source /tmp/00-guard.sh
set +e
FAILED=0
source "$(dirname "$0")/auth-check.sh"
source /opt/vipers/secrets/vipers.env
API=https://127.0.0.1:8443/openmrs/ws/rest/v1
NEW="$OPENMRS_OWNER_PASSWORD"
auth_ok() { omrs_auth "$1" "$2" "$API"; }
code() { curl -sk -o /dev/null -w '%{http_code}' "$@"; }

if ! auth_ok superman "$NEW"; then
  auth_ok superman Admin123 && echo "superman: changing default -> HTTP $(code -u superman:Admin123 -H 'Content-Type: application/json' -d "{\"oldPassword\":\"Admin123\",\"newPassword\":\"$NEW\"}" "$API/password")"
fi
auth_ok superman "$NEW" || { echo "ABORT: cannot authenticate as superman"; exit 1; }

USERS=$(curl -sk -u "superman:$NEW" "$API/user?v=custom:(uuid,username,systemId)&limit=100")
# login name of an account: its username, or its system ID when the username is empty (e.g. the sync account "admin")
uuid_of() { echo "$USERS" | jq -r --arg s "$1" '.results[] | select(.systemId==$s or .username==$s) | .uuid' | head -1; }
# succeeds only when the API accepts the change AND the new password then signs in
setpw() {
  local u; u=$(uuid_of "$1"); [ -n "$u" ] || { echo "$1: not found"; return 1; }
  local c; c=$(code -u "superman:$NEW" -H 'Content-Type: application/json' -d "{\"newPassword\":\"$2\"}" "$API/password/$u")
  echo "$1: HTTP $c"
  [ "${c:0:1}" = 2 ] || return 1
  auth_ok "$(echo "$USERS" | jq -r --arg u "$u" '.results[] | select(.uuid==$u) | (if (.username // "") != "" then .username else .systemId end)')" "$2"
}

auth_ok admin "$NEW" && echo "admin: already hardened" || { setpw admin "$NEW" || FAILED=1; }

STOCK=/opt/vipers/secrets/stock-users.env
touch "$STOCK"; chmod 600 "$STOCK"
for S in registration doctor "Lab Manager" "Lab System" "Reports User"; do
  [ -z "$(uuid_of "$S")" ] && continue
  KEY=$(echo "$S" | tr ' a-z' '_A-Z')
  # a recorded password counts only if it really works (an earlier failed change is repaired here)
  OLD=$(grep "^$KEY=" "$STOCK" | cut -d= -f2-)
  UN=$(echo "$USERS" | jq -r --arg s "$S" '.results[] | select(.systemId==$s or .username==$s) | (if (.username // "") != "" then .username else .systemId end)' | head -1)
  [ -n "$OLD" ] && auth_ok "$UN" "$OLD" && { echo "$S: already randomised"; continue; }
  sed -i "/^$KEY=/d" "$STOCK"
  PW="Stk$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | head -c 18)7"
  if setpw "$S" "$PW"; then echo "$KEY=$PW" >> "$STOCK"; else FAILED=1; fi
done

# The reports service logs in as reports-user (systemId "Reports User"): hand it the new password through
# a template whose password line reads ${REPORTS_SERVICE_PASSWORD} (mounted by docker-compose.vipers.yml).
TPL=/opt/vipers/branding/bahmni-reports.properties.template; mkdir -p /opt/vipers/branding
if [ ! -f "$TPL" ]; then
  docker run --rm --entrypoint cat "bahmni/reports:${REPORTS_IMAGE_TAG:-1.2.0}" /etc/bahmni-reports/bahmni-reports.properties.template \
    | sed 's#^openmrs.service.password=.*#openmrs.service.password=${REPORTS_SERVICE_PASSWORD}#' > "$TPL"
fi
[ -s "$TPL" ] && grep -qF 'openmrs.service.password=${REPORTS_SERVICE_PASSWORD}' "$TPL" || { echo 'FAIL: reports template'; FAILED=1; }
RP=$(grep '^REPORTS_USER=' "$STOCK" | cut -d= -f2-)
ENVF=/opt/vipers/bahmni-docker/bahmni-lite/.env.vipers
if [ -n "$RP" ] && ! grep -q "^REPORTS_SERVICE_PASSWORD=$RP\$" "$ENVF"; then
  sed -i '/^REPORTS_SERVICE_PASSWORD=/d' "$ENVF"; [ -n "$(tail -c1 "$ENVF")" ] && echo >> "$ENVF"; echo "REPORTS_SERVICE_PASSWORD=$RP" >> "$ENVF"
  vipers dc up -d reports >/dev/null 2>&1 && echo "reports service given the new reports-user password" || FAILED=1
fi

for S in superman admin registration doctor "Lab Manager" "Lab System" "Reports User"; do
  U=$(echo "$USERS" | jq -r --arg s "$S" '.results[] | select(.systemId==$s or .username==$s) | (if (.username // "") != "" then .username else .systemId end)' | head -1)
  [ -n "$U" ] || { echo "FAIL: expected account $S missing"; FAILED=1; continue; }
  auth_ok "$U" Admin123; result=$?
  if [ "$result" != 1 ]; then echo "FAIL: $S default check accepted or inconclusive"; FAILED=1; fi
done
auth_ok admin "$NEW" || { echo 'FAIL: sync account not authenticated'; FAILED=1; }
exit "$FAILED"
