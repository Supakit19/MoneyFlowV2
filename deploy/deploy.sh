#!/usr/bin/env bash
# Upgrade production containers safely. Never uses "down -v" or drops data.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:---tls}"
[[ "$MODE" == "--tls" || "$MODE" == "--existing-proxy" ]] || {
  echo "Usage: bash deploy/deploy.sh [--tls|--existing-proxy]" >&2; exit 2;
}
cd "$ROOT"
export MONEYFLOW_ENV_FILE=.env.production
bash deploy/doctor.sh "$MODE"
compose=(docker compose --env-file .env.production -f docker-compose.production.yml)
if [[ "$MODE" == "--tls" ]]; then compose+=(--profile tls); fi
echo "Building and starting MoneyFlow production containers (data volumes are preserved)..."
"${compose[@]}" up -d --build --wait --wait-timeout 300 --remove-orphans
echo "Checking local reverse proxy and app routes..."
port="$(grep -m1 '^HTTP_PORT=' .env.production | cut -d= -f2-)"
port="${port:-8080}"
curl -fsS --max-time 15 "http://127.0.0.1:$port/api/health" >/dev/null || {
  echo "API not responding correctly through nginx; inspect docker compose logs" >&2; exit 1;
}
login="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 12 "http://127.0.0.1:$port/login")"
[[ "$login" == "200" ]] || { echo "Frontend /login returned $login" >&2; exit 1; }
unauth="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 "http://127.0.0.1:$port/api/data")"
[[ "$unauth" == "401" ]] || { echo "Unauthenticated finance endpoint gave unexpected HTTP $unauth" >&2; exit 1; }
webhook="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 \
  -H 'Content-Type: application/json' -X POST --data '{}' \
  "http://127.0.0.1:$port/webhook/line")"
[[ "$webhook" == "401" ]] || {
  echo "Unsigned LINE webhook returned unexpected HTTP $webhook" >&2; exit 1;
}
"${compose[@]}" ps
echo "DEPLOYED: API health, /login, authenticated finance boundary and LINE webhook signature checks passed."
if [[ "$MODE" == "--tls" ]]; then
  domain="$(grep -m1 '^MONEYFLOW_DOMAIN=' .env.production | cut -d= -f2-)"
  echo "HTTPS: visit https://$domain after DNS A record points to this VPS and ports 80/443 are open."
  echo "LINE Developers Webhook: https://$domain/webhook/line"
  echo "LINE Login callback: https://$domain/api/auth/line/qr/callback"
else
  echo "EXISTING REVERSE PROXY MODE: route HTTPS to http://127.0.0.1:$port (no public HTTP on port $port)."
fi
echo "NEXT: configure off-server encrypted backups and verify QR login with test accounts."
