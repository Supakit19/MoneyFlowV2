import { createHash, randomBytes } from 'node:crypto';
import { Elysia } from 'elysia';
import type { Sql } from 'postgres';
import { isAuthorizedGoogleOrigin } from './google-auth.ts';

/**
 * An app opened inside LINE uses LINE Login, never the unofficial bank-chat listener.
 * The app ID is public; every user identity must be verified by LINE on our server.
 */
export function getMiniAppConfig(env: NodeJS.ProcessEnv = process.env) {
  const liffId = String(env.LINE_LIFF_ID || '').trim();
  const channelId = String(env.LINE_LOGIN_CHANNEL_ID || '').trim();
  const valid = /^[0-9]{5,20}-[a-zA-Z0-9]{5,64}$/.test(liffId);
  const enabled = valid && /^[0-9]{5,20}$/.test(channelId) && liffId.startsWith(channelId + '-');
  return { enabled, liffId: enabled ? liffId : '', channelId: enabled ? channelId : '' };
}

export async function verifyMiniIdToken(
  token: unknown,
  channelId: string,
  transport: typeof fetch = fetch,
  now = Date.now(),
): Promise<string> {
  if (
    typeof token !== 'string' ||
    token.length < 100 ||
    token.length > 12000 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
  )
    throw Error('INVALID_ID_TOKEN');

  const response = await transport('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: token, client_id: channelId }),
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw Error('LINE_VERIFICATION_FAILED');
  const data = (await response.json()) as {
    iss?: unknown;
    aud?: unknown;
    exp?: unknown;
    sub?: unknown;
    iat?: unknown;
  };
  const seconds = Math.floor(now / 1000);
  if (
    data.iss !== 'https://access.line.me' ||
    data.aud !== channelId ||
    typeof data.exp !== 'number' ||
    data.exp <= seconds ||
    data.exp > seconds + 24 * 60 * 60 ||
    (data.iat !== undefined && (typeof data.iat !== 'number' || data.iat > seconds + 120)) ||
    typeof data.sub !== 'string' ||
    !/^U[0-9a-f]{32}$/i.test(data.sub)
  )
    throw Error('INVALID_LINE_IDENTITY');
  return data.sub;
}

export function createMiniAppRoutes(
  db: Sql,
  env: NodeJS.ProcessEnv = process.env,
  transport: typeof fetch = fetch,
) {
  return new Elysia({ name: 'moneyflow-mini-app' })
    .get('/api/mini/config', ({ set }: any) => {
      set.headers['Cache-Control'] = 'no-store';
      const { enabled, liffId } = getMiniAppConfig(env);
      return { enabled, liffId };
    })
    .post('/api/mini/auth', async (ctx: any) => {
      ctx.set.headers['Cache-Control'] = 'no-store';
      const { enabled, channelId } = getMiniAppConfig(env);
      if (!enabled) {
        ctx.set.status = 503;
        return { error: 'การเข้าใช้งานจาก LINE ยังไม่เปิดให้บริการ' };
      }
      if (!isAuthorizedGoogleOrigin(ctx.request.headers.get('origin') || '', env.WEB_ORIGIN || '')) {
        ctx.set.status = 403;
        return { error: 'กรุณาเปิดจากเว็บไซต์ MoneyFlow เท่านั้น' };
      }
      let lineUserId: string;
      try {
        lineUserId = await verifyMiniIdToken(ctx.body?.idToken, channelId, transport);
      } catch {
        ctx.set.status = 401;
        return { error: 'ยืนยันบัญชี LINE ไม่สำเร็จ กรุณาลองเปิดใหม่อีกครั้ง' };
      }
      try {
        // A LINE identity can access only the MoneyFlow account explicitly linked to it.
        // Never register new users or trust profile/user IDs supplied by the browser.
        const linked = await db`SELECT user_id FROM line_links WHERE line_user_id=${lineUserId} LIMIT 1`;
        if (!linked.length) {
          ctx.set.status = 403;
          return {
            error: 'LINE นี้ยังไม่เชื่อมกับ MoneyFlow กรุณาเข้าเว็บไซต์และเชื่อมบัญชีก่อน',
            linkRequired: true,
          };
        }
        const session = randomBytes(32).toString('hex');
        const hash = createHash('sha256').update(session).digest('hex');
        await db`INSERT INTO sessions(token_hash,user_id,expires_at,auth_method)
          VALUES(${hash},${linked[0].user_id},now()+interval '7 days','line')`;
        ctx.cookie.mf_session.set({
          value: session,
          httpOnly: true,
          sameSite: 'lax',
          secure: env.NODE_ENV === 'production',
          path: '/',
          maxAge: 7 * 24 * 60 * 60,
        });
        return { ok: true };
      } catch {
        ctx.set.status = 500;
        return { error: 'เข้าใช้งานไม่สำเร็จ กรุณาลองใหม่ภายหลัง' };
      }
    });
}
