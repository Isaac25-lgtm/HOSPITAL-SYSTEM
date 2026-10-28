#!/bin/bash
# Create/repair VIPERS demo roles + accounts in OpenMRS. Idempotent; also run every 15 min by
# vipers-guard.timer so testers cannot lock others out by changing demo passwords or roles.
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || source /tmp/00-guard.sh >/dev/null
set +e
source /opt/vipers/secrets/vipers.env
A="superman:$OPENMRS_OWNER_PASSWORD"; API=https://127.0.0.1:8443/openmrs/ws/rest/v1
q() { curl -sk -u "$A" -H 'Content-Type: application/json' "$@"; }
QUIET="${QUIET:-0}"; say() { [ "$QUIET" = 1 ] || echo "$@"; }
[ "$(q "$API/session" | jq -r .authenticated)" = "true" ] || { echo "OpenMRS not ready"; exit 1; }

# ---- demo password policy (owner accounts keep strong random passwords) ----
gp() { local cur; cur=$(q "$API/systemsetting?q=$1&v=custom:(uuid,property,value)" | jq -r --arg p "$1" '.results[] | select(.property==$p) | .uuid + " " + (.value // "")');
  local uuid=${cur%% *} val=${cur#* }
  if [ -z "$uuid" ]; then q -o /dev/null -d "{\"property\":\"$1\",\"value\":\"$2\"}" "$API/systemsetting"; say "gp $1 created=$2";
  elif [ "$val" != "$2" ]; then q -o /dev/null -d "{\"value\":\"$2\"}" "$API/systemsetting/$uuid"; say "gp $1=$2"; fi; }
gp security.passwordMinimumLength 6
gp security.passwordRequiresUpperAndLowerCase false
gp security.passwordRequiresDigit false
gp security.passwordRequiresNonDigit true
gp security.passwordCannotMatchUsername true
gp security.userUnlockWaitTime 5

# ---- demo only: keep visits open across days so the seeded patients stay in the Active / Lab lists ----
# (real hospitals should keep "Close Stale Visits Task" running; re-enable with action STARTTASK)
if [ "${KEEP_VISITS_OPEN:-1}" = 1 ]; then
  q -o /dev/null -d '{"tasks":["Close Stale Visits Task"],"action":"SHUTDOWNTASK"}' "$API/taskaction"
fi

# ---- brand the login location ----
LOC=$(q "$API/location?q=Bahmni%20Clinic&v=custom:(uuid,name)" | jq -r '.results[] | select(.name=="Bahmni Clinic") | .uuid')
[ -n "$LOC" ] && q -o /dev/null -d '{"name":"VIPERS HOSPITAL"}' "$API/location/$LOC" && say "location 'Bahmni Clinic' renamed to 'VIPERS HOSPITAL'"

# ---- billing tile privilege ----
if [ -z "$(q "$API/privilege/app:billing" | jq -r '.uuid // empty')" ]; then
  q -o /dev/null -d '{"name":"app:billing","description":"VIPERS: shows the Billing (Crater) tile on the home page"}' "$API/privilege" && say "privilege app:billing created"
fi
# The 2.0 clinical dashboard's FHIR Appointment widget checks "Get Appointments", which this release
# never defines (only superusers pass). Define it so normal roles can be granted it.
# Same for the FHIR DocumentReference privileges used when saving patient documents in 2.0.
for P in "Get Appointments" "Get DocumentReference" "Add DocumentReference" "Edit DocumentReference" "Delete DocumentReference"; do
  if [ -z "$(q "$API/privilege/$(echo "$P" | sed 's/ /%20/g')" | jq -r '.uuid // empty')" ]; then
    q -o /dev/null -d "{\"name\":\"$P\",\"description\":\"VIPERS: FHIR privilege referenced by Bahmni 2.0 screens but not defined in this release\"}" "$API/privilege" && say "privilege $P created"
  fi
done
DOCS_WRITE='Get DocumentReference|Add DocumentReference|Edit DocumentReference'

# Demo roles are flattened copies of Bahmni's own roles (so the 2.0 screens get every API privilege
# they expect), minus the module tiles that role should not see. No System Developer / Full privilege.
ROLES_FULL=$(q "$API/role?v=custom:(uuid,display,privileges:(display),inheritedRoles:(display))&limit=200")
ruuid() { echo "$ROLES_FULL" | jq -r --arg n "$1" '.results[] | select(.display==$n) | .uuid'; }
flat() {  # flat "RoleA|RoleB" -> JSON array of all privileges (recursive)
  echo "$ROLES_FULL" | jq -c --arg roles "$1" '
    (.results | map({key: .display, value: {p: [.privileges[].display], i: [.inheritedRoles[]?.display]}}) | from_entries) as $R
    | def f($n; $seen): if ($seen | index($n)) then [] else ($R[$n].p // []) + ([$R[$n].i[]? | f(.; $seen + [$n])] | add // []) end;
    [$roles | split("|")[] | f(.; [])] | add | unique'
}
FORBIDDEN='["System Developer","Privilege Level: Full"]'
role() {  # role NAME "desc" "BaseRole1|BaseRole2" "remove1|remove2" "add1|add2"
  local name="$1" desc="$2"
  local privs; privs=$(jq -nc --argjson base "$(flat "$3")" --arg rm "$4" --arg add "$5" \
    '($base - ($rm | split("|"))) + ($add | split("|") | map(select(length>0))) | unique')
  local body; body=$(jq -nc --arg n "$name" --arg d "$desc" --argjson p "$privs" '{name:$n,description:$d,inheritedRoles:[],privileges:$p}')
  local u; u=$(ruuid "$name")
  if [ -z "$u" ]; then q -o /dev/null -w "role $name created: %{http_code}\n" -d "$body" "$API/role" | { [ "$QUIET" = 1 ] && cat >/dev/null || cat; }
  else q -o /dev/null -w "role $name updated: %{http_code} ($(echo "$privs" | jq length) privileges)\n" -d "$(echo "$body" | jq -c 'del(.name)')" "$API/role/$u" | { [ "$QUIET" = 1 ] && cat >/dev/null || cat; }; fi
}
DOCTOR_READS=$(flat "SuperAdmin" | jq -r 'map(select(startswith("Get ") or startswith("View "))) + ["Get Appointments"] | unique | join("|")')  # read-only; the 2.0 dashboards need e.g. Get Allergies / Get Appointments
# 2.0 consultation pad sections are gated by these (absent from the stock Doctor role in this release)
CLIN_WRITE='Add Allergies|Edit Allergies|Remove Allergies|Task: Modify Allergies|Add Diagnoses|Edit Diagnoses|Delete Diagnoses|Add Conditions|Edit Conditions|Edit Encounters|Edit Observations|Edit Notes|Edit Immunizations'
LAB_WRITE='Add Diagnostic Report|Edit Diagnostic Report|Add Observations|Edit Observations|Add Encounters|Edit Encounters|Edit Orders'
role "VIPERS Receptionist" "Demo: registration, visits, appointments, documents" "FrontDesk" "app:lab-lite|app:reports|app:appointments:adminTab" "$DOCTOR_READS|$DOCS_WRITE"
role "VIPERS Doctor" "Demo: consultations, vitals, diagnoses, prescriptions, lab orders, inpatients" "Doctor|InPatient-App" "app:admin|app:lab-lite|app:appointments:adminTab" "$DOCTOR_READS|$CLIN_WRITE|$DOCS_WRITE"
role "VIPERS Lab Technician" "Demo: lab work queue and result entry" "Lab|Registration-App-Read-Only|Clinical-App-Save|Provider" "" "$DOCTOR_READS|$LAB_WRITE"
role "VIPERS Cashier" "Demo: patient lookup + Billing tile (billing itself is in Crater)" "Registration-App-Read-Only" "" "app:billing"
role "VIPERS Demo Admin" "Demo: client-facing administration; no infrastructure privileges" "Admin-App|InPatient-App|Implementer-Interface-App|Reports-App|Registration-App-Read-Only|Clinical-App-Read-Only|Appointments:FullAccess|PatientDocuments-App" "" "app:billing|$DOCTOR_READS|$DOCS_WRITE|app:appointments:manageServices|app:appointments:manageServiceAvailability|Manage Appointment Services|Manage Appointment Specialities"
role "VIPERS Ward Nurse" "Demo: admissions, bed allocation, transfers, discharges, vital signs" "InPatient-App|Registration-App-Read-Only|Clinical-App-Read-Only|Clinical-App-Observations|Provider" "app:lab-lite" "$DOCTOR_READS|Add Visits|Edit Visits|Add Encounters|Edit Encounters|Add Observations|Edit Observations|Assign Beds|Get Beds|Get Admission Locations"
ROLES_FULL=$(q "$API/role?v=custom:(uuid,display,privileges:(display),inheritedRoles:(display))&limit=200")
for r in "VIPERS Receptionist" "VIPERS Doctor" "VIPERS Lab Technician" "VIPERS Cashier" "VIPERS Demo Admin" "VIPERS Ward Nurse"; do
  bad=$(echo "$ROLES_FULL" | jq -r --arg n "$r" --argjson f "$FORBIDDEN" '.results[] | select(.display==$n) | [.privileges[].display] as $p | $f | map(select(. as $x | $p | index($x))) | join(",")')
  [ -n "$bad" ] && echo "WARNING: $r has forbidden privilege(s): $bad"
done

# ---- users ----
user() {  # user USERNAME PASSWORD GIVEN FAMILY GENDER ROLE
  local un="$1" pw="$2" gn="$3" fn="$4" g="$5" rl="$6"
  local rj; rj=$(jq -nc --arg r "$(ruuid "$rl")" '[$r]')
  local u; u=$(q "$API/user?username=$un&v=custom:(uuid,username,retired,person:(uuid))" | jq -r --arg u "$un" '.results[] | select(.username==$u) | .uuid + " " + .person.uuid')
  if [ -z "$u" ]; then
    local body; body=$(jq -nc --arg un "$un" --arg pw "$pw" --arg gn "$gn" --arg fn "$fn" --arg g "$g" --argjson r "$rj" \
      '{username:$un,password:$pw,person:{names:[{givenName:$gn,familyName:$fn}],gender:$g},roles:$r}')
    q -o /dev/null -w "user $un created: %{http_code}\n" -d "$body" "$API/user"
    u=$(q "$API/user?username=$un&v=custom:(uuid,username,person:(uuid))" | jq -r --arg u "$un" '.results[] | select(.username==$u) | .uuid + " " + .person.uuid')
  else
    # repair: un-retire, roles, password (only if changed)
    q -o /dev/null -d "{\"roles\":$rj,\"retired\":false}" "$API/user/${u%% *}"
    [ "$(curl -sk -u "$un:$pw" "$API/session" | jq -r .authenticated)" = "true" ] || { q -o /dev/null -d "{\"newPassword\":\"$pw\"}" "$API/password/${u%% *}"; say "user $un password restored"; }
  fi
  local person=${u#* }
  if [ -z "$(q "$API/provider?user=${u%% *}&v=custom:(uuid,person:(uuid))" | jq -r --arg p "$person" '.results[] | select(.person.uuid==$p) | .uuid')" ] && \
     [ -z "$(q "$API/provider?q=$un&v=custom:(uuid,identifier)" | jq -r --arg i "$un" '.results[] | select(.identifier==$i) | .uuid')" ]; then
    q -o /dev/null -w "provider $un: %{http_code}\n" -d "{\"person\":\"$person\",\"identifier\":\"$un\"}" "$API/provider"
  fi
}
user demo.reception liverpool Demo Receptionist F "VIPERS Receptionist"
user demo.doctor    arsenal   Demo Doctor        M "VIPERS Doctor"
user demo.lab       chelsea   Demo "Lab Technician" F "VIPERS Lab Technician"
user demo.cashier   everton   Demo Cashier       M "VIPERS Cashier"
user demo.admin     fulham    Demo Administrator F "VIPERS Demo Admin"
user demo.nurse     brighton  Demo "Ward Nurse"   F "VIPERS Ward Nurse"

for p in "demo.reception liverpool" "demo.doctor arsenal" "demo.lab chelsea" "demo.cashier everton" "demo.admin fulham" "demo.nurse brighton"; do
  set -- $p; ok=$(curl -sk -u "$1:$2" "$API/session" | jq -r .authenticated)
  [ "$ok" = true ] && say "login check $1: OK" || echo "login check $1: FAILED"
done
