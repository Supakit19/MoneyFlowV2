import { describe, expect, test } from 'bun:test';
import { createBankLineJsRoutes } from '../server/bank-linejs.ts';

describe('Paused hosted workers cannot ingest financial transactions', () => {
  test('pausing hosted connector preserves Flow settings but blocks the bridge', async () => {
    let writes = 0;
    const row = {
      user_id: '00000000-0000-4000-a000-000000000001',
      enabled: true,
      connector_mode: 'hosted',
      connector_run_enabled: false,
      sender_mid: 'u' + 'a'.repeat(32),
      account_id: '00000000-0000-4000-a000-000000000008',
      bank: 'kbank',
    };
    const db = (parts: TemplateStringsArray) => {
      const query = parts.join(' ').replace(/\s+/g, ' ');
      if (query.includes('SELECT enabled,connector_mode,connector_run_enabled'))
        return Promise.resolve([
          {
            enabled: true,
            connector_mode: 'hosted',
            connector_run_enabled: false,
            sender_configured: true,
            account_configured: true,
          },
        ]);
      if (query.includes('SELECT * FROM bank_linejs_settings')) return Promise.resolve([row]);
      writes++;
      throw Error('Financial write during paused hosted connector');
    };
    const app = createBankLineJsRoutes(
      db as any,
      (fn) => (ctx) => fn(ctx, row.user_id),
      () => {},
    );
    const token = 'mfbank_' + 'a'.repeat(64);
    const status = await app.handle(
      new Request('http://localhost/api/integrations/linejs/status', {
        headers: { authorization: 'Bearer ' + token },
      }),
    );
    expect(status.status).toBe(200);
    expect(((await status.json()) as any).enabled).toBe(false);
    const msg = await app.handle(
      new Request('http://localhost/api/integrations/linejs/event', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({
          senderMid: row.sender_mid,
          messageId: '123456789999999',
          sourceFormat: 'text',
          text: 'จำนวนเงิน -50.00 บาท',
        }),
      }),
    );
    expect(msg.status).toBe(200);
    expect(((await msg.json()) as any).status).toBe('paused');
    expect(writes).toBe(0);
  });
});
