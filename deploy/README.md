# MoneyFlow — Structure, routing and production preparation

> **Current VPS deployment procedure:** See [../VPS_DEPLOY.md](../VPS_DEPLOY.md). The current Docker Compose supports an optional Caddy TLS profile (`--profile tls`) as well as an existing HTTPS reverse proxy. The longer notes below describe the earlier reverse-proxy-only layout.

## Client-side application structure

Each page has a real browser URL. React Router (BrowserRouter) handles forward/back navigation and direct links. Session bootstrap waits for a server response before rendering a sign-in form, so a logged-in visitor does not briefly see the login page on refresh.

Project layout:

\`\`\`text
src/
  main.tsx                     # BrowserRouter, global toast/confirm hosts
  app/
    App.tsx                    # session bootstrap + routing + shared finance state
    FinanceContext.tsx         # typed per-page operations and finance data
    navigation.ts              # page ID ↔ URL mappings + sidebar entries
    routing.css                # routing, spinner, empty/404 states
  pages/
    LoginPage.tsx              # /login
    DashboardPage.tsx          # /dashboard
    TransactionsPage.tsx       # /transactions
    BudgetsPage.tsx            # /budgets
    AccountsPage.tsx           # /accounts
    RecurringPage.tsx          # /recurring
    LineAiPage.tsx             # /line-ai
    SecurityPage.tsx           # /settings
    NotFoundPage.tsx           # unmatched URLs
  components/
    layout/WorkspaceLayout.tsx # persistent sidebar, toolbar, responsive shell
    TransactionRow.tsx         # shared money transaction view
    SectionTitle.tsx           # standard section heading
    BrandMark.tsx
    SessionLoading.tsx
    SessionError.tsx
  lib/
    finance.ts                 # shared data shapes, money/date helpers, demo data
    api.ts                     # browser API wrapper, typed HTTP errors
  FinanceModal.tsx
  AuthPortal.tsx
  MoneyWellness.tsx
  SecurityPanel.tsx
  GoogleSignIn.tsx
  feedback.tsx
  ConfirmDialog.tsx
  validation.ts
server/
  index.ts                     # Bun/Elysia API and migrations
  realtime.ts                  # authenticated /ws/live WebSocket server
  webhook-gateway.ts           # narrow, signature-verified LINE public endpoint
deploy/
  nginx.conf                   # SPA fallback, API/WebSocket/LINE proxy
Dockerfile                     # multi-stage web + backend image
docker-compose.production.yml  # isolated production Postgres, API, gateway, Nginx
.env.production.example        # placeholders only, never actual secrets
\`\`\`

### URL behavior

- \`/\` redirects to \`/dashboard\` for signed-in users.
- \`/login\` shows the login form only for signed-out users; authenticated users are redirected to \`/dashboard\`.
- \`/demo\` enables the no-write preview from the login page; this preview is not an authenticated session.
- For a direct link such as \`/budgets\`, the app checks the session; a valid session renders \`/budgets\` without redirecting to the dashboard. A signed-out session redirects to \`/login\`.
- Unknown authenticated paths show a 404 page with a return-to-dashboard link.
- The Navbar/sidebar uses \`NavLink\`, which updates the browser URL and works with Back/Forward.
- Vite handles SPA fallback in development; Nginx \`try_files $uri $uri/ /index.html\` handles it after deployment.

## Local development (unchanged)

\`\`\`bash
cd ~/Desktop/moneyflow
bun install
docker compose up -d
bun run dev
\`\`\`

App: \`http://127.0.0.1:5178\`
API: \`http://127.0.0.1:3011\`
WebSocket: via \`ws://127.0.0.1:5178/ws/live\` (Vite dev proxy).

This local compose is **not** the production stack. It uses a development-only database password and should not be exposed publicly.

## Production deployment — Docker Compose behind HTTPS

These files are ready for a remote Linux VPS/Docker host, but **no real server, domain, secrets or database have been deployed**. Caddy TLS is now provided as an optional profile; see the current [VPS_DEPLOY.md](../VPS_DEPLOY.md) for commands. The production compose creates its *own independent database*; it does not migrate or erase the Mac's current data.

### 1. Prepare a real domain and TLS termination

Choose a hostname, e.g. \`https://moneyflow.example.com\`. Configure a trusted external reverse proxy, load balancer or named Cloudflare Tunnel to forward HTTPS requests to the host's private \`http://127.0.0.1:8080\` endpoint.

**Do not expose :8080 over plain public HTTP**. OAuth, sessions and WebSockets must use a stable HTTPS origin. Enable proper HTTP->HTTPS redirects at the edge. Production cookies use \`Secure\`, so sign-in does not work over plain HTTP.

### 2. Create and fill the production environment

\`\`\`bash
cp .env.production.example .env.production
\`\`\`

Set at least these values:

- \`WEB_ORIGIN=https://moneyflow.example.com\` (origin only, no path and no trailing slash)
- \`APP_PUBLIC_URL=https://moneyflow.example.com\`
- \`POSTGRES_PASSWORD\`: a long, new, random database password
- \`DATABASE_URL=postgres://moneyflow:<url-encoded-password>@postgres:5432/moneyflow\`, matching the DB password above
- \`GOOGLE_CLIENT_ID\`: the existing OAuth Web Client ID
- \`LINE_CHANNEL_SECRET\` and \`LINE_CHANNEL_ACCESS_TOKEN\`
- \`GEMINI_API_KEY\` and \`GEMINI_MODEL\`, if the AI features are enabled

\`.env.production\` is ignored by Git and the Docker build context. Do not copy the Mac development \`.env\` to a remote host without checking its settings and access permissions.

### 3. Update Google + LINE to the final domain

In Google Cloud Console > Google Auth Platform > Clients > your MoneyFlow Web Client, add \`https://moneyflow.example.com\` in **Authorized JavaScript origins**. Keep development origins only for local use. No callback redirect URI is necessary for the current Google Identity Services JS callback design.

In LINE Developers > Messaging API, change **Webhook URL** to:
\`https://moneyflow.example.com/webhook/line\` and verify the signature-checked webhook.

Avoid using a temporary randomly assigned \`*.trycloudflare.com\` URL for your live service, as its hostname changes and invalidates OAuth origins.

### 4. Build and start the isolated production stack

\`\`\`bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
docker compose --env-file .env.production -f docker-compose.production.yml ps
\`\`\`

The topology is:

\`\`\`text
Internet -> HTTPS edge -> http://127.0.0.1:8080
                             Nginx (static React/Vite build)
                             | /api/*            -> Elysia API:3011
                             | /ws/live          -> Bun WebSocket:3061
                             | /webhook/line     -> LINE-only gateway:3012
                                                  -> Elysia webhook:3011
Internal Docker network -> PostgreSQL:5432 (not publicly exposed)
\`\`\`

The API automatically runs its additive \`schema.sql\` initialization during startup. Verify your migrations before upgrading a production database.

### 5. Smoke checks and operations

\`\`\`bash
curl -fsS http://127.0.0.1:8080/api/health
curl -I http://127.0.0.1:8080/budgets
curl -I http://127.0.0.1:8080/settings
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=60 api web gateway
\`\`\`

For real login + WebSocket verification, test using the **HTTPS domain** in a browser. The browser should show a signed-in dashboard on refresh without flashing the Login screen; navigation/back/forward should keep the correct URLs.

Before opening the service to the public, add SMTP verification/forgot-password email flow, rate limiting at the edge, CSP/security headers suitable for Google Identity Services, audit logs, backups and restore drills, and periodic dependency updates. The project currently supports recovery through a *previously linked* Google/LINE account but does not provide email reset links.

### Back up before any data migration

Do not reuse or drop the Mac's development Postgres volume. If you later want to transfer local transactions to production, first create a password-protected Postgres backup, restore into a separate DB, and verify user/account/LINE link mapping and reconciliation. This task did **not** move any user data.

## Tests

\`\`\`bash
bun test
bun run build
\`\`\`

Check deployed URLs \`/dashboard\`, \`/transactions\`, \`/budgets\`, \`/accounts\`, \`/recurring\`, \`/line-ai\`, \`/settings\` after an authenticated session. Test OAuth redirect/origin on both localhost and final HTTPS domain separately.
