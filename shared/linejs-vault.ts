import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Uses a deployment-only 32-byte key. Never log or serialize the key. */
export function vaultKey(value: string | undefined): Buffer {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value))
    throw Error('LINEJS_SESSION_ENCRYPTION_KEY must contain 64 hex characters');
  return Buffer.from(value, 'hex');
}

/** AEAD binds tokens and LINE sessions to a single MoneyFlow user. */
export function sealVault(plaintext: string, key: Buffer, userId: string, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('moneyflow-linejs:v1:' + userId + ':' + purpose, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function openVault(payload: string, key: Buffer, userId: string, purpose: string): string {
  const pieces = payload.split('.');
  if (pieces.length !== 4 || pieces[0] !== 'v1') throw Error('Unsupported LINEJS credential encoding');
  const iv = Buffer.from(pieces[1], 'base64url');
  const tag = Buffer.from(pieces[2], 'base64url');
  const encrypted = Buffer.from(pieces[3], 'base64url');
  if (iv.length !== 12 || tag.length !== 16 || encrypted.length > 5_000_000)
    throw Error('Invalid LINEJS credential encoding');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from('moneyflow-linejs:v1:' + userId + ':' + purpose, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
