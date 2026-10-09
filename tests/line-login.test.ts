import { test, expect, describe } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  formatLineLoginCommand,
  parseLineLoginCommand,
  isLineLoginAttempt,
  buildLineLoginChatUrl,
} from '../shared/line-login.ts';
import { handleLineMessage } from '../server/line-bot.ts';

describe('MoneyFlow LINE sign-in command', () => {
  test('QR opens the correct LINE Official Account and pre-fills the existing Login command', () => {
    expect(buildLineLoginChatUrl('@387ozgyn', '73400441')).toBe(
      'https://line.me/R/oaMessage/%40387ozgyn/?Login%2073400441',
    );
    expect(buildLineLoginChatUrl('@wrong id', '73400441')).toBeNull();
    expect(buildLineLoginChatUrl('@387ozgyn', '123456')).toBeNull();
    expect(buildLineLoginChatUrl(null, '73400441')).toBeNull();
  });
  test('website generates the complete message, not a bare number', () => {
    expect(formatLineLoginCommand('73400441')).toBe('Login 73400441');
  });
  test('bot accepts Login/login/LOGIN and keeps the old Thai command working', () => {
    for (const text of [
      'Login 73400441',
      'login 73400441',
      'LOGIN 73400441',
      'เข้าสู่ระบบ 73400441',
      '  Login   73400441  ',
    ]) {
      expect(parseLineLoginCommand(text)).toBe('73400441');
    }
  });
  test('codes without the prefix or with a wrong length must not log in', () => {
    for (const text of [
      '73400441',
      'Login',
      'login abc',
      'Login 1234567',
      'Login 123456789',
      'กาแฟ 45',
      'Login 12345678 and pay',
    ]) {
      expect(parseLineLoginCommand(text)).toBeNull();
    }
    expect(isLineLoginAttempt('73400441')).toBe(true);
    expect(isLineLoginAttempt('Login')).toBe(true);
    expect(isLineLoginAttempt('Login 1234567')).toBe(true);
    expect(isLineLoginAttempt('กาแฟ 45')).toBe(false);
  });

  test('the LINE bot approves a valid Login code for the linked user without asking Gemini', async () => {
    const queries: { statement: string; params: any[] }[] = [];
    const replies: any[] = [];
    const fakeDb = {
      unsafe: async (statement: string, params: any[]) => {
        queries.push({ statement, params });
        if (statement.includes('SELECT user_id FROM line_links')) return [{ user_id: 'finance-user-a' }];
        if (statement.includes('UPDATE line_login_challenges')) return [{ id: 'challenge-a' }];
        throw Error('Unexpected SQL: ' + statement);
      },
    };
    const event = {
      source: { userId: 'line-user-a' },
      replyToken: 'reply-123',
      message: { type: 'text', text: 'Login 73400441' },
    };
    const deps = {
      db: fakeDb as any,
      send: async (to: string, message: any, token?: string) => {
        replies.push({ to, message, token });
      },
      extract: async () => {
        throw Error('Gemini must NOT be called for Login');
      },
      publish: () => {},
      ai: () => null,
    };
    await handleLineMessage(event, deps as any);
    expect(queries).toHaveLength(2);
    expect(queries[1].params[0]).toBe('finance-user-a');
    expect(queries[1].params[1]).toBe(createHash('sha256').update('line-login:73400441').digest('hex'));
    expect(replies).toHaveLength(1);
    expect(replies[0].message.text).toContain('ยืนยันสำเร็จแล้ว');
    expect(replies[0].token).toBe('reply-123');
  });
  test('sending only the 8 digits explains the required Login prefix', async () => {
    const replies: any[] = [];
    const fakeDb = { unsafe: async () => [{ user_id: 'finance-user-a' }] };
    await handleLineMessage(
      {
        source: { userId: 'line-user-a' },
        replyToken: 'reply-123',
        message: { type: 'text', text: '73400441' },
      },
      {
        db: fakeDb as any,
        send: async (_to: string, message: any) => {
          replies.push(message);
        },
        extract: async () => {
          throw Error('Gemini must NOT be called');
        },
        publish: () => {},
        ai: () => null,
      } as any,
    );
    expect(replies).toHaveLength(1);
    expect(replies[0].text).toContain('Login 12345678');
    expect(replies[0].text).toContain('ไม่ใช่ส่งเลขอย่างเดียว');
  });
});
