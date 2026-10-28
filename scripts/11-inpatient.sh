#!/bin/bash
# Enable inpatient care (admissions, wards, beds, transfers, discharges) in VIPERS HOSPITAL. Idempotent.
# Bahmni Lite 2.0 ships the IPD + Bed Management modules, the InPatient-App role and the ADT web app,
# but no wards, beds, IPD visit type, ADT configuration or Home tile. This adds them.
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || source /tmp/00-guard.sh
set +e
source /opt/vipers/secrets/vipers.env
A="superman:$OPENMRS_OWNER_PASSWORD"; API=https://127.0.0.1:8443/openmrs/ws/rest/v1
q() { curl -sk -u "$A" -H 'Content-Type: application/json' -H 'Accept: application/json' "$@"; }
enc() { jq -rn --arg s "$1" '$s|@uri'; }

# ---- visit type IPD (the ADT app's default for admissions) ----
if [ -z "$(q "$API/visittype?q=IPD&v=custom:(uuid,name)" | jq -r '.results[] | select(.name=="IPD") | .uuid')" ]; then
  q -o /dev/null -w "visit type IPD: %{http_code}\n" -d '{"name":"IPD","description":"Inpatient (admitted) visit"}' "$API/visittype"
fi

# ---- location tag + wards ----
if [ -z "$(q "$API/locationtag?q=Admission%20Location&v=custom:(uuid,name)" | jq -r '.results[] | select(.name=="Admission Location") | .uuid')" ]; then
  q -o /dev/null -w "location tag Admission Location: %{http_code}\n" -d '{"name":"Admission Location","description":"Ward where patients can be admitted"}' "$API/locationtag"
fi
TAG=$(q "$API/locationtag?q=Admission%20Location&v=custom:(uuid,name)" | jq -r '.results[] | select(.name=="Admission Location") | .uuid')
HOSP=$(q "$API/location?q=VIPERS%20HOSPITAL&v=custom:(uuid,name)" | jq -r '.results[] | select(.name=="VIPERS HOSPITAL") | .uuid')
[ -n "$HOSP" ] || { echo "VIPERS HOSPITAL location not found"; exit 1; }

# bed type used for all demo beds (display name max 10 characters)
if [ "$(q "$API/bedtype?v=custom:(name)" | jq -r '[.results[]? | select(.name=="standard")] | length')" = "0" ]; then
  q -o /dev/null -w "bed type standard: %{http_code}\n" -d '{"name":"standard","displayName":"Standard","description":"Standard ward bed"}' "$API/bedtype"
fi

# ward NAME PREFIX ROWS COLUMNS
ward() {
  local name="$1" pre="$2" rows="$3" cols="$4" u
  u=$(q "$API/location?q=$(enc "$name")&v=custom:(uuid,name)" | jq -r --arg n "$name" '.results[] | select(.name==$n) | .uuid')
  if [ -z "$u" ]; then
    u=$(q -d "$(jq -nc --arg n "$name" --arg p "$HOSP" --arg t "$TAG" '{name:$n,description:"VIPERS HOSPITAL ward",parentLocation:$p,tags:[$t]}')" "$API/location" | jq -r '.uuid')
    echo "ward $name created: $u"
  fi
  # beds: create each expected bed that is missing (an interrupted earlier run is completed, never duplicated)
  local existing; existing=$(q "$API/admissionLocation/$u?v=full" | jq -r '.bedLayouts[]? | select(.bedNumber != null) | .bedNumber')
  local n=0 r c b
  for r in $(seq 1 "$rows"); do for c in $(seq 1 "$cols"); do
    n=$((n + 1)); b=$(printf '%s%02d' "$pre" "$n")
    grep -qx "$b" <<<"$existing" && continue
    local resp; resp=$(q -d "$(jq -nc --arg b "$b" --argjson r "$r" --argjson c "$c" --arg l "$u" \
      '{bedNumber:$b,bedType:"standard",row:$r,column:$c,locationUuid:$l,status:"AVAILABLE"}')" "$API/bed")
    echo "  bed $b: $(echo "$resp" | jq -r '.uuid // .error.message' 2>/dev/null | head -c 120)"
  done; done
  local got; got=$(q "$API/admissionLocation/$u?v=full" | jq '[.bedLayouts[]? | select(.bedNumber != null)] | length')
  echo "ward $name: $got beds"
  [ "$got" -ge $((rows * cols)) ] || { echo "FAIL: ward $name has $got of $((rows * cols)) beds"; BEDS_FAILED=1; }
}
ward "Female Ward"     FW 2 5
ward "Male Ward"       MW 2 5
ward "Maternity Ward"  MT 2 3
ward "Paediatric Ward" PW 2 3

# ---- ADT app configuration + Home tiles (config overlay = survives restarts; volume = live now) ----
V=/var/lib/docker/volumes/bahmni-lite_bahmni-config/_data/openmrs
O=/opt/vipers/branding/config-overlay/openmrs
SRC=/opt/vipers/branding/adt-src   # reviewed ADT configuration (the kit's copy; never a moving upstream branch)
KIT_OV="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)/config-overlay/openmrs"
mkdir -p $SRC
for f in apps/adt/app.json apps/adt/extension.json i18n/adt/locale_en.json; do
  if [ -s "$KIT_OV/$f" ]; then install -m 644 "$KIT_OV/$f" "$SRC/$(basename $f)"; fi
done
for f in app.json extension.json locale_en.json; do [ -s "$SRC/$f" ] || { echo "ADT configuration $f missing (expected in the kit's config-overlay)"; exit 1; }; done
mkdir -p $O/apps/adt
# vitals: the 2.0 Vitals form records individual concepts (no "Vitals" set); admission closes the OPD visit,
# so show the previous visit too (otherwise the doctor's vitals and diagnosis look missing on the ward)
jq '.config.dashboard.sections.patientInformation.patientAttributes = ["phoneNumber"]
    | .config.dashboard.sections.patientInformation.addressFields = ["cityVillage"]
    | .config.dashboard.sections.vitals.dashboardConfig.conceptNames = ["Pulse","Temperature","Blood Pressure","Respiratory rate","Arterial blood oxygen saturation (pulse oximeter)"]
    | .config.dashboard.sections.vitals.dashboardConfig.numberOfVisits = 2
    | .config.dashboard.sections.diagnosis.numberOfVisits = 2
    | .config.enableIPDFeature = false' $SRC/app.json > $O/apps/adt/app.json
# enableIPDFeature points the ward screens at the IPD "care view" micro-frontend (/ipd/remoteEntry.js), which Bahmni Lite
# does not ship: the screen would spin forever. Off = the classic ward screens (admit, beds, transfer, discharge).
cp $SRC/extension.json $O/apps/adt/extension.json
for f in v2/extension.json extension.json; do
  url=$([ "$f" = extension.json ] && echo "../adt/#/patient/search" || echo "/bahmni/adt/#/patient/search")
  jq --arg url "$url" '.adt = {id:"bahmni.adt", extensionPointId:"org.bahmni.home.dashboard", type:"link",
      translationKey:"MODULE_LABEL_INPATIENT_KEY", url:$url, icon:"fa-bed", order:4, requiredPrivilege:"app:adt"}' \
    $O/apps/home/$f > /tmp/home-ext.json && install -m 644 /tmp/home-ext.json $O/apps/home/$f
done
mkdir -p $V/apps/adt
install -m 644 $O/apps/adt/app.json $O/apps/adt/extension.json $V/apps/adt/
mkdir -p $O/i18n/adt $V/i18n/adt
install -m 644 $SRC/locale_en.json $O/i18n/adt/locale_en.json
install -m 644 $SRC/locale_en.json $V/i18n/adt/locale_en.json
install -m 644 $O/apps/home/extension.json $V/apps/home/extension.json
install -m 644 $O/apps/home/v2/extension.json $V/apps/home/v2/extension.json
echo "ADT config + In-Patient tile installed"
exit ${BEDS_FAILED:-0}
