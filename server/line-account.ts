import type { Sql } from 'postgres';
import { provisionFinanceWorkspace } from './google-auth.ts';

export type LineAccountResult = { userId: string; created: boolean };

export const validVerifiedLineId = (id: unknown): id is string =>
  typeof id === 'string' && /^U[0-9a-f]{32}$/i.test(id);

/**
 * Link verified LINE identity to its own finance workspace.
 *
 * ONLY call this after official LINE OAuth/LIFF ID token verification,
 * or from an authenticated LINE Messaging API webhook. Never accept an ID
 * from a browser request body. A LINE identity is never merged into an
 * email/Google account based on an unverified name or address.
 *
 * Caller MUST be inside a PostgreSQL transaction. The per-identity advisory
 * lock serializes simultaneous LIFF, QR and chat-code first sign-ins.
 */
export async function findOrCreateLineUserInTransaction(
  db: Sql,
  verifiedLineId: string,
): Promise<LineAccountResult> {
  if (!validVerifiedLineId(verifiedLineId)) throw Error('INVALID_VERIFIED_LINE_ID');

  await db`SELECT pg_advisory_xact_lock(hashtext(${'moneyflow-line:' + verifiedLineId}))`;
  const linked = await db`
    SELECT user_id FROM line_links WHERE line_user_id=${verifiedLineId} LIMIT 1
  `;
  if (linked.length) return { userId: linked[0].user_id as string, created: false };

  // The LINE subject is verified, but LINE does not guarantee a usable
  // email address. Keep email null until explicitly added by the user.
  const newUser = await db`
    INSERT INTO users(username,password_hash,display_name,onboarding_state)
    VALUES(${'line:' + verifiedLineId},NULL,'สมาชิก MoneyFlow','pending')
    RETURNING id
  `;
  if (!newUser.length) throw Error('LINE_ACCOUNT_CREATION_FAILED');
  const userId = newUser[0].id as string;
  await db`
    INSERT INTO line_links(user_id,line_user_id) VALUES(${userId},${verifiedLineId})
  `;
  await provisionFinanceWorkspace(db, userId);
  return { userId, created: true };
}

export async function findOrCreateLineUser(db: Sql, verifiedLineId: string): Promise<LineAccountResult> {
  return db.begin(async (tx) =>
    findOrCreateLineUserInTransaction(tx as unknown as Sql, verifiedLineId),
  ) as Promise<LineAccountResult>;
}

/** Do not allow a LINE-only member to unlink their final sign-in method. */
export function hasAlternateSignIn(
  methods: { email_login?: boolean; google_login?: boolean } | null | undefined,
): boolean {
  return Boolean(methods?.email_login || methods?.google_login);
}
