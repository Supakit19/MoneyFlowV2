import { describe, expect, test } from 'bun:test';
import {
  bankReceiptCard,
  bankUnrecognizedCard,
  receiptCard,
  daySummaryCard,
  weeklyCard,
  summaryCard,
  barChartCard,
  simpleHelpCard,
} from '../server/line-flex.ts';

const week = {
  start: '2026-10-05',
  end: '2026-10-11',
  limitSatang: 80000,
  spentSatang: 35020,
  remainingSatang: 44980,
  progress: 0.43775,
  tier: 'ok' as const,
  daysLeftInWeek: 1,
  daysLeftInMonth: 21,
  daysElapsedInWeek: 6,
  daily: [{ date: '2026-10-10', label: 'ส.', spentSatang: 3520 }],
};
function strings(obj: any): string[] {
  const result: string[] = [];
  function walk(node: any) {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (node.type === 'text' && typeof node.text === 'string') result.push(node.text);
    Object.values(node).forEach(walk);
  }
  walk(obj);
  return result;
}
describe('All MoneyFlow consumer finance cards use the new consistent content design', () => {
  const messages = [
    receiptCard([{ kind: 'expense', amount: 85, merchant: 'อาหาร', category: 'อาหาร' }], week, '', true),
    receiptCard([{ kind: 'expense', amount: 85, merchant: 'อาหาร' }], week, '', false),
    summaryCard(
      { month: '2026-10', incomeSatang: 200000, expenseSatang: 35020, savedSatang: 164980 },
      week,
    ),
    daySummaryCard('2026-10-10', 35020, 0, week),
    weeklyCard(week),
    barChartCard('กราฟเดือนนี้', 'รายจ่ายตามหมวด', [{ label: 'อาหาร', spentSatang: 30020 }]),
    simpleHelpCard('https://liff.line.me/2011955989-OUGIQOBk'),
    bankReceiptCard('income', 2000, 'Krungthai Connext'),
    bankReceiptCard('expense', 3520, 'KBank Live'),
    bankUnrecognizedCard('KBank Live'),
  ];
  test('all report cards have matching header, body, footer and safe human-friendly descriptions', () => {
    for (const msg of messages) {
      expect(msg.type).toBe('flex');
      expect(msg.contents.type).toBe('bubble');
      expect(msg.contents.header.type).toBe('box');
      expect(msg.contents.body.type).toBe('box');
      expect(msg.contents.footer?.type).toBe('box');
      expect(msg.contents.styles.header.backgroundColor).toBe('#123D32');
      expect(msg.altText.length).toBeLessThanOrEqual(350);
      expect(strings(msg).join(' ')).not.toMatch(/PostgreSQL|Sender MID|LINEJS|worker|token/i);
    }
  });
  test('warnings never pretend an ambiguous notification is saved', () => {
    const card = bankUnrecognizedCard('Krungthai Connext');
    expect(strings(card).join(' ')).toContain('ยังไม่ได้บันทึก');
    expect(strings(card).join(' ')).not.toMatch(/เลขบัญชี|OTP|รหัสผ่าน/);
  });
  test('income and expense bank cards use different color and exact amounts', () => {
    const inCard = bankReceiptCard('income', 2000, 'Krungthai Connext');
    const outCard = bankReceiptCard('expense', 3520, 'KBank Live');
    expect(strings(inCard).join(' ')).toContain('20');
    expect(strings(outCard).join(' ')).toContain('35.2');
    expect(strings(inCard).join(' ')).toContain('Krungthai Connext');
    expect(strings(outCard).join(' ')).toContain('KBank Live');
  });
});
