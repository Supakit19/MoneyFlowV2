import { describe, expect, test } from 'bun:test';
import { createMiniAppRoutes, getMiniAppConfig, verifyMiniIdToken } from '../server/mini-app-auth.ts';

const channel = '1234567890';
const env = {
  LINE_LIFF_ID: channel + '-AbcDEF123',
  LINE_LOGIN_CHANNEL_ID: channel,
  WEB_ORIGIN: 'https://moneyflow.example.com',
  NODE_ENV: 'production',
};
const lineId = 'U' + 'a'.repeat(32);
const idToken = ['a'.repeat(60), 'b'.repeat(60), 'c'.repeat(60)].join('.');
function provider(overrides: Record<string, unknown> = {}, status = 200) {
  return (async (_url: string | URL | Request, options?: RequestInit) => {
    if (status === 200) {
      const params = options?.body as URLSearchParams;
      expect(params.get('client_id')).toBe(channel);
      expect(params.get('id_token')).toBe(idToken);
    }
    return new Response(
      JSON.stringify({
        iss: 'https://access.line.me',
        aud: channel,
        exp: Math.floor(Date.now() / 1000) + 600,
        sub: lineId,
        ...overrides,
      }),
      { status, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
}
function appHarness(connected: boolean, customEnv = env) {
  const queries: string[] = [];
  let cookieWrites = 0;
  const db = (async (parts: TemplateStringsArray, ...args: any[]) => {
    const query = parts.join('?').replace(/\s+/g, ' ');
    queries.push(query);
    if (query.includes('pg_advisory_xact_lock')) return [];
    if (query.includes('SELECT user_id FROM line_links'))
      return connected ? [{ user_id: '00000000-0000-4000-a000-000000000001' }] : [];
    if (query.includes('INSERT INTO users')) return [{ id: '00000000-0000-4000-a000-000000000002' }];
    if (query.includes('INSERT INTO line_links')) return [];
    if (query.includes('INSERT INTO accounts')) return [];
    if (query.includes('INSERT INTO categories')) return [];
    if (query.includes('INSERT INTO sessions')) {
      cookieWrites++;
      return [];
    }
    throw Error('Unexpected query: ' + query);
  }) as any;
  db.begin = async (fn: (tx: any) => Promise<any>) => fn(db);
  const app = createMiniAppRoutes(db, customEnv, provider());
  async function login(origin = env.WEB_ORIGIN, body: unknown = { idToken }) {
    const response = await app.handle(
      new Request('https://moneyflow.example.com/api/mini/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin },
        body: JSON.stringify(body),
      }),
    );
    return { response, data: (await response.json()) as any };
  }
  return {
    app,
    login,
    queries,
    get cookieWrites() {
      return cookieWrites;
    },
  };
}
describe('MoneyFlow inside LINE: identity and existing account boundaries', () => {
  test('no LIFF ID or a different LINE channel keeps LINE sign-in disabled', () => {
    expect(getMiniAppConfig({})).toEqual({ enabled: false, liffId: '', channelId: '' });
    expect(getMiniAppConfig({ ...env, LINE_LIFF_ID: '9876543210-AbcDEF123' }).enabled).toBe(false);
    expect(getMiniAppConfig(env).enabled).toBe(true);
  });
  test('LINE-signed ID token is verified against the exact LINE Login channel', async () => {
    expect(await verifyMiniIdToken(idToken, channel, provider())).toBe(lineId);
    await expect(verifyMiniIdToken(idToken, channel, provider({ aud: 'other' }))).rejects.toThrow();
    await expect(verifyMiniIdToken(idToken, channel, provider({ sub: 'spoofed' }))).rejects.toThrow();
    await expect(verifyMiniIdToken(idToken, channel, provider({ exp: 100 }))).rejects.toThrow();
    await expect(verifyMiniIdToken(idToken, channel, provider({}, 401))).rejects.toThrow();
    await expect(verifyMiniIdToken('invalid', channel, provider())).rejects.toThrow();
  });
  test('linked LINE identity gets an HttpOnly secure finance session', async () => {
    const x = appHarness(true);
    const result = await x.login();
    expect(result.response.status).toBe(200);
    expect(result.data.ok).toBe(true);
    expect(result.data.created).toBe(false);
    expect(result.response.headers.get('set-cookie')).toContain('mf_session=');
    expect(result.response.headers.get('set-cookie')?.toLowerCase()).toContain('httponly');
    expect(result.response.headers.get('set-cookie')?.toLowerCase()).toContain('secure');
    expect(x.cookieWrites).toBe(1);
  });
  test('first-time LINE users get a new account and secure session automatically', async () => {
    const x = appHarness(false);
    const result = await x.login();
    expect(result.response.status).toBe(200);
    expect(result.data).toEqual({ ok: true, created: true });
    expect(result.response.headers.get('set-cookie')).toContain('mf_session=');
    expect(result.response.headers.get('set-cookie')?.toLowerCase()).toContain('httponly');
    expect(result.response.headers.get('set-cookie')?.toLowerCase()).toContain('secure');
    expect(x.queries.some((q) => q.includes('INSERT INTO users'))).toBe(true);
    expect(x.queries.some((q) => q.includes('INSERT INTO line_links'))).toBe(true);
    expect(x.queries.filter((q) => q.includes('INSERT INTO accounts'))).toHaveLength(3);
    expect(x.queries.filter((q) => q.includes('INSERT INTO categories'))).toHaveLength(10);
    expect(x.cookieWrites).toBe(1);
  });

  test('cross-site requests and client-supplied LINE user IDs cannot bypass verification', async () => {
    const x = appHarness(true);
    const blocked = await x.login('https://evil.example', { idToken, userId: lineId });
    expect(blocked.response.status).toBe(403);
    expect(x.cookieWrites).toBe(0);
    const invalid = await x.login(env.WEB_ORIGIN, { userId: lineId });
    expect(invalid.response.status).toBe(401);
    expect(x.cookieWrites).toBe(0);
  });
  test('missing LIFF configuration never exchanges a token or creates a session', async () => {
    const x = appHarness(true, { ...env, LINE_LIFF_ID: '' });
    const result = await x.login();
    expect(result.response.status).toBe(503);
    expect(x.queries).toHaveLength(0);
  });
});
