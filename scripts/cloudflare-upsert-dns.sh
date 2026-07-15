#!/usr/bin/env bash
# 在 Cloudflare 里 upsert 一条 DNS 记录（同名存在则更新，否则创建）。
# 用于：① ACM 证书的 DNS 校验 CNAME；② 把 api.faithcal.xyz 指向 API Gateway 区域域名。
#
# 用法:
#   CF_API_TOKEN=... CF_ZONE_ID=... \
#     scripts/cloudflare-upsert-dns.sh <type> <name> <content> [proxied(true|false)]
# 例:
#   # ACM 校验记录（DNS-only）
#   ...upsert-dns.sh CNAME _abc.api.faithcal.xyz _xyz.acm-validations.aws false
#   # API 自定义域名指向（DNS-only，避免 APIGW 端 Host 校验问题）
#   ...upsert-dns.sh CNAME api.faithcal.xyz d-xxxx.execute-api.ap-northeast-1.amazonaws.com false
set -euo pipefail

TYPE="${1:?type required}"
NAME="${2:?name required}"
CONTENT="${3:?content required}"
PROXIED="${4:-false}"

: "${CF_API_TOKEN:?CF_API_TOKEN required}"
: "${CF_ZONE_ID:?CF_ZONE_ID required}"

API="https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records"
AUTH=(-H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json")

REC_ID="$(curl -sf "${AUTH[@]}" "${API}?type=${TYPE}&name=${NAME}" | jq -r '.result[0].id // empty')"
BODY="$(jq -nc --arg t "$TYPE" --arg n "$NAME" --arg c "$CONTENT" --argjson p "$PROXIED" \
  '{type:$t,name:$n,content:$c,ttl:60,proxied:$p}')"

if [ -n "$REC_ID" ]; then
  curl -sf -X PUT "${AUTH[@]}" -d "$BODY" "${API}/${REC_ID}" >/dev/null
  echo "updated ${TYPE} ${NAME} -> ${CONTENT}"
else
  curl -sf -X POST "${AUTH[@]}" -d "$BODY" "${API}" >/dev/null
  echo "created ${TYPE} ${NAME} -> ${CONTENT}"
fi
