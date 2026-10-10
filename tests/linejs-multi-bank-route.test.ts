import { describe, expect, test } from 'bun:test';
import { createBankLineJsRoutes } from '../server/bank-linejs.ts';

const userId = '00000000-0000-4000-a000-000000000090';
const kasikornAccountId = '00000000-0000-4000-a000-000000000091';
const krungthaiAccountId = '00000000-0000-4000-a000-000000000092';
const kasikornMid = 'u' + 'a'.repeat(32);
const krungthaiMid = 'u' + 'b'.repeat(32);
const unrelatedMid = 'u' + 'c'.repeat(32);
const bearer = 'mfbank_' + 'd'.repeat(64);

function harness(secondaryEnabled = true) {
  const books: { accountId: string; kind: string; satang: number }[] = [];
  const hashes = new Set<string>();
  const bankEvents = new Map<string, any>();
  let nextId = 0;
  const config = {
    user_id: userId,
    enabled: true,
    connector_mode: 'hosted',
    connector_run_enabled: true,
    bank: 'kbank',
    push_line: false,
    sender_mid: kasikornMid,
    account_id: kasikornAccountId,
    extra_sources: [
      {
        bank: 'ktb',
        senderMid: krungthaiMid,
        accountId: krungthaiAccountId,
        enabled: secondaryEnabled,
      },
    ],
  };
  const tx = {
    unsafe: async (query: string, args: unknown[]) => {
      if (query.includes('SELECT * FROM bank_linejs_events')) {
        return bankEvents.has(String(args[0])) ? [bankEvents.get(String(args[0]))] : [];
      }
      if (query.includes('SELECT id FROM accounts')) {
        return [kasikornAccountId, krungthaiAccountId].includes(String(args[0]))
          ? [{ id: args[0] }]
          : [];
      }
      if (query.includes('SELECT id FROM categories')) return [{ id: null }];
      if (query.includes('INSERT INTO transactions')) {
        books.push({ accountId: String(args[1]), kind: String(args[3]), satang: Number(args[4]) });
        return [{ id: '00000000-0000-4000-a000-000000000098' }];
      }
      if (query.includes('UPDATE bank_linejs_events SET status=')) {
        const event = bankEvents.get(String(args[1]));
        if (event) event.status = 'saved';
        return [];
      }
      throw Error('Unexpected transaction SQL');
    },
  };
  const db = Object.assign(
    (parts: TemplateStringsArray, ...args: unknown[]) => {
      const sql = parts.join('?').replace(/\s+/g, ' ');
      if (sql.includes('SELECT * FROM bank_linejs_settings')) return Promise.resolve([config]);
      if (sql.includes('SELECT status FROM bank_linejs_events')) {
        return Promise.resolve(hashes.has(String(args[1])) ? [{ status: 'saved' }] : []);
      }
      if (sql.includes('INSERT INTO bank_linejs_events')) {
        hashes.add(String(args[1]));
        nextId++;
        const id = '00000000-0000-4000-a000-' + String(nextId).padStart(12, '0');
        const event = {
          id,
          event_hash: args[1],
          bank: args[3],
          kind: args[4],
          amount_satang: args[5],
          summary: args[6],
          status: 'pending',
        };
        bankEvents.set(id, event);
        return Promise.resolve([{ id }]);
      }
      if (sql.includes('UPDATE bank_linejs_settings SET last_event_at')) return Promise.resolve([]);
      if (sql.includes('UPDATE bank_linejs_events')) return Promise.resolve([]);
      throw Error('Unexpected bank API SQL');
    },
    { begin: (fn: (t: unknown) => Promise<unknown>) => fn(tx) },
  );
  const app = createBankLineJsRoutes(
    db as any,
    (fn) => (ctx) => fn(ctx, userId),
    () => {},
  );
  const ingest = async (senderMid: string, messageId: string, text: string) => {
    const response = await app.handle(
      new Request('http://localhost/api/integrations/linejs/event', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + bearer, 'content-type': 'application/json' },
        body: JSON.stringify({ senderMid, messageId, text, sourceFormat: 'text' }),
      }),
    );
    return { http: response.status, payload: (await response.json()) as any };
  };
  return { ingest, books, config };
}

describe('Authenticated LINEJS ingestion chooses the matching bank account', () => {
  test('routes KBank and Krungthai Connext events to different accounts with one token', async () => {
    const { ingest, books } = harness();
    expect((await ingest(kasikornMid, '123456789000011', 'จำนวนเงิน -30.00 บาท')).payload.status).toBe(
      'saved',
    );
    expect((await ingest(krungthaiMid, '123456789000012', 'เงินเข้า 250.00 บาท')).payload.status).toBe(
      'saved',
    );
    expect(books).toEqual([
      { accountId: kasikornAccountId, kind: 'expense', satang: 3000 },
      { accountId: krungthaiAccountId, kind: 'income', satang: 25000 },
    ]);
  });
  test('unverified or paused second bank sender cannot create transactions', async () => {
    const active = harness();
    const unknown = await active.ingest(unrelatedMid, '123456789000013', 'เงินออก 50 บาท');
    expect(unknown.http).toBe(403);
    expect(active.books).toHaveLength(0);
    const paused = harness(false);
    const hidden = await paused.ingest(krungthaiMid, '123456789000014', 'เงินออก 50 บาท');
    expect(hidden.http).toBe(403);
    expect(paused.books).toHaveLength(0);
  });
  test('same message ID across two approved bank senders has distinct dedupe hashes', async () => {
    const { ingest, books } = harness();
    const id = '123456789000015';
    expect((await ingest(kasikornMid, id, 'จำนวนเงิน -30.00 บาท')).payload.status).toBe('saved');
    expect((await ingest(krungthaiMid, id, 'เงินออก 80 บาท')).payload.status).toBe('saved');
    expect((await ingest(krungthaiMid, id, 'เงินออก 80 บาท')).payload.status).toBe('duplicate');
    expect(books).toHaveLength(2);
  });
});
