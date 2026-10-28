#!/bin/bash
# vipers-guard (systemd timer, every 15 min): keep the demo usable without manual intervention.
#  - start any stopped VIPERS/Bahmni container
#  - restore demo accounts / roles / passwords (OpenMRS) and the Crater cashier
#  - switch to the real domain once its DNS points at this server
export VIPERS_EXPECTED_HOST="$(hostname)"
S=/opt/vipers/scripts
LOG=/var/log/vipers-guard.log
exec >>"$LOG" 2>&1
echo "== $(date '+%F %T %Z') guard run"

cd /opt/vipers/bahmni-docker/bahmni-lite
stopped=$(vipers dc ps -a --format '{{.Service}} {{.State}}' 2>/dev/null | awk '$2!="running"{print $1}' | grep -v -E '^$')
if [ -n "$stopped" ]; then echo "starting stopped services: $stopped"; vipers up >/dev/null 2>&1; fi

# hospital trial servers (tenant-firstboot.sh) keep only the container self-heal: no demo accounts, no DNS switch
if [ -f /opt/vipers/tenant/is-tenant ]; then echo "hospital trial server: self-heal only"; exit 0; fi

# OpenMRS answers? then repair demo accounts quietly
if curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1:8443/openmrs/ws/rest/v1/session | grep -q 200; then
  QUIET=1 bash $S/05-demo-accounts.sh
  docker cp $S/crater-demo-user.php bahmni-lite-crater-php-1:/tmp/crater-demo-user.php >/dev/null 2>&1 && \
    docker exec bahmni-lite-crater-php-1 php /tmp/crater-demo-user.php 2>&1 | grep -v -E 'roles: cashier|eprecat' || true
else
  echo "OpenMRS not answering yet"
fi

# DNS switch-over (one-time): demo./billing.motionimprints.tech -> this server
IP=$(curl -s -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip 2>/dev/null || echo 34.35.115.102)
if ! grep -q 'demo.motionimprints.tech' /opt/vipers/edge/edge.env && \
   [ "$(getent ahostsv4 demo.motionimprints.tech | awk 'NR==1{print $1}')" = "$IP" ] && \
   [ "$(getent ahostsv4 billing.motionimprints.tech | awk 'NR==1{print $1}')" = "$IP" ]; then
  echo "DNS for motionimprints.tech now points here: switching hostnames"
  PUBLIC_IP=$IP bash $S/02-configure.sh && vipers dc up -d crater-php crater-nginx
  PUBLIC_IP=$IP bash $S/03-edge.sh
fi
