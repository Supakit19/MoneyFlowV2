import { describe, expect, test } from 'bun:test';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminPage from '../src/pages/AdminPage.tsx';

describe('MoneyFlow admin console and privacy', () => {
  test('dedicated login screen does not display member financial records', () => {
    const html = renderToStaticMarkup(<MemoryRouter><AdminPage /></MemoryRouter>);
    expect(html).toContain('กำลังตรวจสอบสิทธิ์');
    expect(html).toContain('ADMIN CONSOLE');
    expect(html).not.toContain('เงินเข้าบันทึกแล้ว');
  });
  test('admin APIs are guarded and use a separate admin cookie', async () => {
    const server = await Bun.file(new URL('../server/admin-routes.ts', import.meta.url)).text();
    expect(server).toContain("ctx.cookie?.mf_admin?.value");
    expect(server).toContain("path: '/api/admin'");
    expect(server).toContain("httpOnly: true");
    expect(server).toContain("sameSite: 'strict'");
    expect(server).toContain("adminGuard(async");
    expect(server).not.toContain('SELECT * FROM transactions');
    expect(server).toContain('allowedOrigin(ctx.request)');
  });
  test('site traffic accepts only whitelisted routes and anonymous UUID-like sessions', async () => {
    const server = await Bun.file(new URL('../server/admin-routes.ts', import.meta.url)).text();
    expect(server).toContain("new Set(['/', '/company'])");
    expect(server).toContain("/^[a-f0-9-]{36}$/");
    expect(server).toContain('visitor_hash');
    expect(server).not.toContain("headers.get('x-forwarded-for')");
  });
});
