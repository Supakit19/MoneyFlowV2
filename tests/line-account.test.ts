import { describe, expect, test } from 'bun:test';
import {
  findOrCreateLineUser,
  findOrCreateLineUserInTransaction,
  validVerifiedLineId,
  hasAlternateSignIn,
} from '../server/line-account.ts';

const validId = 'U' + 'a'.repeat(32);
const otherId = 'U' + 'b'.repeat(32);
const uuid = '10000000-0000-4000-8000-000000000001';

function fakeFinanceDb(opts: { failProvision?: boolean } = {}) {
  const links = new Map<string, string>();
  const users: Array<{ id: string; username: string; password: unknown; onboarding: string }> = [];
  let accounts = 0;
  let categories = 0;
  let commits = 0;

  const sql: any = async (segments: TemplateStringsArray, ...args: any[]) => {
    const query = segments.join('?').replace(/\s+/g, ' ');
    if (query.includes('pg_advisory_xact_lock')) return [];
    if (query.includes('SELECT user_id FROM line_links'))
      return links.has(args[0]) ? [{ user_id: links.get(args[0]) }] : [];
    if (query.includes('INSERT INTO users')) {
      const result = { id: uuid, username: args[0], password: null, onboarding: 'pending' };
      users.push(result);
      return [{ id: uuid }];
    }
    if (query.includes('INSERT INTO line_links')) {
      links.set(args[1], args[0]);
      return [];
    }
    if (query.includes('INSERT INTO accounts')) {
      accounts++;
      return [];
    }
    if (query.includes('INSERT INTO categories')) {
      if (opts.failProvision) throw Error('FAKE_PROVISION_FAILURE');
      categories++;
      return [];
    }
    throw Error('Unexpected SQL: ' + query);
  };
  sql.begin = async (fn: (sql: any) => Promise<any>) => {
    const snapshot = { links: new Map(links), userCount: users.length, accounts, categories };
    try {
      const result = await fn(sql);
      commits++;
      return result;
    } catch (e) {
      links.clear();
      for (const [key, value] of snapshot.links) links.set(key, value);
      users.length = snapshot.userCount;
      accounts = snapshot.accounts;
      categories = snapshot.categories;
      throw e;
    }
  };
  return {
    sql,
    links,
    users,
    get accounts() {
      return accounts;
    },
    get categories() {
      return categories;
    },
    get commits() {
      return commits;
    },
  };
}

describe('Verified LINE accounts can register and return without email', () => {
  test('new LINE user receives a unique linked and provisioned finance workspace', async () => {
    const db = fakeFinanceDb();
    const result = await findOrCreateLineUser(db.sql, validId);
    expect(result).toEqual({ userId: uuid, created: true });
    expect(db.users).toEqual([
      { id: uuid, username: 'line:' + validId, password: null, onboarding: 'pending' },
    ]);
    expect(db.links.get(validId)).toBe(uuid);
    expect(db.accounts).toBe(3);
    expect(db.categories).toBe(10);
    expect(db.commits).toBe(1);
    const returning = await findOrCreateLineUser(db.sql, validId);
    expect(returning).toEqual({ userId: uuid, created: false });
    expect(db.users).toHaveLength(1);
    expect(db.accounts).toBe(3);
    expect(db.categories).toBe(10);
  });

  test('already linked LINE signs into the exact previous MoneyFlow account', async () => {
    const db = fakeFinanceDb();
    const older = '20000000-0000-4000-8000-000000000002';
    db.links.set(otherId, older);
    const result = await findOrCreateLineUser(db.sql, otherId);
    expect(result).toEqual({ userId: older, created: false });
    expect(db.users).toHaveLength(0);
    expect(db.accounts).toBe(0);
  });

  test('do not trust a user ID from a browser or unverified request', async () => {
    const db = fakeFinanceDb();
    for (const id of ['', 'line-user-a', 'Ufake', 'U' + 'g'.repeat(32), 'U' + 'a'.repeat(33)]) {
      expect(validVerifiedLineId(id)).toBe(false);
      await expect(findOrCreateLineUser(db.sql, id)).rejects.toThrow('INVALID_VERIFIED_LINE_ID');
    }
    expect(db.users).toHaveLength(0);
  });

  test('failure during provisioning rolls back users and linking together', async () => {
    const db = fakeFinanceDb({ failProvision: true });
    await expect(findOrCreateLineUser(db.sql, validId)).rejects.toThrow('FAKE_PROVISION_FAILURE');
    expect(db.users).toHaveLength(0);
    expect(db.links.size).toBe(0);
    expect(db.accounts).toBe(0);
  });

  test('transaction-safe shared path cannot accidentally mint users twice', async () => {
    const db = fakeFinanceDb();
    const one = await db.sql.begin(async (tx: any) => findOrCreateLineUserInTransaction(tx, validId));
    const two = await db.sql.begin(async (tx: any) => findOrCreateLineUserInTransaction(tx, validId));
    expect(one.created).toBe(true);
    expect(two.created).toBe(false);
    expect(db.users).toHaveLength(1);
  });
});
