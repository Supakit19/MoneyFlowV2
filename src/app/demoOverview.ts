import type { FinanceOverview } from '../MoneyWellness';
import { currentMonth } from '../lib/finance';

// Preview-only zero balance / empty history. Never presented as saved data.
function dateInBangkok() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (name: string) => Number(parts.find((item) => item.type === name)?.value || 0);
  return new Date(Date.UTC(value('year'), value('month') - 1, value('day')));
}

function getDemoOverview(): FinanceOverview {
  const today = dateInBangkok();
  const dayIndex = (today.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - dayIndex);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const daily = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + offset);
    return {
      date: iso(date),
      label: date.toLocaleDateString('th-TH', { weekday: 'short', timeZone: 'UTC' }),
      spentSatang: 0,
    };
  });
  const endOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  const month = currentMonth();
  return {
    settings: {
      weekly_limit_satang: 0,
      savings_goal_satang: 0,
      confirmation_mode: 'always',
      coach_tone: 'friend',
      coach_alerts: 'once',
      daily_digest_enabled: false,
      daily_digest_hour: 20,
    },
    week: {
      start: iso(monday),
      end: iso(sunday),
      limitSatang: 0,
      spentSatang: 0,
      remainingSatang: 0,
      progress: 0,
      tier: 'normal',
      daysLeftInWeek: 6 - dayIndex,
      daysLeftInMonth: endOfMonth.getUTCDate() - today.getUTCDate(),
      daily,
    },
    history: [],
    month: { month, incomeSatang: 0, expenseSatang: 0, savedSatang: 0 },
    categories: { month, categories: [] },
    goal: { targetSatang: 0, savedSatang: 0 },
  };
}

export const demoFinanceOverview = getDemoOverview();
