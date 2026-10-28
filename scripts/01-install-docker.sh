#!/bin/bash
# Install Docker Engine + Compose plugin from Docker's official apt repo, add swap, cap container logs.
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || source /tmp/00-guard.sh

export DEBIAN_FRONTEND=noninteractive
timedatectl set-timezone Africa/Kampala

if ! command -v docker >/dev/null; then
  apt-get update -q
  apt-get install -yq ca-certificates curl git jq
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# Keep container logs from filling the disk
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "3" } }
EOF
systemctl enable --now docker
systemctl restart docker

# 4 GB swap as a safety net for OpenMRS start-up peaks
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 && echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
fi

docker --version
docker compose version
free -h | head -3
