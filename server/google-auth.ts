import { OAuth2Client } from 'google-auth-library';
import type { Sql } from 'postgres';

export type GoogleIdentity = {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
};

export type GoogleAccountResult = {
  userId: string;
  created: boolean;
};

const DEFAULT_CATEGORIES: Array<[string, string, string]> = [
  ['expense', 'อาหาร', '#139e78'],
  ['expense', 'เดินทาง', '#7f78e8'],
  ['expense', 'ช้อปปิ้ง', '#eeb455'],
  ['expense', 'บิลและที่พัก', '#ef8e72'],
  ['expense', 'สุขภาพ', '#e57d98'],
  ['expense', 'บันเทิง', '#61a5de'],
  ['expense', 'อื่นๆ', '#87949d'],
  ['income', 'เงินเดือน', '#139e78'],
  ['income', 'รายได้เสริม', '#7f78e8'],
  ['income', 'อื่นๆ', '#87949d'],
];
const DEFAULT_ACCOUNTS: Array<[string, string, string]> = [
  ['บัญชีหลัก', 'bank', '#17a078'],
  ['เงินสด', 'cash', '#e9aa62'],
  ['วอลเล็ต', 'wallet', '#858de6'],
];

/** Google public photo URLs are never trusted as credentials. */
function googlePhoto(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (
      parsed.protocol !== 'https:' ||
      !(host === 'googleusercontent.com' || host.endsWith('.googleusercontent.com'))
    )
      return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Google must cryptographically attest sub, issuer, audience, expiry, and verified email. */
export async function verifyGoogleCredential(
  credential: string,
  clientId: string,
): Promise<GoogleIdentity> {
  if (!credential || credential.length > 12000 || credential.split('.').length !== 3) {
    throw new Error('INVALID_GOOGLE_CREDENTIAL');
  }
  if (!clientId.endsWith('.apps.googleusercontent.com')) {
    throw new Error('GOOGLE_CLIENT_ID_NOT_CONFIGURED');
  }
  const verifier = new OAuth2Client(clientId);
  const ticket = await verifier.verifyIdToken({ idToken: credential, audience: clientId });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    throw new Error('GOOGLE_EMAIL_NOT_VERIFIED');
  }
  return {
    sub: payload.sub,
    email: payload.email.trim().toLowerCase(),
    name: (
      payload.name ||
      payload.given_name ||
      payload.email.split('@')[0] ||
      'สมาชิก MoneyFlow'
    ).slice(0, 100),
    picture: googlePhoto(payload.picture),
  };
}

/**
 * Must run inside a PostgreSQL transaction (sql.begin).
 * Each verified Google account receives its own independent finance workspace.
 * Advisory lock prevents duplicate profiles when Google calls back concurrently.
 */
export async function findOrCreateGoogleUser(
  db: Sql,
  identity: GoogleIdentity,
): Promise<GoogleAccountResult> {
  await db`SELECT pg_advisory_xact_lock(hashtext(${'moneyflow-google:' + identity.sub}))`;

  const existing = await db`SELECT user_id FROM google_links WHERE google_sub=${identity.sub}`;
  if (existing.length) {
    await db`UPDATE google_links SET email=${identity.email},display_name=${identity.name},avatar_url=${identity.picture} WHERE google_sub=${identity.sub}`;
    return { userId: existing[0].user_id as string, created: false };
  }

  // Never auto-merge by email. Require the member to log in by password and
  // explicitly connect Google first, so one person cannot silently take over
  // an existing email/password finance workspace.
  const existingEmailAccount = await db`
    SELECT id FROM users WHERE lower(email)=${identity.email} LIMIT 1
  `;
  if (existingEmailAccount.length) throw Error('EMAIL_ACCOUNT_MUST_LINK_GOOGLE_FIRST');

  const created = await db`
    INSERT INTO users(username,password_hash,onboarding_state)
    VALUES(${'google:' + identity.sub},NULL,'pending')
    RETURNING id
  `;
  if (!created.length) throw new Error('NEW_GOOGLE_USER_CREATION_FAILED');

  const userId = created[0].id as string;
  await db`
    INSERT INTO google_links(user_id,google_sub,email,display_name,avatar_url)
    VALUES(${userId},${identity.sub},${identity.email},${identity.name},${identity.picture})
  `;
  await provisionFinanceWorkspace(db, userId);
  return { userId, created: true };
}

/** Shared first-time defaults for Google and local email/password accounts. */
export async function provisionFinanceWorkspace(db: Sql, userId: string): Promise<void> {
  for (const [name, kind, color] of DEFAULT_ACCOUNTS) {
    await db`
      INSERT INTO accounts(user_id,name,kind,color)
      VALUES(${userId},${name},${kind},${color})
    `;
  }
  for (const [kind, name, color] of DEFAULT_CATEGORIES) {
    await db`
      INSERT INTO categories(user_id,name,kind,color)
      VALUES(${userId},${name},${kind},${color})
    `;
  }
}

export function isAuthorizedGoogleOrigin(origin: string, webOrigin: string): boolean {
  const allowed = new Set(['http://127.0.0.1:5178', 'http://localhost:5178', webOrigin.trim()]);
  return !!origin && allowed.has(origin);
}
