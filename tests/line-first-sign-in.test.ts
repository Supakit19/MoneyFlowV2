import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import { handleLineMessage } from '../server/line-bot.ts';

const validLineId = 'U' + 'c'.repeat(32);
const code = '73316630';
const challengeId = '30000000-0000-4000-8000-000000000003';
const userId = '40000000-0000-4000-8000-000000000004';
const hash = createHash('sha256')
  .update('line-login:' + code)
  .digest('hex');

function mockChatLogin(options: { validChallenge?: boolean; lineId?: string } = {}) {
  const links = new Map<string, string>();
  const users: any[] = [];
  let status = options.validChallenge === false ? 'expired' : 'pending';
  let createdWorkspaces = 0;
  const replies: any[] = [];
  const db: any = {
    unsafe: async (sql: string, params: any[]) => {
      if (sql.includes('SELECT user_id FROM line_links')) {
        const id = links.get(params[0]);
        return id ? [{ user_id: id }] : [];
      }
      throw Error('Unexpected standalone SQL: ' + sql);
    },
    begin: async (fn: (tx: any) => Promise<any>) => {
      const tx: any = async (parts: TemplateStringsArray, ...values: any[]) => {
        const sql = parts.join('?');
        if (sql.includes('pg_advisory_xact_lock')) return [];
        if (sql.includes('SELECT user_id FROM line_links'))
          return links.has(values[0]) ? [{ user_id: links.get(values[0]) }] : [];
        if (sql.includes('INSERT INTO users')) {
          users.push({ id: userId, username: values[0] });
          return [{ id: userId }];
        }
        if (sql.includes('INSERT INTO line_links')) {
          links.set(values[1], values[0]);
          return [];
        }
        if (sql.includes('INSERT INTO accounts') || sql.includes('INSERT INTO categories')) {
          createdWorkspaces++;
          return [];
        }
        throw Error('Unexpected transaction SQL: ' + sql);
      };
      tx.unsafe = async (sql: string, params: any[]) => {
        if (sql.includes('SELECT id FROM line_login_challenges')) {
          expect(params[0]).toBe(hash);
          return status === 'pending' ? [{ id: challengeId }] : [];
        }
        if (sql.includes('UPDATE line_login_challenges')) {
          if (status !== 'pending') return [];
          expect(params[0]).toBe(userId);
          expect(params[1]).toBe(challengeId);
          status = 'approved';
          return [{ id: challengeId }];
        }
        throw Error('Unexpected transaction SQL: ' + sql);
      };
      return fn(tx);
    },
  };
  const deps: any = {
    db,
    send: async (_to: string, message: any) => replies.push(message),
    extract: async () => {
      throw Error('AI must never see a login code');
    },
    publish: () => {},
    ai: () => null,
  };
  async function sendLogin(lineId = options.lineId ?? validLineId, enteredCode = code) {
    await handleLineMessage(
      {
        source: { type: 'user', userId: lineId },
        replyToken: 'reply-login',
        message: { type: 'text', text: 'Login ' + enteredCode },
      },
      deps,
    );
    return replies.at(-1);
  }
  async function sendGroupLogin() {
    await handleLineMessage(
      {
        source: { type: 'group', groupId: 'group-1', userId: validLineId },
        replyToken: 'reply-group',
        message: { type: 'text', text: 'Login ' + code },
      },
      deps,
    );
    return replies.at(-1);
  }
  return {
    sendLogin,
    sendGroupLogin,
    replies,
    links,
    users,
    get workspaces() {
      return createdWorkspaces;
    },
    get challengeStatus() {
      return status;
    },
  };
}

describe('First-time sign-in through LINE Official Account chat', () => {
  test('first valid one-time code registers and links the verified LINE user', async () => {
    const session = mockChatLogin();
    const reply = await session.sendLogin();
    expect(reply.type).toBe('text');
    expect(reply.text).toContain('สมัครบัญชี MoneyFlow ด้วย LINE สำเร็จ');
    expect(session.links.get(validLineId)).toBe(userId);
    expect(session.users).toHaveLength(1);
    expect(session.workspaces).toBe(13);
    expect(session.challengeStatus).toBe('approved');
  });

  test('replayed and expired challenges do not create further accounts', async () => {
    const session = mockChatLogin({ validChallenge: false });
    const reply = await session.sendLogin();
    expect(reply.text).toContain('รหัสไม่ถูกต้อง');
    expect(session.users).toHaveLength(0);
    expect(session.links.size).toBe(0);
    expect(session.workspaces).toBe(0);
  });

  test('untrusted LINE sender IDs cannot register even with a valid code', async () => {
    const session = mockChatLogin({ lineId: 'not-a-line-id' });
    const reply = await session.sendLogin();
    expect(reply.text).toContain('ยืนยัน LINE ไม่สำเร็จ');
    expect(session.users).toHaveLength(0);
    expect(session.workspaces).toBe(0);
    expect(session.challengeStatus).toBe('pending');
  });
});

describe('LINE login privacy boundaries', () => {
  test('a group chat cannot approve sign-in or create an account', async () => {
    const session = mockChatLogin();
    const reply = await session.sendGroupLogin();
    expect(reply.text).toContain('แชตส่วนตัว');
    expect(session.users).toHaveLength(0);
    expect(session.links.size).toBe(0);
    expect(session.workspaces).toBe(0);
    expect(session.challengeStatus).toBe('pending');
  });
});
