import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  buildLineAuthorizationUrl,
  getLineOAuthConfig,
  oauthSha256,
  verifyLineAuthorizationCode,
} from '../server/line-oauth.ts';

const validSettings = {
  LINE_LOGIN_CHANNEL_ID: '1659001234',
  LINE_LOGIN_CHANNEL_SECRET: 'a'.repeat(32),
  APP_PUBLIC_URL: 'https://moneyflow.example.com',
};
const ready = getLineOAuthConfig(validSettings).config!;

describe('LINE OAuth QR login configuration', () => {
  test('requires dedicated LINE Login credentials and HTTPS mobile-accessible domain', () => {
    expect(getLineOAuthConfig({}).config).toBeNull();
    expect(getLineOAuthConfig({ ...validSettings, LINE_LOGIN_CHANNEL_ID: '' }).config).toBeNull();
    expect(getLineOAuthConfig({ ...validSettings, APP_PUBLIC_URL: '' }).config).toBeNull();
    expect(
      getLineOAuthConfig({ ...validSettings, APP_PUBLIC_URL: 'http://127.0.0.1:5178' }).config,
    ).toBeNull();
    expect(
      getLineOAuthConfig({ ...validSettings, APP_PUBLIC_URL: 'https://example.com/redirect?evil=1' })
        .config,
    ).toBeNull();
    expect(ready.callbackUrl).toBe('https://moneyflow.example.com/api/auth/line/qr/callback');
  });

  test('authorization URL binds redirect, random state, nonce and PKCE', () => {
    const state = 'x'.repeat(43),
      nonce = 'y'.repeat(43),
      verifier = 'z'.repeat(43);
    const url = new URL(buildLineAuthorizationUrl(ready, { state, nonce, verifier }));
    expect(url.origin).toBe('https://access.line.me');
    expect(url.pathname).toBe('/oauth2/v2.1/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid');
    expect(url.searchParams.get('state')).toBe(state);
    expect(url.searchParams.get('nonce')).toBe(nonce);
    expect(url.searchParams.get('client_id')).toBe(ready.channelId);
    expect(url.searchParams.get('redirect_uri')).toBe(ready.callbackUrl);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(verifier).digest('base64url'),
    );
    expect(url.href).not.toContain(ready.channelSecret);
    expect(url.href).not.toContain(verifier);
  });
  test('secret hashes are deterministic but never equal to the secret', () => {
    expect(oauthSha256('abc')).toBe(oauthSha256('abc'));
    expect(oauthSha256('abc')).not.toBe('abc');
    expect(oauthSha256('abc')).not.toBe(oauthSha256('abd'));
  });
});

describe('LINE identity verification through official LINE endpoints', () => {
  const nonce = 'n'.repeat(43),
    verifier = 'v'.repeat(43);
  const userId = 'U' + 'a'.repeat(32);
  function mockedTransport(overrides: Record<string, unknown> = {}): typeof fetch {
    return (async (input: any, init?: RequestInit) => {
      const url = String(input);
      const form = init?.body as URLSearchParams;
      if (url.endsWith('/token')) {
        expect(form.get('grant_type')).toBe('authorization_code');
        expect(form.get('client_secret')).toBe(ready.channelSecret);
        expect(form.get('code_verifier')).toBe(verifier);
        expect(form.get('redirect_uri')).toBe(ready.callbackUrl);
        return Response.json({ id_token: 'signed.line.id.token' });
      }
      if (url.endsWith('/verify')) {
        expect(form.get('client_id')).toBe(ready.channelId);
        expect(form.get('nonce')).toBe(nonce);
        return Response.json({
          iss: 'https://access.line.me',
          aud: ready.channelId,
          nonce,
          exp: Math.floor(Date.now() / 1000) + 120,
          sub: userId,
          ...overrides,
        });
      }
      throw new Error('Unexpected external request');
    }) as typeof fetch;
  }
  test('accepts only LINE-verified subject matching audience, issuer and nonce', async () => {
    expect(
      await verifyLineAuthorizationCode(ready, 'code-123', verifier, nonce, mockedTransport()),
    ).toBe(userId);
  });
  test('rejects forged claims / replay / another LINE channel', async () => {
    for (const altered of [
      { nonce: 'wrong' },
      { aud: 'different-channel' },
      { iss: 'https://not-line.example' },
      { exp: 1 },
      { sub: 'arbitrary-user' },
    ]) {
      await expect(
        verifyLineAuthorizationCode(ready, 'code-123', verifier, nonce, mockedTransport(altered)),
      ).rejects.toThrow('LINE_ID_TOKEN_CLAIMS_INVALID');
    }
  });
  test('rejects malformed or empty authorization codes before contacting LINE', async () => {
    await expect(
      verifyLineAuthorizationCode(ready, '', verifier, nonce, mockedTransport()),
    ).rejects.toThrow('INVALID_LINE_AUTH_CODE');
    await expect(
      verifyLineAuthorizationCode(ready, 'a bad code', verifier, nonce, mockedTransport()),
    ).rejects.toThrow('INVALID_LINE_AUTH_CODE');
  });
});
