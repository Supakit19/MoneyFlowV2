#!/usr/bin/env bash
# Export the current working tree (including UNCOMMITTED new features) safely.
# Only explicitly selected code/config paths are exported. Never packs .env.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$HOME/Desktop/moneyflow-vps-release-$(date +%Y%m%d-%H%M%S).tar.gz}"
[[ ! -e "$OUT" ]] || { echo "Release archive exists; refusing to overwrite: $OUT" >&2; exit 1; }
umask 077
cd "$ROOT"
tar -czf "$OUT" \
  --exclude='*/node_modules' \
  --exclude='**/.env' \
  --exclude='**/.env.*' \
  --exclude='**/session.json' \
  --exclude='**/session.enc' \
  --exclude='**/*.log' \
  --exclude='**/.DS_Store' \
  --exclude='**/.backups' \
  Dockerfile docker-compose.production.yml .dockerignore .env.production.example \
  package.json bun.lock tsconfig.json index.html vite.config.ts \
  README.md LINEJS_MULTIUSER_SETUP.md VPS_DEPLOY.md \
  deploy server shared src \
  integrations/linejs/package.json integrations/linejs/bun.lock \
  integrations/linejs/bank-message-content.ts \
  integrations/linejs/encrypted-storage.ts \
  integrations/linejs/recent-bank-history.ts \
  integrations/linejs/worker.ts
chmod 600 "$OUT"
if tar -tzf "$OUT" | grep -E '(^|/)(\.env($|\.)|session\.json$|session\.enc$|node_modules/|\.backups/)' | grep -Ev '^(\./)?\.env\.production\.example$' >/dev/null; then
  rm -f "$OUT"
  echo "Secret/session path detected in archive; release refused" >&2
  exit 1
fi
echo "RELEASE_READY: $OUT"
if command -v sha256sum >/dev/null; then sha256sum "$OUT"; else shasum -a 256 "$OUT"; fi
echo "Archive includes current uncommitted working-tree code and excludes credentials/sessions."
echo "Copy it with scp to the VPS, extract in a new directory, then initialize .env.production."
