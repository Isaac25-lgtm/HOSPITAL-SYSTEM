#!/bin/bash
# Installed in the golden image; must succeed BEFORE Docker can start.
set -euo pipefail
ACTION=${1:?block or unblock}
[[ "$ACTION" = block || "$ACTION" = unblock ]] || exit 2
IFACE=$(ip -4 route show default | awk 'NR==1{print $5}')
[[ -n "$IFACE" ]] || { echo 'no ingress interface'; exit 1; }
for tool in iptables ip6tables; do
  command -v "$tool" >/dev/null || exit 1
  # One private chain; the hooks precede Docker forwarding rules and cover QUIC too.
  "$tool" -w -N VIPERS-BOOT 2>/dev/null || "$tool" -w -S VIPERS-BOOT >/dev/null
  # Docker puts its own FORWARD jumps above ours when it starts, so FORWARD alone does not hold. DOCKER-USER is the
  # chain Docker always evaluates first and never rewrites: create it before Docker starts and hook it there too.
  "$tool" -w -N DOCKER-USER 2>/dev/null || "$tool" -w -S DOCKER-USER >/dev/null
  for chain in INPUT FORWARD DOCKER-USER; do
    if [[ "$ACTION" = block ]]; then
      "$tool" -w -C "$chain" -i "$IFACE" -j VIPERS-BOOT 2>/dev/null || "$tool" -w -I "$chain" 1 -i "$IFACE" -j VIPERS-BOOT
    else
      while "$tool" -w -C "$chain" -i "$IFACE" -j VIPERS-BOOT 2>/dev/null; do
        "$tool" -w -D "$chain" -i "$IFACE" -j VIPERS-BOOT
      done
    fi
  done
  if [[ "$ACTION" = block ]]; then
    for proto in tcp udp; do
      "$tool" -w -C VIPERS-BOOT -p "$proto" -m multiport --dports 80,443 -j DROP 2>/dev/null ||
        "$tool" -w -A VIPERS-BOOT -p "$proto" -m multiport --dports 80,443 -j DROP
    done
    for chain in INPUT FORWARD DOCKER-USER; do "$tool" -w -C "$chain" -i "$IFACE" -j VIPERS-BOOT; done
  fi
done
