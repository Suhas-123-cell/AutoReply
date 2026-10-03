#!/bin/sh
set -eu

: "${API_BASE_URL:?Set API_BASE_URL to the public or internal API URL}"
: "${CRON_SECRET:?Set CRON_SECRET to the server cron secret}"

case "${1:-}" in
  refresh-tokens|attach-next-reel|snapshot-followers) ;;
  *) echo "Usage: $0 {refresh-tokens|attach-next-reel|snapshot-followers}" >&2; exit 2 ;;
esac

curl --fail --silent --show-error --max-time 300 \
  --header "Authorization: Bearer $CRON_SECRET" \
  "${API_BASE_URL%/}/api/cron/$1"
