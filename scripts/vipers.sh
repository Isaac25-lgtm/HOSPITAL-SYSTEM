#!/bin/bash
# VIPERS HOSPITAL server management (installed as /usr/local/bin/vipers on the VM).
#   vipers up | down | restart [svc] | ps | logs [svc] | health | pull
set -euo pipefail
cd /opt/vipers/bahmni-docker/bahmni-lite
DC=(docker compose --env-file .env.vipers -f docker-compose.yml -f docker-compose.vipers.yml)
[ -f docker-compose.edge.yml ] && DC+=(-f docker-compose.edge.yml)

case "${1:-ps}" in
  up)      # refuse to start with a missing or wrong-type mount source (Docker would silently create a directory)
           for m in /opt/vipers/branding/crater-nginx.conf /opt/vipers/branding/bahmni-reports.properties.template; do
             [ -f "$m" ] && [ -s "$m" ] || { echo "ABORT: $m is missing or not a file - run stage-mounts.sh (02-configure.sh does)"; exit 1; }
           done
           "${DC[@]}" up -d --remove-orphans; rm -f /opt/vipers/maintenance ;;
  down)    touch /opt/vipers/maintenance; "${DC[@]}" stop ;;                       # stop only: never removes volumes
  restart) shift; "${DC[@]}" restart "$@" ;;
  ps)      "${DC[@]}" ps --format 'table {{.Service}}\t{{.Status}}' ;;
  logs)    shift; "${DC[@]}" logs --tail=200 -f "$@" ;;
  pull)    "${DC[@]}" pull ;;
  config)  "${DC[@]}" config ;;
  dc)      shift; "${DC[@]}" "$@" ;;
  health)
    "${DC[@]}" ps --format 'table {{.Service}}\t{{.Status}}'
    echo; free -h | head -2; df -h / | tail -1
    echo; docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' | sort -k3 -h -r | head -25
    echo; printf 'OpenMRS session API: '; curl -sk -o /dev/null -w '%{http_code}\n' https://127.0.0.1:8443/openmrs/ws/rest/v1/session
    printf 'Bahmni home:         '; curl -sk -o /dev/null -w '%{http_code}\n' https://127.0.0.1:8443/bahmni/home/
    printf 'Crater:              '; curl -sk -o /dev/null -w '%{http_code}\n' https://127.0.0.1:8444/login
    ;;
  *) echo "usage: vipers up|down|restart [svc]|ps|logs [svc]|health|pull|config|dc <args>"; exit 1 ;;
esac
