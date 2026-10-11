import postgres from 'postgres';
import {
  findTransferPairs,
  confirmTransferPair,
  createFinanceToolsRoutes,
} from '../server/finance-tools.ts';
import { createReceiptRoutes } from '../server/receipt-tools.ts';
import { createHash } from 'node:crypto';
const url = process.env.TEST_DATABASE_URL || '';
const parsed = new URL(url);
if (
  parsed.hostname !== '127.0.0.1' ||
  parsed.port !== '55439' ||
  process.env.MF_ALLOW_LOCAL_PG_INTEGRATION !== 'YES'
) {
  throw Error('Refusing any non-local isolated PostgreSQL DB');
}
const db = postgres(url, { max: 4 });
const prefix = 'qa-' + Date.now();
let userId = '';
const assert = (ok: boolean, msg: string) => {
  if (!ok) throw Error('ASSERTION FAILED: ' + msg);
};
try {
  const users = await db`INSERT INTO users(username) VALUES(${prefix}) RETURNING id`;
  userId = users[0].id;
  const accounts = await db`INSERT INTO accounts(user_id,name,opening_satang)
   VALUES(${userId},'กสิกรไทย',200000),(${userId},'กรุงไทย',150000) RETURNING id,name`;
  const a = accounts.find((x) => x.name === 'กสิกรไทย')!.id;
  const b = accounts.find((x) => x.name === 'กรุงไทย')!.id;
  const categories = await db`INSERT INTO categories(user_id,name,kind)
   VALUES(${userId},'อื่นๆ','income'),(${userId},'อื่นๆ','expense')
   RETURNING id,kind`;
  const expense = categories.find((c) => c.kind === 'expense')!.id;
  const income = categories.find((c) => c.kind === 'income')!.id;
  const outTx = (
    await db`INSERT INTO transactions(user_id,account_id,category_id,kind,amount_satang,merchant,source,source_message_id)
  VALUES(${userId},${a},${expense},'expense',50000,'โอนออก','bank_linejs','qa-out') RETURNING id`
  )[0].id;
  const inTx = (
    await db`INSERT INTO transactions(user_id,account_id,category_id,kind,amount_satang,merchant,source,source_message_id)
  VALUES(${userId},${b},${income},'income',50000,'รับโอน','bank_linejs','qa-in') RETURNING id`
  )[0].id;
  const sender = 'u' + 'a'.repeat(32);
  const events = await db`INSERT INTO bank_linejs_events
   (user_id,event_hash,sender_mid,bank,kind,amount_satang,status,transaction_id)
   VALUES (${userId},${createHash('sha256')
     .update(prefix + '-out')
     .digest('hex')},${sender},'kbank','expense',50000,'saved',${outTx}),
          (${userId},${createHash('sha256')
            .update(prefix + '-in')
            .digest('hex')},${'u' + 'b'.repeat(32)},'ktb','income',50000,'saved',${inTx})
   RETURNING id,kind`;
  const outEvent = events.find((e) => e.kind === 'expense')!.id;
  const inEvent = events.find((e) => e.kind === 'income')!.id;
  const suggestions = await findTransferPairs(db, userId);
  assert(
    suggestions.some((x) => x.outId === outEvent && x.inId === inEvent),
    'pair not proposed',
  );
  console.log('REAL_DB_TRANSFER_SUGGESTED', suggestions.length);
  await confirmTransferPair(db, userId, outEvent, inEvent);
  const finance =
    await db`SELECT kind,amount_satang,to_account_id,account_id FROM transactions WHERE user_id=${userId}`;
  assert(
    (finance.length === 1 && finance[0].kind === 'transfer' && finance[0].amount_satang === '50000') ||
      (finance.length === 1 &&
        finance[0].kind === 'transfer' &&
        Number(finance[0].amount_satang) === 50000),
    'invalid ledger after pairing',
  );
  assert(finance[0].to_account_id === b && finance[0].account_id === a, 'transfer routing');
  const updatedEvents = await db`SELECT transaction_id FROM bank_linejs_events WHERE user_id=${userId}`;
  assert(
    updatedEvents.length === 2 && updatedEvents.every((e) => e.transaction_id === outTx),
    'both event links kept',
  );
  console.log('REAL_DB_TRANSFER_MATCHED', finance[0].kind, 'source and target accounts preserved');
  try {
    await confirmTransferPair(db, userId, outEvent, inEvent);
    throw Error('Second pairing unexpectedly succeeded');
  } catch (e: any) {
    assert(/ได้รับการจัดการ|ไม่สามารถยืนยัน/.test(e.message), 'repeat pairing was not rejected');
  }
  console.log('REAL_DB_REPEAT_REJECTED');
  await db`INSERT INTO bank_linejs_settings(user_id,bank,sender_mid,account_id)
 VALUES(${userId},'kbank',${sender},${a})`;
  const reviewId = (
    await db`INSERT INTO bank_linejs_events(user_id,event_hash,sender_mid,bank,kind,status,reason)
 VALUES(${userId},${createHash('sha256')
   .update(prefix + '-unreadable')
   .digest('hex')},${sender},'kbank',NULL,'pending','ไม่ชัดเจน') RETURNING id`
  )[0].id;
  const guard = (handler: any) => (ctx: any) => handler(ctx, userId);
  const routes = createFinanceToolsRoutes(db, guard, () => {});
  const inboxResp = await routes.handle(new Request('http://127.0.0.1/api/finance/inbox'));
  assert(inboxResp.status === 200, 'inbox status');
  const inbox = (await inboxResp.json()) as any;
  assert(inbox.review.length === 1 && inbox.review[0].id === reviewId, 'pending inbox');
  console.log('REAL_DB_BANK_INBOX_VISIBLE');
  const confirmResp = await routes.handle(
    new Request('http://127.0.0.1/api/finance/inbox/' + reviewId + '/confirm', {
      method: 'POST',
      headers: {
        origin: process.env.WEB_ORIGIN || 'http://127.0.0.1:5178',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ kind: 'expense', amountSatang: 7400, accountId: a }),
    }),
  );
  const confirmed = (await confirmResp.json()) as any;
  console.log('INBOX_CONFIRM_DIAGNOSTIC', confirmResp.status, JSON.stringify(confirmed).slice(0, 400));
  assert(confirmResp.status === 200 && confirmed.ok, 'pending confirmed');
  const secondResp = await routes.handle(
    new Request('http://127.0.0.1/api/finance/inbox/' + reviewId + '/confirm', {
      method: 'POST',
      headers: {
        origin: process.env.WEB_ORIGIN || 'http://127.0.0.1:5178',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ kind: 'expense', amountSatang: 7400, accountId: a }),
    }),
  );
  assert(secondResp.status !== 200, 'duplicate pending refused');
  console.log('REAL_DB_INBOX_CONFIRM_ONCE');
  // Real DB receipt insert/confirm validates foreign keys and dedup
  const receiptImage = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(120, 0x11)]);
  const image64 = receiptImage.toString('base64');
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'LOCAL_INTEGRATION_DUMMY';
  try {
    const receiptRoute = createReceiptRoutes(
      db,
      guard,
      async () => ({
        items: [
          {
            kind: 'expense',
            amount: 287.55,
            merchant: 'ร้านทดสอบ',
            category: 'อื่นๆ',
            confidence: 0.93,
          },
        ],
      }),
      () => {},
    );
    const preview = await receiptRoute.handle(
      new Request('http://127.0.0.1/api/finance/receipts/preview', {
        method: 'POST',
        headers: {
          origin: process.env.WEB_ORIGIN || 'http://127.0.0.1:5178',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ base64: image64, mime: 'image/png' }),
      }),
    );
    const data = (await preview.json()) as any;
    assert(preview.status === 200 && data.reviewId, 'receipt preview');
    const confirm = await receiptRoute.handle(
      new Request('http://127.0.0.1/api/finance/receipts/confirm', {
        method: 'POST',
        headers: {
          origin: process.env.WEB_ORIGIN || 'http://127.0.0.1:5178',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          reviewId: data.reviewId,
          accountId: a,
          categoryId: expense,
          kind: 'expense',
          amountSatang: 28755,
          merchant: 'ร้านทดสอบ',
        }),
      }),
    );
    const saved = (await confirm.json()) as any;
    assert(confirm.status === 200 && saved.ok, 'receipt booked');
    const previewAgain = await receiptRoute.handle(
      new Request('http://127.0.0.1/api/finance/receipts/preview', {
        method: 'POST',
        headers: {
          origin: process.env.WEB_ORIGIN || 'http://127.0.0.1:5178',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ base64: image64, mime: 'image/png' }),
      }),
    );
    assert(previewAgain.status === 409, 'repeat slip blocked');
    console.log('REAL_DB_RECEIPT_DEDUP_AND_PRIVACY');
  } finally {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
  const exported = await routes.handle(new Request('http://127.0.0.1/api/finance/export.csv'));
  assert(exported.status === 200, 'CSV endpoint');
  const csv = await exported.text();
  assert(csv.includes('โอนระหว่างบัญชี') && csv.includes('287.55'), 'CSV rows');
  console.log('REAL_DB_CSV_EXPORT_OK');
  // Sessions are hashed and scoped to the current user. Revoking other sessions
  // must preserve the cookie used for the current session.
  const ownToken = 'qa-current-session-' + prefix;
  const anotherToken = 'qa-other-session-' + prefix;
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  await db`INSERT INTO sessions(token_hash,user_id,expires_at,auth_method)
   VALUES(${digest(ownToken)},${userId},now()+interval '1 day','line'),
          (${digest(anotherToken)},${userId},now()+interval '1 day','google')`;
  const sessions = await routes.handle(
    new Request('http://127.0.0.1/api/security/sessions', {
      headers: { cookie: 'mf_session=' + ownToken },
    }),
  );
  const sessionData = (await sessions.json()) as any;
  assert(sessions.status === 200 && sessionData.sessions.length === 2, 'two user sessions returned');
  assert(
    sessionData.sessions.some((x: any) => x.current),
    'current session identified',
  );
  assert(
    !JSON.stringify(sessionData).includes(digest(ownToken)),
    'raw hashed login tokens must not leak',
  );
  const revoke = await routes.handle(
    new Request('http://127.0.0.1/api/security/sessions/revoke-others', {
      method: 'POST',
      headers: {
        origin: process.env.WEB_ORIGIN || 'http://127.0.0.1:5178',
        cookie: 'mf_session=' + ownToken,
        'content-type': 'application/json',
      },
      body: '{}',
    }),
  );
  const revokeData = (await revoke.json()) as any;
  assert(revoke.status === 200 && revokeData.revoked === 1, 'other sessions revoked');
  const kept = await db`SELECT token_hash FROM sessions WHERE user_id=${userId}`;
  assert(kept.length === 1 && kept[0].token_hash === digest(ownToken), 'current session retained');
  console.log('REAL_DB_SESSION_SCOPED_AND_REVOKED');

  const fk = await db`SELECT COUNT(*)::int AS count FROM receipt_reviews WHERE user_id=${userId}`;
  assert(fk[0].count === 1, 'receipt review persisted');
  console.log('ALL_REAL_DB_FINANCE_CHECKS_PASS');
} catch (error) {
  console.error('LOCAL_DB_INTEGRATION_FAILED', String(error));
  process.exitCode = 1;
} finally {
  if (userId) await db`DELETE FROM users WHERE id=${userId}`.catch(() => {});
  await db.end();
}
