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
for file in trial-firewall.sh auth-check.sh; do [ -s "$S/$file" ] || { echo "$S/$file is missing or empty"; exit 1; }; done
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
# prove the quarantine exists (an empty or broken script must fail the seal, so Docker cannot start)
# (exact rules: TCP and UDP drops on 80,443 and ingress-interface hooks in INPUT, FORWARD and DOCKER-USER, IPv4 and IPv6;
#  "$$" is systemd's escape for a literal "$")
ExecStartPost=/bin/sh -c 'IF=$$(ip -4 route show default | awk "NR==1{print \$$5}"); [ -n "$$IF" ] || exit 1; for t in iptables ip6tables; do for p in tcp udp; do $$t -w -C VIPERS-BOOT -p $$p -m multiport --dports 80,443 -j DROP || exit 1; done; for c in INPUT FORWARD DOCKER-USER; do $$t -w -C $$c -i $$IF -j VIPERS-BOOT || exit 1; done; done'
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/docker.service.d/vipers-seal.conf <<'EOF'
[Unit]
Requires=vipers-boot-seal.service
After=vipers-boot-seal.service
EOF
# flush the unit files to disk now: a crash/reset before writeback would leave them empty and Docker unsealed
sync
[ -s /etc/systemd/system/vipers-boot-seal.service ] && [ -s /etc/systemd/system/docker.service.d/vipers-seal.conf ] || { echo 'seal unit files empty'; exit 1; }
systemctl daemon-reload
systemctl enable vipers-boot-seal.service
bash "$S/trial-firewall.sh" block
systemctl start vipers-boot-seal.service
systemctl is-active --quiet vipers-boot-seal.service
touch /opt/vipers/boot-seal-v1
sync
echo 'Quarantine installed. Reboot/probe this builder, stop it, capture image, then label the VERIFIED image vipers-boot-sealed=v1.'
