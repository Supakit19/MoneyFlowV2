#!/usr/bin/env bash
# Private, verifiable backups of PostgreSQL and encrypted per-user LINE sessions.
# Optional: export MONEYFLOW_BACKUP_AGE_RECIPIENT=age1... to encrypt outputs.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
ENV_FILE="${MONEYFLOW_ENV_FILE:-.env.production}"
COMPOSE_PROJECT="${MONEYFLOW_COMPOSE_PROJECT:-moneyflow-production}"
[[ -f "$ENV_FILE" ]] || { echo "Missing private production environment file" >&2; exit 1; }
[[ "$COMPOSE_PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] ||
  { echo "Invalid Compose project identifier" >&2; exit 1; }
command -v docker >/dev/null || { echo "Docker unavailable" >&2; exit 1; }
umask 077
OUT="${MONEYFLOW_BACKUP_DIR:-$HOME/moneyflow-private-backups}"
mkdir -p "$OUT"
chmod 700 "$OUT"
stamp="$(date -u '+%Y%m%dT%H%M%SZ')"
tmp="$(mktemp -d "$OUT/.backup-$stamp-XXXXXXXX")"
trap 'rm -rf "$tmp"' EXIT
compose=(docker compose -p "$COMPOSE_PROJECT" --env-file "$ENV_FILE" -f docker-compose.production.yml)
echo "Creating consistent-format PostgreSQL backup..."
"${compose[@]}" exec -T postgres pg_dump -U moneyflow -d moneyflow -Fc > "$tmp/database.dump"
[[ -s "$tmp/database.dump" ]] || { echo "Empty DB backup" >&2; exit 1; }
"${compose[@]}" exec -T postgres pg_restore --list < "$tmp/database.dump" >/dev/null ||
  { echo "DB backup validation failed" >&2; exit 1; }
echo "Backing up encrypted LINEJS sessions (never decrypting them)..."
volume="${COMPOSE_PROJECT}_linejs_sessions"
docker volume inspect "$volume" >/dev/null 2>&1 || {
  echo "LINEJS volume $volume not found; refusing incomplete backup" >&2; exit 1;
}
docker run --rm --network none -v "$volume:/sessions:ro" busybox:1.36 \
  tar -C /sessions -czf - . > "$tmp/linejs-sessions.tar.gz"
[[ -s "$tmp/linejs-sessions.tar.gz" ]] || {
  echo "Empty LINEJS volume archive" >&2; exit 1;
}
recipient="${MONEYFLOW_BACKUP_AGE_RECIPIENT:-}"
if [[ -n "$recipient" ]]; then
  command -v age >/dev/null || {
    echo "age is required when MONEYFLOW_BACKUP_AGE_RECIPIENT is set" >&2; exit 1;
  }
  for spec in "database.dump" "linejs-sessions.tar.gz"; do
    age -r "$recipient" -o "$OUT/moneyflow-$stamp-$spec.age" "$tmp/$spec" || exit 1
    chmod 600 "$OUT/moneyflow-$stamp-$spec.age"
  done
  echo "ENCRYPTED BACKUP COMPLETE (age recipient set)."
else
  echo "WARNING: backups contain sensitive finance data and are NOT encrypted. Configure age and off-site storage."
  cp "$tmp/database.dump" "$OUT/moneyflow-$stamp-database.dump"
  cp "$tmp/linejs-sessions.tar.gz" "$OUT/moneyflow-$stamp-linejs-sessions.tar.gz"
  chmod 600 "$OUT/moneyflow-$stamp-database.dump" "$OUT/moneyflow-$stamp-linejs-sessions.tar.gz"
  echo "PRIVATE BACKUP COMPLETE (mode 600 under a mode-700 directory)."
fi
echo "REMEMBER: LINEJS_SESSION_ENCRYPTION_KEY is not in these backups. Keep an offline private copy."
