#!/bin/bash
# Data fixes from the 28 Oct 2026 end-to-end QA run (idempotent; safe to re-run).
#  - Billing payment modes: add Mobile Money, "Check" -> "Cheque" (Uganda spelling)
#  - One name for the malaria rapid test everywhere: billing item renamed; the concept's short
#    name "RDT malaria" (shown by Lab Entry) becomes a plain synonym, so Lab shows "Rapid test for malaria"
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || source /tmp/00-guard.sh
set +e
source /opt/vipers/secrets/vipers.env
M() { docker exec -e MYSQL_PWD="$CRATER_DB_PASSWORD" bahmni-lite-craterdb-1 mysql -ucrater crater -N -e "$1" 2>&1 | grep -v Warning; }
A="superman:$OPENMRS_OWNER_PASSWORD"; API=https://127.0.0.1:8443/openmrs/ws/rest/v1
q() { curl -sk -u "$A" -H 'Content-Type: application/json' -H 'Accept: application/json' "$@"; }

# Crater payment modes
M "update payment_methods set name='Cheque', updated_at=now() where name='Check' and company_id=1"
[ -z "$(M "select id from payment_methods where name='Mobile Money' and company_id=1")" ] &&
  M "insert into payment_methods (name, company_id, created_at, updated_at, type, active, use_test_env) values ('Mobile Money', 1, now(), now(), 'GENERAL', 0, 0)"
echo "payment modes: $(M "select group_concat(name order by id separator ', ') from payment_methods where company_id=1")"

# Crater price list item
M "update items set name='Rapid test for malaria (RDT)', updated_at=now() where name='Malaria RDT' and company_id=1"
echo "malaria items: $(M "select group_concat(name separator ', ') from items where name like '%alaria%'")"

# OpenMRS concept 1643 (Rapid test for malaria): short name -> synonym
C=1643AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
N=$(q "$API/concept/$C?v=custom:(names:(uuid,name,conceptNameType))" | jq -r '.names[] | select(.conceptNameType=="SHORT" and .name=="RDT malaria") | .uuid')
if [ -n "$N" ]; then
  code=$(q -o /dev/null -w '%{http_code}' -d '{"conceptNameType":null}' "$API/concept/$C/name/$N")
  echo "RDT malaria short name -> synonym: HTTP $code"
fi
q "$API/concept/$C?v=custom:(display,names:(name,conceptNameType))" | jq -c '.'
