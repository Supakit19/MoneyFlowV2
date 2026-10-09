import { describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WelcomePage from '../src/pages/WelcomePage.tsx';
import { demo } from '../src/lib/finance.ts';

describe('MoneyFlow first-login setup', () => {
  test('offers bank automation after the existing money, budget and LINE steps', () => {
    const html = renderToStaticMarkup(
      <WelcomePage
        data={{
          ...demo,
          profile: {
            id: '00000000-0000-4000-a000-000000000001',
            display_name: 'QA Member',
            email: 'qa@example.invalid',
            avatar_url: null,
            google_linked: false,
            line_connected: false,
            email_login_enabled: true,
            password_set: true,
            onboarding_state: 'pending',
          },
        }}
        overview={null}
        onFinish={async () => {}}
        notify={() => {}}
      />,
    );
    expect(html).toContain('ขั้นตอน 1 จาก 4');
    expect(html).toContain('บัญชีเงิน');
    expect(html).toContain('งบของคุณ');
    expect(html).toContain('เชื่อม LINE');
    expect(html).toContain('เชื่อมธนาคาร');
    expect(html).toContain('ยอดตั้งต้นของบัญชี');
  });

  test('reset tool defaults to preview, enforces a confirmation and excludes remote DBs', async () => {
    const source = await Bun.file(new URL('../scripts/reset-local-data.ts', import.meta.url)).text();
    expect(source).toContain("const apply = process.argv.includes('--apply')");
    expect(source).toContain('ERASE_ALL_LOCAL_MONEYFLOW_DATA');
    expect(source).toContain('port !==');
    expect(source).toContain('moneyflow.dump');
    expect(source).toContain('Database backup verification failed');
    expect(source).toContain('ensureStopped()');
  });
});
