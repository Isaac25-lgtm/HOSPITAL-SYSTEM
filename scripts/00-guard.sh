#!/bin/bash
# Sourced by every deployment script: refuse to run anywhere except a Linux server.
# Set VIPERS_EXPECTED_HOST to the server's hostname (default: the GCP demo VM).
set -euo pipefail
EXPECTED="${VIPERS_EXPECTED_HOST:-vipers-hospital-vm}"
if [ "$(uname -s)" != "Linux" ] || [ "$(hostname)" != "$EXPECTED" ]; then
  echo "ABORT: expected to run on '$EXPECTED' (Linux), but this is '$(hostname)' ($(uname -s))." >&2
  exit 1
fi
echo "[guard] running on $(hostname) - $(. /etc/os-release && echo "$PRETTY_NAME") - $(date '+%F %T %Z')"
