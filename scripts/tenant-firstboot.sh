#!/bin/bash
# First boot of a hospital's own trial server (created from the VIPERS image by the trial portal).
# Runs as the instance startup-script on every boot; configures once (marker file), then only re-asserts
# the trial settings. Inputs: instance metadata vipers-hospital, vipers-username, vipers-password,
# vipers-expires, vipers-billing-email (the portal removes vipers-password once the server is ready).
set -u
export VIPERS_EXPECTED_HOST="$(hostname)"   # the kit scripts (00-guard.sh) refuse to run on any other host name
LOG=/var/log/vipers-tenant.log; exec >>"$LOG" 2>&1
echo "== $(date '+%F %T %Z') tenant boot"
md() { curl -sf -H 'Metadata-Flavor: Google' "http://metadata.google.internal/computeMetadata/v1/instance/$1"; }
T=/opt/vipers/tenant; S=/opt/vipers/scripts
install -d -m 700 $T
systemctl disable --now vipers-expiry.timer 2>/dev/null || true   # the portal deletes this server after 5 days
touch $T/is-tenant                                                # guard.sh: no demo accounts on a hospital server
# mark this as a hospital server for the web layer at once: switches off the copied trial portal and the role cards
P=/opt/vipers/edge/addons/public/site.json
[ -f $P ] || { echo '{"mode":"hospital-pending"}' > $P; chmod 644 $P; }
rm -f /var/lib/docker/volumes/bahmni-lite_addons-data/_data/trials.json   # never a copy of the main portal registry
[ -f $T/configured ] && { echo "already configured"; exit 0; }

HOSP=$(md attributes/vipers-hospital); USERN=$(md attributes/vipers-username); PASS=$(md attributes/vipers-password)
EXP=$(md attributes/vipers-expires); BEMAIL=$(md attributes/vipers-billing-email)
IP=$(md network-interfaces/0/access-configs/0/external-ip)
if [ -z "$HOSP" ] || [ -z "$USERN" ] || [ -z "$PASS" ] || [ -z "$IP" ]; then echo "missing metadata"; exit 1; fi

cd /opt/vipers/bahmni-docker/bahmni-lite
for i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 5; done
# this server's own hostnames (secrets are kept); DOMAIN is unset so only the sslip.io names are served
# a failure here stops before 'configured', so the next boot retries (output goes to the log)
PUBLIC_IP=$IP bash $S/02-configure.sh || { echo "02-configure failed"; exit 1; }
vipers up >/dev/null 2>&1
PUBLIC_IP=$IP DOMAIN=invalid.local bash $S/03-edge.sh || { echo "03-edge failed"; exit 1; }
vipers dc up -d --force-recreate crater-php crater-nginx >/dev/null 2>&1

for i in $(seq 1 120); do
  curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:8443/openmrs/ws/rest/v1/session | grep -q 200 && break; sleep 10
done
source /opt/vipers/secrets/vipers.env
A="superman:$OPENMRS_OWNER_PASSWORD"; API=https://127.0.0.1:8443/openmrs/ws/rest/v1
q() { curl -sk -u "$A" -H 'Content-Type: application/json' -H 'Accept: application/json' "$@"; }

# one account with every section: union of the VIPERS demo roles' privileges (no infrastructure privileges)
PRIVS=$(q "$API/role?v=custom:(display,privileges:(display))&limit=200" | jq -c '[.results[] | select(.display | startswith("VIPERS ")) | select(.display != "VIPERS Hospital") | .privileges[].display] | unique')
ruuid() { q "$API/role?v=custom:(uuid,display)&limit=200" | jq -r '.results[] | select(.display=="VIPERS Hospital") | .uuid'; }
RU=$(ruuid)
BODY=$(jq -nc --argjson p "$PRIVS" '{description:"Trial hospital account: every section", privileges:$p}')
if [ -z "$RU" ]; then q -o /dev/null -w "hospital role: %{http_code}\n" -d "$(echo "$BODY" | jq -c '. + {name:"VIPERS Hospital"}')" "$API/role"; RU=$(ruuid)
else q -o /dev/null -w "hospital role updated: %{http_code}\n" -d "$BODY" "$API/role/$RU"; fi

UJSON=$(jq -nc --arg un "$USERN" --arg pw "$PASS" --arg gn "$HOSP" --arg r "$RU" \
  '{username:$un, password:$pw, person:{names:[{givenName:$gn, familyName:"Account"}], gender:"F"}, roles:[$r]}')
q -o /dev/null -w "hospital user: %{http_code}\n" -d "$UJSON" "$API/user"
U=$(q "$API/user?username=$USERN&v=custom:(uuid,username,person:(uuid))" | jq -r --arg u "$USERN" '.results[] | select(.username==$u) | .uuid + " " + .person.uuid')
[ -n "$U" ] && q -o /dev/null -w "hospital provider: %{http_code}\n" -d "{\"person\":\"${U#* }\",\"identifier\":\"$USERN\"}" "$API/provider"

# the public demo passwords must not open a hospital's server: retire the demo accounts
for un in demo.reception demo.doctor demo.lab demo.cashier demo.admin demo.nurse; do
  du=$(q "$API/user?username=$un&v=custom:(uuid,username)" | jq -r --arg u "$un" '.results[] | select(.username==$u) | .uuid')
  [ -n "$du" ] && q -o /dev/null -w "retire $un: %{http_code}\n" -X DELETE "$API/user/$du?reason=hospital%20trial%20server"
done

# billing: the hospital's user (same password), company name, demo cashier locked out
docker cp $S/crater-hospital-user.php bahmni-lite-crater-php-1:/tmp/crater-hospital-user.php >/dev/null
docker exec -e VH_EMAIL="$BEMAIL" -e VH_PASS="$PASS" -e VH_NAME="$HOSP" bahmni-lite-crater-php-1 php /tmp/crater-hospital-user.php 2>&1 | grep -v -i deprecat

# hospital mode for the web layer (sign-in notice, no role cards)
jq -nc --arg h "$HOSP" --arg u "$USERN" --arg b "$BEMAIL" --arg e "$EXP" \
  '{mode:"hospital", hospital:$h, username:$u, billingEmail:$b, expires:$e}' > /opt/vipers/edge/addons/public/site.json
chmod 644 /opt/vipers/edge/addons/public/site.json
touch $T/configured
echo "configured for $HOSP ($USERN) at $IP"
