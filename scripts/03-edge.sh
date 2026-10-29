#!/bin/bash
# Install the VIPERS edge (Caddy HTTPS + vipers-addons) from /tmp/edge.tgz into /opt/vipers/edge and start it.
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || source /tmp/00-guard.sh

IP="${PUBLIC_IP:-34.35.115.102}"
SSLIP="$(echo "$IP" | tr . -).sslip.io"
DOMAIN="${DOMAIN:-motionimprints.tech}"

mkdir -p /opt/vipers/edge
# new edge files only when a package was uploaded; otherwise reuse what is installed
[ -f /tmp/edge.tgz ] && tar -xzf /tmp/edge.tgz -C /opt/vipers/edge
find /opt/vipers/edge -type f \( -name '*.js' -o -name '*.json' -o -name '*.css' -o -name '*.html' -o -name '*.svg' -o -name 'Caddyfile' -o -name '*.yml' -o -name 'Dockerfile' \) -exec sed -i 's/\r$//' {} +
cp /opt/vipers/edge/docker-compose.edge.yml /opt/vipers/bahmni-docker/bahmni-lite/docker-compose.edge.yml

# Hostnames: always serve the sslip.io fallback; add the real domain once its DNS points here.
resolves() { [ "$(getent ahostsv4 "$1" | awk 'NR==1{print $1}')" = "$IP" ]; }
DEMO_HOSTS="demo.$SSLIP"; BILLING_HOSTS="billing.$SSLIP"
resolves "demo.$DOMAIN" && DEMO_HOSTS="demo.$DOMAIN, $DEMO_HOSTS"
resolves "billing.$DOMAIN" && BILLING_HOSTS="billing.$DOMAIN, $BILLING_HOSTS"
# AI key source: Secret Manager on Google Cloud; elsewhere AI_API_KEY in secrets/addons.env (or AI off)
GCP_PROJECT=$(curl -s -m 2 -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/project/project-id 2>/dev/null || true)
AI_KEY_LINE=""; AI_ON=false
if [ -n "$GCP_PROJECT" ]; then AI_KEY_LINE="AI_GCP_SECRET=projects/$GCP_PROJECT/secrets/deepseek-api-key"; AI_ON=true
elif grep -q '^AI_API_KEY=.' /opt/vipers/secrets/addons.env 2>/dev/null; then AI_ON=true; fi
AI_ON="${AI_ENABLED:-$AI_ON}"
# free-text AI answers: off unless chosen (fictional-data demo/trials only); a regeneration keeps the current choice
# (a missing file or key must fall back to "false", not abort the script under set -e)
FREE_TEXT="${AI_ALLOW_FREE_TEXT:-$( (grep -s '^AI_ALLOW_FREE_TEXT=' /opt/vipers/edge/edge.env || true) | tail -1 | cut -d= -f2)}"
[ "$FREE_TEXT" = true ] || FREE_TEXT=false
# AI allowances: an explicit value, else the current one (a trial keeps its smaller allowance), else the default
cur() { (grep -s "^$1=" /opt/vipers/edge/edge.env || true) | tail -1 | cut -d= -f2; }
DAILY_LIMIT="${AI_DAILY_TOKEN_LIMIT:-$(cur AI_DAILY_TOKEN_LIMIT)}"; [[ "$DAILY_LIMIT" =~ ^[0-9]+$ ]] || DAILY_LIMIT=250000
TOTAL_LIMIT="${AI_TOTAL_TOKEN_LIMIT:-$(cur AI_TOTAL_TOKEN_LIMIT)}"; [[ "$TOTAL_LIMIT" =~ ^[0-9]+$ ]] || TOTAL_LIMIT=1500000
# portal settings added by operators (TRIAL_IMAGE, TRIAL_SA, ...) survive a regeneration of edge.env
KEEP=$( (grep -s -E '^TRIAL_[A-Z_]+=' /opt/vipers/edge/edge.env || true) )
cat > /opt/vipers/edge/edge.env <<EOF
DEMO_HOSTS=$DEMO_HOSTS
BILLING_HOSTS=$BILLING_HOSTS
AI_ENABLED=$AI_ON
AI_ALLOW_FREE_TEXT=$FREE_TEXT
AI_MODEL=${AI_MODEL:-deepseek-flash}
AI_URL=${AI_URL:-https://api.deepseek.com/chat/completions}
$AI_KEY_LINE
AI_DAILY_TOKEN_LIMIT=$DAILY_LIMIT
AI_TOTAL_TOKEN_LIMIT=$TOTAL_LIMIT
AI_MAX_OUTPUT_TOKENS=300
GATE_ENABLED=${GATE_ENABLED:-false}
GATE_DAYS=14
EOF
[ -n "$KEEP" ] && printf '%s\n' "$KEEP" >> /opt/vipers/edge/edge.env
echo "edge hosts: $DEMO_HOSTS | $BILLING_HOSTS"

# Gate secrets (tester access code + cookie signing key), generated once.
if [ ! -f /opt/vipers/secrets/addons.env ]; then
  WORDS=(kampala entebbe jinja mbale gulu lira masaka mbarara arua tororo soroti hoima kabale fortportal)
  CODE="${WORDS[$((RANDOM % ${#WORDS[@]}))]}-$((RANDOM % 9000 + 1000))"
  printf 'GATE_CODE=%s\nGATE_SECRET=%s\n' "$CODE" "$(openssl rand -hex 32)" > /opt/vipers/secrets/addons.env
  chmod 600 /opt/vipers/secrets/addons.env
  echo "generated tester access code (stored in /opt/vipers/secrets/addons.env)"
fi

cd /opt/vipers/bahmni-docker/bahmni-lite
vipers dc build --quiet caddy vipers-addons
# the add-ons service runs as uid 1000 (node); make sure its usage/ceiling file is writable
docker volume create bahmni-lite_addons-data >/dev/null
docker run --rm -v bahmni-lite_addons-data:/data alpine:3 chown -R 1000:1000 /data
# failures must stop the script (a trial must never be declared ready on a broken edge)
if ! OUT=$(vipers up 2>&1); then echo "$OUT" | tail -20; echo "vipers up failed"; exit 1; fi
# pick up changed bind-mounted files (Caddyfile, public assets, env)
if ! OUT=$(vipers dc up -d --force-recreate caddy vipers-addons 2>&1); then echo "$OUT" | tail -20; echo "edge recreate failed"; exit 1; fi
sleep 5
for c in caddy vipers-addons; do
  [ "$(docker inspect -f '{{.State.Running}}' "bahmni-lite-$c-1" 2>/dev/null)" = true ] || { echo "$c is not running"; exit 1; }
done
vipers ps | grep -E 'caddy|addons'
