import { createHash, randomBytes } from 'node:crypto';
import { Elysia } from 'elysia';
import type { Sql } from 'postgres';
import type { PublishFn } from './realtime.ts';
import { sealVault, vaultKey } from '../shared/linejs-vault.ts';
import {
  hostedLineJsManager,
  type HostedConfig,
  type HostedLineJsManager,
} from './linejs-hosted-manager.ts';
import { lineJsLocalManager } from './linejs-local-manager.ts';
import { extraBankSources } from './linejs-bank-sources.ts';

type Guard = (fn: (ctx: any, userId: string) => Promise<unknown>) => (ctx: any) => Promise<unknown>;
type Publish = PublishFn;
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
function originAllowed(ctx: any) {
  const origin = String(ctx.request.headers.get('origin') || '');
  const allowed =
    process.env.NODE_ENV === 'production'
      ? [process.env.WEB_ORIGIN]
      : [process.env.WEB_ORIGIN, 'http://127.0.0.1:5178', 'http://localhost:5178'];
  if (allowed.filter(Boolean).includes(origin)) return true;
  ctx.set.status = 403;
  return false;
}
function noCache(ctx: any) {
  ctx.set.headers['Cache-Control'] = 'no-store';
  ctx.set.headers['Pragma'] = 'no-cache';
}
async function ensure(db: Sql, userId: string): Promise<any> {
  const rows = await db`
    INSERT INTO bank_linejs_settings(user_id) VALUES(${userId})
    ON CONFLICT(user_id) DO UPDATE SET user_id=excluded.user_id
    RETURNING *
  `;
  return rows[0];
}
function workerConfig(row: any): HostedConfig {
  return {
    userId: row.user_id,
    tokenEncrypted: row.connector_token_encrypted,
    enabled: row.enabled === true,
    senderMid: row.sender_mid,
    accountId: row.account_id,
    extraSenderMids: extraBankSources(row)
      .filter((x) => x.enabled)
      .map((x) => x.senderMid),
  };
}

export function createHostedLineJsRoutes(
  db: Sql,
  guarded: Guard,
  publish: Publish,
  manager: HostedLineJsManager = hostedLineJsManager,
) {
  return new Elysia({ name: 'moneyflow-hosted-linejs' })
    .get(
      '/api/bank/linejs/connector/status',
      guarded(async (ctx, userId) => {
        noCache(ctx);
        const row = await ensure(db, userId);
        return {
          ok: true,
          connectorMode: row.connector_mode || 'local',
          connected: row.connector_mode === 'hosted' && !!row.connector_token_encrypted,
          autoResume: row.connector_run_enabled === true,
          agent: manager.status(userId),
        };
      }),
    )
    .post(
      '/api/bank/linejs/connector/connect',
      guarded(async (ctx, userId) => {
        if (!originAllowed(ctx)) return { error: 'คำขอไม่ได้รับอนุญาต' };
        noCache(ctx);
        if (!manager.available) {
          ctx.set.status = 503;
          return { error: manager.reason };
        }
        const old = await ensure(db, userId);
        const occupancy = manager.status(userId);
        if (!occupancy.running && occupancy.runningWorkers >= occupancy.maxWorkers) {
          ctx.set.status = 503;
          return { error: 'Hosted LINEJS ใช้งานครบจำนวนผู้ใช้พร้อมกัน กรุณาลองใหม่ภายหลัง' };
        }
        if (lineJsLocalManager.status(userId, old.token_hash).running) {
          ctx.set.status = 409;
          return { error: 'กรุณาหยุด Local LINEJS เดิมก่อนเปลี่ยนเป็น Hosted' };
        }
        if (old.connector_mode === 'hosted' && old.connector_run_enabled) {
          ctx.set.status = 409;
          return { error: 'กรุณาหยุด Hosted LINEJS ก่อนเชื่อมใหม่' };
        }
        // QR login grants access to a personal LINE account, so require fresh login.
        const session = String(ctx.cookie?.mf_session?.value || '');
        const recent = session
          ? await db`SELECT 1 FROM sessions WHERE token_hash=${sha(session)} AND user_id=${userId}
                  AND expires_at>now() AND signed_in_at>now()-interval '30 minutes' LIMIT 1`
          : [];
        if (!recent.length) {
          ctx.set.status = 403;
          return { error: 'กรุณาเข้าสู่ MoneyFlow ใหม่อีกครั้งก่อนสแกน QR เชื่อม LINE' };
        }
        // A deliberate reconnection must not reuse the previous user's LINE
        // login. Wipe only this user's encrypted session before showing QR.
        if (old.connector_mode === 'hosted') await manager.remove(userId);
        const token = 'mfbank_' + randomBytes(32).toString('hex');
        const encrypted = sealVault(
          token,
          vaultKey(process.env.LINEJS_SESSION_ENCRYPTION_KEY),
          userId,
          'bridge-token',
        );
        await db`
        UPDATE bank_linejs_settings
        SET enabled=false, token_hash=${sha(token)}, connector_token_encrypted=${encrypted},
            connector_mode='hosted', connector_run_enabled=true, updated_at=now()
        WHERE user_id=${userId}
      `;
        try {
          await manager.start({
            userId,
            tokenEncrypted: encrypted,
            enabled: false,
            senderMid: old.sender_mid,
            accountId: old.account_id,
            extraSenderMids: extraBankSources(old)
              .filter((x) => x.enabled)
              .map((x) => x.senderMid),
          });
        } catch {
          await db`UPDATE bank_linejs_settings SET connector_run_enabled=false WHERE user_id=${userId}`;
          ctx.set.status = 503;
          return { error: 'เริ่ม Hosted LINEJS ไม่สำเร็จ กรุณาตรวจโควตา Worker แล้วลองใหม่' };
        }
        publish(userId, 'settings.changed');
        return { ok: true, agent: manager.status(userId) };
      }),
    )
    .post(
      '/api/bank/linejs/connector/start',
      guarded(async (ctx, userId) => {
        if (!originAllowed(ctx)) return { error: 'คำขอไม่ได้รับอนุญาต' };
        noCache(ctx);
        if (!manager.available) {
          ctx.set.status = 503;
          return { error: manager.reason };
        }
        const row = await ensure(db, userId);
        if (row.connector_mode !== 'hosted' || !row.connector_token_encrypted) {
          ctx.set.status = 409;
          return { error: 'กรุณาเชื่อม LINE ก่อน' };
        }
        await db`UPDATE bank_linejs_settings SET connector_run_enabled=true WHERE user_id=${userId}`;
        try {
          await manager.start(workerConfig(row));
        } catch {
          await db`UPDATE bank_linejs_settings SET connector_run_enabled=false WHERE user_id=${userId}`;
          ctx.set.status = 503;
          return { error: 'เริ่ม LINEJS ไม่สำเร็จ กรุณาลองอีกครั้ง' };
        }
        return { ok: true, agent: manager.status(userId) };
      }),
    )
    .post(
      '/api/bank/linejs/connector/stop',
      guarded(async (ctx, userId) => {
        if (!originAllowed(ctx)) return { error: 'คำขอไม่ได้รับอนุญาต' };
        noCache(ctx);
        const row = await ensure(db, userId);
        if (row.connector_mode !== 'hosted') {
          ctx.set.status = 409;
          return { error: 'บัญชีนี้ไม่ได้ใช้ Hosted LINEJS' };
        }
        await db`UPDATE bank_linejs_settings SET connector_run_enabled=false,updated_at=now()
               WHERE user_id=${userId}`;
        await manager.stop(userId);
        publish(userId, 'settings.changed');
        return { ok: true, agent: manager.status(userId) };
      }),
    )
    .post(
      '/api/bank/linejs/connector/disconnect',
      guarded(async (ctx, userId) => {
        if (!originAllowed(ctx)) return { error: 'คำขอไม่ได้รับอนุญาต' };
        noCache(ctx);
        const row = await ensure(db, userId);
        if (row.connector_mode !== 'hosted') return { ok: true };
        await db`UPDATE bank_linejs_settings SET
        connector_mode='local', connector_token_encrypted=NULL,
        connector_run_enabled=false,token_hash=NULL,enabled=false,
        sender_mid=NULL,updated_at=now() WHERE user_id=${userId}`;
        await manager.remove(userId);
        publish(userId, 'settings.changed');
        return { ok: true };
      }),
    );
}
