# MoneyFlow VPS: Git-based updates

Production checkout: `/root/MoneyFlowV2` (GitHub: `Supakit19/MoneyFlowV2`, branch `main`).

## Update (single command)

```bash
cd /root/MoneyFlowV2
git pull --ff-only
```

On this configured VPS, a **local Git post-merge hook** invokes `deploy/vps-update.sh` after a successful pull that changes commits. It builds changed MoneyFlow code in a resource-limited, network-isolated Docker container, builds thin web/API image layers and updates **only** the affected MoneyFlow containers with health checks. The hook is specific to this VPS; it is installed with `sudo bash deploy/install-vps-git-hook.sh`.

Git pulling alone ordinarily **does not** update a running Docker image. The hook is what makes this VPS's one-command workflow possible. A pull with no new commits does not run the hook.

If an update introduces changed dependencies (`package.json`, lockfiles, or `Dockerfile`) or deletes important runtime files, the updater refuses the fast overlay method. Git still receives the commit, but **Production stays on the prior image** pending a separately planned full build. Read the hook output and check the deployed revision.

## Verify current deployment

```bash
cd /root/MoneyFlowV2
git rev-parse --short HEAD
cat /etc/moneyflow/deployed-revision
docker ps --format '{{.Names}} {{.Image}} {{.Status}}' | grep moneyflow-production
curl -fsS https://moneyflow.aionixth.com/api/health
```

To retry a failed deployment of the already-pulled revision (without another pull):

```bash
cd /root/MoneyFlowV2
bash deploy/vps-update.sh
```

**Secrets:** the active untracked `.env.production` is mode 600, ignored by Git and Docker builds. Build context is derived from `git archive HEAD`, so secrets and backups are not included.

**Runtime:** `/opt/moneyflow` is kept as a compatibility link for the existing systemd backup service and deployment utilities. Only use `/root/MoneyFlowV2` for Git.

**Backups:** `/var/backups/moneyflow` (mode 700) stores sensitive PostgreSQL dumps, LINE session archives, and old release artifacts. The automatic backup timer continues to run every morning. No Docker volumes are changed by pulling or deploying.

**Image selection:** `/etc/moneyflow/compose-images.yml` is updated after images are built; the updater restores the previous image selection if the rollout fails. Rollbacks never remove PostgreSQL or LINE session volumes.

Do not run `docker compose down -v`, `docker system prune --volumes`, or cleanup across all Docker projects on the shared VPS.
