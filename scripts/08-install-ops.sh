#!/bin/bash
# Install VIPERS operational scripts + systemd timers (guard every 15 min, nightly backup).
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || source /tmp/00-guard.sh
set -e
mkdir -p /opt/vipers/scripts
tar -xzf /tmp/scripts.tgz -C /opt/vipers/scripts
sed -i -e 's/\r$//' -e '1s/^\xEF\xBB\xBF//' /opt/vipers/scripts/*.sh /opt/vipers/scripts/*.php /opt/vipers/scripts/*.yml
chmod 750 /opt/vipers/scripts/*.sh
install -m 755 /opt/vipers/scripts/vipers.sh /usr/local/bin/vipers

cat > /etc/systemd/system/vipers-guard.service <<'EOF'
[Unit]
Description=VIPERS HOSPITAL demo guard (self-heal accounts, restart services, DNS switch)
After=docker.service
[Service]
Type=oneshot
ExecStart=/bin/bash /opt/vipers/scripts/guard.sh
EOF
cat > /etc/systemd/system/vipers-guard.timer <<'EOF'
[Unit]
Description=Run VIPERS guard every 15 minutes
[Timer]
OnBootSec=8min
OnUnitActiveSec=15min
[Install]
WantedBy=timers.target
EOF
cat > /etc/systemd/system/vipers-backup.service <<'EOF'
[Unit]
Description=VIPERS HOSPITAL nightly backup (keeps 3)
[Service]
Type=oneshot
Environment=VIPERS_EXPECTED_HOST=%H
ExecStart=/bin/bash -c '/opt/vipers/scripts/backup.sh nightly-$(date +%%a) >/var/log/vipers-backup.log 2>&1'
EOF
cat > /etc/systemd/system/vipers-backup.timer <<'EOF'
[Unit]
Description=Nightly VIPERS backup at 02:30 EAT
[Timer]
OnCalendar=*-*-* 02:30:00 Africa/Kampala
Persistent=true
[Install]
WantedBy=timers.target
EOF
# docker must start on boot; containers use restart policies
systemctl enable docker >/dev/null
systemctl daemon-reload
systemctl enable --now vipers-guard.timer vipers-backup.timer
cat > /etc/logrotate.d/vipers <<'EOF'
/var/log/vipers-*.log { weekly rotate 4 compress missingok notifempty }
EOF
systemctl list-timers --all | grep vipers
