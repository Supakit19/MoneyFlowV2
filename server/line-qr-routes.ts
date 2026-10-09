import { Elysia } from 'elysia';
import { randomBytes } from 'node:crypto';
import type { Sql } from 'postgres';
import { isAuthorizedGoogleOrigin } from './google-auth.ts';
import {
  buildLineAuthorizationUrl,
  getLineOAuthConfig,
  LINE_QR_TTL_MINUTES,
  oauthSha256,
  randomOauthValue,
  verifyLineAuthorizationCode,
} from './line-oauth.ts';

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const isBrowserChallenge = (body: any) =>
  isUuid(body?.id) && typeof body?.secret === 'string' && /^[a-f0-9]{64}$/.test(body.secret);
const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const rateBuckets = new Map<string, { count: number; until: number }>();
function limited(key: string, max: number, periodMs: number) {
  const now = Date.now();
  if (rateBuckets.size > 3000)
    for (const [id, r] of rateBuckets) if (r.until <= now) rateBuckets.delete(id);
  const r = rateBuckets.get(key);
  if (!r || r.until <= now) {
    rateBuckets.set(key, { count: 1, until: now + periodMs });
    return false;
  }
  r.count++;
  return r.count > max;
}
function guardOrigin(ctx: any) {
  if (isAuthorizedGoogleOrigin(ctx.request.headers.get('origin') || '', process.env.WEB_ORIGIN || ''))
    return null;
  ctx.set.status = 403;
  return { error: 'กรุณาทำรายการจากเว็บไซต์ MoneyFlow เท่านั้น' };
}

/** Return a short success/failure screen to the scanning phone, not a web session. */
function phoneResult(ctx: any, success: boolean, title: string, details: string, status = 200) {
  ctx.set.status = status;
  ctx.set.headers['content-type'] = 'text/html; charset=utf-8';
  ctx.set.headers['cache-control'] = 'no-store, max-age=0';
  ctx.set.headers['referrer-policy'] = 'no-referrer';
  ctx.set.headers['x-content-type-options'] = 'nosniff';
  ctx.set.headers['x-frame-options'] = 'DENY';
  ctx.set.headers['content-security-policy'] =
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'";
  return (
    '<!doctype html><html lang="th"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>MoneyFlow · LINE Login</title><style>' +
    '*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:22px;background:#f5faf6;color:#1e4d38;font-family:system-ui,-apple-system,sans-serif}' +
    'main{width:min(100%,420px);background:white;border:1px solid #dce9df;border-radius:24px;text-align:center;padding:36px 25px;box-shadow:0 18px 60px #134f3910}' +
    'i{display:grid;place-items:center;width:74px;height:74px;border-radius:22px;margin:0 auto 23px;background:#e4f6eb;color:' +
    (success ? '#148f67' : '#b76e47') +
    ';font-style:normal;font-size:42px;font-weight:800}' +
    'h1{font-size:23px;line-height:1.5;margin:0 0 10px}p{font-size:14px;line-height:1.95;color:#6c8979;margin:0 0 18px}' +
    'small{font-size:12px;color:#7f9a88;line-height:1.75;display:block;background:#f5faf6;border-radius:12px;padding:13px}' +
    '</style></head><body><main><i>' +
    (success ? '✓' : '!') +
    '</i><h1>' +
    escapeHtml(title) +
    '</h1><p>' +
    escapeHtml(details) +
    '</p><small>' +
    (success
      ? 'กลับไปที่หน้าจอ MoneyFlow เดิมได้เลย ระบบจะเข้าสู่บัญชีให้อัตโนมัติ ไม่ต้องพิมพ์รหัส'
      : 'กลับไปที่หน้า MoneyFlow เดิมเพื่อสร้าง QR Code ใหม่อีกครั้ง') +
    '</small></main></body></html>'
  );
}

/** Explicit device approval prevents QR-code phishing, without requiring codes or chat. */
function phoneApprovalPage(ctx: any, id: string, token: string) {
  ctx.set.status = 200;
  ctx.set.headers['content-type'] = 'text/html; charset=utf-8';
  ctx.set.headers['cache-control'] = 'no-store, max-age=0';
  ctx.set.headers['referrer-policy'] = 'no-referrer';
  ctx.set.headers['x-content-type-options'] = 'nosniff';
  ctx.set.headers['x-frame-options'] = 'DENY';
  ctx.set.headers['content-security-policy'] =
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
  const fields =
    '<input type="hidden" name="id" value="' +
    escapeHtml(id) +
    '">' +
    '<input type="hidden" name="token" value="' +
    escapeHtml(token) +
    '">';
  return (
    '<!doctype html><html lang="th"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>MoneyFlow · ยืนยันการเข้าสู่ระบบ</title><style>' +
    '*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:20px;background:#f5faf6;color:#204b3b;font-family:system-ui,-apple-system,sans-serif}' +
    'main{max-width:420px;width:100%;background:#fff;border:1px solid #dce9df;border-radius:24px;text-align:center;padding:34px 24px;box-shadow:0 18px 60px #134f3910}' +
    'i{display:grid;place-items:center;background:#e5f5e9;color:#148f67;border-radius:22px;width:74px;height:74px;margin:0 auto 23px;font-size:38px;font-style:normal;font-weight:900}' +
    'h1{font-size:23px;line-height:1.5;margin:0 0 12px}p{font-size:14px;line-height:1.85;color:#708d7b;margin:0 0 20px}' +
    'strong{color:#174e38}button{border:0;border-radius:12px;width:100%;min-height:52px;font-size:15px;font-weight:800;background:#149c73;color:white;cursor:pointer}' +
    'button.deny{margin-top:10px;background:#f4f8f3;color:#4b765e;border:1px solid #e0e9df}' +
    'small{display:block;color:#759482;font-size:12px;line-height:1.8;margin-top:18px}' +
    '</style></head><body><main><i>✓</i>' +
    '<h1>อนุญาตให้เข้าสู่ MoneyFlow?</h1>' +
    '<p>LINE ยืนยันตัวตนของคุณแล้ว<br>มีการขอเข้าสู่บัญชี MoneyFlow <strong>บนอีกอุปกรณ์หนึ่ง</strong></p>' +
    '<form method="post" action="/api/auth/line/qr/approve">' +
    fields +
    '<button type="submit">อนุญาตให้เข้าสู่ระบบ</button>' +
    '<button class="deny" type="submit" formaction="/api/auth/line/qr/deny">ไม่ใช่ฉัน · ยกเลิก</button>' +
    '</form><small>กดอนุญาตเฉพาะเมื่อคุณกำลังเปิดหน้า MoneyFlow บนคอมหรือมือถือของตัวเอง' +
    '<br>ไม่ต้องพิมพ์เลขหรือส่งข้อความหา LINE OA</small></main></body></html>'
  );
}

/** LINE OAuth happens on the phone; the original browser holds the secret. */
export function createLineQrRoutes(
  sql: Sql,
  issueLineSession: (cookie: any, userId: string) => Promise<void>,
) {
  return new Elysia({ name: 'moneyflow-line-oauth-qr' })
    .get('/api/auth/line/qr/config', () => {
      const { config, reason } = getLineOAuthConfig();
      return { ok: true, enabled: !!config, reason: config ? null : reason };
    })
    .post('/api/auth/line/qr/start', async (ctx: any) => {
      const denied = guardOrigin(ctx);
      if (denied) return denied;
      const { config, reason } = getLineOAuthConfig();
      if (!config) {
        ctx.set.status = 503;
        return { error: reason };
      }
      if (
        limited('global', 200, 600_000) ||
        limited('ip:' + (ctx.request.headers.get('cf-connecting-ip') || 'local'), 18, 600_000)
      ) {
        ctx.set.status = 429;
        return { error: 'ขอ QR Code บ่อยเกินไป กรุณารอสักครู่' };
      }
      const browserSecret = randomBytes(32).toString('hex');
      const state = randomOauthValue(),
        nonce = randomOauthValue(),
        verifier = randomOauthValue();
      const rows = await sql`
        INSERT INTO line_qr_oauth_challenges
          (secret_hash,state,nonce,code_verifier,expires_at)
        VALUES (${oauthSha256(browserSecret)},${state},${nonce},${verifier},
          now()+interval '5 minutes') RETURNING id
      `;
      return {
        ok: true,
        id: rows[0].id,
        secret: browserSecret,
        expiresMinutes: LINE_QR_TTL_MINUTES,
        scanUrl: config.publicBaseUrl + '/api/auth/line/qr/scan/' + rows[0].id,
      };
    })
    .get('/api/auth/line/qr/scan/:id', async (ctx: any) => {
      ctx.set.headers['cache-control'] = 'no-store, max-age=0';
      ctx.set.headers['referrer-policy'] = 'no-referrer';
      const { config } = getLineOAuthConfig();
      if (!config || !isUuid(ctx.params.id))
        return phoneResult(ctx, false, 'QR นี้ใช้งานไม่ได้', 'กรุณาสร้าง QR ใหม่จาก MoneyFlow', 400);
      const rows = await sql`
        SELECT state,nonce,code_verifier FROM line_qr_oauth_challenges
        WHERE id=${ctx.params.id} AND status='pending' AND expires_at>now() LIMIT 1
      `;
      if (!rows.length) return phoneResult(ctx, false, 'QR Code หมดอายุแล้ว', 'กรุณาสร้าง QR ใหม่', 410);
      const authorizationUrl = buildLineAuthorizationUrl(config, {
        state: rows[0].state,
        nonce: rows[0].nonce,
        verifier: rows[0].code_verifier,
      });
      return ctx.redirect(authorizationUrl, 302);
    })
    .get('/api/auth/line/qr/callback', async (ctx: any) => {
      const { config } = getLineOAuthConfig();
      const params = new URL(ctx.request.url).searchParams;
      const state = params.get('state') || '',
        code = params.get('code') || '';
      const rejected = params.get('error') || '';
      if (!config || !/^[A-Za-z0-9_-]{43}$/.test(state))
        return phoneResult(ctx, false, 'LINE Login ไม่สำเร็จ', 'ข้อมูลการยืนยันไม่ถูกต้อง', 400);
      // Claim an unexpired challenge exactly once, preventing parallel callbacks.
      const rows = await sql`
        UPDATE line_qr_oauth_challenges SET status='verifying'
        WHERE state=${state} AND status='pending' AND expires_at>now()
        RETURNING id,nonce,code_verifier
      `;
      if (!rows.length)
        return phoneResult(ctx, false, 'ลิงก์ยืนยันหมดอายุแล้ว', 'กลับไปสร้าง QR ใหม่บน MoneyFlow', 410);
      const row = rows[0];
      if (rejected || !code) {
        await sql`
          UPDATE line_qr_oauth_challenges
          SET status='failed',error_reason='ผู้ใช้ยกเลิก LINE Login'
          WHERE id=${row.id} AND status='verifying'
        `;
        return phoneResult(ctx, false, 'ยกเลิกการเข้าสู่ระบบแล้ว', 'คุณสามารถลองใหม่ได้ทุกเมื่อ', 400);
      }
      try {
        const lineId = await verifyLineAuthorizationCode(config, code, row.code_verifier, row.nonce);
        const linked = await sql`SELECT user_id FROM line_links WHERE line_user_id=${lineId} LIMIT 1`;
        if (!linked.length) {
          await sql`
            UPDATE line_qr_oauth_challenges
            SET status='failed',error_reason='LINE นี้ยังไม่ได้เชื่อมกับบัญชี MoneyFlow'
            WHERE id=${row.id} AND status='verifying'
          `;
          return phoneResult(
            ctx,
            false,
            'ยังไม่ได้เชื่อม LINE กับบัญชี',
            'กรุณาเข้าสู่ระบบด้วยอีเมลหรือ Google ก่อน แล้วเชื่อม LINE ที่หน้าบัญชีและความปลอดภัย',
            403,
          );
        }
        // One tap on the phone is required before opening a financial account
        // on another device. This prevents approval by scanning a malicious QR.
        const approvalToken = randomBytes(32).toString('hex');
        const pendingApproval = await sql`
          UPDATE line_qr_oauth_challenges
          SET user_id=${linked[0].user_id},approval_hash=${oauthSha256(approvalToken)}
          WHERE id=${row.id} AND status='verifying' AND expires_at>now()
          RETURNING id
        `;
        if (!pendingApproval.length)
          return phoneResult(ctx, false, 'QR Code หมดอายุแล้ว', 'กรุณาสร้าง QR ใหม่', 410);
        return phoneApprovalPage(ctx, row.id, approvalToken);
      } catch {
        await sql`
          UPDATE line_qr_oauth_challenges
          SET status='failed',error_reason='ไม่สามารถตรวจสอบบัญชี LINE ได้'
          WHERE id=${row.id} AND status='verifying'
        `;
        return phoneResult(
          ctx,
          false,
          'ตรวจสอบบัญชี LINE ไม่สำเร็จ',
          'กรุณาลองใหม่หรือตรวจสอบการตั้งค่า LINE Login ของเว็บไซต์',
          502,
        );
      }
    })
    .post('/api/auth/line/qr/approve', async (ctx: any) => {
      const body = ctx.body || {};
      const id = body.id,
        token = body.token;
      if (!isUuid(id) || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
        return phoneResult(ctx, false, 'ไม่สามารถอนุญาตได้', 'ข้อมูลการยืนยันไม่ถูกต้อง', 400);
      const rows = await sql`
        UPDATE line_qr_oauth_challenges
        SET status='approved',approved_at=now(),approval_hash=NULL
        WHERE id=${id} AND approval_hash=${oauthSha256(token)}
          AND status='verifying' AND user_id IS NOT NULL AND expires_at>now()
        RETURNING id
      `;
      if (!rows.length)
        return phoneResult(ctx, false, 'ไม่สามารถอนุญาตได้', 'QR หมดอายุหรือถูกใช้ไปแล้ว', 410);
      return phoneResult(
        ctx,
        true,
        'อนุญาตเรียบร้อย!',
        'MoneyFlow บนหน้าจอเดิมกำลังเข้าสู่บัญชีของคุณโดยอัตโนมัติ',
      );
    })
    .post('/api/auth/line/qr/deny', async (ctx: any) => {
      const body = ctx.body || {};
      const id = body.id,
        token = body.token;
      if (!isUuid(id) || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
        return phoneResult(ctx, false, 'ยกเลิกไม่ได้', 'ข้อมูลการยืนยันไม่ถูกต้อง', 400);
      const rows = await sql`
        UPDATE line_qr_oauth_challenges
        SET status='failed',error_reason='ผู้ใช้ปฏิเสธการเข้าสู่ระบบ',approval_hash=NULL
        WHERE id=${id} AND approval_hash=${oauthSha256(token)}
          AND status='verifying' AND expires_at>now()
        RETURNING id
      `;
      if (!rows.length) return phoneResult(ctx, false, 'ลิงก์ยืนยันหมดอายุ', 'กรุณาใช้ QR ใหม่', 410);
      return phoneResult(
        ctx,
        false,
        'ยกเลิกแล้ว',
        'เราไม่ได้อนุญาตให้อุปกรณ์นั้นเข้าสู่บัญชี MoneyFlow',
        200,
      );
    })
    .post('/api/auth/line/qr/status', async (ctx: any) => {
      const denied = guardOrigin(ctx);
      if (denied) return denied;
      if (!isBrowserChallenge(ctx.body)) {
        ctx.set.status = 400;
        return { error: 'คำขอ QR ไม่ถูกต้อง' };
      }
      const b = ctx.body;
      const rows = await sql`
        SELECT status,error_reason,(approval_hash IS NOT NULL) AS awaiting_confirm FROM line_qr_oauth_challenges
        WHERE id=${b.id} AND secret_hash=${oauthSha256(b.secret)}
          AND expires_at>now() AND status IN('pending','verifying','approved','failed') LIMIT 1
      `;
      if (!rows.length) {
        ctx.set.status = 410;
        return { error: 'QR Code หมดอายุหรือถูกใช้งานแล้ว' };
      }
      return {
        ok: true,
        approved: rows[0].status === 'approved',
        awaitingConfirm: rows[0].status === 'verifying' && rows[0].awaiting_confirm,
        failed: rows[0].status === 'failed',
        message: rows[0].status === 'failed' ? rows[0].error_reason : null,
      };
    })
    .post('/api/auth/line/qr/complete', async (ctx: any) => {
      const denied = guardOrigin(ctx);
      if (denied) return denied;
      if (!isBrowserChallenge(ctx.body)) {
        ctx.set.status = 400;
        return { error: 'คำขอ QR ไม่ถูกต้อง' };
      }
      const b = ctx.body;
      const rows = await sql`
        UPDATE line_qr_oauth_challenges SET status='consumed',consumed_at=now()
        WHERE id=${b.id} AND secret_hash=${oauthSha256(b.secret)}
          AND status='approved' AND expires_at>now() AND user_id IS NOT NULL
        RETURNING user_id
      `;
      if (!rows.length) {
        ctx.set.status = 403;
        return { error: 'ยังไม่ได้รับการยืนยันจาก LINE หรือ QR ถูกใช้งานแล้ว' };
      }
      await issueLineSession(ctx.cookie, rows[0].user_id);
      return { ok: true };
    })
    .post('/api/auth/line/qr/cancel', async (ctx: any) => {
      const denied = guardOrigin(ctx);
      if (denied) return denied;
      if (!isBrowserChallenge(ctx.body)) {
        ctx.set.status = 400;
        return { error: 'คำขอ QR ไม่ถูกต้อง' };
      }
      const b = ctx.body;
      await sql`
        UPDATE line_qr_oauth_challenges SET status='consumed',consumed_at=now()
        WHERE id=${b.id} AND secret_hash=${oauthSha256(b.secret)}
          AND status IN('pending','verifying','approved')
      `;
      return { ok: true };
    });
}
