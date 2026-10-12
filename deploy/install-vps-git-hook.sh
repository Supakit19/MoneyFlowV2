#!/usr/bin/env bash
# One-time setup on the MoneyFlow VPS. Never creates or modifies a database.
set -Eeuo pipefail
umask 077
root=/root/MoneyFlowV2
deployment=/etc/moneyflow
revision_file="$deployment/deployed-revision"
hook="$root/.git/hooks/post-merge"

[[ $EUID -eq 0 ]] || { echo "Run as root on the VPS." >&2; exit 1; }
[[ -d "$root/.git" && -r "$root/.env.production" ]] || { echo "Missing MoneyFlow Git checkout/config." >&2; exit 1; }
[[ -r "$deployment/compose-images.yml" ]] || exit 1
cd "$root"
[[ "$(git remote get-url origin)" == https://github.com/Supakit19/MoneyFlowV2.git ]] || exit 1
git diff --quiet
git diff --cached --quiet
git config --local pull.ff only

if [[ ! -e "$revision_file" ]]; then
  live_rev="$(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' moneyflow-production-web-1)"
  [[ "$live_rev" =~ ^[a-f0-9]{7,40}$ ]] || {
    echo "Cannot determine the currently deployed web revision safely." >&2; exit 1;
  }
  git rev-parse --verify "$live_rev^{commit}" > "$revision_file"
  chmod 600 "$revision_file"
fi

if [[ -f "$hook" ]]; then
  echo "Refusing to overwrite an existing Git post-merge hook." >&2
  exit 1
fi
cat > "$hook" <<'HOOK'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "$(git rev-parse --show-toplevel)" != /root/MoneyFlowV2 ]]; then
  exit 0
fi
echo "[MoneyFlow] Git pull complete; verifying and deploying Production..."
if ! /bin/bash /root/MoneyFlowV2/deploy/vps-update.sh; then
  echo "[MoneyFlow] DEPLOYMENT FAILED: Git was updated but the existing Production image remains the expected fallback." >&2
  echo "[MoneyFlow] Check /etc/moneyflow/deployed-revision and retry: bash deploy/vps-update.sh" >&2
  exit 1
fi
HOOK
chmod 700 "$hook"
echo "Git post-merge deployment enabled: cd /root/MoneyFlowV2 && git pull --ff-only"
echo "Current Production baseline: $(cat "$revision_file")"
