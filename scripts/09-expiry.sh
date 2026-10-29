#!/bin/bash
# One-time end of the 10-day demo: final backup, then power off the VM (stops compute charges and public access).
#   EXPIRY="2026-11-04 08:47" bash 09-expiry.sh        # install / move the timer (time is Africa/Kampala)
#   systemctl disable --now vipers-expiry.timer         # cancel (extend the demo)
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || source /tmp/00-guard.sh
# maintenance lock FIRST, profile check SECOND: a job queued behind the production switch must see the marker it wrote
# (a caller that already holds the lock, e.g. the guard, exports VIPERS_OPS_LOCK_HELD=1)
[ "${VIPERS_OPS_LOCK_HELD:-}" = 1 ] || { exec 9>"${VIPERS_OPS_LOCK:-/run/vipers-ops.lock}"; flock -w 600 9 || { echo "another maintenance job is running"; exit 1; }; export VIPERS_OPS_LOCK_HELD=1; }
# a server switched to production mode (scripts/production-mode.sh) never runs demo tooling
[ "$(cat "${VIPERS_PROFILE_FILE:-/opt/vipers/profile}" 2>/dev/null)" = production ] && { echo "refusing: production server (no demo accounts, demo reset or demo expiry)"; exit 1; }
set -e
EXPIRY="${EXPIRY:?set EXPIRY=\"YYYY-MM-DD HH:MM\" (Africa/Kampala)}"
cat > /etc/systemd/system/vipers-expiry.service <<'EOF'
[Unit]
Description=VIPERS HOSPITAL demo expiry: final backup, then power off
[Service]
Type=oneshot
Environment=VIPERS_EXPECTED_HOST=%H
ExecStart=/bin/bash -c '/opt/vipers/scripts/backup.sh final-$(date +%%Y%%m%%d) >/var/log/vipers-expiry.log 2>&1; /usr/sbin/shutdown -h +1 "VIPERS demo period ended"'
EOF
cat > /etc/systemd/system/vipers-expiry.timer <<EOF
[Unit]
Description=VIPERS HOSPITAL demo expiry at $EXPIRY EAT
[Timer]
OnCalendar=$EXPIRY:00 Africa/Kampala
Persistent=false
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now vipers-expiry.timer
systemctl list-timers vipers-expiry.timer --all | head -2
