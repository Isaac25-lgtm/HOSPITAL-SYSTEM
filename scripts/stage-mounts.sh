#!/bin/bash
# Create the files that docker-compose.vipers.yml bind-mounts into containers, BEFORE the first `vipers up`.
# A missing bind source is created by Docker as a directory; the file could then never be written there.
# Idempotent: existing files are kept. Run by 02-configure.sh, 04-harden.sh and 06-crater.sh.
#  - bahmni-reports.properties.template: the reports service password comes from REPORTS_SERVICE_PASSWORD
#    (the stock template hard-codes the public default password)
#  - crater-nginx.conf: Crater's access log without query strings (the Bahmni sync sends credentials in the URL)
set -euo pipefail
B="${VIPERS_BRANDING:-/opt/vipers/branding}"; mkdir -p "$B"
ENVF=/opt/vipers/bahmni-docker/bahmni-lite/.env.vipers
tag() { local v; v=$( (grep -s "^$1=" "$ENVF" || true) | tail -1 | cut -d= -f2-); echo "${v:-$2}"; }

# an empty directory left by an earlier start without these files is replaced; anything else stops the setup
fix_type() {
  if [ -d "$1" ]; then rmdir "$1" 2>/dev/null || { echo "ABORT: $1 is a non-empty directory (expected a file)"; exit 1; }; fi
}

TPL=$B/bahmni-reports.properties.template
fix_type "$TPL"
if [ ! -s "$TPL" ]; then
  docker run --rm --entrypoint cat "bahmni/reports:$(tag REPORTS_IMAGE_TAG 1.2.0)" /etc/bahmni-reports/bahmni-reports.properties.template \
    | sed 's#^openmrs.service.password=.*#openmrs.service.password=${REPORTS_SERVICE_PASSWORD}#' > "$TPL.tmp"
  mv -f "$TPL.tmp" "$TPL"
fi
grep -qF 'openmrs.service.password=${REPORTS_SERVICE_PASSWORD}' "$TPL" || { echo "ABORT: $TPL has no REPORTS_SERVICE_PASSWORD line"; exit 1; }

CONF=$B/crater-nginx.conf
fix_type "$CONF"
if [ ! -s "$CONF" ]; then
  { echo 'log_format vipers_noquery '"'"'$remote_addr - $remote_user [$time_local] "$request_method $uri $server_protocol" $status $body_bytes_sent "$http_referer" "$http_user_agent"'"'"';'
    docker run --rm --entrypoint cat "bahmni/crater-nginx:$(tag CRATER_NGINX_IMAGE_TAG 1.0.0)" /etc/nginx/conf.d/nginx.conf \
      | sed 's#access_log /var/log/nginx/access.log;#access_log /var/log/nginx/access.log vipers_noquery;#'; } > "$CONF.tmp"
  mv -f "$CONF.tmp" "$CONF"
fi
grep -qF 'vipers_noquery;' "$CONF" || { echo "ABORT: $CONF does not use the query-free log format"; exit 1; }
chmod 644 "$TPL" "$CONF"
echo "mount sources ready: $(basename "$TPL"), $(basename "$CONF")"
