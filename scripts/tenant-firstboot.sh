#!/bin/bash
# First boot of a hospital's own trial server (created from the VIPERS image by the trial portal).
# Runs as the instance startup script on every boot. Inputs: instance metadata vipers-hospital, vipers-username,
# vipers-password, vipers-expires, vipers-billing-email (the portal removes vipers-password once the server is ready).
#
# Fail closed: the public web ports stay blocked from the first moment until every setup step has been checked,
# including that none of the public demo passwords and none of the logins copied from the image still work.
# Any failure leaves the ports blocked and reports "hospital-failed"; the portal then deletes the server.
set -Eeuo pipefail
umask 077
export VIPERS_EXPECTED_HOST="$(hostname)"   # the kit scripts (00-guard.sh) refuse to run on any other host name
LOG=/var/log/vipers-tenant.log; exec >>"$LOG" 2>&1
echo "== $(date '+%F %T %Z') tenant boot"
md() { curl -sf -m 5 -H 'Metadata-Flavor: Google' "http://metadata.google.internal/computeMetadata/v1/instance/$1"; }
T=/opt/vipers/tenant; S=/opt/vipers/scripts; LITE=/opt/vipers/bahmni-docker/bahmni-lite
P=/opt/vipers/edge/addons/public/site.json
install -d -m 700 $T
touch $T/is-tenant                                                # guard.sh: no demo accounts on a hospital server
systemctl disable --now vipers-expiry.timer 2>/dev/null || true   # the demo's own end date does not apply here
rm -f /var/lib/docker/volumes/bahmni-lite_addons-data/_data/trials.json   # never a copy of the main portal registry

EXP=$(md attributes/vipers-expires)
IP=$(md network-interfaces/0/access-configs/0/external-ip)
# switch itself off at expiry even if the main server (which deletes it) is not running
[ -n "$EXP" ] || { echo 'expiry metadata missing'; exit 1; }
if [ "$(date -u -d "$EXP" +%s)" -le "$(date -u +%s)" ]; then poweroff; exit 0; fi
cat > /etc/systemd/system/vipers-trial-expiry.service <<'EOF'
[Service]
Type=oneshot
ExecStart=/usr/sbin/poweroff
EOF
cat > /etc/systemd/system/vipers-trial-expiry.timer <<EOF
[Timer]
OnCalendar=$(date -u -d "$EXP" '+%Y-%m-%d %H:%M:%S UTC')
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now vipers-trial-expiry.timer

# The image's systemd dependency sealed ingress before Docker was allowed to start.
[ -f /opt/vipers/boot-seal-v1 ] || { echo "unsealed image refused"; exit 1; }
systemctl is-active --quiet vipers-boot-seal.service || { echo "boot seal not active"; exit 1; }
block() { bash "$S/trial-firewall.sh" block; }
unblock() { bash "$S/trial-firewall.sh" unblock; }
block
fail() {
  trap - ERR
  block || { systemctl stop docker.service docker.socket; exit 1; }
  echo "SETUP FAILED: $*"
  echo '{"mode":"hospital-failed"}' > "$P"
  exit 1
}
trap 'fail "command failed at line $LINENO"' ERR
for i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 5; done
docker info >/dev/null

if [ -f $T/configured ]; then
  # later boots: follow a new public address after a stop/start (ephemeral IP), otherwise nothing to do
  if [ -n "$IP" ] && [ "$IP" != "$(cat $T/ip 2>/dev/null)" ]; then
    echo "address changed to $IP: reconfiguring hostnames"
    PUBLIC_IP=$IP bash $S/02-configure.sh
    (cd $LITE && vipers up >/dev/null 2>&1)
    PUBLIC_IP=$IP DOMAIN=invalid.local bash $S/03-edge.sh
    echo "$IP" > $T/ip
  fi
  unblock
  echo "already configured"; exit 0
fi

# ---------------- first configuration ----------------
block
touch $T/setup-running                        # guard.sh leaves the stack alone while this runs
echo '{"mode":"hospital-pending"}' > $P; chmod 644 $P   # web layer: portal and role cards off at once
need() { local c; c=$(cat); [[ "$c" =~ ^2[0-9][0-9]$ ]] || { echo "$1 failed (HTTP $c)" >&2; return 1; }; }

HOSP=$(md attributes/vipers-hospital); USERN=$(md attributes/vipers-username); PASS=$(md attributes/vipers-password)
BEMAIL=$(md attributes/vipers-billing-email)
[ -n "$HOSP" ] && [ -n "$USERN" ] && [ -n "$PASS" ] && [ -n "$IP" ] || fail "missing metadata"
[[ "$USERN" =~ ^[a-z][a-z0-9._-]{2,29}$ ]] || fail "invalid username"

# controller (main demo server) address, for fetching the current web layer below; delete token for the
# hospital's own "Delete hospital space" button (kept root-only in addons.env, removed from metadata when ready)
CTRL=$(md attributes/vipers-controller || true)
TID=$(md attributes/vipers-trial-id || true); DTOK=$(md attributes/vipers-delete-token || true)
[ -n "$CTRL" ] && [ -n "$TID" ] && [ -n "$DTOK" ] || fail "deletion metadata missing"

# own hostnames; secrets file kept for now (rotated below)
PUBLIC_IP=$IP bash $S/02-configure.sh || fail "02-configure"
cd $LITE && vipers up >/dev/null 2>&1
for i in $(seq 1 120); do
  curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:8443/openmrs/ws/rest/v1/session | grep -q 200 && break; sleep 10
done
source /opt/vipers/secrets/vipers.env
API=https://127.0.0.1:8443/openmrs/ws/rest/v1
source "$S/auth-check.sh"
auth_ok() { omrs_auth "$1" "$2" "$API"; }
# Persist intended passwords BEFORE the remote mutation. Resume with either old or new.
J="$T/rotation.env"
if [ ! -s "$J" ]; then
  OLDOWN="$OPENMRS_OWNER_PASSWORD"
  NEWOWN="Vip$(openssl rand -hex 12)9"; NEWCRA="$(openssl rand -hex 16)"
  printf 'OLDOWN=%s\nNEWOWN=%s\nNEWCRA=%s\n' "$OLDOWN" "$NEWOWN" "$NEWCRA" > "$J.tmp"
  chmod 600 "$J.tmp"; sync -f "$J.tmp"; mv "$J.tmp" "$J"; sync -f "$T"
fi
source "$J"
A="superman:$NEWOWN"
q() { curl -fsk --max-time 30 -u "$A" -H 'Content-Type: application/json' -H 'Accept: application/json' "$@"; }
if ! auth_ok superman "$NEWOWN"; then
  auth_ok superman "$OLDOWN" || fail "neither journalled owner password works"
  A="superman:$OLDOWN"
  q -o /dev/null -w '%{http_code}' -d "$(jq -nc --arg o "$OLDOWN" --arg n "$NEWOWN" '{oldPassword:$o,newPassword:$n}')" "$API/password" | need "owner password"
fi
A="superman:$NEWOWN"
auth_ok superman "$NEWOWN" || fail "new owner password not accepted"
sed "s|^OPENMRS_OWNER_PASSWORD=.*|OPENMRS_OWNER_PASSWORD=$NEWOWN|; s|^CRATER_OWNER_PASSWORD=.*|CRATER_OWNER_PASSWORD=$NEWCRA|" /opt/vipers/secrets/vipers.env > "$T/vipers.env.tmp"
sync -f "$T/vipers.env.tmp"; mv "$T/vipers.env.tmp" /opt/vipers/secrets/vipers.env
ADMIN_UUID=$(q "$API/user?username=admin&v=custom:(uuid,username)" | jq -r '.results[] | select(.username=="admin") | .uuid')
[ -n "$ADMIN_UUID" ] || fail "sync user missing"
q -o /dev/null -w '%{http_code}' -d "$(jq -nc --arg n "$NEWOWN" '{newPassword:$n}')" "$API/password/$ADMIN_UUID" | need "sync user password"
auth_ok admin "$NEWOWN" || fail "sync password not accepted"

# one account with every section: union of the VIPERS demo roles' privileges (no infrastructure privileges)
PRIVS=$(q "$API/role?v=custom:(display,privileges:(display))&limit=200" | jq -c '[.results[] | select(.display | startswith("VIPERS ")) | select(.display != "VIPERS Hospital") | .privileges[].display] | unique')
[ "$(echo "$PRIVS" | jq length)" -gt 0 ] || fail "no VIPERS role privileges found"
ruuid() { q "$API/role?v=custom:(uuid,display)&limit=200" | jq -r '.results[] | select(.display=="VIPERS Hospital") | .uuid'; }
RU=$(ruuid)
BODY=$(jq -nc --argjson p "$PRIVS" '{description:"Trial hospital account: every section", privileges:$p}')
if [ -z "$RU" ]; then q -o /dev/null -w '%{http_code}' -d "$(echo "$BODY" | jq -c '. + {name:"VIPERS Hospital"}')" "$API/role" | need "hospital role"; RU=$(ruuid)
else q -o /dev/null -w '%{http_code}' -d "$BODY" "$API/role/$RU" | need "hospital role update"; fi
[ -n "$RU" ] || fail "hospital role missing"

# hospital user: create, or reset the password when a previous attempt already created it
U=$(q "$API/user?username=$USERN&v=custom:(uuid,username,person:(uuid))" | jq -r --arg u "$USERN" '.results[] | select(.username==$u) | .uuid + " " + .person.uuid')
if [ -z "$U" ]; then
  q -o /dev/null -w '%{http_code}' -d "$(jq -nc --arg un "$USERN" --arg pw "$PASS" --arg gn "$HOSP" --arg r "$RU" \
    '{username:$un, password:$pw, person:{names:[{givenName:$gn, familyName:"Account"}], gender:"F"}, roles:[$r]}')" "$API/user" | need "hospital user"
  U=$(q "$API/user?username=$USERN&v=custom:(uuid,username,person:(uuid))" | jq -r --arg u "$USERN" '.results[] | select(.username==$u) | .uuid + " " + .person.uuid')
else
  q -o /dev/null -w '%{http_code}' -d "$(jq -nc --arg pw "$PASS" '{newPassword:$pw}')" "$API/password/${U%% *}" | need "hospital user password"
fi
[ -n "$U" ] || fail "hospital user missing"
if [ "$(q "$API/provider?user=${U%% *}&v=custom:(uuid)" | jq '.results | length')" = 0 ]; then
  q -o /dev/null -w '%{http_code}' -d "$(jq -nc --arg p "${U#* }" --arg i "$USERN" '{person:$p, identifier:$i}')" "$API/provider" | need "hospital provider"
fi

# the public demo passwords must not open a hospital's server: retire the demo accounts, then prove it
for un in demo.reception demo.doctor demo.lab demo.cashier demo.admin demo.nurse; do
  du=$(q "$API/user?username=$un&v=custom:(uuid,username,retired)" | jq -r --arg u "$un" '.results[] | select(.username==$u and .retired==false) | .uuid')
  # (an if, not "&&": under set -e a loop ending in a skipped "&&" would count as a failure on a resumed setup)
  if [ -n "$du" ]; then q -o /dev/null -w '%{http_code}' -X DELETE "$API/user/$du?reason=hospital%20trial%20server" | need "retire $un"; fi
done
for pair in "demo.reception liverpool" "demo.doctor arsenal" "demo.lab chelsea" "demo.cashier everton" "demo.admin fulham" "demo.nurse brighton" "superman Admin123" "admin Admin123"; do
  if auth_ok $pair; then fail "a public password still works (${pair%% *})"; else rc=$?; [ "$rc" = 1 ] || fail "public password check inconclusive"; fi
done
auth_ok "$USERN" "$PASS" || fail "hospital account cannot sign in"
echo "verified: hospital account works, no public or default password works"

# password policy for the hospital (the demo lowered it)
for kv in "security.passwordMinimumLength 8" "security.passwordCannotMatchUsername true"; do
  set -- $kv
  q -o /dev/null -w '%{http_code}' -d "{\"value\":\"$2\"}" "$API/systemsetting/$1" | need "policy $1"
done

# billing: propagate the new owner passwords (sync services), then the hospital user, revoke copied logins
PUBLIC_IP=$IP bash $S/02-configure.sh || fail "02-configure (passwords)"
vipers up >/dev/null 2>&1
docker cp $S/crater-hospital-user.php bahmni-lite-crater-php-1:/tmp/crater-hospital-user.php >/dev/null || fail "copy billing script"
docker exec -e VH_EMAIL="$BEMAIL" -e VH_PASS="$PASS" -e VH_NAME="$HOSP" -e VH_OWNER_EMAIL=owner@vipers-hospital.test -e VH_OWNER_PASS="$NEWCRA" \
  bahmni-lite-crater-php-1 php /tmp/crater-hospital-user.php 2> >(grep -v -i deprecat >&2) || fail "billing setup"
docker exec bahmni-lite-crater-php-1 rm -f /tmp/crater-hospital-user.php
vipers dc up -d --force-recreate crater-php crater-nginx crater-atomfeed >/dev/null 2>&1

# current web layer from the main server, so servers made from an older image still look current
if [ -n "$CTRL" ]; then
  for f in vipers.js vipers.css help.json system-guide.txt about.html nature-bg.jpg logo.svg logo-white.svg; do
    curl -sf -m 20 "$CTRL/vipers-assets/$f" -o "/tmp/vp-$f"
    [ -s "/tmp/vp-$f" ] || fail "empty asset $f"
    install -m 644 "/tmp/vp-$f" "/opt/vipers/edge/addons/public/$f"
    rm -f "/tmp/vp-$f"
  done
fi

# current add-on code (AI, portal, self-delete) from the portal, and this server's delete token
for k in server help trial; do
  md attributes/vipers-addons-$k > /tmp/vp-$k.js
  [ -s /tmp/vp-$k.js ] || fail "empty add-on $k"
  install -m 644 /tmp/vp-$k.js /opt/vipers/edge/addons/$k.js
  rm -f /tmp/vp-$k.js
done
AE=/opt/vipers/secrets/addons.env; touch $AE; chmod 600 $AE
sed -i '/^TRIAL_\(ID\|DELETE_TOKEN\|CONTROLLER\)=/d' $AE
[ -n "$(tail -c1 $AE)" ] && echo >> $AE
[ -n "$TID" ] && [ -n "$DTOK" ] && [ -n "$CTRL" ] && printf 'TRIAL_ID=%s\nTRIAL_DELETE_TOKEN=%s\nTRIAL_CONTROLLER=%s\n' "$TID" "$DTOK" "$CTRL" >> $AE

# all checks passed: open the web ports and serve this server's own hostnames (certificate issued now)
unblock
AI_ALLOW_FREE_TEXT="$(md attributes/vipers-ai-free-text || echo false)" PUBLIC_IP=$IP DOMAIN=invalid.local bash $S/03-edge.sh || { block; fail "03-edge"; }
H="demo.$(echo "$IP" | tr . -).sslip.io"
for i in $(seq 1 30); do curl -s -o /dev/null -m 10 "https://$H/vipers-assets/favicon.svg" && break; sleep 10; done

# hospital mode for the web layer (sign-in notice, no role cards); the portal reads this to mark the server ready
jq -nc --arg h "$HOSP" --arg u "$USERN" --arg b "$BEMAIL" --arg e "$EXP" \
  '{mode:"hospital", hospital:$h, username:$u, billingEmail:$b, expires:$e}' > $P
chmod 644 $P
echo "$IP" > $T/ip
rm -f $T/setup-running
touch $T/configured
rm -f "$J"
echo "configured for $HOSP ($USERN) at $IP"
