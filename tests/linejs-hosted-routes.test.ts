import { describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { openVault } from '../shared/linejs-vault.ts';
import { createHostedLineJsRoutes } from '../server/linejs-hosted-routes.ts';
import type { HostedLineJsManager, HostedConfig } from '../server/linejs-hosted-manager.ts';

const a = '00000000-0000-4000-a000-000000000011';
const b = '00000000-0000-4000-a000-000000000022';
const originalKey = process.env.LINEJS_SESSION_ENCRYPTION_KEY;

describe('Hosted LINEJS routes isolate each signed-in owner', () => {
  test('QR, status, tokens and stop/disconnect actions are user-scoped', async () => {
    process.env.LINEJS_SESSION_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    const saved = new Map<string, any>();
    const running = new Map<string, HostedConfig>();
    const db = (parts: TemplateStringsArray, ...values: unknown[]) => {
      const query = parts.join('?').replace(/\s+/g, ' ');
      const userId = values.find((x) => x === a || x === b) as string | undefined;
      if (query.includes('SELECT 1 FROM sessions')) return Promise.resolve([{}]);
      if (query.includes('INSERT INTO bank_linejs_settings')) {
        const user = userId!;
        if (!saved.has(user))
          saved.set(user, {
            user_id: user,
            connector_mode: 'local',
            connector_token_encrypted: null,
            connector_run_enabled: false,
            token_hash: null,
            enabled: false,
            sender_mid: null,
            account_id: null,
          });
        return Promise.resolve([saved.get(user)]);
      }
      if (query.includes('UPDATE bank_linejs_settings')) {
        const user = userId!;
        const row = saved.get(user);
        if (query.includes("connector_mode='hosted'")) {
          row.connector_mode = 'hosted';
          row.connector_token_encrypted = values[1];
          row.token_hash = values[0];
          row.connector_run_enabled = true;
        } else if (query.includes("connector_mode='local'")) {
          Object.assign(row, {
            connector_mode: 'local',
            connector_token_encrypted: null,
            connector_run_enabled: false,
            token_hash: null,
            enabled: false,
            sender_mid: null,
          });
        } else if (query.includes('connector_run_enabled=false')) {
          row.connector_run_enabled = false;
        } else if (query.includes('connector_run_enabled=true')) {
          row.connector_run_enabled = true;
        }
        return Promise.resolve([]);
      }
      throw Error('Unexpected test SQL');
    };
    const manager = {
      available: true,
      reason: '',
      status: (id: string) => ({
        available: true,
        running: running.has(id),
        qrUrl: running.has(id) ? 'line://qr/test-' + id : '',
        state: running.has(id) ? 'waiting_qr' : 'stopped',
        maxWorkers: 4,
        runningWorkers: running.size,
      }),
      start: async (conf: HostedConfig) => {
        running.set(conf.userId, conf);
      },
      stop: async (id: string) => {
        running.delete(id);
      },
      remove: async (id: string) => {
        running.delete(id);
      },
    } as unknown as HostedLineJsManager;
    const appFor = (user: string) =>
      createHostedLineJsRoutes(
        db as any,
        (fn) => (ctx) => fn(ctx, user),
        () => {},
        manager,
      );
    const appA = appFor(a);
    const appB = appFor(b);
    const request = (
      app: ReturnType<typeof appFor>,
      method: string,
      path: string,
      origin = 'http://127.0.0.1:5178',
      cookie = 'mf_session=test-browser',
    ) =>
      app.handle(
        new Request('http://127.0.0.1' + path, {
          method,
          headers: { origin, cookie },
        }),
      );
    try {
      const wrongOrigin = await request(
        appA,
        'POST',
        '/api/bank/linejs/connector/connect',
        'https://bad-origin.example',
      );
      expect(wrongOrigin.status).toBe(403);
      expect(running.size).toBe(0);
      const connectedA = await request(appA, 'POST', '/api/bank/linejs/connector/connect');
      expect(connectedA.status).toBe(200);
      expect(((await connectedA.json()) as any).ok).toBe(true);
      expect(running.size).toBe(1);
      const statusB = await request(appB, 'GET', '/api/bank/linejs/connector/status');
      expect(((await statusB.json()) as any).agent.qrUrl).toBe('');
      const connectedB = await request(appB, 'POST', '/api/bank/linejs/connector/connect');
      expect(connectedB.status).toBe(200);
      expect(running.size).toBe(2);
      const tokenA = running.get(a)!.tokenEncrypted;
      const tokenB = running.get(b)!.tokenEncrypted;
      expect(tokenA).not.toBe(tokenB);
      const key = Buffer.from(process.env.LINEJS_SESSION_ENCRYPTION_KEY!, 'hex');
      expect(openVault(tokenA, key, a, 'bridge-token')).toMatch(/^mfbank_[0-9a-f]{64}$/);
      expect(() => openVault(tokenA, key, b, 'bridge-token')).toThrow();
      const qrA = (
        (await (await request(appA, 'GET', '/api/bank/linejs/connector/status')).json()) as any
      ).agent.qrUrl;
      const qrB = (
        (await (await request(appB, 'GET', '/api/bank/linejs/connector/status')).json()) as any
      ).agent.qrUrl;
      expect(qrA).not.toEqual(qrB);
      saved.get(b).enabled = true;
      const stoppedB = await request(appB, 'POST', '/api/bank/linejs/connector/stop');
      expect(stoppedB.status).toBe(200);
      expect(running.has(a)).toBe(true);
      expect(running.has(b)).toBe(false);
      expect(saved.get(b).enabled).toBe(true);
      expect(saved.get(b).connector_run_enabled).toBe(false);
      const disconnectB = await request(appB, 'POST', '/api/bank/linejs/connector/disconnect');
      expect(disconnectB.status).toBe(200);
      expect(saved.get(b).connector_token_encrypted).toBeNull();
      expect(saved.get(a).connector_token_encrypted).toBe(tokenA);
    } finally {
      if (originalKey === undefined) delete process.env.LINEJS_SESSION_ENCRYPTION_KEY;
      else process.env.LINEJS_SESSION_ENCRYPTION_KEY = originalKey;
    }
  });
});

describe('Hosted connector onboarding safeguards', () => {
  test('a full server refuses another QR without altering the existing user setup', async () => {
    const user = a;
    let updates = 0;
    const config = {
      user_id: user,
      connector_mode: 'local',
      connector_token_encrypted: null,
      connector_run_enabled: false,
      token_hash: null,
    };
    const db = (parts: TemplateStringsArray) => {
      const query = parts.join(' ');
      if (query.includes('INSERT INTO bank_linejs_settings')) return Promise.resolve([config]);
      if (query.includes('UPDATE bank_linejs_settings')) updates++;
      throw Error('Unexpected database mutation');
    };
    const manager = {
      available: true,
      reason: '',
      status: () => ({ available: true, running: false, runningWorkers: 4, maxWorkers: 4 }),
      start: async () => {
        throw Error('Should not attempt worker startup');
      },
    } as unknown as HostedLineJsManager;
    const app = createHostedLineJsRoutes(
      db as any,
      (fn) => (ctx) => fn(ctx, user),
      () => {},
      manager,
    );
    const response = await app.handle(
      new Request('http://localhost/api/bank/linejs/connector/connect', {
        method: 'POST',
        headers: { origin: 'http://127.0.0.1:5178', cookie: 'mf_session=fake' },
      }),
    );
    expect(response.status).toBe(503);
    expect(((await response.json()) as any).error).toContain('ครบ');
    expect(updates).toBe(0);
  });
});
