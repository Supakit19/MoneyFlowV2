import { describe, expect, test } from 'bun:test';
import { handleLineMessage } from '../server/line-bot.ts';

const userId = '00000000-0000-4000-a000-000000000041';
const lineId = 'u' + 'a'.repeat(32);

async function exercise(extraction: { items: any[]; query: string | null }, mode = 'auto') {
  const sent: any[] = [];
  const sqlCalls: string[] = [];
  const fakeDb = {
    async unsafe(sql: string) {
      sqlCalls.push(sql);
      if (sql.includes('FROM line_links WHERE')) return [{ user_id: userId }];
      if (sql.includes('FROM finance_preferences'))
        return [
          {
            weekly_limit_satang: 0,
            savings_goal_satang: 0,
            confirmation_mode: mode,
            coach_tone: 'friend',
            coach_alerts: 'off',
            daily_digest_enabled: false,
            daily_digest_hour: 20,
          },
        ];
      if (sql.includes('FROM transactions WHERE')) return [];
      if (sql.includes('DELETE FROM pending')) return [];
      if (sql.includes('INSERT INTO pending')) return [];
      if (sql.includes('SELECT id FROM accounts')) return [{ id: 'a1' }];
      if (sql.includes('SELECT id FROM categories')) return [{ id: 'c1' }];
      if (sql.includes('INSERT INTO transactions')) return [{ id: 't1' }];
      throw new Error('Unexpected test database request');
    },
  };
  fakeDb.begin = async (fn: any) => fn(fakeDb);
  await handleLineMessage(
    {
      source: { userId: lineId },
      replyToken: 'test-reply',
      message: { type: 'text', id: '123456789012345', text: 'โอนเงินสำเร็จ 45.00 บาท' },
    },
    {
      db: fakeDb as any,
      send: async (_lineId: string, message: any) => {
        sent.push(message);
      },
      extract: async () => extraction,
      publish: () => {},
      ai: () => null,
    },
  );
  return { sent, sqlCalls };
}

describe('Bank transfer slip safety in LINE OA', () => {
  test('auto setting saves a clear transfer without asking for confirmation', async () => {
    const result = await exercise({
      query: 'transfer_review',
      items: [{ kind: 'expense', amount: 45, merchant: 'โอนเงิน', category: 'อื่นๆ', confidence: 0.98 }],
    });
    expect(result.sqlCalls.some((q) => q.includes('INSERT INTO pending'))).toBe(false);
    expect(result.sqlCalls.some((q) => q.includes('INSERT INTO transactions'))).toBe(true);
    expect(JSON.stringify(result.sent[0])).toContain('บันทึกรายการสำเร็จ');
  });

  test('always setting requests confirmation for a clear transfer', async () => {
    const result = await exercise(
      {
        query: 'transfer_review',
        items: [
          { kind: 'expense', amount: 45, merchant: 'โอนเงิน', category: 'อื่นๆ', confidence: 0.98 },
        ],
      },
      'always',
    );
    expect(result.sqlCalls.some((q) => q.includes('INSERT INTO pending'))).toBe(true);
    expect(result.sqlCalls.some((q) => q.includes('INSERT INTO transactions'))).toBe(false);
  });

  test('smart setting requests confirmation for transfer slip images', async () => {
    const result = await exercise(
      {
        query: 'transfer_review',
        items: [
          { kind: 'expense', amount: 45, merchant: 'โอนเงิน', category: 'อื่นๆ', confidence: 0.98 },
        ],
      },
      'smart',
    );
    expect(result.sqlCalls.some((q) => q.includes('INSERT INTO pending'))).toBe(false);
  });

  test('low-confidence transfer must be confirmed even when mode is auto', async () => {
    const result = await exercise({
      query: 'transfer_review',
      items: [{ kind: 'expense', amount: 45, merchant: 'โอนเงิน', category: 'อื่นๆ', confidence: 0.65 }],
    });
    expect(result.sqlCalls.some((q) => q.includes('INSERT INTO pending'))).toBe(true);
  });

  test('does not invent a transaction when amount is unclear', async () => {
    const result = await exercise({ query: 'transfer_review', items: [] });
    expect(result.sqlCalls.some((q) => q.includes('INSERT INTO pending'))).toBe(false);
    expect(result.sent).toHaveLength(1);
    expect(result.sent[0].type).toBe('text');
    expect(result.sent[0].text).toContain('ยังอ่านจำนวนเงินที่โอนได้ไม่ชัด');
  });
});
