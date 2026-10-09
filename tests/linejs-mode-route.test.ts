import { describe, expect, test } from 'bun:test';
import { createBankLineJsRoutes } from '../server/bank-linejs.ts';

const userId = '00000000-0000-4000-a000-000000000001';

describe('LINEJS requires manual confirmation for all bank notifications', () => {
  test('removed mode endpoint rejects attempts to turn automatic saving back on', async () => {
    let writes = 0;
    const fakeDb = () => {
      writes += 1;
      return Promise.resolve([]);
    };
    const app = createBankLineJsRoutes(
      fakeDb as any,
      (fn) => (ctx) => fn(ctx, userId),
      () => {},
    );
    const request = async (origin: string) =>
      app.handle(
        new Request('http://127.0.0.1/api/bank/linejs/mode', {
          method: 'PUT',
          headers: { origin, 'content-type': 'application/json' },
          body: JSON.stringify({ autoSave: true, autoTransfer: true, acceptTransferRisk: true }),
        }),
      );

    const oldClient = await request('http://127.0.0.1:5178');
    expect(oldClient.status).toBe(410);
    expect(((await oldClient.json()) as any).error).toContain('เครื่องหมาย +/-');
    expect(writes).toBe(0);
    const deniedOrigin = await request('https://not-moneyflow.example');
    expect(deniedOrigin.status).toBe(403);
  });

  test('ordinary settings endpoint refuses legacy auto-save flags', async () => {
    const existing = {
      enabled: false,
      auto_save: false,
      auto_transfer: false,
      push_line: false,
      bank: 'kbank',
      sender_mid: null,
      account_id: null,
      token_hash: null,
      last_event_at: null,
    };
    let writes = 0;
    const db = (strings: TemplateStringsArray) => {
      const sql = strings.join(' ');
      if (sql.includes('INSERT INTO bank_linejs_settings')) return Promise.resolve([existing]);
      writes += 1;
      return Promise.resolve([]);
    };
    const app = createBankLineJsRoutes(
      db as any,
      (fn) => (ctx) => fn(ctx, userId),
      () => {},
    );
    const response = await app.handle(
      new Request('http://127.0.0.1/api/bank/linejs/settings', {
        method: 'PUT',
        headers: { origin: 'http://127.0.0.1:5178', 'content-type': 'application/json' },
        body: JSON.stringify({ autoSave: true, autoTransfer: true }),
      }),
    );
    expect(response.status).toBe(410);
    expect(writes).toBe(0);
  });
});
