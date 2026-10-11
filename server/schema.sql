CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),username TEXT UNIQUE NOT NULL,password_hash TEXT,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id UUID REFERENCES users(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS accounts(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,kind TEXT DEFAULT 'bank',opening_satang BIGINT DEFAULT 0,color TEXT DEFAULT '#1b9c76');
CREATE TABLE IF NOT EXISTS categories(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('income','expense')),color TEXT DEFAULT '#16a37c',icon TEXT DEFAULT 'circle',UNIQUE(user_id,name,kind));
CREATE TABLE IF NOT EXISTS transactions(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID REFERENCES users(id) ON DELETE CASCADE,account_id UUID REFERENCES accounts(id),to_account_id UUID REFERENCES accounts(id),category_id UUID REFERENCES categories(id),kind TEXT NOT NULL CHECK(kind IN ('income','expense','transfer')),amount_satang BIGINT NOT NULL CHECK(amount_satang > 0),merchant TEXT DEFAULT '',note TEXT DEFAULT '',source TEXT DEFAULT 'web',source_message_id TEXT,transacted_at TIMESTAMPTZ DEFAULT now(),created_at TIMESTAMPTZ DEFAULT now(),UNIQUE(user_id,source_message_id));
CREATE INDEX IF NOT EXISTS idx_t_user_date ON transactions(user_id,transacted_at DESC);
CREATE TABLE IF NOT EXISTS budgets(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID REFERENCES users(id) ON DELETE CASCADE,category_id UUID REFERENCES categories(id) ON DELETE CASCADE,month TEXT NOT NULL,limit_satang BIGINT NOT NULL,UNIQUE(user_id,category_id,month));
CREATE TABLE IF NOT EXISTS recurring_rules(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID REFERENCES users(id) ON DELETE CASCADE,account_id UUID REFERENCES accounts(id),category_id UUID REFERENCES categories(id),kind TEXT NOT NULL,amount_satang BIGINT NOT NULL,title TEXT NOT NULL,day_of_month INT NOT NULL CHECK(day_of_month BETWEEN 1 AND 31),active BOOLEAN DEFAULT TRUE);
CREATE TABLE IF NOT EXISTS recurring_executions(rule_id UUID REFERENCES recurring_rules(id) ON DELETE CASCADE,month TEXT NOT NULL,transaction_id UUID REFERENCES transactions(id),PRIMARY KEY(rule_id,month));
CREATE TABLE IF NOT EXISTS line_links(user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,line_user_id TEXT UNIQUE NOT NULL,linked_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS pair_codes(code_hash TEXT PRIMARY KEY,user_id UUID REFERENCES users(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS line_events(id TEXT PRIMARY KEY,line_user_id TEXT NOT NULL,event JSONB NOT NULL,status TEXT DEFAULT 'queued',attempts INT DEFAULT 0,error TEXT,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS pending(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID REFERENCES users(id) ON DELETE CASCADE,line_user_id TEXT NOT NULL,items JSONB NOT NULL,expires_at TIMESTAMPTZ NOT NULL);
-- Google multi-user accounts are identified by a unique verified Google subject.
-- The original owner can be recovered using a separately configured owner email.
CREATE TABLE IF NOT EXISTS google_links(
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Non-destructive upgrades for installations created before Google multi-user support.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE google_links ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE google_links ADD COLUMN IF NOT EXISTS avatar_url TEXT;
CREATE INDEX IF NOT EXISTS idx_google_links_email ON google_links(email);


-- Multi-method authentication (existing finance tables remain isolated by user_id).
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users((lower(email))) WHERE email IS NOT NULL;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS auth_method TEXT NOT NULL DEFAULT 'email';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS signed_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Browser displays a short code. The LINE account already linked to the user
-- confirms that code in chat. A separate high-entropy browser secret completes
-- the one-time sign-in. Neither token is stored in plaintext.
CREATE TABLE IF NOT EXISTS line_login_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_hash TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','consumed')),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_line_login_expiry ON line_login_challenges(expires_at);

-- New scan-and-sign-in LINE OAuth flow. Keeps old chat-code challenges intact.
-- This database table never exposes the OAuth verifier or browser secret in a QR.
CREATE TABLE IF NOT EXISTS line_qr_oauth_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_hash TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL UNIQUE,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  approval_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verifying','approved','failed','consumed')),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  error_reason TEXT,
  approved_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE line_qr_oauth_challenges ADD COLUMN IF NOT EXISTS approval_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_line_qr_oauth_expiry ON line_qr_oauth_challenges(expires_at);

-- Durable preferences: a weekly budget is reused until a user explicitly changes it.
CREATE TABLE IF NOT EXISTS finance_preferences(
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weekly_limit_satang BIGINT NOT NULL DEFAULT 0 CHECK(weekly_limit_satang >= 0),
  savings_goal_satang BIGINT NOT NULL DEFAULT 0 CHECK(savings_goal_satang >= 0),
  confirmation_mode TEXT NOT NULL DEFAULT 'always' CHECK(confirmation_mode IN ('always','smart','auto')),
  coach_tone TEXT NOT NULL DEFAULT 'friend' CHECK(coach_tone IN ('polite','friend','roast')),
  coach_alerts TEXT NOT NULL DEFAULT 'every' CHECK(coach_alerts IN ('every','once','off')),
  daily_digest_enabled BOOLEAN NOT NULL DEFAULT false,
  daily_digest_hour INT NOT NULL DEFAULT 20 CHECK(daily_digest_hour BETWEEN 0 AND 23),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS coach_alert_history(
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  tier TEXT NOT NULL,
  alerted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,week_start,tier)
);
CREATE TABLE IF NOT EXISTS daily_digest_history(
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,day)
);


-- Additive welcome state. Existing accounts stay complete; new users pending.
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_state TEXT NOT NULL DEFAULT 'completed'
  CHECK (onboarding_state IN ('pending','completed','skipped'));

-- Experimental personal-LINE bank notification bridge. All switches default OFF.
-- Authentication token is hashed; no LINE credentials, raw alerts, account
-- numbers, or bank balances are stored in these tables.
CREATE TABLE IF NOT EXISTS bank_linejs_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  auto_save BOOLEAN NOT NULL DEFAULT false,
  auto_transfer BOOLEAN NOT NULL DEFAULT false,
  push_line BOOLEAN NOT NULL DEFAULT false,
  bank TEXT NOT NULL DEFAULT 'kbank' CHECK (bank IN ('kbank','scb','other')),
  sender_mid TEXT,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  token_hash TEXT UNIQUE,
  last_event_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bank_linejs_settings ADD COLUMN IF NOT EXISTS auto_transfer BOOLEAN NOT NULL DEFAULT false;
-- Each hosted connector has its own encrypted LINE session and encrypted
-- bearer token. Existing local users remain local, with no session migration.
ALTER TABLE bank_linejs_settings ADD COLUMN IF NOT EXISTS connector_mode TEXT NOT NULL DEFAULT 'local'
  CHECK (connector_mode IN ('local','hosted'));
ALTER TABLE bank_linejs_settings ADD COLUMN IF NOT EXISTS connector_token_encrypted TEXT;
ALTER TABLE bank_linejs_settings ADD COLUMN IF NOT EXISTS connector_run_enabled BOOLEAN NOT NULL DEFAULT false;
-- Multiple LINE bank chats per account. Existing primary bank stays untouched.
-- Extra sources contain only verified MID/account routing, never messages.
ALTER TABLE bank_linejs_settings ADD COLUMN IF NOT EXISTS extra_sources JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bank_linejs_settings DROP CONSTRAINT IF EXISTS bank_linejs_settings_bank_check;
ALTER TABLE bank_linejs_settings ADD CONSTRAINT bank_linejs_settings_bank_check
  CHECK (bank IN ('kbank','ktb','scb','other'));

CREATE INDEX IF NOT EXISTS idx_linejs_hosted_resume ON bank_linejs_settings(updated_at DESC)
  WHERE connector_mode='hosted' AND connector_run_enabled=true;
-- Retire legacy auto-save mode flags; keep the LINE OA push preference
-- user-controlled and persistent across API restarts.
UPDATE bank_linejs_settings SET auto_save=false, auto_transfer=false
  WHERE auto_save=true OR auto_transfer=true;
CREATE TABLE IF NOT EXISTS bank_linejs_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_hash TEXT NOT NULL,
  sender_mid TEXT NOT NULL,
  bank TEXT NOT NULL,
  kind TEXT CHECK (kind IN ('income','expense')),
  amount_satang BIGINT CHECK (amount_satang IS NULL OR amount_satang > 0),
  summary TEXT NOT NULL DEFAULT '',
  source_format TEXT NOT NULL DEFAULT 'legacy' CHECK (source_format IN ('legacy','text','flex_nodes','flex_partial','flex_fallback','unreadable')),
  status TEXT NOT NULL CHECK (status IN ('pending','saved','ignored')),
  reason TEXT,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  push_status TEXT NOT NULL DEFAULT 'off' CHECK(push_status IN ('off','sent','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id,event_hash)
);
ALTER TABLE bank_linejs_events ADD COLUMN IF NOT EXISTS source_format TEXT NOT NULL DEFAULT 'legacy';
CREATE INDEX IF NOT EXISTS idx_bank_linejs_events_user_recent
  ON bank_linejs_events(user_id,created_at DESC);

-- A verified image may be reviewed once per user. Never persist image bytes:
-- only its digest and a short sanitized suggestion. User confirmation is mandatory.
CREATE TABLE IF NOT EXISTS receipt_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_digest TEXT NOT NULL CHECK (image_digest ~ '^[a-f0-9]{64}$'),
  suggestion JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','saved','discarded')),
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '3 days',
  UNIQUE (user_id,image_digest)
);
CREATE INDEX IF NOT EXISTS idx_receipt_reviews_user_pending
  ON receipt_reviews(user_id,created_at DESC) WHERE status='pending';

-- Separate voluntary personal-LINE bank access from normal LINE Login.
-- Keep a current consent state and an append-only grant/withdrawal audit.
CREATE TABLE IF NOT EXISTS bank_access_consents (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS bank_access_consent_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('granted','withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bank_consent_events_user
 ON bank_access_consent_events(user_id,created_at DESC);
