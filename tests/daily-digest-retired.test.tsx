import { describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinanceSettings } from '../src/MoneyWellness';
import { demoFinanceOverview } from '../src/app/demoOverview';
import { validateLinePreferences } from '../src/validation';
import { setPreferences } from '../server/moneyflow-features.ts';

describe('Retired daily automated LINE report', () => {
  test('the entire daily report setting is hidden, even if historical preference was enabled', () => {
    const overview = {
      ...demoFinanceOverview,
      settings: {
        ...demoFinanceOverview.settings,
        daily_digest_enabled: true,
        daily_digest_hour: 19,
      },
    };
    const html = renderToStaticMarkup(
      <FinanceSettings variant="line" overview={overview} onSaved={async () => {}} />,
    );

    expect(html).toContain('ยืนยันก่อนบันทึก LINE');
    expect(html).toContain('บุคลิก AI Money Coach');
    expect(html).toContain('ความถี่การเตือน');
    expect(html).toContain('บันทึกการตั้งค่า');

    expect(html).not.toContain('รายงานสรุปอัตโนมัติทุกวัน');
    expect(html).not.toContain('เวลาส่งรายงาน');
    expect(html).not.toContain('LINE Push API');
    expect(html).not.toContain('mf-digest-section');
    expect(html).not.toContain('mf-toggle');
    expect(html).not.toContain('type="checkbox"');
  });

  test('settings validation needs only the remaining user-facing options', () => {
    expect(
      validateLinePreferences({
        confirmation_mode: 'smart',
        coach_tone: 'friend',
        coach_alerts: 'once',
      }),
    ).toEqual({});
    expect(
      validateLinePreferences({
        confirmation_mode: 'smart',
        coach_tone: 'friend',
        coach_alerts: 'once',
        daily_digest_enabled: true,
        daily_digest_hour: 25,
      }),
    ).toHaveProperty('daily_digest_hour');
  });

  test('API preserves existing legacy preference when saving remaining fields', async () => {
    const existing = {
      weekly_limit_satang: 50000,
      savings_goal_satang: 0,
      confirmation_mode: 'always',
      coach_tone: 'friend',
      coach_alerts: 'every',
      daily_digest_enabled: true,
      daily_digest_hour: 18,
    };
    let parameters: unknown[] = [];
    const db = {
      unsafe: async (query: string, args: unknown[]) => {
        if (query.startsWith('SELECT ')) return [existing];
        if (query.startsWith('INSERT INTO ')) {
          parameters = args;
          return [{ ...existing, confirmation_mode: 'smart' }];
        }
        throw Error('Unexpected SQL statement in settings test');
      },
    };
    await setPreferences(db as any, '00000000-0000-4000-a000-000000000001', {
      confirmation_mode: 'smart',
      coach_tone: 'friend',
      coach_alerts: 'off',
    });
    expect(parameters[6]).toBe(true);
    expect(parameters[7]).toBe(18);
  });

  test('API no longer runs an unattended daily LINE push job', async () => {
    const server = await Bun.file(new URL('../server/index.ts', import.meta.url)).text();
    expect(server).not.toContain('runDailyDigest');
    expect(server).toContain('handleLineMessage');
    const bot = await Bun.file(new URL('../server/line-bot.ts', import.meta.url)).text();
    expect(bot).toContain('daySummaryCard');
    expect(bot).toContain('สรุปวันนี้');
  });
});
