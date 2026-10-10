# MoneyFlow — LINEJS for multiple users

## Architecture

New users can scan QR in their own MoneyFlow web account. Every hosted connector has:
- One Node.js 24 LINEJS process per signed-in MoneyFlow user
- Unique allowlisted bank sender MID, MoneyFlow destination account and hashed bank bridge token
- Separate AES-256-GCM encrypted LINE Session on a persistent private server volume
- AES-256-GCM encrypted bridge token stored in PostgreSQL, bound to that user's ID
- Authenticated QR/status/start/stop/delete endpoints, a fresh login requirement and a concurrent worker limit (default 4)
- Bank ingestion and LINE OA notifications scoped to the owner
- No automatic financial backfill from alerts that predate a worker start

The original owner's working Mac LINEJS session stays on the legacy Local Agent.
No automatic migration or deletion of the owner's personal session is performed.

**LINEJS is unofficial.** It may break after LINE updates and may carry account restrictions or security risks. Do not market it as bank-approved. Always provide a way to disconnect and audit imported transactions.

## Two banks on one LINE account (KBank + Krungthai)

MoneyFlow accepts **KBank Live** and **Krungthai Connext** as separate bank
notification sources without requiring two LINE logins or two Worker slots.

1. Create separate MoneyFlow accounts for KBank and Krungthai.
2. Under **เชื่อมธนาคาร**, configure the first bank and its verified Sender MID.
3. In **แชตธนาคารเพิ่มเติม**, choose Krungthai Connext, its MoneyFlow account,
   and the verified MID of that bank's LINE chat.
4. Save the configuration. Each enabled bank can be paused independently.
5. Only messages with an exact allowlisted MID are accepted. KBank's
   undirected-expense fallback does **not** apply to Krungthai. Krungthai alerts
   must explicitly show income or expense and an unambiguous amount.
6. Older bank notifications are not automatically backfilled to avoid duplicates.
   Wait for a new alert, then verify it against your banking app.

**Safety:** This is a conservative first implementation tested with synthetic
notification formats. Actual Krungthai Connext messages vary. Before treating
it as production-grade, verify a real alert with all names, account identifiers,
references and balances hidden. MoneyFlow must never claim the bank's authority.

## Setup for each MoneyFlow customer

1. Register/sign into MoneyFlow with their own account.
2. Create a bank account under MoneyFlow's Accounts menu.
3. Go to LINEJS, click "เชื่อม LINE ด้วย QR", and approve login using their own LINE mobile app. They must never share the QR or PIN.
4. Verify the KBank Live or SCB Connect sender found by the worker and choose "เลือกธนาคารนี้", or manually enter a verified sender MID.
5. Select their own bank account and turn on automatic receipt recording. Press "บันทึกการตั้งค่า".
6. Optionally link their own LINE OA account and enable notifications.
7. To pause use "หยุดรับแจ้งเตือน"; to permanently disconnect use "ยกเลิกเชื่อม LINE". LINE's mobile app also provides an active-device list to revoke login.

When the MoneyFlow backend runs on a VPS, customers need no Terminal or extra desktop program and may close their browser.

## Local developer pilot

The existing Mac owner remains on the original connection. To enable hosted connectors for other MoneyFlow accounts on the same machine:

1. Install Node.js 24+, Bun, PostgreSQL and LINEJS dependencies under integrations/linejs.
2. In the private root .env, set LINEJS_HOSTED_ENABLED=1, LINEJS_HOSTED_MAX_WORKERS=4 and LINEJS_SESSION_ENCRYPTION_KEY to a persistent 64-character hexadecimal key. Generate the key using: openssl rand -hex 32
3. Restart the API. For other authenticated MoneyFlow users, /linejs now presents Hosted QR login.
4. To let users access the site from other networks, publish the full MoneyFlow website over authenticated HTTPS; a quick tunnel for LINE Webhook alone is insufficient.

Do not expose local session files, token files or server environment variables.

## Production on VPS

1. Provision a VPS and HTTPS domain. For a four-person pilot, start around 2 vCPU and 4 GB RAM, observe memory and CPU, and increase when needed.
2. Configure MoneyFlow's WEB_ORIGIN, Google/LINE OAuth callbacks, and Messaging API webhook URL for that domain.
3. Copy .env.production.example to private .env.production and fill database credentials, LINE secrets and LINEJS_SESSION_ENCRYPTION_KEY. Never commit or send this file.
4. Set LINEJS_HOSTED_ENABLED=1 and LINEJS_HOSTED_MAX_WORKERS=4 in .env.production.
5. Run: docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
6. The API Docker image includes Node.js 24 for LINEJS in addition to Bun. The linejs_sessions named volume persists encrypted sessions.
7. Run a **single API replica** controlling hosted workers. Horizontal scale needs a distributed ownership lock first.
8. Back up the PostgreSQL database and encrypted session volume. Back up the encryption key separately; losing it makes encrypted credentials unreadable. Rotating it requires a migration.
9. Keep container ports private; expose only the HTTPS frontend and LINE webhook through the reverse proxy.
10. Test QR and disconnect with four distinct MoneyFlow test users; do not transfer real money for infrastructure testing.

## Troubleshooting

- QR missing: check server Node 24, encryption key, worker dependencies, capacity and whether the user signed in recently.
- Connected but no imports: verify the bank MID, destination account and Flow switch. KBank alerts with a readable amount but no direction default to expense by the chosen policy and may occasionally classify incorrectly.
- LINE OA does not reply: inspect the user's LINE OA link, push setting and public webhook independently of the LINEJS worker.
- API restart asks to scan again: check named volume persistence and encryption key stability.
- A shared LINE session or cross-user bank transaction is a security incident: stop workers and audit user_id, tokens and sender MID before re-enabling.
