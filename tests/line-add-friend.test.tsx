import { describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Elysia } from 'elysia';
import { buildFriendUrl } from '../src/components/LineAddFriend';
import LandingPage from '../src/pages/MoneyFlowSite';
import { createAuthRoutes } from '../server/auth-routes.ts';

describe('LINE OA friend onboarding on the public MoneyFlow website', () => {
  test('only valid official-account IDs produce trusted LINE friend links', () => {
    expect(buildFriendUrl('@387ozgyn')).toBe('https://line.me/R/ti/p/%40387ozgyn');
    for (const value of [
      'https://malicious.example',
      '2011955989-OUGIQOBk',
      '@bad id',
      '@',
      '',
      null,
      undefined,
    ]) {
      expect(buildFriendUrl(value)).toBeNull();
    }
  });

  test('landing explains QR add-friend separately from login and links it from the hero', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(html).toContain('id="line"');
    expect(html).toContain('สแกนเพื่อเพิ่มเพื่อน');
    expect(html).toContain('เพิ่มเพื่อน MoneyFlow');
    expect(html).toContain('เพิ่มเพื่อน LINE');
    expect(html).toContain('href="#line"');
    expect(html).toContain('href="/login"');
    expect(html).toContain('เพิ่มเพื่อนอย่างเดียวยังไม่ได้สร้างบัญชี MoneyFlow');
    expect(html).toContain('เพื่อสมัครหรือเข้าสู่ระบบได้เลย');
    expect(html).not.toContain('https://line.me/R/ti/p/%40fake');
  });

  test('public endpoint reveals only basicId and not credentials', async () => {
    const old = process.env.LINE_OFFICIAL_ACCOUNT_ID;
    try {
      process.env.LINE_OFFICIAL_ACCOUNT_ID = '@387ozgyn';
      const app = new Elysia().use(createAuthRoutes({} as any));
      const response = await app.handle(new Request('http://localhost/api/public/line-oa'));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ available: true, basicId: '@387ozgyn' });
      expect(response.headers.get('Cache-Control')).toContain('max-age=300');
    } finally {
      if (old === undefined) delete process.env.LINE_OFFICIAL_ACCOUNT_ID;
      else process.env.LINE_OFFICIAL_ACCOUNT_ID = old;
    }
  });
});
