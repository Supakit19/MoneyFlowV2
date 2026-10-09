import { createHash, randomBytes } from 'node:crypto';

export type LineOAuthConfig = {
  channelId: string;
  channelSecret: string;
  publicBaseUrl: string;
  callbackUrl: string;
};

export const LINE_QR_TTL_MINUTES = 5;

/**
 * LINE Login is a separate channel from Messaging API but BOTH channels must
 * belong to the same LINE Developers provider to share the same LINE user ID.
 * APP_PUBLIC_URL must be a stable HTTPS website reachable from a mobile phone.
 */
export function getLineOAuthConfig(env: NodeJS.ProcessEnv = process.env): {
  config: LineOAuthConfig | null;
  reason: string | null;
} {
  const channelId = String(env.LINE_LOGIN_CHANNEL_ID || '').trim();
  const channelSecret = String(env.LINE_LOGIN_CHANNEL_SECRET || '').trim();
  if (!/^[0-9]{5,20}$/.test(channelId) || !/^[a-zA-Z0-9_-]{16,128}$/.test(channelSecret)) {
    return {
      config: null,
      reason:
        'ยังไม่ได้ตั้งค่า LINE Login Channel ID และ Channel Secret (ต้องเป็น LINE Login Channel ใต้ Provider เดียวกับ MoneyFlow OA)',
    };
  }
  const urlString = String(env.APP_PUBLIC_URL || '').trim();
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return {
      config: null,
      reason: 'กรุณาตั้งค่า APP_PUBLIC_URL เป็น URL เว็บไซต์ HTTPS ที่มือถือเปิดได้',
    };
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname.includes('.') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    return {
      config: null,
      reason: 'APP_PUBLIC_URL ต้องเป็นโดเมน HTTPS ที่เปิดได้จากมือถือ (ไม่ใช่ localhost)',
    };
  }
  return {
    config: {
      channelId,
      channelSecret,
      publicBaseUrl: url.origin,
      callbackUrl: url.origin + '/api/auth/line/qr/callback',
    },
    reason: null,
  };
}

export const randomOauthValue = () => randomBytes(32).toString('base64url');
export const oauthSha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function buildLineAuthorizationUrl(
  config: LineOAuthConfig,
  challenge: { state: string; nonce: string; verifier: string },
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.channelId,
    redirect_uri: config.callbackUrl,
    state: challenge.state,
    scope: 'openid',
    nonce: challenge.nonce,
    code_challenge: createHash('sha256').update(challenge.verifier).digest('base64url'),
    code_challenge_method: 'S256',
  });
  return 'https://access.line.me/oauth2/v2.1/authorize?' + params.toString();
}

function isLineId(value: unknown): value is string {
  return typeof value === 'string' && /^U[0-9a-f]{32}$/i.test(value);
}

/**
 * Exchange an authorization code server-side; ask LINE to verify the ID token
 * signature, audience, nonce and expiration. Only a verified subject may
 * be mapped to an existing MoneyFlow LINE account.
 */
export async function verifyLineAuthorizationCode(
  config: LineOAuthConfig,
  code: string,
  verifier: string,
  nonce: string,
  transport: typeof fetch = fetch,
): Promise<string> {
  if (!code || code.length > 2048 || !/^[a-zA-Z0-9._-]+$/.test(code)) {
    throw new Error('INVALID_LINE_AUTH_CODE');
  }
  if (!/^[a-zA-Z0-9_-]{43,128}$/.test(verifier) || !/^[a-zA-Z0-9_-]{43}$/.test(nonce)) {
    throw new Error('INVALID_LINE_OAUTH_CHALLENGE');
  }
  const tokenResponse = await transport('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.callbackUrl,
      client_id: config.channelId,
      client_secret: config.channelSecret,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(9000),
  });
  if (!tokenResponse.ok) throw new Error('LINE_TOKEN_EXCHANGE_FAILED');
  const token = (await tokenResponse.json()) as { id_token?: unknown };
  if (typeof token.id_token !== 'string' || token.id_token.length > 12000) {
    throw new Error('MISSING_LINE_ID_TOKEN');
  }
  const verifiedResponse = await transport('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: token.id_token, client_id: config.channelId, nonce }),
    signal: AbortSignal.timeout(9000),
  });
  if (!verifiedResponse.ok) throw new Error('LINE_ID_TOKEN_VERIFICATION_FAILED');
  const verified = (await verifiedResponse.json()) as {
    iss?: string;
    aud?: string;
    nonce?: string;
    exp?: number;
    sub?: unknown;
  };
  if (
    verified.iss !== 'https://access.line.me' ||
    verified.aud !== config.channelId ||
    verified.nonce !== nonce ||
    typeof verified.exp !== 'number' ||
    verified.exp <= Math.floor(Date.now() / 1000) ||
    !isLineId(verified.sub)
  ) {
    throw new Error('LINE_ID_TOKEN_CLAIMS_INVALID');
  }
  return verified.sub;
}
