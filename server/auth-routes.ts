import { Elysia } from 'elysia';
import { randomBytes, randomInt } from 'node:crypto';
import type { Sql } from 'postgres';
import { verifyGoogleCredential, isAuthorizedGoogleOrigin } from './google-auth.ts';
import {
  tokenHash,
  normalizeEmail,
  validEmail,
  validPassword,
  registerEmailAccount,
  authenticateEmail,
  attachEmailPassword,
  changePassword,
} from './auth-methods.ts';

const ALLOWED_METHODS = ['email', 'google', 'line'];
const ERROR = (s: string) => ({ error: s });
const attackLimits = new Map<string, { count: number; until: number }>();
function limited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  if (attackLimits.size > 5000) {
    for (const [k, v] of attackLimits) if (v.until < now) attackLimits.delete(k);
  }
  const prev = attackLimits.get(key);
  if (!prev || prev.until < now) {
    attackLimits.set(key, { count: 1, until: now + windowMs });
    return false;
  }
  prev.count++;
  return prev.count > max;
}
function originOkay(request: Request) {
  return isAuthorizedGoogleOrigin(request.headers.get('origin') || '', process.env.WEB_ORIGIN || '');
}
function originError(ctx: any) {
  if (!originOkay(ctx.request)) {
    ctx.set.status = 403;
    return ERROR('กรุณาทำรายการจากเว็บไซต์ MoneyFlow เท่านั้น');
  }
  return null;
}
async function sessionFor(db: Sql, ctx: any) {
  const tok = String(ctx.cookie?.mf_session?.value || '');
  if (!tok) return null;
  const rows =
    await db`SELECT user_id,auth_method,signed_in_at FROM sessions WHERE token_hash=${tokenHash(tok)} AND expires_at>now() LIMIT 1`;
  return rows[0] || null;
}
function createCookie(cookie: any, tok: string) {
  cookie.mf_session.set({
    value: tok,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}
async function issueSession(db: Sql, cookie: any, userId: string, method: string) {
  if (!ALLOWED_METHODS.includes(method)) throw Error('Invalid login method');
  const token = randomBytes(32).toString('hex');
  await db`
   INSERT INTO sessions(token_hash,user_id,expires_at,auth_method)
   VALUES(${tokenHash(token)},${userId},now()+interval '30 days',${method})
 `;
  createCookie(cookie, token);
}

function isUuid(raw: any) {
  return (
    typeof raw === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
  );
}
function validChallenge(body: any) {
  return isUuid(body?.id) && typeof body?.secret === 'string' && /^[a-f0-9]{64}$/.test(body.secret);
}

const lineOfficialAccountCache: { id: string | null } = { id: null };
const isLineBasicId = (value: string) => /^@[a-z0-9._-]{3,40}$/i.test(value);

/**
 * Resolve the LINE OA attached to this Messaging API channel, rather than
 * hard-coding an ID or asking users to configure another integration.
 * This is public bot profile data; access tokens never leave the server.
 */
async function getLineOfficialAccountId(): Promise<string | null> {
  const configured = String(process.env.LINE_OFFICIAL_ACCOUNT_ID || '').trim();
  if (isLineBasicId(configured)) return configured;
  if (lineOfficialAccountCache.id) return lineOfficialAccountCache.id;

  const token = String(process.env.LINE_CHANNEL_ACCESS_TOKEN || '');
  if (!token) return null;
  try {
    const response = await fetch('https://api.line.me/v2/bot/info', {
      headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) return null;
    const info = (await response.json()) as { basicId?: unknown };
    if (typeof info.basicId !== 'string' || !isLineBasicId(info.basicId)) return null;
    lineOfficialAccountCache.id = info.basicId;
    return info.basicId;
  } catch {
    return null;
  }
}

export function createAuthRoutes(sql: Sql) {
  return (
    new Elysia({ name: 'moneyflow-auth-methods' })
      // Public profile identifier only. The Messaging API access token stays on the server.
      // Visitors can add the real MoneyFlow LINE OA before creating an account.
      .get('/api/public/line-oa', async (ctx: any) => {
        const basicId = await getLineOfficialAccountId();
        if (!basicId) {
          ctx.set.status = 503;
          ctx.set.headers['Cache-Control'] = 'no-store';
          return { available: false };
        }
        ctx.set.headers['Cache-Control'] = 'public, max-age=300';
        return { available: true, basicId };
      })
      // LINE OAuth QR login temporarily disabled. Keep the original LINE chat-code login.
      .post('/api/auth/email/register', async (ctx: any) => {
        const origin = originError(ctx);
        if (origin) return origin;
        const body = ctx.body || {};
        const email = normalizeEmail(body.email);
        if (limited('register:' + email, 6, 30 * 60_000)) {
          ctx.set.status = 429;
          return ERROR('กรุณารอสักครู่ก่อนสมัครอีกครั้ง');
        }
        try {
          const user = await registerEmailAccount(sql, {
            email,
            name: String(body.name || ''),
            password: body.password,
          });
          await issueSession(sql, ctx.cookie, user.userId, 'email');
          return { ok: true, created: true };
        } catch (e: any) {
          ctx.set.status = 400;
          return ERROR(e.message || 'สมัครสมาชิกไม่สำเร็จ');
        }
      })
      .post('/api/auth/email/login', async (ctx: any) => {
        const origin = originError(ctx);
        if (origin) return origin;
        const body = ctx.body || {};
        const email = normalizeEmail(body.email);
        if (limited('login:' + email, 10, 15 * 60_000)) {
          ctx.set.status = 429;
          return ERROR('ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาที');
        }
        try {
          const id = await authenticateEmail(sql, email, body.password);
          if (!id) {
            ctx.set.status = 401;
            return ERROR('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
          }
          await issueSession(sql, ctx.cookie, id, 'email');
          return { ok: true };
        } catch {
          ctx.set.status = 500;
          return ERROR('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่');
        }
      })
      .post('/api/auth/email/connect', async (ctx: any) => {
        const origin = originError(ctx);
        if (origin) return origin;
        const session = await sessionFor(sql, ctx);
        if (!session) {
          ctx.set.status = 401;
          return ERROR('กรุณาเข้าสู่ระบบก่อน');
        }
        if (session.auth_method === 'email') {
          ctx.set.status = 403;
          return ERROR('ต้องเข้าสู่ระบบด้วย Google หรือ LINE เพื่อผูกอีเมลใหม่');
        }
        // Stronger step-up: linking another login method needs a recently issued
        // Google/LINE session (not any old authenticated browser tab).
        if (Date.now() - new Date(session.signed_in_at).getTime() > 15 * 60_000) {
          ctx.set.status = 403;
          return ERROR('กรุณาออกจากระบบแล้วเข้าสู่ระบบด้วย Google หรือ LINE ใหม่ก่อนเชื่อมอีเมล');
        }
        const body = ctx.body || {};
        try {
          return await attachEmailPassword(sql, session.user_id, {
            email: body.email,
            password: body.password,
          });
        } catch (e: any) {
          ctx.set.status = 400;
          return ERROR(e.message || 'เชื่อมอีเมลไม่สำเร็จ');
        }
      })
      .post('/api/auth/password/change', async (ctx: any) => {
        const origin = originError(ctx);
        if (origin) return origin;
        const session = await sessionFor(sql, ctx);
        if (!session) {
          ctx.set.status = 401;
          return ERROR('กรุณาเข้าสู่ระบบก่อน');
        }
        const body = ctx.body || {};
        const recentRecovery =
          ['google', 'line'].includes(session.auth_method) &&
          Date.now() - new Date(session.signed_in_at).getTime() < 15 * 60_000;
        try {
          const changed = await changePassword(
            sql,
            session.user_id,
            body.password,
            body.oldPassword,
            recentRecovery,
          );
          // Revoke all other sessions after a password change or LINE-assisted recovery.
          const current = String(ctx.cookie?.mf_session?.value || '');
          await sql`DELETE FROM sessions WHERE user_id=${session.user_id} AND token_hash<>${tokenHash(current)}`;
          return changed;
        } catch (e: any) {
          ctx.set.status = 400;
          return ERROR(e.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
        }
      })
      .post('/api/auth/google/link', async (ctx: any) => {
        const origin = originError(ctx);
        if (origin) return origin;
        const session = await sessionFor(sql, ctx);
        if (!session) {
          ctx.set.status = 401;
          return ERROR('กรุณาเข้าสู่ระบบก่อน');
        }
        if (Date.now() - new Date(session.signed_in_at).getTime() > 15 * 60_000) {
          ctx.set.status = 403;
          return ERROR('กรุณาเข้าสู่ระบบใหม่ก่อนเชื่อมบัญชี Google');
        }
        const clientId = String(process.env.GOOGLE_CLIENT_ID || '');
        if (!clientId.endsWith('.apps.googleusercontent.com')) {
          ctx.set.status = 503;
          return ERROR('ยังไม่ได้ตั้งค่า Google Client ID');
        }
        let identity;
        try {
          identity = await verifyGoogleCredential(ctx.body?.credential || '', clientId);
        } catch {
          ctx.set.status = 401;
          return ERROR('Google ยืนยันตัวตนไม่สำเร็จ');
        }
        try {
          return await sql.begin(async (tx) => {
            await tx`SELECT pg_advisory_xact_lock(hashtext(${'moneyflow-google:' + identity.sub}))`;
            const other =
              await tx`SELECT user_id FROM google_links WHERE google_sub=${identity.sub} OR user_id=${session.user_id}`;
            if (other.some((x) => x.user_id !== session.user_id)) {
              ctx.set.status = 409;
              return ERROR('Google บัญชีนี้เชื่อมกับบัญชี MoneyFlow อื่นอยู่แล้ว');
            }
            if (other.length) return { ok: true, linked: true };
            await tx`
      INSERT INTO google_links(user_id,google_sub,email,display_name,avatar_url)
      VALUES(${session.user_id},${identity.sub},${identity.email},${identity.name},${identity.picture})
    `;
            return { ok: true, linked: true };
          });
        } catch (e: any) {
          ctx.set.status = e?.code === '23505' ? 409 : 500;
          return ERROR('เชื่อม Google ไม่สำเร็จหรือบัญชีนี้ถูกใช้งานแล้ว');
        }
      })
      .post('/api/auth/line/start', async (ctx: any) => {
        const origin = originError(ctx);
        if (origin) return origin;
        if (limited('line:start', 80, 10 * 60_000)) {
          ctx.set.status = 429;
          return ERROR('มีการขอรหัสมากเกินไป กรุณารอสักครู่');
        }
        const secret = randomBytes(32).toString('hex');
        const code = String(randomInt(10_000_000, 100_000_000));
        await sql`DELETE FROM line_login_challenges WHERE expires_at<now()-interval '1 day'`;
        await sql`
    INSERT INTO line_login_challenges(secret_hash,code_hash,expires_at)
    VALUES(${tokenHash(secret)},${tokenHash('line-login:' + code)},now()+interval '5 minutes')
  `;
        const rows =
          await sql`SELECT id FROM line_login_challenges WHERE secret_hash=${tokenHash(secret)}`;
        return {
          ok: true,
          id: rows[0].id,
          secret,
          code,
          expiresMinutes: 5,
          lineBasicId: await getLineOfficialAccountId(),
        };
      })
      .post('/api/auth/line/status', async (ctx: any) => {
        const origin = originError(ctx);
        if (origin) return origin;
        const body = ctx.body || {};
        if (!validChallenge(body)) {
          ctx.set.status = 400;
          return ERROR('รหัสคำขอไม่ถูกต้อง');
        }
        const rows = await sql`
    SELECT status FROM line_login_challenges
    WHERE id=${body.id} AND secret_hash=${tokenHash(body.secret)}
    AND expires_at>now() AND status IN ('pending','approved') LIMIT 1
  `;
        if (!rows.length) {
          ctx.set.status = 410;
          return ERROR('รหัสเข้าสู่ระบบหมดอายุ กรุณาสร้างใหม่');
        }
        return { ok: true, approved: rows[0].status === 'approved' };
      })
      .post('/api/auth/line/cancel', async (ctx: any) => {
        const origin = originError(ctx);
        if (origin) return origin;
        const body = ctx.body || {};
        if (!validChallenge(body)) {
          ctx.set.status = 400;
          return ERROR('รหัสคำขอไม่ถูกต้อง');
        }
        await sql`
    UPDATE line_login_challenges SET status='consumed',consumed_at=now()
    WHERE id=${body.id} AND secret_hash=${tokenHash(body.secret)}
      AND status='pending'
  `;
        return { ok: true };
      })
      .post('/api/auth/line/complete', async (ctx: any) => {
        const origin = originError(ctx);
        if (origin) return origin;
        const body = ctx.body || {};
        if (!validChallenge(body)) {
          ctx.set.status = 400;
          return ERROR('รหัสคำขอไม่ถูกต้อง');
        }
        const rows = await sql`
    UPDATE line_login_challenges SET status='consumed',consumed_at=now()
    WHERE id=${body.id} AND secret_hash=${tokenHash(body.secret)}
      AND status='approved' AND expires_at>now() AND user_id IS NOT NULL
    RETURNING user_id
  `;
        if (!rows.length) {
          ctx.set.status = 403;
          return ERROR('ยังไม่ได้ยืนยันรหัสจาก LINE หรือรหัสถูกใช้ไปแล้ว');
        }
        await issueSession(sql, ctx.cookie, rows[0].user_id, 'line');
        return { ok: true };
      })
  );
}
