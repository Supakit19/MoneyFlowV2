import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  validSatang,
  isPlausibleTransfer,
  makeTransactionsCsv,
  confirmTransferPair,
  createFinanceToolsRoutes,
} from '../server/finance-tools.ts';
import {
  receiptImageDigest,
  sanitizeReceiptProposal,
  createReceiptRoutes,
} from '../server/receipt-tools.ts';
import { budgetProjection } from '../src/lib/budgetForecast.ts';

const USER = '10000000-0000-4000-8000-000000000001';
const OUT = '10000000-0000-4000-8000-000000000002';
const IN = '10000000-0000-4000-8000-000000000003';
const TX_OUT = '10000000-0000-4000-8000-000000000004';
const TX_IN = '10000000-0000-4000-8000-000000000005';
const ACCOUNT_A = '10000000-0000-4000-8000-000000000006';
const ACCOUNT_B = '10000000-0000-4000-8000-000000000007';
const now = '2026-10-11T04:00:00Z';

describe('Verified-bank transfer pairing is advisory until manually confirmed', () => {
  const proposal = {
    outKind: 'expense',
    inKind: 'income',
    outAmount: 200000,
    inAmount: 200000,
    outAccount: ACCOUNT_A,
    inAccount: ACCOUNT_B,
    outAt: now,
    inAt: '2026-10-11T04:14:00Z',
  };
  test('requires opposite directions, same value, distinct accounts, 15-minute window', () => {
    expect(isPlausibleTransfer(proposal)).toBe(true);
    expect(isPlausibleTransfer({ ...proposal, inKind: 'expense' })).toBe(false);
    expect(isPlausibleTransfer({ ...proposal, inAmount: 200001 })).toBe(false);
    expect(isPlausibleTransfer({ ...proposal, inAccount: ACCOUNT_A })).toBe(false);
    expect(isPlausibleTransfer({ ...proposal, inAt: '2026-10-11T04:20:00Z' })).toBe(false);
    expect(isPlausibleTransfer({ ...proposal, outAmount: -1 })).toBe(false);
    expect(validSatang(35.2)).toBe(false);
  });
  test('manual confirmation transforms two saved bank movements into one transfer transaction atomically', async () => {
    const statements: string[] = [];
    const pair = [
      {
        id: OUT,
        kind: 'expense',
        amount_satang: '200000',
        created_at: now,
        transaction_id: TX_OUT,
        txn_kind: 'expense',
        source: 'bank_linejs',
        account_id: ACCOUNT_A,
        to_account_id: null,
        user_id: USER,
      },
      {
        id: IN,
        kind: 'income',
        amount_satang: '200000',
        created_at: '2026-10-11T04:02:00Z',
        transaction_id: TX_IN,
        txn_kind: 'income',
        source: 'bank_linejs',
        account_id: ACCOUNT_B,
        to_account_id: null,
        user_id: USER,
      },
    ];
    const tx = {
      unsafe: async (query: string, args: unknown[]) => {
        statements.push(query);
        if (query.includes('SELECT e.id')) {
          expect(args).toEqual([OUT, IN, USER]);
          return pair;
        }
        if (query.includes("UPDATE transactions SET kind='transfer'")) {
          expect(args).toEqual([ACCOUNT_B, TX_OUT, USER]);
          return [];
        }
        if (query.startsWith('DELETE FROM transactions')) {
          expect(args).toEqual([TX_IN, USER]);
          return [];
        }
        if (query.includes('UPDATE bank_linejs_events SET transaction_id')) {
          expect(args).toEqual([TX_OUT, OUT, IN, USER]);
          return [];
        }
        throw Error('Unexpected SQL');
      },
    };
    const db: any = { begin: async (fn: any) => fn(tx) };
    expect(await confirmTransferPair(db, USER, OUT, IN)).toEqual({ ok: true, transactionId: TX_OUT });
    expect(statements).toHaveLength(4);
  });
  test('rejects transfers involving wrong accounts or forged/bad IDs before any writes', async () => {
    const tx = {
      unsafe: async (query: string) => {
        if (query.includes('SELECT e.id'))
          return [
            {
              id: OUT,
              kind: 'expense',
              amount_satang: '3500',
              created_at: now,
              transaction_id: TX_OUT,
              txn_kind: 'expense',
              source: 'web',
              account_id: ACCOUNT_A,
              to_account_id: null,
            },
            {
              id: IN,
              kind: 'income',
              amount_satang: '3500',
              created_at: now,
              transaction_id: TX_IN,
              txn_kind: 'income',
              source: 'bank_linejs',
              account_id: ACCOUNT_B,
              to_account_id: null,
            },
          ];
        throw Error('Must not modify untrusted source');
      },
    };
    const db: any = { begin: async (fn: any) => fn(tx) };
    await expect(confirmTransferPair(db, USER, OUT, IN)).rejects.toThrow('ไม่สามารถยืนยัน');
    await expect(confirmTransferPair(db, USER, 'not-a-uuid', IN)).rejects.toThrow('ไม่ถูกต้อง');
  });
});

describe('Receipt privacy, duplicate awareness and safe CSV export', () => {
  const image = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(135, 0x11)]);
  const base64 = image.toString('base64');
  test('recognizes a genuine allowed image signature without storing image bytes', () => {
    expect(receiptImageDigest(base64, 'image/png')).toBe(
      createHash('sha256').update(image).digest('hex'),
    );
    expect(() => receiptImageDigest('hello', 'image/png')).toThrow();
    expect(() => receiptImageDigest(base64, 'image/jpeg')).toThrow();
    expect(() => receiptImageDigest(base64, 'image/svg+xml')).toThrow();
    expect(() => receiptImageDigest('a'.repeat(2_800_008), 'image/png')).toThrow();
  });
  test('rejects hallucinated or invalid receipt suggestions', () => {
    expect(
      sanitizeReceiptProposal({
        items: [{ kind: 'expense', amount: 159, merchant: 'ร้านค้า', confidence: 0.9 }],
      }),
    ).toMatchObject({
      kind: 'expense',
      amountSatang: 15900,
      merchant: 'ร้านค้า',
    });
    expect(
      sanitizeReceiptProposal({ items: [{ kind: 'transfer', amount: 100, merchant: 'โอน' }] }),
    ).toBeNull();
    expect(
      sanitizeReceiptProposal({ items: [{ kind: 'expense', amount: -2, merchant: 'ร้าน' }] }),
    ).toBeNull();
    expect(
      sanitizeReceiptProposal({ items: [{ kind: 'expense', amount: 25, merchant: '  ' }] }),
    ).toBeNull();
    expect(sanitizeReceiptProposal({ items: [] })).toBeNull();
  });
  test('CSV protects Excel from formula injection and includes transfer rows', () => {
    const csv = makeTransactionsCsv([
      {
        transacted_at: '2026-10-11T05:00:00Z',
        kind: 'transfer',
        amount_satang: '12000',
        account_name: 'KBank',
        to_account_name: 'KTB',
        merchant: '=HYPERLINK("https://evil")',
        note: ' +SUM(1,1)',
        source: 'bank_linejs',
      },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('โอนระหว่างบัญชี');
    expect(csv).toContain('120.00');
    expect(csv).toContain('"\'=HYPERLINK(""https://evil"")"');
    expect(csv).toContain('"\' +SUM(1,1)"');
    expect(csv).not.toContain('undefined');
  });
  test('receipt preview stores digest and proposal, not the raw image', async () => {
    const seen: any[] = [];
    const db: any = Object.assign(
      async (parts: TemplateStringsArray, ...values: any[]) => {
        const query = parts.join(' ');
        seen.push({ query, values });
        if (query.includes('SELECT id,status,suggestion')) return [];
        if (query.includes('INSERT INTO receipt_reviews')) return [{ id: OUT }];
        if (query.includes('FROM transactions t')) return [];
        throw Error('Unexpected SQL: ' + query);
      },
      { json: (x: any) => x },
    );
    const route = createReceiptRoutes(
      db,
      (fn) => (ctx) => fn(ctx, USER),
      async () => {
        return {
          items: [
            { kind: 'expense', amount: 159, merchant: 'อาหาร', category: 'อาหาร', confidence: 0.95 },
          ],
        };
      },
      () => {},
    );
    const before = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'dummy-test-key';
    try {
      const response = await route.handle(
        new Request('http://127.0.0.1/api/finance/receipts/preview', {
          method: 'POST',
          headers: {
            origin: process.env.WEB_ORIGIN || 'http://127.0.0.1:5178',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ base64, mime: 'image/png' }),
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true,
        reviewId: OUT,
        suggestion: { amountSatang: 15900 },
      });
      expect(JSON.stringify(seen)).not.toContain(base64);
      expect(JSON.stringify(seen)).toContain(createHash('sha256').update(image).digest('hex'));
    } finally {
      if (before === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = before;
    }
  });
});

describe('Budget coach forecasts are transparent and not push reports', () => {
  test('projects pace, calculates allowance, and adapts tone', () => {
    const w = { limitSatang: 70000, spentSatang: 40000, daysElapsedInWeek: 2, daysLeftInWeek: 5 };
    const a = budgetProjection(w, 'polite')!;
    const b = budgetProjection(w, 'roast')!;
    expect(a.projectedSatang).toBe(140000);
    expect(a.dailyAllowanceSatang).toBe(5000);
    expect(a.atRisk).toBe(true);
    expect(a.overSatang).toBe(70000);
    expect(a.message).not.toBe(b.message);
    expect(budgetProjection({ ...w, limitSatang: 0 })).toBeNull();
  });
  test('fresh start does not predict spending or invent a deficit', () => {
    const a = budgetProjection({
      limitSatang: 100000,
      spentSatang: 0,
      daysElapsedInWeek: 1,
      daysLeftInWeek: 6,
    })!;
    expect(a.projectedSatang).toBe(0);
    expect(a.atRisk).toBe(false);
  });
});

describe('Finance endpoints are scoped and unsafe methods require same-origin requests', () => {
  test('an empty review response never includes raw bank message content', async () => {
    const db: any = Object.assign(
      async (parts: TemplateStringsArray, ...values: any[]) => {
        const query = parts.join(' ');
        if (query.includes('FROM bank_linejs_settings')) return [];
        if (query.includes('FROM bank_linejs_events') && query.includes("status='pending'")) return [];
        throw Error('Unexpected query: ' + query);
      },
      {
        unsafe: async (query: string, args: any[]) => {
          expect(args).toEqual([USER]);
          return [];
        },
      },
    );
    const app = createFinanceToolsRoutes(
      db,
      (fn) => (ctx) => fn(ctx, USER),
      () => {},
    );
    const response = await app.handle(new Request('http://localhost/api/finance/inbox'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, review: [], transfers: [] });
  });
});
