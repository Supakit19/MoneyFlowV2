import { describe, expect, test } from 'bun:test';
import { createBankLineJsRoutes } from '../server/bank-linejs.ts';

describe('LINEJS manual approval routes are retired', () => {
  test('no review, approve or ignore route remains exposed', async () => {
    let databaseCalls = 0;
    const db = () => {
      databaseCalls++;
      throw Error('No database calls expected');
    };
    const app = createBankLineJsRoutes(
      db as any,
      (fn) => (ctx) => fn(ctx, '00000000-0000-4000-a000-000000000001'),
      () => {},
    );
    const id = '00000000-0000-4000-a000-000000000002';
    for (const action of ['approve', 'review', 'ignore']) {
      const reply = await app.handle(
        new Request('http://127.0.0.1/api/bank/linejs/events/' + id + '/' + action, {
          method: 'POST',
          headers: { origin: 'http://127.0.0.1:5178', 'content-type': 'application/json' },
          body: '{}',
        }),
      );
      expect(reply.status).toBe(404);
    }
    expect(databaseCalls).toBe(0);
  });
});
