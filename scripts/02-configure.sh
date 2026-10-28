#!/bin/bash
# Build /opt/vipers/bahmni-docker/bahmni-lite/.env.vipers from the release .env (left untouched).
# Secrets are generated once into /opt/vipers/secrets/vipers.env (root-only) and never printed.
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || source /tmp/00-guard.sh

PUBLIC_IP="${PUBLIC_IP:-34.35.115.102}"
SSLIP="$(echo "$PUBLIC_IP" | tr . -).sslip.io"
# Use the real domain once its DNS points at this server; until then the sslip.io fallback.
if [ -z "${BILLING_HOST:-}" ]; then
  if [ "$(getent ahostsv4 billing.motionimprints.tech | awk 'NR==1{print $1}')" = "$PUBLIC_IP" ]; then BILLING_HOST=billing.motionimprints.tech
  else BILLING_HOST="billing.$SSLIP"; fi
fi
LITE=/opt/vipers/bahmni-docker/bahmni-lite
SECRETS=/opt/vipers/secrets/vipers.env

install -d -m 700 /opt/vipers/secrets
if [ ! -f "$SECRETS" ]; then
  gen() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "${1:-24}"; }
  cat > "$SECRETS" <<EOF
MYSQL_ROOT_PASSWORD=$(gen)
OPENMRS_DB_PASSWORD=$(gen)
REPORTS_DB_PASSWORD=$(gen)
CRATER_DB_PASSWORD=$(gen)
CRATER_ATOMFEED_DB_PASSWORD=$(gen)
CRATER_ATOMFEED_DB_ROOT_PASSWORD=$(gen)
CRATER_OWNER_PASSWORD=$(gen 20)
OPENMRS_OWNER_PASSWORD=Vip$(gen 18)9
EOF
  chmod 600 "$SECRETS"
  echo "generated new secrets file"
fi
set -a; source "$SECRETS"; set +a

cd "$LITE"
cp .env .env.vipers
setv() {  # setv KEY VALUE  -> replace KEY=... line (or append)
  local k="$1" v="$2"
  if grep -q "^$k=" .env.vipers; then
    KEY="$k" VAL="$v" perl -i -pe 's/^\Q$ENV{KEY}\E=.*$/$ENV{KEY}=$ENV{VAL}/' .env.vipers
  else
    echo "$k=$v" >> .env.vipers
  fi
}
setv COMPOSE_PROFILES bahmni-lite
setv TZ Africa/Kampala
setv RESTART_POLICY unless-stopped
setv OPENMRS_IMAGE_TAG 2.0.1                       # Bahmni security advisory 2026-10-08 (SQLi / path traversal)
setv MYSQL_ROOT_PASSWORD "$MYSQL_ROOT_PASSWORD"
setv OPENMRS_DB_PASSWORD "$OPENMRS_DB_PASSWORD"
setv REPORTS_DB_PASSWORD "$REPORTS_DB_PASSWORD"
setv CRATER_DB_PASSWORD "\"$CRATER_DB_PASSWORD\""
setv CRATER_ATOMFEED_DB_PASSWORD "$CRATER_ATOMFEED_DB_PASSWORD"
setv CRATER_ATOMFEED_DB_ROOT_PASSWORD "$CRATER_ATOMFEED_DB_ROOT_PASSWORD"
# OpenMRS 'admin' (used by atomfeed sync) gets the owner password after first boot (see 04-harden.sh)
setv OPENMRS_ATOMFEED_PASSWORD "$OPENMRS_OWNER_PASSWORD"
# Crater (billing) owner account - private, not a demo account
setv CRATER_ADMIN_NAME "\"VIPERS Owner\""
setv CRATER_ADMIN_EMAIL owner@vipers-hospital.test
setv CRATER_ADMIN_PASSWORD "$CRATER_OWNER_PASSWORD"
setv CRATER_USERNAME owner@vipers-hospital.test
setv CRATER_PASSWORD "$CRATER_OWNER_PASSWORD"
setv CRATER_COMPANY_NAME "\"VIPERS HOSPITAL\""
setv CRATER_COMPANY_SLUG vipers-hospital
setv CRATER_COUNTRY_ID 227                          # Uganda
setv CRATER_APP_URL "https://$BILLING_HOST"
setv CRATER_SANCTUM_STATEFUL_DOMAINS "billing.motionimprints.tech,billing.$SSLIP"
setv CRATER_SESSION_DOMAIN null   # host-only cookie: works on both the real and the fallback hostname
chmod 600 .env.vipers

OVR_SRC="$(dirname "$0")/docker-compose.vipers.yml"; [ -f "$OVR_SRC" ] || OVR_SRC=/tmp/docker-compose.vipers.yml
[ -f "$OVR_SRC" ] && cp "$OVR_SRC" "$LITE/docker-compose.vipers.yml"

echo "--- non-secret differences vs release .env:"
diff .env .env.vipers | grep '^>' | grep -v -E 'PASSWORD' || true
docker compose --env-file .env.vipers -f docker-compose.yml -f docker-compose.vipers.yml config --services | sort | tr '\n' ' '; echo
docker compose --env-file .env.vipers -f docker-compose.yml -f docker-compose.vipers.yml config --quiet && echo "compose config: VALID"
