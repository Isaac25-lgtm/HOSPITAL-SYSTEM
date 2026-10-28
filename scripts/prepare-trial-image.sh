#!/bin/bash
# Run ONLY on a disposable image-builder VM, never the live demo/controller.
source "$(dirname "$0")/00-guard.sh"
[[ "${VIPERS_IMAGE_BUILDER:-}" = 1 ]] || { echo 'Set VIPERS_IMAGE_BUILDER=1 on the disposable image builder'; exit 1; }
S=/opt/vipers/scripts
mkdir -p "$S"
for file in trial-firewall.sh auth-check.sh; do
  if [[ "$(readlink -f "$(dirname "$0")/$file")" != "$(readlink -f "$S/$file")" ]]; then
    install -m 750 "$(dirname "$0")/$file" "$S/$file"
  fi
done
mkdir -p /etc/systemd/system/docker.service.d
cat > /etc/systemd/system/vipers-boot-seal.service <<'EOF'
[Unit]
Description=Quarantine trial web ingress before Docker
Wants=network-online.target
After=network-online.target
Before=docker.service
[Service]
Type=oneshot
ExecStart=/bin/bash /opt/vipers/scripts/trial-firewall.sh block
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/docker.service.d/vipers-seal.conf <<'EOF'
[Unit]
Requires=vipers-boot-seal.service
After=vipers-boot-seal.service
EOF
systemctl daemon-reload
systemctl enable vipers-boot-seal.service
bash "$S/trial-firewall.sh" block
systemctl start vipers-boot-seal.service
systemctl is-active --quiet vipers-boot-seal.service
touch /opt/vipers/boot-seal-v1
echo 'Quarantine installed. Reboot/probe this builder, stop it, capture image, then label the VERIFIED image vipers-boot-sealed=v1.'
