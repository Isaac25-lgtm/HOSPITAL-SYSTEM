#!/bin/bash
# Fetch the official Bahmni Lite 2.0.0-lite release onto this server and download its images
# (OpenMRS overridden to the security-patched 2.0.1). Run on the server, not on a PC.
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || source /tmp/00-guard.sh
set -e
TAG=2.0.0-lite
mkdir -p /opt/vipers && cd /opt/vipers
[ -d bahmni-docker ] || git clone -q --branch $TAG --depth 1 https://github.com/Bahmni/bahmni-docker.git
cd bahmni-docker && echo "release $(git describe --tags 2>/dev/null || echo $TAG) commit $(git rev-parse HEAD)"
cd bahmni-lite
OPENMRS_IMAGE_TAG=2.0.1 docker compose --env-file .env --profile bahmni-lite pull --quiet
docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -E 'bahmni/openmrs:2.0.1' && echo "images ready"
