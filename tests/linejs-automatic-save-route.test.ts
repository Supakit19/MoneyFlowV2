import { describe, expect, test } from 'bun:test';
import { createBankLineJsRoutes } from '../server/bank-linejs.ts';

const userId = '00000000-0000-4000-a000-000000000001';
const accountId = '00000000-0000-4000-a000-000000000002';
const eventId = '00000000-0000-4000-a000-000000000003';
const transactionId = '00000000-0000-4000-a000-000000000004';
const senderMid = 'u' + 'a'.repeat(32);
const token = 'mfbank_' + 'b'.repeat(64);

function harness() {
  let event: Record<string, any> | null = null;
  const transactions: { kind: string; amountSatang: number }[] = [];
  let financePublishes = 0;
  const config = {
    user_id: userId,
    enabled: true,
    auto_save: false,
    auto_transfer: false,
    push_line: true,
    bank: 'kbank',
    account_id: accountId,
    sender_mid: senderMid,
  };
  const transaction = {
    unsafe: async (sql: string, args: unknown[]) => {
      if (sql.includes('SELECT * FROM bank_linejs_events')) return event ? [{ ...event }] : [];
      if (sql.includes('SELECT id FROM accounts')) return [{ id: accountId }];
      if (sql.includes('SELECT id FROM categories')) return [{ id: null }];
      if (sql.includes('INSERT INTO transactions')) {
        transactions.push({ kind: String(args[3]), amountSatang: Number(args[4]) });
        return [{ id: transactionId }];
      }
      if (sql.includes('UPDATE bank_linejs_events SET status=')) {
        if (event) event.status = 'saved';
        return [];
      }
      throw Error('Unexpected transaction query');
    },
  };
  const db = Object.assign(
    (parts: TemplateStringsArray, ...args: unknown[]) => {
      const query = parts.join('?').replace(/\s+/g, ' ');
      if (query.includes('SELECT * FROM bank_linejs_settings')) return Promise.resolve([config]);
      if (query.includes('SELECT status FROM bank_linejs_events'))
        return Promise.resolve(event ? [{ status: event.status }] : []);
      if (query.includes('INSERT INTO bank_linejs_events')) {
        event = {
          id: eventId,
          event_hash: args[1],
          kind: args[4],
          amount_satang: args[5],
          summary: args[6],
          status: 'pending',
        };
        return Promise.resolve([{ id: eventId }]);
      }
      if (query.includes('UPDATE bank_linejs_settings SET last_event_at')) return Promise.resolve([]);
      if (query.includes('UPDATE bank_linejs_events')) return Promise.resolve([]);
      throw Error('Unexpected API database query');
    },
    { begin: async (fn: (tx: any) => Promise<boolean>) => fn(transaction) },
  );
  const app = createBankLineJsRoutes(
    db as any,
    (fn) => (ctx) => fn(ctx, userId),
    (_id, type) => {
      if (type === 'finance.changed') financePublishes++;
    },
  );

  async function ingest(
    text: string,
    sourceFormat: string = 'flex_nodes',
    messageId = '123456789923456',
    extra: { altText?: string; rawText?: string } = {},
  ) {
    const reply = await app.handle(
      new Request('http://127.0.0.1/api/integrations/linejs/event', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ senderMid, messageId, text, sourceFormat, ...extra }),
      }),
    );
    return { status: reply.status, result: (await reply.json()) as any };
  }
  return {
    ingest,
    transactions,
    get financePublishes() {
      return financePublishes;
    },
  };
}

describe('LINEJS bank alerts import automatically from signed or explicit bank descriptions', () => {
  test('negative signed KBank Flex amount creates expense', async () => {
    const instance = harness();
    const reply = await instance.ingest('จากบัญชี\nxxx-x-x9097-x\nจำนวนเงิน\n-30.00 บาท');
    expect(reply.status).toBe(200);
    expect(reply.result).toMatchObject({ ok: true, status: 'saved', pushed: false });
    expect(instance.transactions).toEqual([{ kind: 'expense', amountSatang: 3000 }]);
    expect(instance.financePublishes).toBe(1);
  });
  test('positive signed amount creates income', async () => {
    const instance = harness();
    const reply = await instance.ingest('เข้าบัญชี\nจำนวนเงิน\n+25.00 บาท');
    expect(reply.result).toMatchObject({ ok: true, status: 'saved', pushed: false });
    expect(instance.transactions).toEqual([{ kind: 'income', amountSatang: 2500 }]);
  });
  test('plain signed text is supported, even when old settings were off', async () => {
    const instance = harness();
    const reply = await instance.ingest('จำนวนเงิน -12.50 บาท', 'text');
    expect(reply.result.status).toBe('saved');
    expect(instance.transactions).toEqual([{ kind: 'expense', amountSatang: 1250 }]);
  });
  test('balance-only is ignored, but signed-bank ambiguity waits for human review', async () => {
    for (const [message, status] of [
      ['ยอดคงเหลือ -300.00 บาท', 'ignored'],
      ['เงินเข้า\nจำนวนเงิน -30.00 บาท', 'pending'],
      ['จากบัญชี\n25.00 บาท\n35.00 บาท', 'pending'],
    ]) {
      const instance = harness();
      const reply = await instance.ingest(message);
      expect(reply.result.status).toBe(status);
      expect(instance.transactions).toHaveLength(0);
    }
  });
  test('partial Flex and legacy source formats are ignored', async () => {
    for (const source of ['flex_partial', 'legacy']) {
      const instance = harness();
      const reply = await instance.ingest('จำนวนเงิน -30.00 บาท', source);
      expect(reply.result.status).toBe('ignored');
      expect(instance.transactions).toHaveLength(0);
    }
  });
  test('restored KBank income ALT_TEXT plus unsigned Flex creates one income', async () => {
    const instance = harness();
    const reply = await instance.ingest(
      'แจ้งเตือนธนาคาร\n25.00 บาท\nจากบัญชี xxx-x-x9097-x',
      'flex_nodes',
      '123456789923456',
      { altText: 'แจ้งเตือนเงินเข้าบัญชีจาก KBank Live' },
    );
    expect(reply.result).toMatchObject({ status: 'saved', pushed: false });
    expect(instance.transactions).toEqual([{ kind: 'income', amountSatang: 2500 }]);
  });
  test('unsigned outgoing KBank transfer with explicit withdrawal heading saves expense', async () => {
    const instance = harness();
    const reply = await instance.ingest(
      'รายการโอน/ถอน\nจากบัญชี xxx-x-x9097-x\n30.00 บาท',
      'flex_nodes',
      '123456789923456',
      { altText: 'แจ้งเตือนรายการโอน/ถอน' },
    );
    expect(reply.result.status).toBe('saved');
    expect(instance.transactions).toEqual([{ kind: 'expense', amountSatang: 3000 }]);
  });
  test('ALT_TEXT-only with complete amount and direction can be imported', async () => {
    const instance = harness();
    const reply = await instance.ingest('', 'flex_fallback', '123456789923456', {
      altText: 'รับโอนเงินเข้า จำนวนเงิน +10.00 บาท',
    });
    expect(reply.result.status).toBe('saved');
    expect(instance.transactions).toEqual([{ kind: 'income', amountSatang: 1000 }]);
  });
  test('conflicting ALT_TEXT and unsigned Flex direction is not imported', async () => {
    const instance = harness();
    const reply = await instance.ingest('โอนออก\nจำนวนเงิน 30.00 บาท', 'flex_nodes', '123456789923456', {
      altText: 'เงินเข้าจาก KBank Live',
    });
    expect(reply.result.status).toBe('pending');
    expect(instance.transactions).toHaveLength(0);
  });
  test('real KBank-like unsigned 50-baht card defaults to expense and records once', async () => {
    const instance = harness();
    const message = 'แจ้งเตือนธนาคาร\n50.00 บาท\n9 ต.ค. 69\nจากบัญชี\nxxx-x-x9097-x';
    const first = await instance.ingest(message, 'flex_nodes', '123456789129999', {
      altText: 'แจ้งเตือนจากธนาคารกสิกรไทย',
    });
    const duplicate = await instance.ingest(message, 'flex_nodes', '123456789129999', {
      altText: 'แจ้งเตือนจากธนาคารกสิกรไทย',
    });
    expect(first.result).toMatchObject({ ok: true, status: 'saved', pushed: false });
    expect(duplicate.result.status).toBe('duplicate');
    expect(instance.transactions).toEqual([{ kind: 'expense', amountSatang: 5000 }]);
    expect(instance.financePublishes).toBe(1);
  });
  test('an incoming 20-baht alert must not default to expense', async () => {
    const instance = harness();
    const response = await instance.ingest(
      'แจ้งเตือนธนาคาร\n20.00 บาท\nจากบัญชี\nxxx-x-x9097-x',
      'flex_nodes',
      '123456789129999',
      { altText: 'รายการเงินเข้า KBank Live' },
    );
    expect(response.result.status).toBe('saved');
    expect(instance.transactions).toEqual([{ kind: 'income', amountSatang: 2000 }]);
  });
  test('a repeated LINE message ID never creates another transaction', async () => {
    const instance = harness();
    const first = await instance.ingest('จำนวนเงิน -30.00 บาท');
    const second = await instance.ingest('จำนวนเงิน -30.00 บาท');
    expect(first.result.status).toBe('saved');
    expect(second.result.status).toBe('duplicate');
    expect(instance.transactions).toHaveLength(1);
  });
});
