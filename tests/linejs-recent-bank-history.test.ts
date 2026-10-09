import { describe, expect, test } from 'bun:test';
import {
  HISTORY_BACKFILL_MS,
  historyMessageTime,
  recentBankMessages,
} from '../integrations/linejs/recent-bank-history.ts';

const sender = 'u' + 'a'.repeat(32);
const unrelated = 'u' + 'b'.repeat(32);
const now = Date.parse('2026-10-09T10:00:00Z');

describe('Read-only bank chat history fallback filters by exact sender and age', () => {
  test('only recent messages from the exact bank chat are eligible', () => {
    const messages = [
      { id: '12345678910001', from: sender, createdTime: now - 4_000 },
      { id: '12345678910002', from: unrelated, createdTime: now - 2_000 },
      { id: '12345678910003', from: sender, createdTime: now - HISTORY_BACKFILL_MS - 1 },
      { id: '12345678910004', from: sender, createdTime: now - 7_000 },
      { id: 'invalid', from: sender, createdTime: now - 2_000 },
      { id: '12345678910005', from: sender, createdTime: now + 200_000 },
    ];
    expect(recentBankMessages(messages, sender, now).map((m) => m.id)).toEqual([
      '12345678910004',
      '12345678910001',
    ]);
  });
  test('timestamp can be supplied as epoch seconds, milliseconds or bigint', () => {
    expect(historyMessageTime(now / 1000)).toBe(now);
    expect(historyMessageTime(BigInt(now))).toBe(now);
    expect(historyMessageTime('nonsense')).toBeNull();
    expect(
      recentBankMessages(
        [{ id: '12345678910006', from: sender, createdTime: BigInt(now - 1_000) }],
        sender,
        now,
      ),
    ).toHaveLength(1);
  });
  test('missing timestamps or incorrect sender never trigger a backfill', () => {
    expect(
      recentBankMessages(
        [
          { id: '12345678910007', from: sender },
          { id: '12345678910008', from: unrelated, createdTime: now },
        ],
        sender,
        now,
      ),
    ).toHaveLength(0);
    expect(
      recentBankMessages(
        [{ id: '12345678910009', from: sender, createdTime: now }],
        'not-a-real-mid',
        now,
      ),
    ).toHaveLength(0);
  });
});
