import { describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EncryptedLineStorage } from '../integrations/linejs/encrypted-storage.ts';
import { openVault, sealVault, vaultKey } from '../shared/linejs-vault.ts';

const a = '00000000-0000-4000-a000-000000000001';
const b = '00000000-0000-4000-a000-000000000002';

describe('Multi-user LINEJS encrypted secret handling', () => {
  test('AES-GCM protects user-specific bridge tokens and detects tampering', () => {
    const key = randomBytes(32);
    const another = randomBytes(32);
    const secret = 'mfbank_' + 'a'.repeat(64);
    const enc = sealVault(secret, key, a, 'bridge-token');
    expect(enc).not.toContain(secret);
    expect(openVault(enc, key, a, 'bridge-token')).toBe(secret);
    expect(() => openVault(enc, another, a, 'bridge-token')).toThrow();
    expect(() => openVault(enc, key, b, 'bridge-token')).toThrow();
    expect(() => openVault(enc, key, a, 'line-session')).toThrow();
    expect(() => openVault(enc.slice(0, -1) + 'X', key, a, 'bridge-token')).toThrow();
    expect(() => vaultKey('1234')).toThrow();
    expect(vaultKey(key.toString('hex'))).toEqual(key);
  });
  test('LINE sessions for 4 users are independent and encrypted at rest', async () => {
    const base = mkdtempSync(join(tmpdir(), 'moneyflow-linejs-multi-'));
    const key = randomBytes(32);
    const accounts = [
      a,
      b,
      '00000000-0000-4000-a000-000000000003',
      '00000000-0000-4000-a000-000000000004',
    ];
    try {
      const sessions = accounts.map(
        (user) => new EncryptedLineStorage(join(base, user, 'session.enc'), key, user),
      );
      await Promise.all(
        sessions.map((session, i) => session.set('.auth', 'not-a-real-line-token-' + i)),
      );
      for (let i = 0; i < sessions.length; i++) {
        expect(await sessions[i].get('.auth')).toBe('not-a-real-line-token-' + i);
        const path = join(base, accounts[i], 'session.enc');
        expect(readFileSync(path, 'utf8')).not.toContain('not-a-real-line-token');
        expect(statSync(path).mode & 0o777).toBe(0o600);
        expect(statSync(join(base, accounts[i])).mode & 0o777).toBe(0o700);
      }
      await sessions[0].set('.auth', 'new-token-0');
      expect(await sessions[1].get('.auth')).toBe('not-a-real-line-token-1');
      expect(() => new EncryptedLineStorage(join(base, a, 'session.enc'), key, b)).toThrow();
      await sessions[0].delete('.auth');
      expect(await sessions[0].get('.auth')).toBeUndefined();
      await sessions[1].clear();
      expect(await sessions[1].get('.auth')).toBeUndefined();
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
