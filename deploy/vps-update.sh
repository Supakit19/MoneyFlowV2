#!/usr/bin/env bash
# Deploy a fast-forward Git pull without rebuilding dependencies on the shared VPS.
# Install with deploy/install-vps-git-hook.sh and then use: git pull --ff-only
set -Eeuo pipefail
umask 077

root=/root/MoneyFlowV2
deployment=/etc/moneyflow
overlay="$deployment/compose-images.yml"
revision_file="$deployment/deployed-revision"
compose=(docker compose --env-file "$root/.env.production" -f "$root/docker-compose.production.yml" -f "$overlay")
mode="${1:-normal}"

[[ $EUID -eq 0 ]] || { echo "Run as root on the MoneyFlow VPS" >&2; exit 1; }
[[ "$mode" == normal || "$mode" == --force-web ]] || { echo "Usage: bash deploy/vps-update.sh [--force-web]" >&2; exit 2; }
[[ -d "$root/.git" && -r "$root/.env.production" && -r "$overlay" && -r "$revision_file" ]] ||
  { echo "MoneyFlow VPS deployment is not initialized." >&2; exit 1; }
command -v flock >/dev/null
exec 9>/run/lock/moneyflow-git-deploy.lock
flock -n 9 || { echo "Another MoneyFlow deploy is already running." >&2; exit 1; }
cd "$root"
[[ "$(git rev-parse --show-toplevel)" == "$root" ]] || exit 1
git diff --quiet
git diff --cached --quiet
[[ "$(git branch --show-current)" == main ]] ||
  { echo "Only the main branch can be deployed." >&2; exit 1; }
[[ "$(git rev-parse origin/main)" == "$(git rev-parse HEAD)" ]] ||
  { echo "Local branch is not at the fetched origin/main." >&2; exit 1; }

current="$(git rev-parse HEAD)"
previous="$(cat "$revision_file")"
[[ "$current" =~ ^[a-f0-9]{40}$ && "$previous" =~ ^[a-f0-9]{40}$ ]] ||
  { echo "Invalid deployment revision." >&2; exit 1; }
git cat-file -e "$previous^{commit}"
git merge-base --is-ancestor "$previous" "$current" ||
  { echo "Refusing non-fast-forward production deployment." >&2; exit 1; }

if [[ "$current" == "$previous" && "$mode" == normal ]]; then
  echo "MoneyFlow production is already at $(git rev-parse --short HEAD)"
  exit 0
fi
changed="$(git diff --name-only "$previous" "$current")"
if echo "$changed" | grep -Eq '^(package\.json|bun\.lock|Dockerfile|integrations/linejs/(package\.json|bun\.lock))$'; then
  echo "DEPENDENCIES CHANGED: Git pull succeeded, but the running Docker images were NOT changed." >&2
  echo "A full dependency image build is required; current website remains online." >&2
  exit 1
fi
if echo "$changed" | grep -Eq '^(server/schema\.sql|server/migrations/)'; then
  echo "DATABASE SCHEMA CHANGED: Git pull succeeded, but Production was NOT updated." >&2
  echo "Review migrations and take a fresh verified backup before deploying." >&2
  exit 1
fi
if git diff --diff-filter=D --name-only "$previous" "$current" -- src server shared public integrations | grep -q .; then
  echo "Deleted runtime files require a full rebuild; leaving production unchanged." >&2
  exit 1
fi
web=0; api=0; gateway=0
if echo "$changed" | grep -Eq '^(src/|public/|index\.html$|vite\.config\.ts$|tsconfig\.json$|deploy/nginx\.conf$)'; then web=1; fi
if echo "$changed" | grep -Eq '^(server/|shared/|integrations/linejs/|src/validation\.ts$)'; then api=1; fi
if echo "$changed" | grep -Eq '^server/webhook-gateway\.ts$'; then gateway=1; fi
if [[ "$mode" == --force-web ]]; then web=1; fi

if [[ "$web" == 0 && "$api" == 0 ]]; then
  printf '%s\n' "$current" > "$revision_file"
  echo "Git revision updated (no running service code changed): $(git rev-parse --short HEAD)"
  exit 0
fi

# We export only committed source files. No .env.production, local secrets or Git files
# are ever mounted inside the untrusted build stage.
stage="$(mktemp -d /tmp/moneyflow-git-release.XXXXXXXX)"
chmod 700 "$stage"
cleanup_stage() {
  case "$stage" in
    /tmp/moneyflow-git-release.*)
      if [[ -d "$stage" ]]; then
        find "$stage" -mindepth 1 -delete
        rmdir "$stage"
      fi
      ;;
  esac
}
trap cleanup_stage EXIT
mkdir -p "$stage/source" "$stage/dist"
git archive HEAD | tar -x -C "$stage/source"

old_api="$(docker inspect -f '{{.Config.Image}}' moneyflow-production-api-1)"
old_web="$(docker inspect -f '{{.Config.Image}}' moneyflow-production-web-1)"
old_gateway="$(docker inspect -f '{{.Config.Image}}' moneyflow-production-gateway-1)"
docker image inspect "$old_api" "$old_web" "$old_gateway" >/dev/null
tag="$(git rev-parse --short=12 HEAD)"
new_api="$old_api"
new_web="$old_web"
new_gateway="$old_gateway"

if [[ "$web" == 1 ]]; then
  echo "Building MoneyFlow frontend from Git (limited to 1 GB RAM and 0.75 CPU)..."
  docker run --rm --network none --memory=1g --memory-swap=1g --cpus=0.75 \
    --pids-limit=180 --user root \
    -v "$stage/source:/source:ro" -v "$stage/dist:/output:rw" \
    --entrypoint sh "$old_api" -c '
    set -eu
    cp -a /source/src/. /app/src/
    cp -a /source/server/. /app/server/
    cp -a /source/shared/. /app/shared/
    cp -a /source/public /app/
    cp -a /source/vite.config.ts /source/tsconfig.json /source/index.html /source/package.json /app/
    cd /app
    bun run build
    cp -a dist/. /output/
    '
  test -s "$stage/dist/index.html"
  cat > "$stage/Dockerfile.web" <<'DOCKER'
ARG BASE_IMAGE
FROM ${BASE_IMAGE}
COPY dist/ /usr/share/nginx/html/
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
DOCKER
  mkdir -p "$stage/deploy"
  cp "$stage/source/deploy/nginx.conf" "$stage/deploy/nginx.conf"
  new_web="moneyflowv2-web:git-$tag"
  docker build --pull=false --network=none --label org.opencontainers.image.revision="$current" --build-arg BASE_IMAGE="$old_web" \
    -t "$new_web" -f "$stage/Dockerfile.web" "$stage"
fi

if [[ "$api" == 1 ]]; then
  echo "Building MoneyFlow API code layer (no dependency download)..."
  cat > "$stage/Dockerfile.api" <<'DOCKER'
ARG BASE_IMAGE
FROM ${BASE_IMAGE}
USER root
COPY server/ /app/server/
COPY shared/ /app/shared/
COPY src/validation.ts /app/src/validation.ts
COPY integrations/linejs/worker.ts /app/integrations/linejs/worker.ts
COPY integrations/linejs/bank-message-content.ts /app/integrations/linejs/bank-message-content.ts
COPY integrations/linejs/recent-bank-history.ts /app/integrations/linejs/recent-bank-history.ts
COPY integrations/linejs/encrypted-storage.ts /app/integrations/linejs/encrypted-storage.ts
USER bun
DOCKER
  new_api="moneyflowv2-api:git-$tag"
  docker build --pull=false --network=none --label org.opencontainers.image.revision="$current" --build-arg BASE_IMAGE="$old_api" \
    -t "$new_api" -f "$stage/Dockerfile.api" "$stage/source"
  if [[ "$gateway" == 1 ]]; then new_gateway="$new_api"; fi
fi

cat > "$stage/compose-images.yml" <<EOF
services:
  api:
    image: $new_api
    mem_limit: 1g
  gateway:
    image: $new_gateway
  web:
    image: $new_web
EOF
docker compose --env-file "$root/.env.production" \
  -f "$root/docker-compose.production.yml" -f "$stage/compose-images.yml" config --quiet

cp -p "$overlay" "$stage/previous-compose-images.yml"
restore_previous() {
  echo "Deployment did not pass health checks. Restoring previous MoneyFlow images..." >&2
  cp -p "$stage/previous-compose-images.yml" "$overlay"
  "${compose[@]}" up -d --no-deps --no-build --wait --wait-timeout 150 api web || :
  if [[ "$gateway" == 1 ]]; then
    "${compose[@]}" up -d --no-deps --no-build --wait --wait-timeout 120 gateway || :
  fi
  echo "Existing database volumes and backup files were not touched." >&2
}
trap restore_previous ERR
install -m 600 "$stage/compose-images.yml" "$overlay"
if [[ "$api" == 1 ]]; then
  "${compose[@]}" up -d --no-deps --no-build --wait --wait-timeout 150 api
fi
if [[ "$gateway" == 1 ]]; then
  "${compose[@]}" up -d --no-deps --no-build --wait --wait-timeout 120 gateway
fi
if [[ "$web" == 1 ]]; then
  "${compose[@]}" up -d --no-deps --no-build --wait --wait-timeout 120 web
fi
curl -fsS --max-time 12 https://moneyflow.aionixth.com/api/health >/dev/null
[[ "$(curl -ksS -o /dev/null -w '%{http_code}' --max-time 10 https://moneyflow.aionixth.com/admin/login)" == 200 ]]
trap - ERR
printf '%s\n' "$current" > "$revision_file"
echo "MONEYFLOW_DEPLOYED_REVISION=$(git rev-parse --short HEAD)"
echo "Web=$new_web API=$new_api Gateway=$new_gateway"
echo "Git code and production image tags now match."
