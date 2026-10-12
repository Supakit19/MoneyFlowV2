import { Elysia } from 'elysia';
import { createHash, randomBytes } from 'node:crypto';
import type { Sql } from 'postgres';
import { isAuthorizedGoogleOrigin } from './google-auth.ts';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const attempts = new Map<string, { hits: number; expires: number }>();
const publicPaths = new Set(['/', '/company']);
const settingKeys = new Set(['site_notice', 'support_email']);
const allowedOrigin = (request: Request) =>
  isAuthorizedGoogleOrigin(request.headers.get('origin') || '', process.env.WEB_ORIGIN || '');
function throttle(key: string, limit = 8) {
  const now = Date.now();
  if (attempts.size > 2000) for (const [k, v] of attempts) if (v.expires < now) attempts.delete(k);
  const record = attempts.get(key);
  if (!record || record.expires < now) { attempts.set(key, { hits: 1, expires: now + 15 * 60_000 }); return false; }
  return ++record.hits > limit;
}
const deny = (ctx: any, code: number, error: string) => { ctx.set.status = code; return { error }; };
const adminSession = async (db: Sql, ctx: any) => {
  const token = String(ctx.cookie?.mf_admin?.value || '');
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const rows = await db`
    SELECT a.id, a.email FROM admin_sessions s JOIN admin_users a ON a.id=s.admin_id
    WHERE s.token_hash=${digest(token)} AND s.expires_at>now() AND a.active=true LIMIT 1
  `;
  return rows[0] || null;
};
export const adminLoginAuthorized = allowedOrigin;
export function createAdminRoutes(db: Sql) {
  const adminGuard = (fn: (ctx: any, admin: any) => Promise<unknown>) => async (ctx: any) => {
    ctx.set.headers['Cache-Control'] = 'no-store';
    const user = await adminSession(db, ctx);
    if (!user) return deny(ctx, 401, 'กรุณาเข้าสู่ระบบผู้ดูแลระบบ');
    return fn(ctx, user);
  };
  return new Elysia({ name: 'moneyflow-admin' })
    .post('/api/public/visit', async (ctx: any) => {
      ctx.set.headers['Cache-Control'] = 'no-store';
      const path = String(ctx.body?.path || '');
      const visitor = String(ctx.body?.visitor || '');
      if (!publicPaths.has(path) || !/^[a-f0-9-]{36}$/.test(visitor))
        return deny(ctx, 400, 'ข้อมูลสถิติไม่ถูกต้อง');
      // Hash an anonymous session identifier. Never collect raw IP or personal finance details.
      const hash = digest(visitor + ':' + String(process.env.VISITOR_HASH_SECRET || 'moneyflow-anonymous-visit'));
      await db`
        INSERT INTO site_visits(visitor_hash, path, visit_day, view_count)
        VALUES(${hash},${path},(now() AT TIME ZONE 'Asia/Bangkok')::date,1)
        ON CONFLICT(visitor_hash,path,visit_day)
        DO UPDATE SET view_count=site_visits.view_count+1
      `;
      return { ok: true };
    })
    .get('/api/public/site-settings', async () => {
      const rows = await db`SELECT key,value FROM site_settings WHERE key IN ('site_notice','support_email')`;
      return { settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) };
    })
    .post('/api/admin/login', async (ctx: any) => {
      ctx.set.headers['Cache-Control'] = 'no-store';
      if (!allowedOrigin(ctx.request)) return deny(ctx, 403, 'ไม่อนุญาตให้เข้าสู่ระบบจากเว็บไซต์นี้');
      const email = String(ctx.body?.email || '').trim().toLowerCase();
      const password = ctx.body?.password;
      if (email.length > 254 || typeof password !== 'string' || password.length > 256 ||
          throttle('admin:' + email)) return deny(ctx, 429, 'กรุณาลองอีกครั้งในภายหลัง');
      const [admin] = await db`SELECT id,password_hash FROM admin_users WHERE email=${email} AND active=true LIMIT 1`;
      // Avoid account enumeration and timing differences for missing admin accounts.
      const fallback = '$argon2id$v=19$m=65536,t=2,p=1$CXfE1xrWlfAgyGNn8flh7g$LVImuBP81Dl8wFt80dqgHWMGsn89owtuq8THlSTlrNs';
      const ok = await Bun.password.verify(password, admin?.password_hash || fallback).catch(() => false);
      if (!admin || !ok) return deny(ctx, 401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      const token = randomBytes(32).toString('hex');
      await db`INSERT INTO admin_sessions(token_hash,admin_id,expires_at)
        VALUES(${digest(token)},${admin.id},now()+interval '8 hours')`;
      ctx.cookie.mf_admin.set({
        value: token, httpOnly: true, secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict', path: '/api/admin', maxAge: 8 * 3600,
      });
      return { ok: true };
    })
    .get('/api/admin/me', adminGuard(async (_ctx, admin) => ({ email: admin.email })))
    .post('/api/admin/logout', adminGuard(async (ctx) => {
      if (!allowedOrigin(ctx.request)) return deny(ctx, 403, 'คำขอไม่ถูกต้อง');
      await db`DELETE FROM admin_sessions WHERE token_hash=${digest(String(ctx.cookie?.mf_admin?.value || ''))}`;
      ctx.cookie.mf_admin.remove(); return { ok: true };
    }))
    .get('/api/admin/overview', adminGuard(async () => {
      const [members] = await db`SELECT count(*)::int AS total,
        count(*) FILTER(WHERE created_at>=now()-interval '30 days')::int AS new_month FROM users`;
      const [links] = await db`SELECT count(*)::int AS total FROM line_links`;
      const [accounts] = await db`SELECT count(*)::int AS total FROM accounts`;
      const [sessions] = await db`SELECT count(DISTINCT user_id)::int AS total FROM sessions WHERE expires_at>now()`;
      const [traffic] = await db`SELECT coalesce(sum(view_count),0)::int AS pageviews,
        count(DISTINCT visitor_hash)::int AS visitors FROM site_visits`;
      const daily = await db`SELECT visit_day::text AS date, sum(view_count)::int AS views,
        count(DISTINCT visitor_hash)::int AS visitors FROM site_visits
        WHERE visit_day>=(now() AT TIME ZONE 'Asia/Bangkok')::date-interval '29 days'
        GROUP BY visit_day ORDER BY visit_day`;
      return { members: members.total, newMembers30d: members.new_month,
        lineLinked: links.total, financeAccounts: accounts.total,
        activeSessions: sessions.total, visitors: traffic.visitors,
        pageviews: traffic.pageviews, daily };
    }))
    .get('/api/admin/settings', adminGuard(async () => {
      const rows = await db`SELECT key,value FROM site_settings ORDER BY key`;
      return { settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) };
    }))
    .put('/api/admin/settings', adminGuard(async (ctx, admin) => {
      if (!allowedOrigin(ctx.request)) return deny(ctx, 403, 'คำขอไม่ถูกต้อง');
      const key = String(ctx.body?.key || '');
      const value = ctx.body?.value;
      if (!settingKeys.has(key) || typeof value !== 'string' || value.length > 500)
        return deny(ctx, 400, 'การตั้งค่าไม่ถูกต้อง');
      if (key === 'support_email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        return deny(ctx, 400, 'อีเมลติดต่อไม่ถูกต้อง');
      await db`INSERT INTO site_settings(key,value,updated_by)
        VALUES(${key},${value},${admin.id})
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,
          updated_by=excluded.updated_by,updated_at=now()`;
      return { ok: true };
    }));
}
