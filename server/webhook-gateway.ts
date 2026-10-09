/**
 * Limited public gateway for LINE only.
 * Cloudflare Tunnel points here instead of exposing the finance API.
 * Other API routes, including setup, remain unreachable from the public tunnel.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const secret = process.env.LINE_CHANNEL_SECRET || '';
if (!secret) {
  console.error('LINE_CHANNEL_SECRET missing - gateway refused to start');
  process.exit(1);
}
const MAX_BODY_BYTES = 1024 * 1024;
const PORT = Number(process.env.WEBHOOK_PORT||3012);

function signatureValid(body: Buffer, encodedSignature: string) {
  const expected = createHmac('sha256', secret).update(body).digest();
  let received: Buffer;
  try { received = Buffer.from(encodedSignature, 'base64'); }
  catch { return false; }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function boundedBody(request: Request): Promise<Buffer> {
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) throw Error('TOO_LARGE');
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw Error('TOO_LARGE');
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}

Bun.serve({
  port: PORT,
  hostname: process.env.LISTEN_HOST || '127.0.0.1',
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/healthz' && request.method === 'GET')
      return new Response('ok', {status: 200, headers: {'cache-control': 'no-store'}});
    if (url.pathname !== '/webhook/line') return new Response('Not Found', {status: 404});
    if (request.method !== 'POST') return new Response('Method Not Allowed', {status: 405});
    if (!(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
      return new Response('Unsupported Media Type', {status: 415});
    }
    try {
      const body = await boundedBody(request);
      const signature = request.headers.get('x-line-signature') || '';
      if (!signatureValid(body, signature)) return new Response('Unauthorized', {status: 401});
      const response = await fetch((process.env.INTERNAL_API_URL||'http://127.0.0.1:3011')+'/webhook/line', {
        method: 'POST',
        headers: {'content-type': 'application/json', 'x-line-signature': signature},
        body: new Uint8Array(body),
        signal: AbortSignal.timeout(1800)
      });
      return new Response(await response.text(), {status: response.status, headers: {'cache-control': 'no-store'}});
    } catch (e: any) {
      if (e.message === 'TOO_LARGE') return new Response('Payload Too Large', {status: 413});
      console.error('Webhook gateway forwarding failed:', e?.name || 'Error');
      return new Response('Service Unavailable', {status: 503});
    }
  }
});
console.log('MoneyFlow LINE-only gateway on 127.0.0.1:' + PORT);
