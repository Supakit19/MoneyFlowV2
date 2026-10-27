import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import postgres from 'postgres';
import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'node:fs';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  verifyGoogleCredential,
  findOrCreateGoogleUser,
  isAuthorizedGoogleOrigin,
} from './google-auth.ts';
import { createAuthRoutes } from './auth-routes.ts';
import { createAdminRoutes } from './admin-routes.ts';
import { tokenHash } from './auth-methods.ts';
import { validateAmount, validLocalDate, validateAiText } from '../src/validation.ts';
import { startRealtime, type PublishFn } from './realtime.ts';
import { fullFinanceOverview, setPreferences } from './moneyflow-features.ts';
import { handleLineMessage } from './line-bot.ts';
import { createBankLineJsRoutes } from './bank-linejs.ts';
import { createHostedLineJsRoutes } from './linejs-hosted-routes.ts';
import { createFinanceToolsRoutes } from './finance-tools.ts';
import { createReceiptRoutes } from './receipt-tools.ts';
import { createMiniAppRoutes } from './mini-app-auth.ts';
import { createLineQrRoutes } from './line-qr-routes.ts';
import { hasAlternateSignIn } from './line-account.ts';
import { hostedLineJsManager } from './linejs-hosted-manager.ts';
import { extraBankSources } from './linejs-bank-sources.ts';
import { lineJsLocalManager } from './linejs-local-manager.ts';

let publishFinance: PublishFn = () => {};
if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
  throw Error('Production DATABASE_URL missing; refusing local database fallback');
}
const sql = postgres(
  process.env.DATABASE_URL || 'postgres://moneyflow:moneyflow_local@127.0.0.1:55432/moneyflow',
  { max: 8 },
);
const port = Number(process.env.APP_PORT || 3011);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const monthTH = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
const dateTH = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const money = (x: any) => {
  const error = validateAmount(x);
  if (error) throw Error(error);
  return Math.round(Number(x) * 100);
};
const fail = (msg: string) => ({ error: msg });
const safeError = (e: any) => {
  const message = String(e?.message || 'เกิดข้อผิดพลาด');
  if (/RESOURCE_EXHAUSTED|quota|429/i.test(message))
    return 'Gemini ใช้งานถึงโควตาแล้ว กรุณารอสักครู่และลองใหม่';
  if (/model_not_found|NOT_FOUND|404|not available to new users/i.test(message))
    return 'โมเดล Gemini นี้ไม่พร้อมใช้งาน กรุณาตรวจสอบ GEMINI_MODEL ในไฟล์ .env';
  if (/API_KEY_INVALID|401|403|PERMISSION_DENIED/i.test(message))
    return 'Gemini API Key ไม่มีสิทธิ์ใช้งาน กรุณาตรวจสอบ Google AI Studio';
  if (/timeout|UNAVAILABLE|503/i.test(message)) return 'Gemini ตอบกลับไม่ทัน กรุณาลองอีกครั้ง';
  return message.startsWith('{') || message.length > 180
    ? 'เกิดข้อผิดพลาดขณะประมวลผล กรุณาลองใหม่และตรวจบันทึกเซิร์ฟเวอร์'
    : message;
};
const guarded = (fn: (ctx: any, u: string) => Promise<any>) => async (ctx: any) => {
  try {
    const token =
      (ctx.headers.authorization || '').replace(/^Bearer /, '') || ctx.cookie?.mf_session?.value || '';
    if (!token) {
      ctx.set.status = 401;
      return fail('กรุณาเข้าสู่ระบบ');
    }
    const rows =
      await sql`SELECT user_id FROM sessions WHERE token_hash=${sha(token)} AND expires_at>now()`;
    if (!rows.length) {
      ctx.set.status = 401;
      return fail('เซสชันหมดอายุ');
    }
    return await fn(ctx, rows[0].user_id);
  } catch (e: any) {
    ctx.set.status = /429|RESOURCE_EXHAUSTED|quota/i.test(String(e?.message)) ? 429 : 400;
    return fail(safeError(e));
  }
};
const ai = () =>
  process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
async function extract(message: string, base64?: string, mime?: string) {
  const prompt = `คุณคือผู้ช่วยอ่านข้อความ/รูปภาพเพื่อเสนอรายการการเงินใน MoneyFlow
ตอบ JSON เท่านั้น รูปแบบ {"items":[{"kind":"expense","amount":65,"merchant":"กาแฟ","category":"อาหาร","note":"","confidence":0.95}],"query":null}
- ผู้ใช้ถามยอดหรือขอสรุป: items=[] และ query="summary"
- รูปสลิปโอนเงิน/จ่ายเงินจากธนาคาร (เช่น K PLUS มีคำว่า "โอนเงินสำเร็จ"): ถ้าเห็นยอดเงินที่โอนจริงชัดเจน ให้เสนอ 1 รายการที่มี kind="expense", amount เป็นจำนวนเงินจริงที่โอน (ไม่ใช่ค่าธรรมเนียม/เลขอ้างอิง/เลขบัญชี), merchant เป็นชื่อผู้รับที่อ่านได้ หรือ "โอนเงิน", category="อื่นๆ", note="สลิปโอนเงิน รอผู้ใช้ตรวจสอบ" และ query="transfer_review" เสมอ ระบบจะถามผู้ใช้ก่อนบันทึก ห้ามถือว่าสลิปคือการซื้อของโดยอัตโนมัติ
- ถ้าเป็นภาพหลักฐานเงินเข้าที่ชัดเจน ให้เสนอ kind="income" แต่ query="transfer_review" เพื่อขอผู้ใช้ยืนยันเช่นกัน
- ถ้าอาจเป็นการโอนระหว่างบัญชีของตัวเอง ก็ยัง query="transfer_review" เสมอ ห้ามบันทึกอัตโนมัติ
- สลิป 1 ใบเสนอได้สูงสุด 1 รายการ ห้ามนำเลขบัญชี/เลขอ้างอิง/ยอดคงเหลือมาเป็นจำนวนเงิน
- หากอ่านจำนวนเงินจริงไม่ได้ชัดเจน ให้ items=[] แต่ถ้ารู้ว่าเป็นสลิปโอนเงินให้ query="transfer_review"
- รายจ่ายปกติ เช่น "กาแฟ 55" หรือใบเสร็จสินค้าทั่วไป ให้แยกตามจริงและใช้ query=null
- ห้ามเดาตัวเลขหรือชื่อผู้รับ หากข้อมูลไม่พอให้ items=[]
ข้อความผู้ใช้: ${message}`;
  const gen = ai();
  if (gen) {
    const parts: any[] = [{ text: prompt }];
    if (base64) parts.push({ inlineData: { data: base64, mimeType: mime || 'image/jpeg' } });
    const res = await gen.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      contents: [{ role: 'user', parts }],
      config: { responseMimeType: 'application/json' },
    });
    const parsed = JSON.parse(res.text || '{}');
    return { items: Array.isArray(parsed.items) ? parsed.items : [], query: parsed.query || null };
  }
  if (base64) throw Error('กรุณาตั้งค่า GEMINI_API_KEY เพื่ออ่านรูป');
  if (/(สรุป|เดือนนี้|เหลือ|ยอด|เท่าไหร่)/.test(message)) return { items: [], query: 'summary' };
  const items: any[] = [];
  const re =
    /(?:^|\s)(?:จ่าย|ซื้อ|กิน|ค่า|รับ|ได้เงิน|เงินเข้า)?\s*([^\d\s]{2,24})\s*(\d+(?:\.\d{1,2})?)/g;
  for (const match of message.matchAll(re)) {
    const name = match[1].trim();
    const n = Number(match[2]);
    if (n > 0 && n < 1e7)
      items.push({
        kind: /(เงินเดือน|รับ|รายได้)/.test(message) ? 'income' : 'expense',
        amount: n,
        merchant: name,
        category: /(ข้าว|กาแฟ|อาหาร|น้ำ)/.test(name)
          ? 'อาหาร'
          : /(รถ|น้ำมัน|ทางด่วน)/.test(name)
            ? 'เดินทาง'
            : 'อื่นๆ',
        note: '',
      });
  }
  return { items, query: null };
}
async function sendLine(to: string, message: any, replyToken?: string) {
  const access = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!access) throw Error('Missing LINE token');
  if (!replyToken) throw Error('Reply token required: Push API is disabled by default');
  const messages = (Array.isArray(message) ? message : [message]).map((m: any) =>
    typeof m === 'string' ? { type: 'text', text: m.slice(0, 4900) } : m,
  );
  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + access },
    body: JSON.stringify({ replyToken, messages }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw Error('LINE HTTP ' + response.status);
}
const lineText = async (event: any) =>
  handleLineMessage(event, {
    db: sql,
    send: sendLine,
    extract,
    publish: publishFinance,
    ai,
  });
let processing = false;
async function workQueue() {
  if (processing) return;
  processing = true;
  try {
    const evts =
      await sql`UPDATE line_events SET status='processing',attempts=attempts+1 WHERE id IN (SELECT id FROM line_events WHERE status='queued' ORDER BY created_at LIMIT 3 FOR UPDATE SKIP LOCKED) RETURNING *`;
    for (const e of evts) {
      try {
        if (e.event.type === 'message' && ['text', 'image'].includes(e.event.message?.type))
          await lineText(e.event);
        await sql`UPDATE line_events SET status='done' WHERE id=${e.id}`;
      } catch (err: any) {
        console.error('LINE event:', err.message);
        await sql`UPDATE line_events SET status='failed',error=${String(err.message).slice(0, 500)} WHERE id=${e.id}`;
        try {
          if (e.event.source?.userId && e.event.replyToken)
            await sendLine(
              e.event.source.userId,
              'ขออภัย ระบบประมวลผลไม่สำเร็จ กรุณาลองอีกครั้ง',
              e.event.replyToken,
            );
        } catch {}
      }
    }
  } catch (e) {
    console.error('Queue:', e);
  } finally {
    processing = false;
  }
}
const allowedOrigins =
  process.env.NODE_ENV === 'production'
    ? [process.env.WEB_ORIGIN || ''].filter(Boolean)
    : [process.env.WEB_ORIGIN || 'http://localhost:5178', 'http://127.0.0.1:5178'];
const issueLineOAuthSession = async (cookie: any, userId: string) => {
  const sessionToken = randomBytes(32).toString('hex');
  await sql`INSERT INTO sessions(token_hash,user_id,expires_at,auth_method)
    VALUES(${sha(sessionToken)},${userId},now()+interval '30 days','line')`;
  cookie.mf_session.set({
    value: sessionToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
};
const app = new Elysia()
  .use(cors({ origin: allowedOrigins, credentials: true }))
  .use(createAuthRoutes(sql))
  .use(createAdminRoutes(sql))
  .use(createLineQrRoutes(sql, issueLineOAuthSession))
  .use(createMiniAppRoutes(sql))
  .use(createBankLineJsRoutes(sql, guarded, (...args) => publishFinance(...args)))
  .use(createFinanceToolsRoutes(sql, guarded, (...args) => publishFinance(...args)))
  .use(createReceiptRoutes(sql, guarded, extract, (...args) => publishFinance(...args)))
  .use(createHostedLineJsRoutes(sql, guarded, (...args) => publishFinance(...args)))
  .get('/api/health', async () => {
    try {
      await sql`SELECT 1`;
      return {
        ok: true,
        database: 'connected',
        gemini: !!process.env.GEMINI_API_KEY,
        line: !!(process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_CHANNEL_SECRET),
      };
    } catch {
      return { ok: false, database: 'offline' };
    }
  })
  .get('/api/auth/status', async () => ({
    setup: (await sql`SELECT count(*)::int AS n FROM users`)[0].n === 0,
  }))
  .get('/api/auth/google/config', async () => {
    const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
    return {
      enabled: clientId.endsWith('.apps.googleusercontent.com'),
      clientId: clientId.endsWith('.apps.googleusercontent.com') ? clientId : '',
    };
  })
  .post('/api/auth/google', async ({ body, request, set, cookie }: any) => {
    const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
    if (!clientId.endsWith('.apps.googleusercontent.com')) {
      set.status = 503;
      return fail('ยังไม่ได้ตั้งค่า Google OAuth Client ID ในไฟล์ .env');
    }
    if (!isAuthorizedGoogleOrigin(request.headers.get('origin') || '', process.env.WEB_ORIGIN || '')) {
      set.status = 403;
      return fail('กรุณาล็อกอินจากเว็บไซต์ MoneyFlow ที่ได้รับอนุญาต');
    }
    const credential = typeof body?.credential === 'string' ? body.credential : '';
    let identity;
    try {
      identity = await verifyGoogleCredential(credential, clientId);
    } catch {
      set.status = 401;
      return fail('Google ยืนยันตัวตนไม่สำเร็จ กรุณาลองเลือกบัญชีใหม่');
    }
    try {
      const result = await sql.begin(async (tx) =>
        findOrCreateGoogleUser(tx as unknown as typeof sql, identity),
      );
      const token = randomBytes(32).toString('hex');
      await sql`INSERT INTO sessions(token_hash,user_id,expires_at,auth_method) VALUES(${sha(token)},${result.userId},now()+interval '30 days','google')`;
      cookie.mf_session.set({
        value: token,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
      return { ok: true, created: result.created };
    } catch (e: any) {
      if (e?.message === 'EMAIL_ACCOUNT_MUST_LINK_GOOGLE_FIRST') {
        set.status = 409;
        return fail(
          'อีเมลนี้มีบัญชี MoneyFlow แล้ว กรุณาเข้าสู่ระบบด้วยอีเมลก่อน แล้วกดเชื่อม Google ในเมนูบัญชีและความปลอดภัย',
        );
      }
      console.error('Google sign-in failed:', e instanceof Error ? e.name : 'unknown');
      set.status = 500;
      return fail('เข้าสู่ระบบ Google ไม่สำเร็จ กรุณาลองอีกครั้ง');
    }
  })
  // Legacy password signup/sign-in are disabled for the multi-user Google-only app.
  .post('/api/auth/setup', ({ set }: any) => {
    set.status = 410;
    return fail('โปรดเข้าสู่ระบบด้วย Google');
  })
  .post('/api/auth/login', ({ set }: any) => {
    set.status = 410;
    return fail('โปรดเข้าสู่ระบบด้วย Google');
  })
  .get(
    '/api/me',
    guarded(async (_, u) => {
      const rows = await sql`
 SELECT u.id,u.created_at,u.onboarding_state,
 COALESCE(g.display_name,u.display_name,'สมาชิก MoneyFlow') AS display_name,
 COALESCE(u.email,g.email) AS email,g.avatar_url,(g.google_sub IS NOT NULL) AS google_linked,
 (u.password_hash IS NOT NULL) AS password_set,
 (l.line_user_id IS NOT NULL) AS line_connected,
 (u.email IS NOT NULL) AS email_login_enabled
 FROM users u LEFT JOIN google_links g ON g.user_id=u.id
 LEFT JOIN line_links l ON l.user_id=u.id
 WHERE u.id=${u} LIMIT 1`;
      if (!rows.length) throw Error('ไม่พบผู้ใช้งาน');
      return rows[0];
    }),
  )
  .post(
    '/api/auth/logout',
    guarded(async (ctx, u) => {
      const token = ctx.cookie?.mf_session?.value || '';
      await sql`DELETE FROM sessions WHERE token_hash=${sha(token)} AND user_id=${u}`;
      ctx.cookie.mf_session.remove();
      return { ok: true };
    }),
  )
  .post(
    '/api/onboarding/state',
    guarded(async ({ body }, userId) => {
      const status = (body as { state?: unknown } | null)?.state;
      if (status !== 'completed' && status !== 'skipped')
        throw Error('สถานะการเริ่มต้นใช้งานไม่ถูกต้อง');
      const rows = await sql`
  UPDATE users SET onboarding_state=${status}
  WHERE id=${userId} RETURNING onboarding_state
 `;
      if (!rows.length) throw Error('ไม่พบผู้ใช้งาน');
      return { ok: true, state: rows[0].onboarding_state };
    }),
  )
  .get(
    '/api/finance/overview',
    guarded(async (_, userId) => fullFinanceOverview(sql, userId)),
  )
  .put(
    '/api/finance/preferences',
    guarded(async ({ body }, userId) => {
      const settings = await setPreferences(sql, userId, body);
      publishFinance(userId, 'settings.changed');
      return { ok: true, settings, overview: await fullFinanceOverview(sql, userId) };
    }),
  )
  .get(
    '/api/data',
    guarded(async (_, u) => {
      const [accounts, categories, transactions, budgets, recurring, links] = await Promise.all([
        sql`SELECT a.*, (a.opening_satang+COALESCE((SELECT SUM(CASE WHEN t.kind='income' AND t.account_id=a.id THEN t.amount_satang WHEN t.kind='expense' AND t.account_id=a.id THEN -t.amount_satang WHEN t.kind='transfer' AND t.account_id=a.id THEN -t.amount_satang WHEN t.kind='transfer' AND t.to_account_id=a.id THEN t.amount_satang ELSE 0 END) FROM transactions t WHERE t.account_id=a.id OR t.to_account_id=a.id),0))::text AS balance_satang FROM accounts a WHERE a.user_id=${u} ORDER BY a.name`,
        sql`SELECT * FROM categories WHERE user_id=${u} ORDER BY kind,name`,
        sql`SELECT t.*,c.name category_name,a.name account_name FROM transactions t LEFT JOIN categories c ON c.id=t.category_id LEFT JOIN accounts a ON a.id=t.account_id WHERE t.user_id=${u} ORDER BY t.transacted_at DESC,t.created_at DESC LIMIT 1000`,
        sql`SELECT * FROM budgets WHERE user_id=${u}`,
        sql`SELECT * FROM recurring_rules WHERE user_id=${u} ORDER BY title`,
        sql`SELECT * FROM line_links WHERE user_id=${u}`,
      ]);
      return {
        accounts,
        categories,
        transactions,
        budgets,
        recurring,
        lineConnected: links.length > 0,
        month: monthTH(),
      };
    }),
  )
  .post(
    '/api/accounts',
    guarded(async ({ body }, u) => {
      const b: any = body || {};
      const name = String(b.name || '').trim();
      if (!name) throw Error('กรุณากรอกชื่อบัญชี');
      if (name.length > 60) throw Error('ชื่อบัญชีต้องไม่เกิน 60 ตัวอักษร');
      if (!['bank', 'cash', 'wallet'].includes(b.kind)) throw Error('กรุณาเลือกประเภทบัญชี');
      const opening = Number(b.opening_satang);
      if (
        b.opening_satang === null ||
        b.opening_satang === undefined ||
        !Number.isSafeInteger(opening) ||
        opening < 0 ||
        opening > 1_000_000_000
      )
        throw Error('ยอดตั้งต้นต้องเป็นจำนวนเงินที่ไม่ติดลบและไม่เกิน 10 ล้านบาท');
      const color = String(b.color || '#159e79');
      if (!/^#[0-9a-f]{6}$/i.test(color)) throw Error('รูปแบบสีไม่ถูกต้อง');
      const rows = await sql`INSERT INTO accounts(user_id,name,kind,opening_satang,color)
  VALUES(${u},${name},${b.kind},${opening},${color}) RETURNING *`;
      publishFinance(u);
      return rows[0];
    }),
  )
  .patch(
    '/api/accounts/:id',
    guarded(async ({ body, params }, u) => {
      const b: any = body || {};
      const name = typeof b.name === 'string' ? b.name.trim() : '';
      if (!name) throw Error('กรุณากรอกชื่อบัญชี');
      if (name.length > 60) throw Error('ชื่อบัญชีต้องไม่เกิน 60 ตัวอักษร');
      if (
        b.opening_satang === null ||
        b.opening_satang === undefined ||
        !Number.isSafeInteger(b.opening_satang) ||
        b.opening_satang < 0 ||
        b.opening_satang > 1_000_000_000
      )
        throw Error('ยอดตั้งต้นต้องเป็นจำนวนเต็มหน่วยสตางค์ 0 ถึง 10 ล้านบาท');
      const rows = await sql`
   UPDATE accounts SET name=${name},opening_satang=${b.opening_satang}
   WHERE id=${params.id} AND user_id=${u}
   RETURNING id,name,opening_satang
 `;
      if (!rows.length) throw Error('ไม่พบบัญชีของคุณ');
      publishFinance(u);
      return { ok: true, account: rows[0] };
    }),
  )
  .post(
    '/api/categories',
    guarded(async ({ body }, u) => {
      const b: any = body || {};
      const name = String(b.name || '').trim();
      if (!name || name.length > 40) throw Error('กรุณาระบุชื่อหมวดหมู่ (ไม่เกิน 40 ตัวอักษร)');
      if (!['income', 'expense'].includes(b.kind)) throw Error('กรุณาเลือกประเภทหมวดหมู่');
      const color = String(b.color || '#169d77');
      if (!/^#[0-9a-f]{6}$/i.test(color)) throw Error('รูปแบบสีไม่ถูกต้อง');
      const rows = await sql`INSERT INTO categories(user_id,name,kind,color)
  VALUES(${u},${name},${b.kind},${color}) RETURNING *`;
      publishFinance(u);
      return rows[0];
    }),
  )
  .post(
    '/api/transactions',
    guarded(async ({ body }, u) => {
      const b: any = body || {};
      const kind = b.kind;
      if (!['income', 'expense', 'transfer'].includes(kind)) throw Error('กรุณาเลือกประเภทรายการ');
      const amountSatang = money(b.amount);
      const merchant = String(b.merchant || '').trim();
      const note = String(b.note || '').trim();
      if (kind !== 'transfer' && !merchant) throw Error('กรุณากรอกชื่อรายการหรือร้านค้า');
      if (merchant.length > 120) throw Error('ชื่อรายการต้องไม่เกิน 120 ตัวอักษร');
      if (note.length > 500) throw Error('หมายเหตุต้องไม่เกิน 500 ตัวอักษร');
      if (!b.account_id) throw Error('กรุณาเลือกบัญชีเงิน');
      const acct = await sql`SELECT id FROM accounts WHERE id=${b.account_id} AND user_id=${u}`;
      if (!acct.length) throw Error('ไม่พบบัญชีเงินที่เลือก');
      if (kind === 'transfer') {
        if (!b.to_account_id) throw Error('กรุณาเลือกบัญชีปลายทาง');
        const dst = await sql`SELECT id FROM accounts WHERE id=${b.to_account_id} AND user_id=${u}`;
        if (!dst.length || dst[0].id === b.account_id) throw Error('บัญชีต้นทางและปลายทางต้องต่างกัน');
      } else {
        if (!b.category_id) throw Error('กรุณาเลือกหมวดหมู่');
        const cat =
          await sql`SELECT id FROM categories WHERE id=${b.category_id} AND kind=${kind} AND user_id=${u}`;
        if (!cat.length) throw Error('หมวดหมู่ไม่ตรงกับประเภทรายการ');
      }
      if (!b.transacted_at || !validLocalDate(String(b.transacted_at).slice(0, 10)))
        throw Error('กรุณาเลือกวันที่ที่ถูกต้อง');
      const at = new Date(b.transacted_at);
      if (Number.isNaN(at.getTime())) throw Error('วันที่ไม่ถูกต้อง');
      const rows = await sql`INSERT INTO transactions(
  user_id,account_id,to_account_id,category_id,kind,amount_satang,merchant,note,transacted_at)
  VALUES(${u},${b.account_id},${kind === 'transfer' ? b.to_account_id : null},
    ${kind === 'transfer' ? null : b.category_id},${kind},${amountSatang},
    ${kind === 'transfer' ? merchant || 'โอนเงิน' : merchant},${note},${at}) RETURNING *`;
      publishFinance(u);
      return rows[0];
    }),
  )
  .delete(
    '/api/transactions/:id',
    guarded(async ({ params }, u) => {
      const rows =
        await sql`DELETE FROM transactions WHERE id=${params.id} AND user_id=${u} RETURNING id`;
      if (!rows.length) throw Error('ไม่พบรายการที่ต้องการลบ');
      publishFinance(u);
      return { ok: true };
    }),
  )
  .put(
    '/api/budgets',
    guarded(async ({ body }, u) => {
      const b: any = body || {};
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(b.month || '')))
        throw Error('กรุณาเลือกเดือนให้ถูกต้อง');
      if (!b.category_id) throw Error('กรุณาเลือกหมวดหมู่งบประมาณ');
      const cat =
        await sql`SELECT id FROM categories WHERE id=${b.category_id} AND user_id=${u} AND kind='expense'`;
      if (!cat.length) throw Error('หมวดหมู่งบประมาณไม่ถูกต้อง');
      const limit = money(b.amount);
      const rows = await sql`INSERT INTO budgets(user_id,category_id,month,limit_satang)
  VALUES(${u},${b.category_id},${b.month},${limit})
  ON CONFLICT(user_id,category_id,month)
  DO UPDATE SET limit_satang=excluded.limit_satang RETURNING *`;
      publishFinance(u);
      return rows[0];
    }),
  )
  .post(
    '/api/recurring',
    guarded(async ({ body }, u) => {
      const b: any = body || {};
      const title = String(b.title || '').trim();
      if (!title) throw Error('กรุณากรอกชื่อรายการประจำ');
      if (title.length > 80) throw Error('ชื่อรายการประจำต้องไม่เกิน 80 ตัวอักษร');
      if (!['income', 'expense'].includes(b.kind)) throw Error('ประเภทของรายการประจำไม่ถูกต้อง');
      if (!Number.isInteger(b.day_of_month) || b.day_of_month < 1 || b.day_of_month > 31)
        throw Error('กรุณาระบุวันที่ของทุกเดือนเป็นเลข 1–31');
      if (!b.account_id) throw Error('กรุณาเลือกบัญชีเงิน');
      if (!b.category_id) throw Error('กรุณาเลือกหมวดหมู่');
      const amountSatang = money(b.amount);
      const rows = await sql`INSERT INTO recurring_rules(
   user_id,account_id,category_id,kind,amount_satang,title,day_of_month)
  SELECT ${u},a.id,c.id,${b.kind},${amountSatang},${title},${b.day_of_month}
  FROM accounts a,categories c
  WHERE a.id=${b.account_id} AND c.id=${b.category_id}
   AND a.user_id=${u} AND c.user_id=${u} AND c.kind=${b.kind}
  RETURNING *`;
      if (!rows.length) throw Error('บัญชีหรือหมวดหมู่ที่เลือกไม่ถูกต้อง');
      publishFinance(u);
      return rows[0];
    }),
  )
  .delete(
    '/api/recurring/:id',
    guarded(async ({ params }, u) => {
      const rows =
        await sql`DELETE FROM recurring_rules WHERE id=${params.id} AND user_id=${u} RETURNING id`;
      if (!rows.length) throw Error('ไม่พบรายการประจำที่ต้องการลบ');
      publishFinance(u);
      return { ok: true };
    }),
  )
  .post(
    '/api/recurring/run',
    guarded(async (_, u) => {
      const m = monthTH(),
        today = Number(dateTH().slice(-2));
      const rules =
        await sql`SELECT * FROM recurring_rules WHERE user_id=${u} AND active=true AND day_of_month<=${today}`;
      let n = 0;
      for (const r of rules) {
        await sql.begin(async (tx) => {
          const done =
            await tx`INSERT INTO recurring_executions(rule_id,month) VALUES(${r.id},${m}) ON CONFLICT DO NOTHING RETURNING rule_id`;
          if (!done.length) return;
          const t =
            await tx`INSERT INTO transactions(user_id,account_id,category_id,kind,amount_satang,merchant,source) VALUES(${u},${r.account_id},${r.category_id},${r.kind},${r.amount_satang},${r.title},'recurring') RETURNING id`;
          await tx`UPDATE recurring_executions SET transaction_id=${t[0].id} WHERE rule_id=${r.id} AND month=${m}`;
          n++;
        });
      }
      if (n > 0) publishFinance(u);
      return { created: n };
    }),
  )
  .get(
    '/api/line/status',
    guarded(async () => {
      const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
      const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
      if (!token)
        return {
          lineConfigured: false,
          webhookConfigured: false,
          webhookActive: false,
          geminiConfigured: !!process.env.GEMINI_API_KEY,
          model,
        };
      try {
        const r = await fetch('https://api.line.me/v2/bot/channel/webhook/endpoint', {
          headers: { Authorization: 'Bearer ' + token },
          signal: AbortSignal.timeout(8000),
        });
        const x: any = r.ok ? await r.json() : {};
        return {
          lineConfigured: true,
          webhookConfigured: !!x.endpoint,
          webhookActive: x.active === true,
          endpoint: typeof x.endpoint === 'string' ? x.endpoint : null,
          geminiConfigured: !!process.env.GEMINI_API_KEY,
          model,
          error: r.status !== 200 && r.status !== 404 ? 'LINE HTTP ' + r.status : null,
        };
      } catch {
        return {
          lineConfigured: true,
          webhookConfigured: false,
          webhookActive: false,
          geminiConfigured: !!process.env.GEMINI_API_KEY,
          model,
          error: 'ตรวจสถานะ LINE ไม่สำเร็จ',
        };
      }
    }),
  )
  .post(
    '/api/line/pair',
    guarded(async (ctx, u) => {
      const token = String(ctx.cookie?.mf_session?.value || '');
      const session =
        await sql`SELECT signed_in_at FROM sessions WHERE token_hash=${sha(token)} AND user_id=${u} AND expires_at>now()`;
      if (!session.length || Date.now() - new Date(session[0].signed_in_at).getTime() > 15 * 60_000)
        throw Error('กรุณาเข้าสู่ระบบใหม่ก่อนเชื่อม LINE เพื่อความปลอดภัย');
      const code = String(randomInt(100000, 1000000));
      await sql`DELETE FROM pair_codes WHERE user_id=${u}`;
      await sql`INSERT INTO pair_codes(code_hash,user_id,expires_at) VALUES(${sha(code)},${u},now()+interval '10 minutes')`;
      return { code, expiresMinutes: 10 };
    }),
  )
  .delete(
    '/api/line/link',
    guarded(async (_, u) => {
      // A LINE-only member would permanently lose access to their finance
      // workspace after disconnecting their one and only identity.
      await sql.begin(async (tx) => {
        await tx`SELECT id FROM users WHERE id=${u} FOR UPDATE`;
        const methods = await tx`
          SELECT
            (u.email IS NOT NULL AND u.password_hash IS NOT NULL) AS email_login,
            EXISTS(SELECT 1 FROM google_links g WHERE g.user_id=u.id) AS google_login
          FROM users u WHERE u.id=${u} LIMIT 1
        `;
        if (!hasAlternateSignIn(methods[0])) {
          throw Error(
            'กรุณาเชื่อม Google หรือเพิ่มวิธีเข้าสู่ระบบสำรองก่อนยกเลิก LINE เพื่อไม่ให้สูญเสียการเข้าถึงข้อมูล',
          );
        }
        await tx`DELETE FROM line_links WHERE user_id=${u}`;
      });
      publishFinance(u, 'line.connected');
      return { ok: true };
    }),
  )
  .post(
    '/api/ai/parse',
    guarded(async ({ body }, u) => {
      const raw = String((body as any)?.text || '');
      const validation = validateAiText(raw);
      if (validation) throw Error(validation);
      return extract(raw.trim());
    }),
  )
  .post('/webhook/line', async ({ request, set }: any) => {
    const secret = process.env.LINE_CHANNEL_SECRET;
    if (!secret) {
      set.status = 503;
      return fail('LINE not configured');
    }
    const raw = await request.text();
    const sig = request.headers.get('x-line-signature') || '';
    const expected = createHmac('sha256', secret).update(raw).digest('base64');
    const x = Buffer.from(sig),
      y = Buffer.from(expected);
    if (x.length !== y.length || !timingSafeEqual(x, y)) {
      set.status = 401;
      return fail('Invalid signature');
    }
    const payload = JSON.parse(raw);
    for (const ev of payload.events || []) {
      const id = ev.webhookEventId || ev.message?.id;
      if (!id || !ev.source?.userId) continue;
      await sql`INSERT INTO line_events(id,line_user_id,event) VALUES(${id},${ev.source.userId},${sql.json(ev)}) ON CONFLICT DO NOTHING`;
    }
    queueMicrotask(() => void workQueue());
    return 'OK';
  });
try {
  await sql.unsafe(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  console.log('PostgreSQL migrated');
} catch (e) {
  console.error(
    'PostgreSQL schema migration failed; refusing to serve traffic',
    e instanceof Error ? e.name : 'unknown',
  );
  throw e;
}
setInterval(() => void workQueue(), 4000);
app.listen({ hostname: process.env.LISTEN_HOST || '127.0.0.1', port });
publishFinance = startRealtime(sql, port + 50);
// Private, on-demand, message-free diagnostics for operators. Trigger SIGUSR2
// inside the API container; never include chat contents, PINs or tokens.
process.on('SIGUSR2', () => {
  console.log('[LINEJS HEALTH]', JSON.stringify(hostedLineJsManager.diagnosticSummary()));
});
console.log('MoneyFlow API http://127.0.0.1:' + port);

// Hosted sessions are resumed from per-user encrypted credentials only after
// the database schema is ready. A stopped user never resumes automatically.
void (async () => {
  if (!hostedLineJsManager.available) return;
  const rows = await sql`
    SELECT user_id,connector_token_encrypted,enabled,sender_mid,account_id,extra_sources
    FROM bank_linejs_settings
    WHERE connector_mode='hosted' AND connector_run_enabled=true
      AND connector_token_encrypted IS NOT NULL
    ORDER BY updated_at DESC LIMIT 8
  `;
  await hostedLineJsManager.restore(
    rows.map((row) => ({
      userId: row.user_id,
      tokenEncrypted: row.connector_token_encrypted,
      enabled: row.enabled === true,
      senderMid: row.sender_mid,
      accountId: row.account_id,
      extraSenderMids: extraBankSources(row)
        .filter((x) => x.enabled)
        .map((x) => x.senderMid),
    })),
  );
})().catch(() => {
  console.warn('[LINEJS] Hosted connector resume unavailable; legacy local connector unaffected');
});

// Restore the locally opted-in LINEJS Worker after the API starts or reloads.
// Bun --watch terminates that child on every server restart, so restore it
// only for the previously bound owner, with matching token and enabled Flow.
// An explicit Stop in the UI disables auto-resume until Start is pressed again.
void (async () => {
  const ownerId = lineJsLocalManager.ownerUserId();
  if (!ownerId) return;
  const rows = await sql`
    SELECT enabled, token_hash, sender_mid
    FROM bank_linejs_settings
    WHERE user_id=${ownerId}
    LIMIT 1
  `;
  const configuration = rows[0];
  if (!configuration || configuration.enabled !== true) return;
  // On hot reload the old Node child may take a moment to terminate.
  // Retry briefly rather than leaving the bank listener stopped forever.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      if (
        lineJsLocalManager.resumeOnBoot(
          ownerId,
          configuration.token_hash,
          true,
          configuration.sender_mid,
          port,
        )
      ) {
        console.log('[LINEJS] Restored the enabled local notification listener after API startup.');
      }
      return;
    } catch {
      if (attempt === 4) throw Error('Local LINEJS worker startup unavailable');
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }
})().catch(() => {
  console.warn('[LINEJS] Automatic listener restore unavailable. Check LINEJS Local Agent.');
});

export { money, monthTH };
