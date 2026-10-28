#!/bin/bash
# Build the VIPERS config overlay from the release's own config files, and make the bahmni-config
# container apply it after every restart (the container re-copies its defaults on start).
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || source /tmp/00-guard.sh
set -e
SRC=/var/lib/docker/volumes/bahmni-lite_bahmni-config/_data/openmrs/apps
OV=/opt/vipers/branding/config-overlay/openmrs/apps
PUB=/opt/vipers/edge/addons/public
mkdir -p $OV/home $OV/registration/registrationCardLayout/images $OV/customDisplayControl/images

# Use pristine release copies (taken once) as the base, so re-runs never compound edits.
BASE=/opt/vipers/branding/release-base; mkdir -p $BASE
[ -f $BASE/whiteLabel.json ] || cp $SRC/home/whiteLabel.json $BASE/whiteLabel.json
[ -f $BASE/extension.json ]  || cp $SRC/home/extension.json  $BASE/extension.json

jq '.homePage.header_text = "<b>WELCOME TO<br />VIPERS HOSPITAL</b>"
  | .homePage.logo = "/bahmni_config/openmrs/apps/home/vipers-logo.png"
  | .loginPage.logo = "/bahmni_config/openmrs/apps/home/vipers-logo.png"
  | .helpLink.url = "/vipers-assets/help.html"
  | .landingPage |= map(
      if .name == "crater" then (del(.linkPrefix) | .link = "/vipers-gate/to-billing" | .title = "Billing & Payments")
      elif .name == "metabase" then .enabled = false
      elif .name == "clinicalService" then .title = "VIPERS HOSPITAL EMR"
      else . end)' $BASE/whiteLabel.json > $OV/home/whiteLabel.json

jq 'del(.atomfeedConsole)
  | .vipersBilling = {
      id: "vipers.billing", extensionPointId: "org.bahmni.home.dashboard", type: "link",
      label: "Billing", translationKey: "Billing", url: "/vipers-gate/to-billing",
      icon: "fa fa-money", order: 10, requiredPrivilege: "app:billing" }' $BASE/extension.json > $OV/home/extension.json

# Bahmni 2.0 React home reads home/v2/extension.json (Font Awesome 6 icon names)
mkdir -p $OV/home/v2
[ -f $BASE/extension-v2.json ] || cp $SRC/home/v2/extension.json $BASE/extension-v2.json
jq 'del(.atomfeedConsole)
  | .vipersBilling = {
      id: "vipers.billing", extensionPointId: "org.bahmni.home.dashboard", type: "link",
      translationKey: "Billing", url: "/vipers-gate/to-billing",
      icon: "fa-file-invoice-dollar", order: 10, requiredPrivilege: "app:billing" }' $BASE/extension-v2.json > $OV/home/v2/extension.json

cp $PUB/vipers-logo.png $OV/home/vipers-logo.png
cp $PUB/vipers-logo.png $OV/home/logo.png
cp $PUB/vipers-logo.png $OV/registration/registrationCardLayout/images/bahmniLogo.png
cp $PUB/vipers-logo.png $OV/customDisplayControl/images/bahmniLogo.png

# Compose override: apply the overlay after the stock copy, on every start.
OVR=/opt/vipers/bahmni-docker/bahmni-lite/docker-compose.vipers.yml
if ! grep -q vipers_overlay $OVR; then
cat >> $OVR <<'EOF'

  bahmni-config:
    volumes:
      - /opt/vipers/branding/config-overlay:/etc/vipers_overlay:ro
    entrypoint: ["/bin/sh", "-c", "cp -r /etc/bahmni_config /usr/local/ && cp -r /etc/vipers_overlay/. /usr/local/bahmni_config/ && echo 'VIPERS overlay applied' && exec sleep infinity"]
EOF
fi
cp $OVR /opt/vipers/branding/docker-compose.vipers.yml.applied
vipers dc up -d bahmni-config 2>&1 | grep -E 'Started|Recreated|Error' || true
sleep 4
docker logs --tail 2 bahmni-lite-bahmni-config-1
jq -r '.homePage.header_text, .loginPage.logo, (.landingPage[] | "\(.name) enabled=\(.enabled) \(.link // .linkPrefix)")' $SRC/home/whiteLabel.json
jq -r 'keys | join(", ")' $SRC/home/extension.json
