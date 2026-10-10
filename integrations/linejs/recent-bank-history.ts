/**
 * Narrow, time-limited history fallback for a previously authorized bank chat.
 * Never broad-scans personal chats, and never logs any message contents.
 */
export type BankHistoryMessage = {
  id?: unknown;
  from?: unknown;
  createdTime?: unknown;
  contentMetadata?: unknown;
};
export const HISTORY_BACKFILL_MS = 30 * 60 * 1000;

/** Scope in-memory delivery caches by bank sender as well as LINE message ID. */
export function bankDeliveryKey(senderMid: string, messageId: string): string | null {
  if (!/^u[0-9a-f]{32}$/i.test(senderMid) || !/^\d{5,30}$/.test(messageId)) return null;
  return `${senderMid.toLowerCase()}:${messageId}`;
}

export function historyMessageTime(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'bigint' && typeof value !== 'string') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n >= 1_000_000_000_000 && n < 100_000_000_000_000) return n; // epoch ms
  if (n >= 1_000_000_000 && n < 100_000_000_000) return n * 1000; // epoch seconds
  return null;
}

export function recentBankMessages<T extends BankHistoryMessage>(
  messages: T[],
  allowedSenderMid: string,
  now: number,
  maxAge = HISTORY_BACKFILL_MS,
): T[] {
  if (!/^u[0-9a-f]{32}$/i.test(allowedSenderMid)) return [];
  const from = allowedSenderMid.toLowerCase();
  const cutoff = now - maxAge;
  return messages
    .filter((m) => {
      const id = String(m.id || '');
      const created = historyMessageTime(m.createdTime);
      return (
        String(m.from || '').toLowerCase() === from &&
        /^\d{5,30}$/.test(id) &&
        created !== null &&
        created >= cutoff &&
        created <= now + 120_000
      );
    })
    .sort((a, b) => (historyMessageTime(a.createdTime) || 0) - (historyMessageTime(b.createdTime) || 0));
}
