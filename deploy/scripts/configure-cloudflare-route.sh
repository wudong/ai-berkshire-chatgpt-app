#!/usr/bin/env bash
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
: "${CLOUDFLARE_ZONE_ID:?set CLOUDFLARE_ZONE_ID}"
: "${CLOUDFLARE_TUNNEL_ID:?set CLOUDFLARE_TUNNEL_ID}"
: "${MCP_HOSTNAME:?set MCP_HOSTNAME}"

ORIGIN_SERVICE=${MCP_ORIGIN_SERVICE:-http://127.0.0.1:3020}
API=https://api.cloudflare.com/client/v4
AUTH_HEADER="Authorization: Bearer $CLOUDFLARE_API_TOKEN"

api() {
  local method=$1
  local url=$2
  local body=${3:-}
  local response
  if [[ -n "$body" ]]; then
    response=$(curl --fail-with-body --silent --show-error \
      --request "$method" \
      --header "$AUTH_HEADER" \
      --header 'Content-Type: application/json' \
      --data "$body" \
      "$url")
  else
    response=$(curl --fail-with-body --silent --show-error \
      --request "$method" \
      --header "$AUTH_HEADER" \
      "$url")
  fi
  jq -e '.success == true' <<<"$response" >/dev/null || {
    jq . <<<"$response" >&2
    return 1
  }
  printf '%s' "$response"
}

current=$(api GET "$API/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel/$CLOUDFLARE_TUNNEL_ID/configurations")
config=$(jq --arg hostname "$MCP_HOSTNAME" --arg service "$ORIGIN_SERVICE" '
  .result.config
  | .ingress = (
      ([.ingress[] | select(.hostname? != $hostname)] | map(select(has("hostname"))))
      + [{hostname: $hostname, service: $service}]
      + ([.ingress[] | select(.hostname? != $hostname)] | map(select(has("hostname") | not)))
    )
' <<<"$current")
body=$(jq -n --argjson config "$config" '{config: $config}')
api PUT "$API/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel/$CLOUDFLARE_TUNNEL_ID/configurations" "$body" >/dev/null

record_query=$(api GET "$API/zones/$CLOUDFLARE_ZONE_ID/dns_records?name=$MCP_HOSTNAME")
record_count=$(jq '.result | length' <<<"$record_query")
if (( record_count > 1 )); then
  echo "Refusing to replace multiple DNS records for $MCP_HOSTNAME" >&2
  exit 1
fi

tunnel_hostname="$CLOUDFLARE_TUNNEL_ID.cfargotunnel.com"
record_body=$(jq -n --arg type CNAME --arg name "$MCP_HOSTNAME" --arg content "$tunnel_hostname" \
  '{type: $type, name: $name, content: $content, proxied: true, ttl: 1}')
record_id=$(jq -r '.result[0].id // empty' <<<"$record_query")
if [[ -n "$record_id" ]]; then
  api PUT "$API/zones/$CLOUDFLARE_ZONE_ID/dns_records/$record_id" "$record_body" >/dev/null
else
  api POST "$API/zones/$CLOUDFLARE_ZONE_ID/dns_records" "$record_body" >/dev/null
fi

echo "Configured $MCP_HOSTNAME through tunnel $CLOUDFLARE_TUNNEL_ID"
