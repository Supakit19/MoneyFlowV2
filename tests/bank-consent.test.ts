import { describe, expect, test } from 'bun:test';
import { createBankConsentRoutes, BANK_CONSENT_VERSION } from '../server/bank-consent';
const USER = '10000000-0000-4000-8000-000000000001';
const consentRows: any[] = [];
const events: any[] = [];
const unsafe = async (query: string, args: any[]) => {
  if (query.includes('INSERT INTO bank_access_consents')) {
    consentRows.splice(0, consentRows.length, {
      version: args[1],
      granted_at: new Date(),
      revoked_at: null,
    });
    return [];
  }
  if (query.includes('INSERT INTO bank_access_consent_events')) {
    events.push(args[2]);
    return [];
  }
  if (query.includes('UPDATE bank_access_consents')) {
    if (consentRows[0]) consentRows[0].revoked_at = new Date();
    return [];
  }
  if (query.includes('UPDATE bank_linejs_settings')) return [];
  throw Error('Unexpected SQL ' + query);
};
const db: any = Object.assign(
  async (template: TemplateStringsArray, ...values: any[]) => {
    const sql = template.join('?');
    if (sql.includes('SELECT 1 FROM bank_access_consents'))
      return consentRows
        .filter((x) => x.revoked_at === null && x.version === values[1])
        .map(() => ({ ok: 1 }));
    if (sql.includes('SELECT version,granted_at')) return consentRows;
    throw Error('Unexpected SQL ' + sql);
  },
  { begin: async (fn: any) => fn({ unsafe }) },
);
const route = createBankConsentRoutes(
  db,
  (fn) => (ctx) => fn(ctx, USER),
  () => {},
);
const request = (path: string, method = 'GET', body: any = null, origin = 'http://127.0.0.1:5178') =>
  route.handle(
    new Request('http://localhost' + path, {
      method,
      headers: { origin, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
describe('Bank reading requires separate, revocable permission', () => {
  test('before permission, access is off', async () => {
    const r = await request('/api/bank/consent');
    expect((await r.json()).granted).toBe(false);
  });
  test('rejects missing acknowledgement and non-matching policy version', async () => {
    let r = await request('/api/bank/consent', 'POST', {
      version: BANK_CONSENT_VERSION,
      lineAccountAccess: true,
    });
    expect(r.status).toBe(422);
    r = await request('/api/bank/consent', 'POST', {
      version: 'old',
      lineAccountAccess: true,
      bankMessageProcessing: true,
      understandsRisks: true,
    });
    expect(r.status).toBe(422);
    r = await request(
      '/api/bank/consent',
      'POST',
      {
        version: BANK_CONSENT_VERSION,
        lineAccountAccess: true,
        bankMessageProcessing: true,
        understandsRisks: true,
      },
      'https://evil.example',
    );
    expect(r.status).toBe(403);
  });
  test('records explicit grant separately from LINE Login', async () => {
    const r = await request('/api/bank/consent', 'POST', {
      version: BANK_CONSENT_VERSION,
      lineAccountAccess: true,
      bankMessageProcessing: true,
      understandsRisks: true,
    });
    expect(r.status).toBe(200);
    expect((await r.json()).granted).toBe(true);
    const status = await request('/api/bank/consent');
    expect((await status.json()).granted).toBe(true);
  });
});
