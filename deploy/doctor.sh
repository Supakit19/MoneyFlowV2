#!/usr/bin/env bash
# Safe preflight. Prints only valid/invalid flags, never secret values.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# Production scripts always bind the private env file in this repository.
export MONEYFLOW_ENV_FILE=.env.production
MODE="${1:---tls}"
if [[ "$MODE" != "--tls" && "$MODE" != "--existing-proxy" ]]; then
  echo "Usage: bash deploy/doctor.sh [--tls|--existing-proxy]" >&2
  exit 2
fi
[[ -f .env.production ]] || { echo "Missing .env.production; run bash deploy/init-env.sh first" >&2; exit 1; }
command -v docker >/dev/null || { echo "Docker missing; install Docker Engine + Compose plugin" >&2; exit 1; }
docker compose version >/dev/null || { echo "Docker Compose plugin missing" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker daemon unavailable" >&2; exit 1; }
val() {
  grep -m1 "^$1=" .env.production | cut -d= -f2- || true
}
domain="$(val MONEYFLOW_DOMAIN)"
origin="$(val WEB_ORIGIN)"
public="$(val APP_PUBLIC_URL)"
dbpass="$(val POSTGRES_PASSWORD)"
dburl="$(val DATABASE_URL)"
key="$(val LINEJS_SESSION_ENCRYPTION_KEY)"
[[ "$domain" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$ ]] &&
  [[ "$domain" != *..* ]] && [[ "$domain" != "moneyflow.example.com" ]] ||
  { echo "MONEYFLOW_DOMAIN must be your real DNS hostname" >&2; exit 1; }
[[ "$origin" == "https://$domain" && "$public" == "$origin" ]] ||
  { echo "WEB_ORIGIN, APP_PUBLIC_URL and MONEYFLOW_DOMAIN must match" >&2; exit 1; }
[[ "$dbpass" =~ ^[0-9a-f]{48}$ ]] &&
  [[ "$dburl" == "postgres://moneyflow:$dbpass@postgres:5432/moneyflow" ]] ||
  { echo "DATABASE_URL/POSTGRES_PASSWORD mismatch; use a generated production password" >&2; exit 1; }
[[ "$key" =~ ^[0-9a-fA-F]{64}$ ]] ||
  { echo "LINEJS_SESSION_ENCRYPTION_KEY must be a 64-character hex key" >&2; exit 1; }
[[ "$(val LINEJS_HOSTED_ENABLED)" == "1" ]] ||
  { echo "LINEJS_HOSTED_ENABLED must be 1 for multi-user connections" >&2; exit 1; }
worker_limit="$(val LINEJS_HOSTED_MAX_WORKERS)"
[[ "$worker_limit" =~ ^[1-8]$ ]] ||
  { echo "Worker limit must be between 1 and 8" >&2; exit 1; }
for k in LINE_CHANNEL_SECRET LINE_CHANNEL_ACCESS_TOKEN; do
  value="$(val "$k")"
  if [[ -z "$value" || "$value" == CHANGE* || "$value" == *example* ]]; then
    echo "Missing required $k for LINE OA/Webhook" >&2
    exit 1
  fi
done
google="$(val GOOGLE_CLIENT_ID)"
if [[ -z "$google" ]]; then
  echo "NOTICE: GOOGLE_CLIENT_ID empty; Google sign-in unavailable. Email sign-in remains available."
elif [[ "$google" != *.apps.googleusercontent.com ]]; then
  echo "GOOGLE_CLIENT_ID must be a real Google Web Client ID" >&2; exit 1
fi
line_id="$(val LINE_LOGIN_CHANNEL_ID)"
line_secret="$(val LINE_LOGIN_CHANNEL_SECRET)"
if [[ -n "$line_id" || -n "$line_secret" ]]; then
  [[ -n "$line_id" && -n "$line_secret" ]] || {
    echo "LINE Login needs BOTH LINE_LOGIN_CHANNEL_ID and LINE_LOGIN_CHANNEL_SECRET" >&2; exit 1;
  }
else
  echo "NOTICE: LINE Login OAuth QR disabled until both LINE_LOGIN keys are configured."
fi
if [[ "$MODE" == "--tls" ]]; then
  acme="$(val ACME_EMAIL)"
  [[ "$acme" == *@*.* && "$acme" != "admin@example.com" ]] ||
    { echo "Set real ACME_EMAIL to enable Caddy certificate issuance" >&2; exit 1; }
fi
# Note: compose interpolates into config; NEVER print config (it holds secrets).
docker compose --env-file .env.production -f docker-compose.production.yml --profile tls config --quiet ||
  { echo "Docker Compose configuration invalid" >&2; exit 1; }
perm=""
if command -v stat >/dev/null; then
  perm="$(stat -c '%a' .env.production 2>/dev/null || true)"
fi
if [[ -n "$perm" && "$perm" != "600" && "$perm" != "400" ]]; then
  echo "Set private permissions: chmod 600 .env.production" >&2; exit 1
fi
if [[ -r /proc/meminfo ]]; then
  mem="$(awk '/MemTotal:/ {print int($2/1024)}' /proc/meminfo)"
  if (( mem < 3500 )); then
    echo "WARNING: VPS has under 3.5 GiB RAM; 4 LINEJS workers may exceed memory."
  fi
fi
echo "PRE-FLIGHT PASSED: configuration validated; no database/data was changed."
if [[ "$MODE" == "--tls" ]]; then
  echo "MODE: automatic HTTPS with Caddy; ensure DNS points to VPS and ports 80/443 are free and public."
else
  echo "MODE: existing HTTPS reverse proxy -> http://127.0.0.1:$(val HTTP_PORT)"
fi
echo "LINEJS: $worker_limit separate hosted worker slots with persistent encrypted sessions."
