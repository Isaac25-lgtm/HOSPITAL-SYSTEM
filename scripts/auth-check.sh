#!/bin/bash
# 0 authenticated; 1 explicit rejection; 2 unknown/transport/server error.
omrs_auth() {
  local body status rc=0
  body=$(mktemp) || return 2
  chmod 600 "$body"
  status=$(curl -sk --max-time 30 -o "$body" -w '%{http_code}' -u "$1:$2" "$3/session") || rc=2
  if [[ "$rc" = 0 && "$status" = 200 ]]; then
    if jq -e '.authenticated == true' "$body" >/dev/null 2>&1; then rc=0
    elif jq -e '.authenticated == false' "$body" >/dev/null 2>&1; then rc=1
    else rc=2; fi
  elif [[ "$rc" = 0 && ( "$status" = 401 || "$status" = 403 ) ]]; then rc=1
  else rc=2; fi
  rm -f "$body"
  return "$rc"
}
