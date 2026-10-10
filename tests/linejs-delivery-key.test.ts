import { describe, expect, test } from 'bun:test';
import { bankDeliveryKey } from '../integrations/linejs/recent-bank-history.ts';

const kbank = 'u' + 'a'.repeat(32);
const krungthai = 'u' + 'b'.repeat(32);

describe('LINEJS worker delivery deduplication across two bank chats', () => {
  test('the same message ID sent by different bank senders is processed independently', () => {
    const messageId = '123456789000015';
    const seen = new Set<string>();
    const first = bankDeliveryKey(kbank, messageId);
    const second = bankDeliveryKey(krungthai, messageId);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first).not.toBe(second);
    seen.add(first!);
    expect(seen.has(first!)).toBe(true);
    expect(seen.has(second!)).toBe(false);
    seen.add(second!);
    expect(seen.size).toBe(2);
  });

  test('duplicate events from one sender share the same cache key regardless of MID case', () => {
    expect(bankDeliveryKey(kbank, '123456789000015')).toBe(
      bankDeliveryKey(kbank.toUpperCase(), '123456789000015'),
    );
  });

  test('invalid sender or LINE message IDs cannot enter worker delivery caches', () => {
    expect(bankDeliveryKey('invalid', '123456789000015')).toBeNull();
    expect(bankDeliveryKey(krungthai, 'not-a-message-id')).toBeNull();
  });
});
