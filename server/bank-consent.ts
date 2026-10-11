/**
 * Versioned, optional opt-in for MoneyFlow's unofficial personal LINE
 * bank notification connector. Login with LINE is a different authorization.
 */
import { Elysia } from 'elysia';
import type { Sql } from 'postgres';
import { hostedLineJsManager } from './linejs-hosted-manager.ts';
import { lineJsLocalManager } from './linejs-local-manager.ts';
import type { PublishFn } from './realtime.ts';

export const BANK_CONSENT_VERSION = 'bank-line-access-2026-10-11';
type Guarded = (fn: (ctx: any, userId: string) => Promise<any>) => (ctx: any) => Promise<any>;

export async function hasBankAccessConsent(db: Sql, userId: string): Promise<boolean> {
  const rows = await db`
    SELECT 1 FROM bank_access_consents
    WHERE user_id=${userId}
      AND version=${BANK_CONSENT_VERSION}
      AND revoked_at IS NULL LIMIT 1
  `;
  return rows.length > 0;
}

const allowedOrigin = (ctx: any) => {
  const origin = String(ctx.request.headers.get('origin') || '');
  const expected = String(process.env.WEB_ORIGIN || 'http://127.0.0.1:5178');
  if (
    origin === expected ||
    (process.env.NODE_ENV !== 'production' &&
      ['http://127.0.0.1:5178', 'http://localhost:5178'].includes(origin))
  )
    return true;
  ctx.set.status = 403;
  return false;
};

export function createBankConsentRoutes(db: Sql, guarded: Guarded, publish: PublishFn) {
  return new Elysia({ name: 'moneyflow-bank-consent' })
    .get(
      '/api/bank/consent',
      guarded(async (ctx, userId) => {
        ctx.set.headers['cache-control'] = 'no-store';
        const rows = await db`
        SELECT version,granted_at,revoked_at FROM bank_access_consents
        WHERE user_id=${userId} LIMIT 1
      `;
        return {
          ok: true,
          version: BANK_CONSENT_VERSION,
          granted:
            rows.length > 0 && rows[0].version === BANK_CONSENT_VERSION && rows[0].revoked_at === null,
          grantedAt: rows[0]?.granted_at || null,
          revokedAt: rows[0]?.revoked_at || null,
        };
      }),
    )
    .post(
      '/api/bank/consent',
      guarded(async (ctx, userId) => {
        if (!allowedOrigin(ctx)) return { error: 'คำขอไม่ได้รับอนุญาต' };
        const body = ctx.body || {};
        if (
          body.version !== BANK_CONSENT_VERSION ||
          body.lineAccountAccess !== true ||
          body.bankMessageProcessing !== true ||
          body.understandsRisks !== true
        ) {
          ctx.set.status = 422;
          return { error: 'กรุณาอ่านและยืนยันแต่ละข้อก่อนเชื่อม LINE เพื่อรับแจ้งเตือนธนาคาร' };
        }
        await db.begin(async (tx) => {
          await tx.unsafe(
            `INSERT INTO bank_access_consents(user_id,version,granted_at,revoked_at)
            VALUES($1,$2,now(),NULL)
            ON CONFLICT (user_id) DO UPDATE
            SET version=EXCLUDED.version,granted_at=now(),revoked_at=NULL`,
            [userId, BANK_CONSENT_VERSION],
          );
          await tx.unsafe(
            "INSERT INTO bank_access_consent_events(user_id,version,action) VALUES($1,$2,'granted')",
            [userId, BANK_CONSENT_VERSION],
          );
        });
        publish(userId, 'settings.changed');
        return { ok: true, granted: true, version: BANK_CONSENT_VERSION };
      }),
    )
    .post(
      '/api/bank/consent/withdraw',
      guarded(async (ctx, userId) => {
        if (!allowedOrigin(ctx)) return { error: 'คำขอไม่ได้รับอนุญาต' };
        // Disable ingestion first, then stop/delete the authenticated session.
        // Retain transaction history for the user; never erase their ledger here.
        await db.begin(async (tx) => {
          await tx.unsafe(
            `UPDATE bank_access_consents SET revoked_at=now()
           WHERE user_id=$1 AND revoked_at IS NULL`,
            [userId],
          );
          await tx.unsafe(
            `UPDATE bank_linejs_settings
           SET enabled=false,connector_run_enabled=false,
               token_hash=NULL,connector_token_encrypted=NULL,
               updated_at=now() WHERE user_id=$1`,
            [userId],
          );
          await tx.unsafe(
            "INSERT INTO bank_access_consent_events(user_id,version,action) VALUES($1,$2,'withdrawn')",
            [userId, BANK_CONSENT_VERSION],
          );
        });
        try {
          await hostedLineJsManager.remove(userId);
        } catch (error) {
          // The settings and consent already prohibit new imports even if the
          // process could not be terminated immediately. Report this issue.
          console.error('BANK_CONSENT_WITHDRAW_STOP_FAILED', userId);
          ctx.set.status = 503;
          return {
            error: 'ปิดการนำเข้าข้อมูลแล้ว แต่การยกเลิกเซสชัน LINE ยังไม่เสร็จ กรุณาติดต่อผู้ดูแล',
          };
        }
        // Local connectors are only used on development machines.
        // The server ingest gate remains closed even if a local process persists.
        publish(userId, 'settings.changed');
        return { ok: true, granted: false, connectorStopped: true };
      }),
    );
}
