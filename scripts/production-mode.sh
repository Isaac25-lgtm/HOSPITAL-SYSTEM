#!/bin/bash
# Switch this server from DEMO to PRODUCTION mode (for real use). One-way, and every step is verified.
#   HOSPITAL="St. Mary's Health Centre" bash production-mode.sh
# What it does:
#   - marks the server as production (/opt/vipers/profile): demo account repair, demo reset and demo expiry refuse to run,
#     and the guard keeps only the container self-heal;
#   - retires every public demo account and proves that none of the demo or default passwords sign in;
#   - restores a production password policy (min 10 characters, letters and digits, not the username);
#   - restarts "Close Stale Visits Task" (paused for the demo);
#   - switches off free-text AI and the trial portal; hides the role cards (site.json mode "production");
#   - locks the demo billing user and revokes every billing token and session.
# After this, create a named account for every staff member (Admin > Users) with only the roles they need.
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || source /tmp/00-guard.sh
set -Eeuo pipefail
umask 077
S="$(cd "$(dirname "$0")" && pwd)"
HOSPITAL="${HOSPITAL:?set HOSPITAL=\"Hospital name\"}"
[ ! -f /opt/vipers/tenant/is-tenant ] || { echo "refusing: this is a 5-day trial server, not a production install"; exit 1; }
# hold the maintenance lock for the whole switch: a guard run already repairing demo accounts finishes first, and no
# later guard run starts until the production marker is in place (the guard checks the marker after taking the lock)
exec 9>/run/vipers-ops.lock
flock -w 900 9 || { echo "another maintenance job is running; try again later"; exit 1; }
trap 'echo "PRODUCTION SWITCH FAILED at line $LINENO - nothing after this step was done; fix and run again (it is safe to rerun)"' ERR

source /opt/vipers/secrets/vipers.env
API=https://127.0.0.1:8443/openmrs/ws/rest/v1
source "$S/auth-check.sh"
A="superman:$OPENMRS_OWNER_PASSWORD"
q() { curl -fsk --max-time 30 -u "$A" -H 'Content-Type: application/json' -H 'Accept: application/json' "$@"; }
omrs_auth superman "$OPENMRS_OWNER_PASSWORD" "$API" || { echo "owner account cannot sign in"; exit 1; }

# 1. production marker first: from now on no demo tooling runs, even if a later step fails
echo production > /opt/vipers/profile; chmod 644 /opt/vipers/profile
systemctl disable --now vipers-expiry.timer >/dev/null 2>&1 || true

# 2. retire the public demo accounts, then prove that no public or default password works
for un in demo.reception demo.doctor demo.lab demo.cashier demo.admin demo.nurse; do
  du=$(q "$API/user?username=$un&v=custom:(uuid,username,retired)" | jq -r --arg u "$un" '.results[] | select(.username==$u and .retired==false) | .uuid')
  if [ -n "$du" ]; then q -o /dev/null -X DELETE "$API/user/$du?reason=production%20server"; echo "retired $un"; fi
done
for pair in "demo.reception liverpool" "demo.doctor arsenal" "demo.lab chelsea" "demo.cashier everton" "demo.admin fulham" "demo.nurse brighton" "superman Admin123" "admin Admin123" "registration Admin123"; do
  set -- $pair
  if omrs_auth "$1" "$2" "$API"; then echo "FAIL: $1 still signs in with a public password"; exit 1; else rc=$?; [ "$rc" = 1 ] || { echo "check for $1 inconclusive"; exit 1; }; fi
done
echo "verified: no demo or default password signs in"

# 3. production password policy
setgp() {
  local uuid; uuid=$(q "$API/systemsetting?q=$1&v=custom:(uuid,property)" | jq -r --arg p "$1" '.results[] | select(.property==$p) | .uuid')
  if [ -n "$uuid" ]; then q -o /dev/null -d "{\"value\":\"$2\"}" "$API/systemsetting/$uuid"; else q -o /dev/null -d "{\"property\":\"$1\",\"value\":\"$2\"}" "$API/systemsetting"; fi
  [ "$(q "$API/systemsetting?q=$1&v=custom:(property,value)" | jq -r --arg p "$1" '.results[] | select(.property==$p) | .value')" = "$2" ] || { echo "policy $1 not applied"; exit 1; }
}
setgp security.passwordMinimumLength 10
setgp security.passwordRequiresDigit true
setgp security.passwordRequiresNonDigit true
setgp security.passwordCannotMatchUsername true
setgp security.userUnlockWaitTime 15
echo "password policy: production"

# 4. close stale visits again (the demo keeps visits open)
q -o /dev/null -d '{"tasks":["Close Stale Visits Task"],"action":"STARTTASK"}' "$API/taskaction"
echo "stale-visit task restarted"

# 5. billing: lock the demo cashier and revoke every copied login
docker exec -i bahmni-lite-crater-php-1 php -r '
require "/var/www/vendor/autoload.php"; $app = require "/var/www/bootstrap/app.php";
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$u = Crater\Models\User::where("email", "demo.cashier@vipers.demo")->first();
if ($u) { $u->password = bin2hex(random_bytes(16)); $u->save(); }
Illuminate\Support\Facades\DB::table("personal_access_tokens")->delete();
Illuminate\Support\Facades\DB::table("sessions")->delete();
if ($u && Illuminate\Support\Facades\Hash::check("everton", Crater\Models\User::find($u->id)->password)) { fwrite(STDERR, "demo cashier still works\n"); exit(1); }
echo "billing: demo cashier locked, tokens and sessions revoked\n";' 2>/tmp/vipers-prod-crater.err || { grep -v -i deprecat /tmp/vipers-prod-crater.err >&2 || true; echo "billing step failed"; exit 1; }
rm -f /tmp/vipers-prod-crater.err

# 6. web layer: no free-text AI, no trial portal, no role cards
EE=/opt/vipers/edge/edge.env
sed -i -e '/^AI_ALLOW_FREE_TEXT=/d' -e '/^TRIAL_PORTAL=/d' "$EE"
[ -n "$(tail -c1 "$EE")" ] && echo >> "$EE"
printf 'AI_ALLOW_FREE_TEXT=false\nTRIAL_PORTAL=false\n' >> "$EE"
jq -nc --arg h "$HOSPITAL" '{mode:"production", hospital:$h}' > /opt/vipers/edge/addons/public/site.json
chmod 644 /opt/vipers/edge/addons/public/site.json
(cd /opt/vipers/bahmni-docker/bahmni-lite && vipers dc up -d --force-recreate vipers-addons >/dev/null 2>&1)
sleep 5
[ "$(docker exec bahmni-lite-vipers-addons-1 printenv AI_ALLOW_FREE_TEXT)" = false ] || { echo "free-text AI still on"; exit 1; }
[ "$(docker exec bahmni-lite-vipers-addons-1 printenv TRIAL_PORTAL)" = false ] || { echo "trial portal still on"; exit 1; }

trap - ERR
echo
echo "PRODUCTION MODE ON for $HOSPITAL."
echo "Next: create a named account for every staff member (Admin > Users) with only the roles they need,"
echo "      set up off-site backups (BACKUP_BUCKET in /opt/vipers/secrets/backup.env) and test a restore."
