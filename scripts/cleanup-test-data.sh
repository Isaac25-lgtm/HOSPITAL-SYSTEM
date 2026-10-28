#!/bin/bash
# Remove automated-test patients (family names Explore*/Wftest*/Mobtest*/Test*) so clients only see the demo dataset.
# OpenMRS: close their visits, cancel appointments, void the patient (reversible). Crater: delete customer + invoices/payments.
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || source /tmp/00-guard.sh
set +e
source /opt/vipers/secrets/vipers.env
A="superman:$OPENMRS_OWNER_PASSWORD"; API=https://127.0.0.1:8443/openmrs/ws/rest/v1
q() { curl -sk -u "$A" -H 'Content-Type: application/json' -H 'Accept: application/json' "$@"; }
RX='^(Wftest|Mobtest|Testdbjfd|Test)[a-j]*$'
NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000+0000)
for term in Wftest Mobtest Explore Test; do
  q "$API/patient?q=$term&v=custom:(uuid,display,person:(preferredName:(familyName)))&limit=100" | jq -r '.results[] | "\(.uuid)\t\(.person.preferredName.familyName)\t\(.display)"'
done | sort -u | while IFS=$'\t' read -r U FAM DISP; do
  [[ "$FAM" =~ $RX ]] || continue
  for V in $(q "$API/visit?patient=$U&includeInactive=false&v=custom:(uuid)" | jq -r '.results[].uuid'); do
    q -o /dev/null -d "{\"stopDatetime\":\"$NOW\"}" "$API/visit/$V"; done
  for AP in $(q -X POST -d "{\"patientUuid\":\"$U\"}" "$API/appointments/search" 2>/dev/null | jq -r '.[]?.uuid' 2>/dev/null); do
    q -o /dev/null -d '{"toStatus":"Cancelled"}' "$API/appointments/$AP/status-change"; done
  code=$(q -o /dev/null -w '%{http_code}' -X DELETE "$API/patient/$U?reason=automated%20test%20data")
  echo "voided test patient: $DISP ($code)"
done

# Crater
CR=https://127.0.0.1:8444/api/v1
TOKEN=$(curl -sk -H 'Accept: application/json' -H 'Content-Type: application/json' \
  -d "{\"username\":\"owner@vipers-hospital.test\",\"password\":\"$CRATER_OWNER_PASSWORD\",\"device_name\":\"cleanup\"}" "$CR/auth/login" | jq -r .token)
M() { docker exec -e MYSQL_PWD="$CRATER_DB_PASSWORD" bahmni-lite-craterdb-1 mysql -ucrater crater -N -e "$1" 2>&1 | grep -v Warning; }
IDS=$(M "select id from customers where name regexp '(Wftest|Mobtest|Testdbjfd)'" | paste -sd, -)
if [ -n "$IDS" ]; then
  curl -sk -H "Authorization: Bearer $TOKEN" -H 'company: 1' -H 'Accept: application/json' -H 'Content-Type: application/json' \
    -d "{\"ids\":[$IDS]}" "$CR/customers/delete" | jq -c '.' ; echo "deleted Crater test customers: $IDS"
fi
echo "Crater now: $(M 'select count(*) from customers') customers, $(M 'select count(*) from invoices') invoices"
