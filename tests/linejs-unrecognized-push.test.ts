import { describe, expect, test } from 'bun:test';
import { createBankLineJsRoutes } from '../server/bank-linejs.ts';

const userId = '00000000-0000-4000-a000-000000000001';
const id = '00000000-0000-4000-a000-000000000008';
const senderMid = 'u' + 'a'.repeat(32);

describe('LINEJS reports unrecognized bank notifications without booking money', () => {
  test('one unclear bank event triggers one safe LINE OA warning and no ledger entry', async () => {
    const previousFetch = globalThis.fetch;
    const previousToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token-not-a-real-secret';
    let deliveries = 0;
    let events = 0;
    let ledgerWrites = 0;
    let savedStatus = '';
    let postedText = '';

    globalThis.fetch = async (_input: any, init?: any) => {
      deliveries++;
      const payload = JSON.parse(init.body);
      expect(payload.messages[0].type).toBe('flex');
      postedText = JSON.stringify(payload.messages[0]);
      expect(payload.to).toBe('U' + 'c'.repeat(32));
      return new Response('{}', { status: 200 });
    };

    const config = {
      enabled: true,
      bank: 'kbank',
      push_line: true,
      account_id: '00000000-0000-4000-a000-000000000009',
      sender_mid: senderMid,
    };
    const db = Object.assign(
      (parts: TemplateStringsArray) => {
        const query = parts.join(' ').replace(/\s+/g, ' ');
        if (query.includes('SELECT * FROM bank_linejs_settings')) return Promise.resolve([config]);
        if (query.includes('SELECT status FROM bank_linejs_events'))
          return Promise.resolve(events ? [{ status: 'ignored' }] : []);
        if (query.includes('INSERT INTO bank_linejs_events')) {
          events++;
          return Promise.resolve([{ id }]);
        }
        if (query.includes('SELECT line_user_id FROM line_links'))
          return Promise.resolve([{ line_user_id: 'U' + 'c'.repeat(32) }]);
        if (query.includes('UPDATE bank_linejs_events')) {
          savedStatus = 'sent';
          return Promise.resolve([]);
        }
        throw Error('Unexpected database query');
      },
      {
        begin: async () => {
          ledgerWrites++;
          throw Error('Must not book ambiguous bank alert');
        },
      },
    );
    const app = createBankLineJsRoutes(
      db as any,
      (fn) => (ctx) => fn(ctx, userId),
      () => {},
    );

    async function deliver() {
      const response = await app.handle(
        new Request('http://127.0.0.1/api/integrations/linejs/event', {
          method: 'POST',
          headers: {
            authorization: 'Bearer mfbank_' + 'b'.repeat(64),
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            senderMid,
            messageId: '123456789129999',
            sourceFormat: 'flex_nodes',
            text: 'รายการโอน\nจากบัญชี xxx-x-x9097-x\n50.00 บาท\n60.00 บาท',
            altText: 'แจ้งเตือนจากธนาคาร',
          }),
        }),
      );
      return response.json() as Promise<any>;
    }
    try {
      expect(await deliver()).toMatchObject({ ok: true, status: 'ignored', pushed: true });
      expect(await deliver()).toMatchObject({ ok: true, status: 'duplicate' });
      expect(events).toBe(1);
      expect(deliveries).toBe(1);
      expect(ledgerWrites).toBe(0);
      expect(savedStatus).toBe('sent');
      expect(postedText).toContain('ยังไม่ได้บันทึก');
      expect(postedText).not.toContain('50.00');
      expect(postedText).not.toContain('9097');
    } finally {
      globalThis.fetch = previousFetch;
      if (previousToken === undefined) delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
      else process.env.LINE_CHANNEL_ACCESS_TOKEN = previousToken;
    }
  });

  test('schema startup never resets the opted-in LINE push preference', async () => {
    const schema = await Bun.file(new URL('../server/schema.sql', import.meta.url)).text();
    for (const sql of schema.matchAll(/UPDATE\s+bank_linejs_settings\s+SET([\s\S]*?)WHERE/gi)) {
      expect(sql[1].toLowerCase()).not.toContain('push_line');
    }
  });
});
