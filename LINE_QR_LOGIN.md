# MoneyFlow LINE Login via QR (OAuth / no chat message)

## Goal

Scan a QR code on the MoneyFlow login page, authenticate with the real LINE
Login service on a phone, tap **อนุญาตให้เข้าสู่ระบบ** once on the phone, and the
original browser signs into the **previously linked MoneyFlow user account**.
No "Login 12345678" typing or bot message is required.

LINE may show an OAuth permissions screen the first time; that screen is
controlled by LINE, not by MoneyFlow.

## Required configuration (before real mobile scanning works)

A LINE Messaging API channel is NOT a LINE Login channel.

1. Open https://developers.line.biz/console/.
2. Under the SAME provider as the existing MoneyFlow Messaging API channel,
   create a LINE Login channel (or reuse one already registered there).
   If LINE Login and Messaging API are under different providers, LINE will
   assign different user IDs and the existing LINE pairing won't match.
3. Enable Web app in LINE Login settings.
4. In that LINE Login channel, add this exact Callback URL:
   https://YOUR-STABLE-DOMAIN/api/auth/line/qr/callback
5. Point a persistent HTTPS domain to MoneyFlow's normal frontend/API service.
   APP_PUBLIC_URL must be the publicly reachable HTTPS site root. A localhost
   URL, 127.0.0.1 URL, or a one-off changing quick tunnel isn't suitable for
   a permanent QR login callback.
6. Set these in the server's .env (never commit or share secrets):

       APP_PUBLIC_URL=https://YOUR-STABLE-DOMAIN
       WEB_ORIGIN=https://YOUR-STABLE-DOMAIN
       LINE_LOGIN_CHANNEL_ID=the_LINE_Login_channel_ID
       LINE_LOGIN_CHANNEL_SECRET=the_LINE_Login_channel_secret

   These new LINE Login credentials are DISTINCT from existing
   LINE_CHANNEL_SECRET and LINE_CHANNEL_ACCESS_TOKEN (Messaging API).
7. Restart the API so environment values are loaded. The database migration
   creates the line_qr_oauth_challenges table without replacing finance data.
8. Open /login > LINE > create QR; use LINE on your phone to scan and authorize.
   Previously unlinked LINE users must first sign in with email/Google and link
   their LINE at Account & Security.

### Runtime endpoints

- GET /api/auth/line/qr/config - public readiness, no secrets.
- POST /api/auth/line/qr/start - issue short-lived random challenge for browser.
- GET /api/auth/line/qr/scan/:id - QR landing, redirects to official LINE Login.
- GET /api/auth/line/qr/callback - verifies OAuth state, token, nonce, subject;
  shows secure phone-side approval UI.
- POST /api/auth/line/qr/approve - requires phone-only approval token.
- POST /api/auth/line/qr/deny - refuse a login from another device.
- POST /api/auth/line/qr/status - original browser polls with its secret.
- POST /api/auth/line/qr/complete - issues session only after approval.
- POST /api/auth/line/qr/cancel - retires stale QR when requesting a new one.

### Security

- Only a real verified LINE identity with an existing line_links record can
  authorize a MoneyFlow session; no accounts are silently created/merged.
- The same provider is mandatory to match LINE Login and Messaging API IDs.
- QR only reveals a short HTTPS path and a challenge UUID. It never contains
  the 256-bit browser secret, OAuth verifier, or phone approval token.
- LINE issues an OAuth authorization code. The backend exchanges it over HTTPS,
  requests LINE ID token verification, and validates audience, issuer, nonce,
  expiry and LINE user ID. PKCE (S256) and OAuth state bind the flow.
- After successful LINE authentication the phone displays a one-tap approval
  screen for opening the browser session. No chat or code required.
- Unapproved, expired, denied, cancelled or replayed QR challenges cannot log in.
- QR expires in five minutes and can only be consumed once.
- Existing email, Google and former chatbot commands remain supported.

## Testing

- TypeScript / Vite production build passed.
- bun test passed including official-endpoint verification mock tests.
- Isolated PostgreSQL OAuth simulation passed:
  pending -> LINE identity verified -> phone approval -> original browser session.
  Invalid browser secrets, approval tokens, unlinked LINE accounts,
  cancellations, replay and invalid OAuth state are rejected.
- Mobile/Desktop screenshots and scoped browser tests under
  .ux-audit/20261009/line-oauth-review/

Note: a real LINE account, a registered public HTTPS callback and actual
LINE Login channel credentials are required for the final live-phone test.
No such secrets have been invented or exposed.
