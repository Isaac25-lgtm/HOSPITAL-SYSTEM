#!/bin/bash
# Configure Crater (billing) for VIPERS HOSPITAL: UGX, Kampala time, logo, cashier role + demo user, service price list.
source "$(dirname "$0")/00-guard.sh" 2>/dev/null || source /tmp/00-guard.sh
set +e
source /opt/vipers/secrets/vipers.env
M() { docker exec -e MYSQL_PWD="$CRATER_DB_PASSWORD" bahmni-lite-craterdb-1 mysql -ucrater crater -N -e "$1" 2>&1 | grep -v Warning; }
CR=https://127.0.0.1:8444/api/v1
TOKEN=$(curl -sk -H 'Accept: application/json' -H 'Content-Type: application/json' \
  -d "{\"username\":\"owner@vipers-hospital.test\",\"password\":\"$CRATER_OWNER_PASSWORD\",\"device_name\":\"vipers-setup\"}" "$CR/auth/login" | jq -r .token)
[ -n "$TOKEN" ] && [ "$TOKEN" != null ] || { echo "Crater login failed"; exit 1; }
api() { curl -sk -H "Authorization: Bearer $TOKEN" -H 'company: 1' -H 'Accept: application/json' -H 'Content-Type: application/json' "$@"; }

# 1. Uganda Shilling (not in Crater's seed list). UGX has no minor unit in practice.
if [ -z "$(M "select id from currencies where code='UGX'")" ]; then
  M "insert into currencies (name,code,symbol,\`precision\`,thousand_separator,decimal_separator,swap_currency_symbol,created_at,updated_at) values ('Uganda Shilling','UGX','USh ',0,',','.',0,now(),now());"
  echo "UGX currency added"
fi
# The Bahmni->Crater patient sync (crater-atomfeed) hard-codes crater.currency.id=13 for new
# customers (13 = INR in Crater's seed). Make row 13 the Uganda Shilling by swapping the two rows,
# so synced patients are billed in UGX without patching upstream code.
if [ "$(M "select code from currencies where id=13")" != "UGX" ]; then
  OLD=$(M "select id from currencies where code='UGX'")
  docker exec -i -e MYSQL_PWD="$CRATER_DB_PASSWORD" bahmni-lite-craterdb-1 mysql -ucrater crater <<SQL 2>&1 | grep -v Warning
CREATE TEMPORARY TABLE t AS SELECT * FROM currencies WHERE id IN (13,$OLD);
UPDATE currencies c JOIN t ON t.id = IF(c.id=13,$OLD,13)
  SET c.name=t.name, c.code=t.code, c.symbol=t.symbol, c.\`precision\`=t.\`precision\`,
      c.thousand_separator=t.thousand_separator, c.decimal_separator=t.decimal_separator,
      c.swap_currency_symbol=t.swap_currency_symbol
  WHERE c.id IN (13,$OLD);
UPDATE items SET currency_id=13 WHERE currency_id=$OLD;
UPDATE customers SET currency_id=13 WHERE currency_id=$OLD;
UPDATE company_settings SET value='13' WHERE \`option\`='currency' AND value='$OLD';
SQL
  echo "currency rows swapped: id 13 is now UGX"
fi
UGX=$(M "select id from currencies where code='UGX'")

# 2. Company settings (currency is locked once invoices/items exist, so only set it once)
[ "$(M "select value from company_settings where \`option\`='currency' and company_id=1")" = "$UGX" ] && echo "settings: already UGX" || \
echo "settings: $(api -X POST -d "{\"settings\":{\"currency\":$UGX,\"time_zone\":\"Africa/Kampala\",\"language\":\"en\",\"fiscal_year\":\"1-12\",\"carbon_date_format\":\"d/m/Y\",\"moment_date_format\":\"DD/MM/YYYY\",\"notification_email\":\"noreply@vipers-hospital.test\"}}" "$CR/company/settings" | jq -c '.success // .message // .')"

# 3. Company profile (address shown on invoices / receipts)
echo "company: $(api -X PUT -d '{"name":"VIPERS HOSPITAL","slug":"vipers-hospital","address":{"name":"VIPERS HOSPITAL","address_street_1":"Plot 00, Demo Road","address_street_2":"(fictional demo address)","city":"Kampala","state":"Central Region","country_id":227,"zip":"","phone":"+256 700 000000"}}' "$CR/company" | jq -c '.data.name // .message // .')"

# 4. Logo
if [ -f /opt/vipers/edge/addons/public/vipers-logo.png ]; then
  B64=$(base64 -w0 /opt/vipers/edge/addons/public/vipers-logo.png)
  printf '{"name":"vipers-logo.png","data":"data:image/png;base64,%s"}' "$B64" > /tmp/logo.json
  echo "logo: $(curl -sk -H "Authorization: Bearer $TOKEN" -H 'company: 1' -H 'Accept: application/json' -F "company_logo=</tmp/logo.json" "$CR/company/upload-logo" | jq -c '.success // .message // .' )"
  rm -f /tmp/logo.json
fi

# 5. Cashier role = Front Desk abilities (customers, items, estimates, invoices, payments; no settings)
if [ -z "$(M "select id from roles where name='cashier'")" ]; then
  ABIL=$(M "select a.name, a.entity_type from permissions p join roles r on r.id=p.entity_id join abilities a on a.id=p.ability_id where p.entity_type='roles' and r.name='front desk';" \
    | jq -R -s -c 'split("\n") | map(select(length>0) | split("\t") | {ability: .[0], model: .[1]})')
  echo "role cashier: $(api -X POST -d "{\"name\":\"cashier\",\"abilities\":$ABIL}" "$CR/roles" | jq -c '.data.name // .message // .')"
fi

# 6. demo.cashier user (Crater signs in with an e-mail address)
PHP_SRC="$(dirname "$0")/crater-demo-user.php"; [ -f "$PHP_SRC" ] || PHP_SRC=/tmp/crater-demo-user.php
docker cp "$PHP_SRC" bahmni-lite-crater-php-1:/tmp/crater-demo-user.php
docker exec bahmni-lite-crater-php-1 php /tmp/crater-demo-user.php 2>&1 | grep -v -i deprecat
echo "cashier login: $(curl -sk -H 'Accept: application/json' -H 'Content-Type: application/json' -d '{"username":"demo.cashier@vipers.demo","password":"everton","device_name":"check"}' "$CR/auth/login" | jq -r 'if .token then "OK" else (.message // .) end')"

# 7. Service price list (UGX; Crater stores amounts x100)
item() { [ -n "$(M "select id from items where name='$1' and company_id=1")" ] && return; api -X POST -o /dev/null -w "item $1: %{http_code}\n" -d "{\"name\":\"$1\",\"price\":$(( $2 * 100 )),\"description\":\"$3\",\"taxes\":[]}" "$CR/items"; }
item "OPD Consultation"            20000 "General outpatient consultation"
item "Specialist Consultation"     50000 "Specialist review"
item "Antenatal Care Visit"        15000 "Routine ANC visit"
item "Malaria RDT"                 10000 "Rapid diagnostic test"
item "Blood Smear (Malaria)"       12000 "Microscopy"
item "Complete Blood Count"        25000 "Full haemogram"
item "Urinalysis"                  10000 "Dipstick and microscopy"
item "Blood Sugar (RBS)"            8000 "Random blood sugar"
item "Artemether-Lumefantrine 20/120mg x24" 12000 "Dispensed course"
item "Paracetamol 500mg x20"        3000 "Tablets"
item "Amlodipine 5mg x30"          15000 "Tablets"
item "Registration / Card Fee"      5000 "New patient card"
M "select name, price/100 from items where company_id=1 order by id;" | tr '\t' ' '
docker exec bahmni-lite-crater-php-1 php /var/www/artisan cache:clear >/dev/null 2>&1; echo "cache cleared"

# 8. The Bahmni->Crater sync logs in with credentials in the URL query string; keep query strings out of
#    Crater's nginx access log (mounted via docker-compose.vipers.yml).
CONF=/opt/vipers/branding/crater-nginx.conf; mkdir -p /opt/vipers/branding
if [ ! -f "$CONF" ]; then
  { echo 'log_format vipers_noquery '"'"'$remote_addr - $remote_user [$time_local] "$request_method $uri $server_protocol" $status $body_bytes_sent "$http_referer" "$http_user_agent"'"'"';'
    docker run --rm --entrypoint cat bahmni/crater-nginx:${CRATER_NGINX_IMAGE_TAG:-1.0.0} /etc/nginx/conf.d/nginx.conf \
      | sed 's#access_log /var/log/nginx/access.log;#access_log /var/log/nginx/access.log vipers_noquery;#'; } > "$CONF"
  echo "crater nginx log format without query strings written"
fi
