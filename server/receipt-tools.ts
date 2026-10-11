import { createHash } from 'node:crypto';
import { Elysia } from 'elysia';
import type { Sql } from 'postgres';
import type { PublishFn } from './realtime.ts';

type Guarded = (fn: (ctx: any, userId: string) => Promise<any>) => (ctx: any) => Promise<any>;
type ReceiptExtract = (message: string, base64?: string, mime?: string) => Promise<any>;
const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const validSatang = (amount: unknown) =>
  typeof amount === 'number' && Number.isSafeInteger(amount) && amount > 0 && amount <= 1_000_000_000;
const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
const permittedOrigin = (ctx: any) => {
  const origin = ctx.request.headers.get('origin') || '';
  const expected = process.env.WEB_ORIGIN || 'http://127.0.0.1:5178';
  if (
    origin === expected ||
    (process.env.NODE_ENV !== 'production' && origin === 'http://localhost:5178')
  )
    return true;
  ctx.set.status = 403;
  return false;
};
/** Only bytes of a user-supplied image are fingerprinted; never store the picture. */
export function receiptImageDigest(base64: unknown, mime: unknown) {
  if (
    typeof base64 !== 'string' ||
    !allowedMimes.includes(String(mime)) ||
    base64.length < 100 ||
    base64.length > 2_800_000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) ||
    base64.length % 4 !== 0
  ) {
    throw Error('กรุณาเลือกรูปสลิป JPG, PNG หรือ WEBP ขนาดไม่เกิน 2MB');
  }
  const binary = Buffer.from(base64, 'base64');
  if (binary.length > 2_100_000 || binary.length < 50) throw Error('ไฟล์สลิปใหญ่เกินไป');
  const header = binary.subarray(0, 12);
  const signatureOk =
    mime === 'image/jpeg'
      ? header[0] === 0xff && header[1] === 0xd8
      : mime === 'image/png'
        ? header.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
        : header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP';
  if (!signatureOk) throw Error('ไฟล์รูปไม่ตรงกับประเภทที่เลือก');
  return createHash('sha256').update(binary).digest('hex');
}
export function sanitizeReceiptProposal(raw: any): {
  kind: 'income' | 'expense';
  amountSatang: number;
  merchant: string;
  category: string;
  confidence: number;
} | null {
  const item = Array.isArray(raw?.items) ? raw.items[0] : null;
  if (!item || (item.kind !== 'income' && item.kind !== 'expense')) return null;
  const amountSatang = Math.round(Number(item.amount) * 100);
  if (!validSatang(amountSatang) || Math.abs(Number(item.amount) * 100 - amountSatang) > 0.01)
    return null;
  const merchant = String(item.merchant || '')
    .replace(/[\r\n\x00-\x1f]/g, ' ')
    .trim()
    .slice(0, 100);
  const category = String(item.category || '')
    .replace(/[\r\n\x00-\x1f]/g, ' ')
    .trim()
    .slice(0, 50);
  if (!merchant) return null;
  const confidence = Number(item.confidence);
  return {
    kind: item.kind,
    amountSatang,
    merchant,
    category,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
  };
}
async function nearbyRecords(db: Sql, userId: string, amount: number) {
  const records = await db`SELECT t.id,t.kind,t.amount_satang::text,t.merchant,t.transacted_at,
    a.name AS account_name FROM transactions t
    LEFT JOIN accounts a ON a.id=t.account_id AND a.user_id=t.user_id
    WHERE t.user_id=${userId} AND t.amount_satang=${amount}
      AND t.transacted_at>=now()-interval '2 days'
    ORDER BY t.transacted_at DESC LIMIT 6`;
  return records.map((r: any) => ({
    id: r.id,
    kind: r.kind,
    amountSatang: Number(r.amount_satang),
    merchant: r.merchant,
    accountName: r.account_name,
    at: r.transacted_at,
  }));
}
/** Parse slip transiently with Gemini, then issue a short-lived review ticket. */
export function createReceiptRoutes(
  db: Sql,
  guarded: Guarded,
  extract: ReceiptExtract,
  publish: PublishFn,
) {
  return new Elysia({ name: 'moneyflow-receipt-tools' })
    .post(
      '/api/finance/receipts/preview',
      guarded(async (ctx, userId) => {
        if (!permittedOrigin(ctx)) return { error: 'คำขอไม่ได้รับอนุญาต' };
        const body = ctx.body || {};
        const digest = receiptImageDigest(body.base64, body.mime);
        const prior = await db`SELECT id,status,suggestion FROM receipt_reviews
        WHERE user_id=${userId} AND image_digest=${digest} LIMIT 1`;
        if (prior.length && prior[0].status === 'saved') {
          ctx.set.status = 409;
          return { error: 'รูปสลิปนี้เคยบันทึกไปแล้ว กรุณาตรวจรายการเดิม' };
        }
        if (prior.length && prior[0].status === 'pending') {
          const suggestion = prior[0].suggestion;
          const possibleDuplicates = await nearbyRecords(db, userId, Number(suggestion.amountSatang));
          return { ok: true, reviewId: prior[0].id, suggestion, possibleDuplicates, fromCache: true };
        }
        if (!process.env.GEMINI_API_KEY) {
          ctx.set.status = 503;
          return { error: 'ยังไม่ได้เปิดระบบอ่านรูปอัตโนมัติ' };
        }
        // The image contains private bank data: send it only to the configured
        // AI provider for this explicit user request; never log or save the bytes.
        const parsed = await extract(
          'ช่วยอ่านยอดเงินในสลิปหรือใบเสร็จนี้เพื่อให้ผู้ใช้ตรวจสอบก่อนบันทึก',
          body.base64,
          body.mime,
        );
        const suggestion = sanitizeReceiptProposal(parsed);
        if (!suggestion) {
          ctx.set.status = 422;
          return { error: 'อ่านจำนวนเงินในรูปได้ไม่ชัดเจน กรุณาบันทึกด้วยตัวเอง' };
        }
        const rows = await db`
        INSERT INTO receipt_reviews(user_id,image_digest,suggestion,status,expires_at)
        VALUES(${userId},${digest},${db.json(suggestion)},'pending',now()+interval '3 days')
        ON CONFLICT(user_id,image_digest) DO UPDATE
          SET suggestion=excluded.suggestion,status='pending',expires_at=excluded.expires_at
          WHERE receipt_reviews.status <> 'saved'
        RETURNING id
      `;
        if (!rows.length) {
          ctx.set.status = 409;
          return { error: 'สลิปนี้ถูกบันทึกไปแล้ว' };
        }
        return {
          ok: true,
          reviewId: rows[0].id,
          suggestion,
          possibleDuplicates: await nearbyRecords(db, userId, suggestion.amountSatang),
        };
      }),
    )
    .post(
      '/api/finance/receipts/confirm',
      guarded(async (ctx, userId) => {
        if (!permittedOrigin(ctx)) return { error: 'คำขอไม่ได้รับอนุญาต' };
        const b = ctx.body || {};
        if (
          !isUuid(b.reviewId) ||
          !isUuid(b.accountId) ||
          !isUuid(b.categoryId) ||
          !['expense', 'income'].includes(b.kind) ||
          !validSatang(b.amountSatang) ||
          typeof b.merchant !== 'string' ||
          !b.merchant.trim() ||
          b.merchant.length > 120
        ) {
          throw Error('กรุณาตรวจยอดเงิน หมวดหมู่ และบัญชีให้ถูกต้อง');
        }
        const result = await db.begin(async (tx) => {
          const rows = await tx.unsafe(
            "SELECT * FROM receipt_reviews WHERE id=$1 AND user_id=$2 AND status='pending' AND expires_at>now() FOR UPDATE",
            [b.reviewId, userId],
          );
          if (!rows.length) throw Error('สลิปนี้เคยบันทึกหรือหมดอายุแล้ว');
          const account = await tx.unsafe('SELECT id FROM accounts WHERE id=$1 AND user_id=$2', [
            b.accountId,
            userId,
          ]);
          const category = await tx.unsafe(
            'SELECT id FROM categories WHERE id=$1 AND user_id=$2 AND kind=$3',
            [b.categoryId, userId, b.kind],
          );
          if (!account.length || !category.length) throw Error('บัญชีหรือหมวดหมู่ไม่ถูกต้อง');
          const dupes = await tx.unsafe(
            `SELECT id FROM transactions WHERE user_id=$1 AND amount_satang=$2
            AND kind=$3 AND transacted_at>=now()-interval '2 days' LIMIT 1`,
            [userId, b.amountSatang, b.kind],
          );
          if (dupes.length && b.acknowledgeDuplicates !== true) {
            throw Error('พบยอดเงินใกล้เคียงกับรายการเดิม กรุณายืนยันว่ารายการนี้ไม่ซ้ำ');
          }
          const txns = await tx.unsafe(
            `INSERT INTO transactions(user_id,account_id,category_id,kind,amount_satang,merchant,note,source,source_message_id)
           VALUES($1,$2,$3,$4,$5,$6,'ตรวจสอบและยืนยันจากรูปใบเสร็จ','receipt_review',$7)
           ON CONFLICT(user_id,source_message_id) DO NOTHING RETURNING id`,
            [
              userId,
              b.accountId,
              b.categoryId,
              b.kind,
              b.amountSatang,
              b.merchant.trim(),
              'receipt:' + rows[0].image_digest,
            ],
          );
          if (!txns.length) throw Error('สลิปนี้เคยบันทึกแล้ว');
          await tx.unsafe(
            "UPDATE receipt_reviews SET status='saved',transaction_id=$1 WHERE id=$2 AND user_id=$3",
            [txns[0].id, b.reviewId, userId],
          );
          return { ok: true, transactionId: txns[0].id };
        });
        publish(userId, 'finance.changed');
        return result;
      }),
    );
}
