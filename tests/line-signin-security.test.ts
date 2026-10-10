import { describe, expect, test } from 'bun:test';
import { attachEmailPassword } from '../server/auth-methods.ts';
import { hasAlternateSignIn } from '../server/line-account.ts';

describe('LINE-first signup protects financial account recovery', () => {
  test('LINE-only members cannot unlink the only valid authentication provider', () => {
    expect(hasAlternateSignIn({ email_login: false, google_login: false })).toBe(false);
    expect(hasAlternateSignIn(null)).toBe(false);
    expect(hasAlternateSignIn({ email_login: true, google_login: false })).toBe(true);
    expect(hasAlternateSignIn({ email_login: false, google_login: true })).toBe(true);
  });

  test('fresh LINE-only members cannot claim an arbitrary unverified email', async () => {
    const queries: string[] = [];
    const mockSql: any = async (parts: TemplateStringsArray) => {
      const query = parts.join('?');
      queries.push(query);
      if (query.includes('SELECT u.username'))
        return [
          {
            username: 'line:' + 'U' + 'a'.repeat(32),
            email: null,
            password_hash: null,
            google_email: null,
          },
        ];
      throw Error('Unauthorized query: ' + query);
    };
    await expect(
      attachEmailPassword(mockSql, 'finance-id', {
        email: 'victim@example.com',
        password: 'secure-enough-password',
      }),
    ).rejects.toThrow('ต้องเชื่อม Google เพื่อยืนยันอีเมล');
    expect(queries.filter((s) => s.includes('UPDATE users'))).toHaveLength(0);
  });

  test('a verified Google email can be attached to LINE account with password', async () => {
    const queries: string[] = [];
    const mockSql: any = async (parts: TemplateStringsArray) => {
      const query = parts.join('?');
      queries.push(query);
      if (query.includes('SELECT u.username'))
        return [
          {
            username: 'line:' + 'U' + 'a'.repeat(32),
            email: null,
            password_hash: null,
            google_email: 'verified@gmail.com',
          },
        ];
      if (query.includes('UPDATE users')) return [{ id: 'finance-id' }];
      throw Error('Unexpected SQL: ' + query);
    };
    await expect(
      attachEmailPassword(mockSql, 'finance-id', {
        email: 'attacker@gmail.com',
        password: 'secure-enough-password',
      }),
    ).rejects.toThrow('ต้องใช้อีเมลเดียวกับ Google');
    expect(queries.filter((s) => s.includes('UPDATE users'))).toHaveLength(0);
    expect(
      await attachEmailPassword(mockSql, 'finance-id', {
        email: 'verified@gmail.com',
        password: 'secure-enough-password',
      }),
    ).toEqual({ ok: true });
    expect(queries.filter((s) => s.includes('UPDATE users'))).toHaveLength(1);
  });
});
