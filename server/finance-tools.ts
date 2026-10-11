/** User-owned transaction review, safe transfer matching and account exports. */
import { Elysia } from 'elysia';
import type { Sql } from 'postgres';
import { createHash } from 'node:crypto';
import type { PublishFn } from './realtime.ts';
import { sourceByMid } from './linejs-bank-sources.ts';

type Guarded = (fn: (ctx: any, userId: string) => Promise<any>) => (ctx: any) => Promise<any>;
const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const validSatang = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 1_000_000_000;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

export type TransferPair = {
  outId: string;
  inId: string;
  amountSatang: number;
  sourceAccountId: string;
  destinationAccountId: string;
  sourceName: string;
  destinationName: string;
};
/** Only show same-value opposite-direction bank events on distinct owned accounts
 * within 15 minutes. The user must explicitly confirm every proposal. */
export function isPlausibleTransfer(pair: {
  outKind: string;
  inKind: string;
  outAmount: number;
  inAmount: number;
  outAccount: string;
  inAccount: string;
  outAt: Date | string;
  inAt: Date | string;
}): boolean {
  const delta = Math.abs(new Date(pair.outAt).getTime() - new Date(pair.inAt).getTime());
  return (
    pair.outKind === 'expense' &&
    pair.inKind === 'income' &&
    validSatang(pair.outAmount) &&
    pair.outAmount === pair.inAmount &&
    pair.outAccount !== pair.inAccount &&
    !!pair.outAccount &&
    !!pair.inAccount &&
    Number.isFinite(delta) &&
    delta <= 15 * 60_000
  );
}
function correctOrigin(ctx: any) {
  const origin = ctx.request.headers.get('origin') || '';
  const expected = process.env.WEB_ORIGIN || 'http://127.0.0.1:5178';
  if (
    origin === expected ||
    (process.env.NODE_ENV !== 'production' && origin === 'http://localhost:5178')
  )
    return true;
  ctx.set.status = 403;
  return false;
}
const sourceName = (name: string) =>
  name === 'kbank'
    ? 'KBank Live'
    : name === 'ktb'
      ? 'Krungthai Connext'
      : name === 'scb'
        ? 'SCB Connect'
        : 'ธนาคาร';

export async function findTransferPairs(db: Sql, userId: string): Promise<TransferPair[]> {
  const rows = await db.unsafe(
    `SELECT out_event.id AS out_id, in_event.id AS in_id,
        out_tx.amount_satang::text AS amount_satang,
        out_tx.account_id AS out_account, in_tx.account_id AS in_account,
        out_account.name AS out_name, in_account.name AS in_name,
        out_event.created_at AS out_at, in_event.created_at AS in_at
      FROM bank_linejs_events out_event
      JOIN bank_linejs_events in_event ON in_event.user_id=out_event.user_id
        AND in_event.id<>out_event.id AND in_event.kind='income'
        AND in_event.amount_satang=out_event.amount_satang
        AND in_event.status='saved'
        AND ABS(EXTRACT(EPOCH FROM(in_event.created_at-out_event.created_at)))<=900
      JOIN transactions out_tx ON out_tx.id=out_event.transaction_id
        AND out_tx.user_id=out_event.user_id AND out_tx.kind='expense'
        AND out_tx.source='bank_linejs'
      JOIN transactions in_tx ON in_tx.id=in_event.transaction_id
        AND in_tx.user_id=out_event.user_id AND in_tx.kind='income'
        AND in_tx.source='bank_linejs' AND in_tx.account_id<>out_tx.account_id
      JOIN accounts out_account ON out_account.id=out_tx.account_id AND out_account.user_id=out_event.user_id
      JOIN accounts in_account ON in_account.id=in_tx.account_id AND in_account.user_id=out_event.user_id
      WHERE out_event.user_id=$1 AND out_event.status='saved' AND out_event.kind='expense'
        AND out_event.created_at>now()-interval '30 days'
        AND out_tx.to_account_id IS NULL AND in_tx.to_account_id IS NULL
      ORDER BY out_event.created_at DESC LIMIT 30`,
    [userId],
  );
  return rows
    .filter((row: any) =>
      isPlausibleTransfer({
        outKind: 'expense',
        inKind: 'income',
        outAmount: Number(row.amount_satang),
        inAmount: Number(row.amount_satang),
        outAccount: row.out_account,
        inAccount: row.in_account,
        outAt: row.out_at,
        inAt: row.in_at,
      }),
    )
    .map((row: any) => ({
      outId: row.out_id,
      inId: row.in_id,
      amountSatang: Number(row.amount_satang),
      sourceAccountId: row.out_account,
      destinationAccountId: row.in_account,
      sourceName: row.out_name,
      destinationName: row.in_name,
    }));
}

/** Single locked transaction prevents repeated confirmation or partial ledger updates. */
export async function confirmTransferPair(db: Sql, userId: string, outId: string, inId: string) {
  if (!isUuid(outId) || !isUuid(inId) || outId === inId) throw Error('ข้อมูลรายการโอนไม่ถูกต้อง');
  return db.begin(async (tx) => {
    const events = await tx.unsafe(
      `SELECT e.id,e.kind,e.amount_satang::text AS amount_satang,e.created_at,e.transaction_id,
        t.kind AS txn_kind,t.source,t.account_id,t.to_account_id,t.user_id
      FROM bank_linejs_events e JOIN transactions t ON t.id=e.transaction_id AND t.user_id=e.user_id
      WHERE e.id IN ($1,$2) AND e.user_id=$3 AND e.status='saved'
      ORDER BY e.id FOR UPDATE OF e,t`,
      [outId, inId, userId],
    );
    if (events.length !== 2) throw Error('รายการนี้อาจถูกใช้หรือแก้ไขแล้ว กรุณาโหลดใหม่');
    const outgoing = events.find((r: any) => r.id === outId);
    const incoming = events.find((r: any) => r.id === inId);
    if (
      !outgoing ||
      !incoming ||
      !isPlausibleTransfer({
        outKind: outgoing.kind,
        inKind: incoming.kind,
        outAmount: Number(outgoing.amount_satang),
        inAmount: Number(incoming.amount_satang),
        outAccount: outgoing.account_id,
        inAccount: incoming.account_id,
        outAt: outgoing.created_at,
        inAt: incoming.created_at,
      }) ||
      outgoing.txn_kind !== 'expense' ||
      incoming.txn_kind !== 'income' ||
      outgoing.source !== 'bank_linejs' ||
      incoming.source !== 'bank_linejs' ||
      outgoing.to_account_id ||
      incoming.to_account_id ||
      outgoing.transaction_id === incoming.transaction_id
    ) {
      throw Error('ไม่สามารถยืนยันรายการโอนนี้ได้ กรุณาตรวจสอบยอดและบัญชีอีกครั้ง');
    }
    await tx.unsafe(
      `UPDATE transactions SET kind='transfer',to_account_id=$1,category_id=NULL,
        merchant='โอนเงินระหว่างบัญชี',note='ยืนยันการโอนจากแจ้งเตือนธนาคารสองฝั่ง'
        WHERE id=$2 AND user_id=$3`,
      [incoming.account_id, outgoing.transaction_id, userId],
    );
    await tx.unsafe('DELETE FROM transactions WHERE id=$1 AND user_id=$2', [
      incoming.transaction_id,
      userId,
    ]);
    await tx.unsafe(
      "UPDATE bank_linejs_events SET transaction_id=$1,reason='ผู้ใช้ยืนยันว่าโอนระหว่างบัญชีตัวเอง' WHERE id IN ($2,$3) AND user_id=$4",
      [outgoing.transaction_id, outId, inId, userId],
    );
    return { ok: true, transactionId: outgoing.transaction_id };
  });
}

const csvSafe = (value: unknown) => {
  let str = String(value ?? '').replace(/\r\n?/g, '\n');
  // Neutralize CSV/spreadsheet formula injection even if preceded by spaces.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(str)) str = "'" + str;
  return '"' + str.replace(/"/g, '""') + '"';
};
export function makeTransactionsCsv(rows: Array<Record<string, unknown>>): string {
  const header = [
    'วันที่',
    'ประเภท',
    'จำนวนเงิน (บาท)',
    'บัญชีต้นทาง',
    'บัญชีปลายทาง',
    'หมวดหมู่',
    'รายการ',
    'หมายเหตุ',
    'แหล่งข้อมูล',
  ];
  const lines = rows.map((r) =>
    [
      new Date(String(r.transacted_at)).toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }),
      r.kind === 'income' ? 'รายรับ' : r.kind === 'transfer' ? 'โอนระหว่างบัญชี' : 'รายจ่าย',
      (Number(r.amount_satang) / 100).toFixed(2),
      r.account_name,
      r.to_account_name,
      r.category_name,
      r.merchant,
      r.note,
      r.source,
    ]
      .map(csvSafe)
      .join(','),
  );
  return '\uFEFF' + [header.map(csvSafe).join(','), ...lines].join('\r\n') + '\r\n';
}

export function createFinanceToolsRoutes(db: Sql, guarded: Guarded, publish: PublishFn) {
  return new Elysia({ name: 'moneyflow-finance-tools' })
    .get(
      '/api/finance/inbox',
      guarded(async (_, userId) => {
        const [settings, rows, pairs] = await Promise.all([
          db`SELECT * FROM bank_linejs_settings WHERE user_id=${userId} LIMIT 1`,
          db`SELECT id,bank,kind,amount_satang::text,summary,status,reason,source_format,
             created_at,sender_mid FROM bank_linejs_events
             WHERE user_id=${userId} AND status='pending'
             ORDER BY created_at DESC LIMIT 60`,
          findTransferPairs(db, userId),
        ]);
        const conf = settings[0];
        return {
          ok: true,
          review: rows.map((r: any) => {
            const bankSource = conf ? sourceByMid(conf, r.sender_mid) : null;
            return {
              id: r.id,
              bank: sourceName(r.bank),
              kind: r.kind,
              amountSatang: r.amount_satang === null ? null : Number(r.amount_satang),
              summary: r.summary,
              reason: r.reason,
              createdAt: r.created_at,
              accountId: bankSource?.accountId || null,
            };
          }),
          transfers: pairs,
        };
      }),
    )
    .post(
      '/api/finance/inbox/:id/confirm',
      guarded(async (ctx, userId) => {
        if (!correctOrigin(ctx)) return { error: 'คำขอไม่ได้รับอนุญาต' };
        if (!isUuid(ctx.params.id)) throw Error('รหัสรายการไม่ถูกต้อง');
        const body = ctx.body || {};
        if (
          !['income', 'expense'].includes(body.kind) ||
          !validSatang(body.amountSatang) ||
          !isUuid(body.accountId)
        )
          throw Error('กรุณาระบุประเภท ยอดเงิน และบัญชีให้ถูกต้อง');
        const result = await db.begin(async (tx) => {
          const events = await tx.unsafe(
            "SELECT * FROM bank_linejs_events WHERE id=$1 AND user_id=$2 AND status='pending' FOR UPDATE",
            [ctx.params.id, userId],
          );
          if (!events.length) throw Error('รายการนี้ได้รับการจัดการแล้ว');
          const settings = await tx.unsafe(
            'SELECT * FROM bank_linejs_settings WHERE user_id=$1 LIMIT 1',
            [userId],
          );
          const source = settings.length ? sourceByMid(settings[0], events[0].sender_mid) : null;
          if (!source?.accountId || source.accountId !== body.accountId)
            throw Error('บัญชีปลายทางไม่ตรงกับธนาคารที่เชื่อมไว้');
          const owned = await tx.unsafe('SELECT id FROM accounts WHERE id=$1 AND user_id=$2', [
            body.accountId,
            userId,
          ]);
          if (!owned.length) throw Error('ไม่พบบัญชีของคุณ');
          const category = await tx.unsafe(
            "SELECT id FROM categories WHERE user_id=$1 AND kind=$2 ORDER BY (name='อื่นๆ') DESC,name LIMIT 1",
            [userId, body.kind],
          );
          const inserted = await tx.unsafe(
            `INSERT INTO transactions(user_id,account_id,category_id,kind,amount_satang,merchant,note,source,source_message_id)
           VALUES($1,$2,$3,$4,$5,$6,'ตรวจสอบยอดจากแจ้งเตือนธนาคาร','bank_linejs',$7)
           ON CONFLICT(user_id,source_message_id) DO NOTHING RETURNING id`,
            [
              userId,
              body.accountId,
              category[0]?.id || null,
              body.kind,
              body.amountSatang,
              events[0].summary || 'แจ้งเตือนธนาคาร',
              'bankline:' + events[0].event_hash,
            ],
          );
          if (!inserted.length) throw Error('รายการนี้เคยบันทึกแล้ว');
          await tx.unsafe(
            "UPDATE bank_linejs_events SET status='saved',kind=$1,amount_satang=$2,transaction_id=$3,reason='ผู้ใช้ตรวจสอบยืนยัน' WHERE id=$4 AND user_id=$5",
            [body.kind, body.amountSatang, inserted[0].id, ctx.params.id, userId],
          );
          return { ok: true, transactionId: inserted[0].id };
        });
        publish(userId, 'finance.changed');
        return result;
      }),
    )
    .post(
      '/api/finance/inbox/:id/reject',
      guarded(async (ctx, userId) => {
        if (!correctOrigin(ctx)) return { error: 'คำขอไม่ได้รับอนุญาต' };
        if (!isUuid(ctx.params.id)) throw Error('รหัสรายการไม่ถูกต้อง');
        const rows =
          await db`UPDATE bank_linejs_events SET status='ignored',reason='ผู้ใช้เลือกไม่บันทึก'
        WHERE id=${ctx.params.id} AND user_id=${userId} AND status='pending' RETURNING id`;
        if (!rows.length) throw Error('รายการนี้ได้รับการจัดการแล้ว');
        publish(userId, 'finance.changed');
        return { ok: true };
      }),
    )
    .post(
      '/api/finance/transfers/confirm',
      guarded(async (ctx, userId) => {
        if (!correctOrigin(ctx)) return { error: 'คำขอไม่ได้รับอนุญาต' };
        const result = await confirmTransferPair(db, userId, ctx.body?.outId, ctx.body?.inId);
        publish(userId, 'finance.changed');
        return result;
      }),
    )
    .get(
      '/api/security/sessions',
      guarded(async (ctx, userId) => {
        ctx.set.headers['cache-control'] = 'no-store';
        const token = String(ctx.cookie?.mf_session?.value || '').trim();
        const current = sha(token);
        const sessions = await db`SELECT encode(digest(token_hash,'sha256'),'hex') AS id,
        auth_method,signed_in_at,expires_at,token_hash=${current} AS current
        FROM sessions WHERE user_id=${userId} AND expires_at>now()
        ORDER BY signed_in_at DESC LIMIT 50`;
        return { ok: true, sessions };
      }),
    )
    .post(
      '/api/security/sessions/revoke',
      guarded(async (ctx, userId) => {
        if (!correctOrigin(ctx)) return { error: 'คำขอไม่ได้รับอนุญาต' };
        const key = ctx.body?.id;
        if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key))
          throw Error('ข้อมูลอุปกรณ์ไม่ถูกต้อง');
        const currentHash = sha(String(ctx.cookie?.mf_session?.value || ''));
        const rows = await db`DELETE FROM sessions WHERE user_id=${userId}
        AND encode(digest(token_hash,'sha256'),'hex')=${key}
        AND token_hash<>${currentHash} RETURNING token_hash`;
        if (!rows.length) throw Error('ไม่พบเซสชันอื่นที่ยกเลิกได้');
        return { ok: true };
      }),
    )
    .post(
      '/api/security/sessions/revoke-others',
      guarded(async (ctx, userId) => {
        if (!correctOrigin(ctx)) return { error: 'คำขอไม่ได้รับอนุญาต' };
        const current = sha(String(ctx.cookie?.mf_session?.value || ''));
        const rows =
          await db`DELETE FROM sessions WHERE user_id=${userId} AND token_hash<>${current} RETURNING token_hash`;
        return { ok: true, revoked: rows.length };
      }),
    )
    .get(
      '/api/finance/export.csv',
      guarded(async (ctx, userId) => {
        const url = new URL(ctx.request.url);
        const year = url.searchParams.get('year');
        if (year !== null && !/^(?:20[2-9][0-9]|21[0-9]{2})$/.test(year))
          throw Error('ปีที่ต้องการส่งออกไม่ถูกต้อง');
        const rows = await db.unsafe(
          `SELECT to_char(t.transacted_at AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD HH24:MI:SS') AS local_at,
          t.transacted_at,t.kind,t.amount_satang::text,t.merchant,t.note,t.source,
          a.name AS account_name,d.name AS to_account_name,c.name AS category_name
         FROM transactions t
         LEFT JOIN accounts a ON a.id=t.account_id AND a.user_id=t.user_id
         LEFT JOIN accounts d ON d.id=t.to_account_id AND d.user_id=t.user_id
         LEFT JOIN categories c ON c.id=t.category_id AND c.user_id=t.user_id
         WHERE t.user_id=$1 AND ($2::text IS NULL OR to_char(t.transacted_at AT TIME ZONE 'Asia/Bangkok','YYYY')=$2)
         ORDER BY t.transacted_at DESC,t.id DESC LIMIT 20001`,
          [userId, year],
        );
        if (rows.length > 20000) throw Error('ข้อมูลเกิน 20,000 รายการ กรุณาเลือกปีที่จะส่งออก');
        const csv = makeTransactionsCsv(
          rows.map((r: any) => ({ ...r, transacted_at: r.local_at + '+07:00' })),
        );
        ctx.set.headers['cache-control'] = 'no-store, private';
        ctx.set.headers['x-content-type-options'] = 'nosniff';
        ctx.set.headers['content-disposition'] =
          'attachment; filename="moneyflow-transactions' + (year ? '-' + year : '') + '.csv"';
        ctx.set.headers['content-type'] = 'text/csv; charset=utf-8';
        return csv;
      }),
    );
}
