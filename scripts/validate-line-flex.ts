import {
  receiptCard,
  summaryCard,
  daySummaryCard,
  weeklyCard,
  barChartCard,
  simpleHelpCard,
  bankReceiptCard,
  bankUnrecognizedCard,
  dailyAllowanceCard,
  savingsGoalCard,
} from '../server/line-flex.ts';
const access = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!access) throw Error('LINE_CHANNEL_ACCESS_TOKEN missing');
const week = {
  start: '2026-10-05',
  end: '2026-10-11',
  limitSatang: 120000,
  spentSatang: 100000,
  remainingSatang: 20000,
  progress: 5 / 6,
  tier: 'near' as const,
  daysLeftInWeek: 3,
  daysLeftInMonth: 23,
  daysElapsedInWeek: 4,
  daily: Array.from({ length: 7 }, (_, i) => ({
    date: '2026-10-' + String(5 + i).padStart(2, '0'),
    label: ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'][i],
    spentSatang: 10000 * i,
  })),
};
const items = [{ kind: 'expense', amount: 84, merchant: 'CJ 1969', category: 'ช้อปปิ้ง' }];
const data = [
  ['receipt-preview', receiptCard(items, week, '', false)],
  ['receipt-complete', receiptCard(items, week, 'วันนี้ยังเหลืองบอยู่', true)],
  [
    'summary',
    summaryCard(
      { month: '2026-10', incomeSatang: 200000, expenseSatang: 125000, savedSatang: 75000 },
      week,
    ),
  ],
  ['today', daySummaryCard('2026-10-08', 7000, 0, week)],
  ['weekly', weeklyCard(week)],
  [
    'chart',
    barChartCard(
      'กราฟสัปดาห์',
      '7 วัน',
      week.daily.map((d) => ({ label: d.label, spentSatang: d.spentSatang })),
    ),
  ],
  ['help', simpleHelpCard()],
  ['bank-income', bankReceiptCard('income', 2000, 'KBank Live')],
  ['bank-expense', bankReceiptCard('expense', 3520, 'Krungthai Connext')],
  ['bank-review', bankUnrecognizedCard('Krungthai Connext')],
  ['daily-allowance', dailyAllowanceCard(week)],
  ['savings-goal', savingsGoalCard(120000, 100000)],
] as const;
for (const [name, message] of data) {
  const result = await fetch('https://api.line.me/v2/bot/message/validate/reply', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [message] }),
    signal: AbortSignal.timeout(12000),
  });
  const body = await result.text();
  console.log('VALIDATE', name, result.status, body.replaceAll(access, '[redacted]').slice(0, 600));
  if (!result.ok) process.exitCode = 1;
}
