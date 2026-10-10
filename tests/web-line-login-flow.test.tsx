import { describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LineCodeLogin from '../src/components/auth/LineCodeLogin';
import { websiteDestinationAfterLogin, websiteFallbackForPocket } from '../src/app/entry-routes';

describe('Website LINE sign-in and in-LINE Pocket remain separate', () => {
  test('after any website login, new users follow onboarding and returning users go to dashboard', () => {
    expect(websiteDestinationAfterLogin('pending')).toBe('/welcome');
    expect(websiteDestinationAfterLogin('completed')).toBe('/dashboard');
    expect(websiteDestinationAfterLogin('skipped')).toBe('/dashboard');
    expect(websiteDestinationAfterLogin(undefined)).toBe('/dashboard');
  });

  test('a normal browser is sent to website auth; the LINE app stays in Pocket', () => {
    expect(websiteFallbackForPocket(false)).toBe('/login');
    expect(websiteFallbackForPocket(true)).toBeNull();
  });

  test('the website LINE login does not offer a LIFF link that opens Pocket by mistake', () => {
    const html = renderToStaticMarkup(
      <LineCodeLogin onAuthenticated={async () => {}} onError={() => {}} />,
    );
    expect(html).toContain('สร้างรหัสยืนยันผ่าน LINE');
    expect(html).toContain('ยืนยันผ่านแชต LINE');
    expect(html).toContain('กลับมาใช้งาน MoneyFlow บนเว็บไซต์นี้');
    expect(html).not.toContain('https://liff.line.me/');
    expect(html).not.toContain('href="/mini"');
    expect(html).not.toContain('เปิด MoneyFlow ผ่าน LINE');
    expect(html).not.toContain('line-direct-signin-button');
  });

  test('LIFF account verification remains a separate, server-side token flow', async () => {
    const mini = await Bun.file(new URL('../src/pages/MiniApp.tsx', import.meta.url)).text();
    expect(mini).toContain('websiteFallbackForPocket(liff.isInClient())');
    expect(mini.indexOf('websiteFallbackForPocket(liff.isInClient())')).toBeLessThan(
      mini.indexOf('await liff.init('),
    );
    expect(mini).toContain("api('/mini/auth', 'POST', { idToken })");
    const auth = await Bun.file(new URL('../server/mini-app-auth.ts', import.meta.url)).text();
    expect(auth).toContain('https://api.line.me/oauth2/v2.1/verify');
  });
});
