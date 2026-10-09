import { describe, expect, test } from 'bun:test';
import { createBankLineJsRoutes } from '../server/bank-linejs.ts';

const userId = '00000000-0000-4000-a000-000000000001';
const senderMid = 'u' + 'a'.repeat(32);
const token = 'mfbank_' + 'b'.repeat(64);

function fakeIngest() {
  let eventWrites = 0;
  let financeWrites = 0;
  const settings = {
    user_id: userId,
    enabled: true,
    account_id: '00000000-0000-4000-a000-000000000002',
    sender_mid: senderMid,
    bank: 'kbank',
    push_line: false,
  };
  const db = Object.assign(
    (parts: TemplateStringsArray) => {
      const query = parts.join('?');
      if (query.includes('SELECT * FROM bank_linejs_settings')) return Promise.resolve([settings]);
      if (query.includes('SELECT status FROM bank_linejs_events')) return Promise.resolve([]);
      if (query.includes('INSERT INTO bank_linejs_events')) eventWrites++;
      throw Error('Unexpected database write for ignored alert');
    },
    {
      begin: async () => {
        financeWrites++;
        throw Error('Should never write finance record');
      },
    },
  );
  const routes = createBankLineJsRoutes(
    db as any,
    (fn) => (ctx) => fn(ctx, userId),
    () => {},
  );
  async function ingest(text: string, sourceFormat = 'flex_nodes', sender = senderMid) {
    const response = await routes.handle(
      new Request('http://127.0.0.1/api/integrations/linejs/event', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ senderMid: sender, messageId: '123456789023456', text, sourceFormat }),
      }),
    );
    return { http: response.status, body: (await response.json()) as any };
  }
  return {
    ingest,
    get eventWrites() {
      return eventWrites;
    },
    get financeWrites() {
      return financeWrites;
    },
  };
}

describe('LINEJS never queues unsigned or untrusted alerts for review', () => {
  test('missing signed amount is ignored without an event or transaction', async () => {
    const app = fakeIngest();
    const result = await app.ingest('รายการโอน/ถอน\nจากบัญชี xxx-x-x9097-x');
    expect(result.http).toBe(200);
    expect(result.body.status).toBe('ignored');
    expect(app.eventWrites).toBe(0);
    expect(app.financeWrites).toBe(0);
  });
  test('ALT_TEXT without any actual amount is ignored', async () => {
    const app = fakeIngest();
    const result = await app.ingest('แจ้งเตือนเงินเข้า', 'flex_fallback');
    expect(result.body.status).toBe('ignored');
    expect(app.eventWrites).toBe(0);
  });
  test('ambiguous multiple amounts without reliable direction are ignored', async () => {
    const app = fakeIngest();
    const result = await app.ingest('จากบัญชี\n25.00 บาท\n35.00 บาท');
    expect(result.body.status).toBe('ignored');
    expect(app.eventWrites).toBe(0);
  });
  test('unapproved sender MID is rejected', async () => {
    const app = fakeIngest();
    const result = await app.ingest('จำนวนเงิน -25.00 บาท', 'flex_nodes', 'u' + 'c'.repeat(32));
    expect(result.http).toBe(403);
    expect(app.eventWrites).toBe(0);
  });
});
