#!/usr/bin/env bash
# VPS bootstrap: creates a fresh production-only env; never prints credentials.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOMAIN="${1:-}"
EMAIL="${2:-}"
if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$ ]] ||
   [[ "$DOMAIN" == *..* ]] || [[ "$DOMAIN" == -* ]] || [[ "$DOMAIN" == *.-* ]]; then
  echo "Usage: bash deploy/init-env.sh moneyflow.yourdomain.com you@example.com" >&2
  exit 2
fi
if [[ ! "$EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
  echo "Provide a real email address for automatic HTTPS certificate notices." >&2
  exit 2
fi
command -v openssl >/dev/null || { echo "Install openssl before continuing" >&2; exit 1; }
if [[ -e "$ROOT/.env.production" ]]; then
  echo ".env.production already exists. Refusing to overwrite live DB or session encryption keys." >&2
  exit 1
fi
umask 077
password="$(openssl rand -hex 24)"
encryption="$(openssl rand -hex 32)"
tmp="$(mktemp "$ROOT/.env.production.XXXXXXXX")"
trap 'rm -f "$tmp"' EXIT
awk -v domain="$DOMAIN" -v email="$EMAIL" -v password="$password" -v key="$encryption" '
  /^WEB_ORIGIN=/ { print "WEB_ORIGIN=https://" domain; next }
  /^APP_PUBLIC_URL=/ { print "APP_PUBLIC_URL=https://" domain; next }
  /^MONEYFLOW_DOMAIN=/ { print "MONEYFLOW_DOMAIN=" domain; next }
  /^ACME_EMAIL=/ { print "ACME_EMAIL=" email; next }
  /^POSTGRES_PASSWORD=/ { print "POSTGRES_PASSWORD=" password; next }
  /^DATABASE_URL=/ { print "DATABASE_URL=postgres://moneyflow:" password "@postgres:5432/moneyflow"; next }
  /^LINEJS_HOSTED_ENABLED=/ { print "LINEJS_HOSTED_ENABLED=1"; next }
  /^LINEJS_SESSION_ENCRYPTION_KEY=/ { print "LINEJS_SESSION_ENCRYPTION_KEY=" key; next }
  { print }
' "$ROOT/.env.production.example" > "$tmp"
chmod 600 "$tmp"
mv "$tmp" "$ROOT/.env.production"
trap - EXIT
echo "Created private .env.production (mode 600) for $DOMAIN."
echo "Generated independent PostgreSQL password and persistent encrypted LINEJS session key."
echo "NEXT: edit .env.production and insert LINE_CHANNEL_SECRET / ACCESS_TOKEN / GOOGLE_CLIENT_ID / LINE_LOGIN credentials."
echo "Then: bash deploy/deploy.sh --tls (or --existing-proxy if ports 80/443 are in use)."
echo "IMPORTANT: back up the LINEJS encryption key separately; losing it invalidates user LINE sessions."
