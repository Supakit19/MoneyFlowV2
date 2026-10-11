import type { Sql } from 'postgres';
import { bankReceiptCard, bankUnrecognizedCard } from './line-flex.ts';

export type BankReceipt = {
  kind: 'income' | 'expense';
  amountSatang: number;
  bank: string;
};

export function bankReceiptText(receipt: BankReceipt): string {
  if (
    !Number.isSafeInteger(receipt.amountSatang) ||
    receipt.amountSatang <= 0 ||
    !['income', 'expense'].includes(receipt.kind)
  ) {
    throw Error('Invalid LINEJS receipt');
  }
  const amount = (receipt.amountSatang / 100).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const label = receipt.kind === 'income' ? 'เงินเข้า' : 'เงินออก';
  const sign = receipt.kind === 'income' ? '+' : '-';
  const icon = receipt.kind === 'income' ? '💚' : '💸';
  const source =
    receipt.bank === 'KBank Live'
      ? 'KBank Live'
      : receipt.bank === 'Krungthai Connext'
        ? 'Krungthai Connext'
        : receipt.bank === 'SCB Connect'
          ? 'SCB Connect'
          : 'ธนาคาร';
  return `${icon} MoneyFlow บันทึก${label}แล้ว\n${sign}฿${amount} · ${source}\nดูรายละเอียดได้ใน MoneyFlow`;
}

/**
 * Best-effort LINE OA push after the MoneyFlow transaction is committed.
 * Only to the LINE account linked to the corresponding MoneyFlow user.
 * No raw bank messages, account numbers, sender MID or images are sent.
 */
export async function pushBankReceipt(
  db: Sql,
  userId: string,
  eventId: string,
  receipt: BankReceipt,
): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  let successful = false;
  try {
    if (token) {
      const links = await db`
        SELECT line_user_id FROM line_links WHERE user_id=${userId} LIMIT 1
      `;
      if (links.length) {
        const response = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: links[0].line_user_id,
            messages: [bankReceiptCard(receipt.kind, receipt.amountSatang, receipt.bank)],
          }),
          signal: AbortSignal.timeout(8000),
        });
        successful = response.ok;
        if (!successful) console.warn('LINEJS receipt push HTTP status', response.status);
      } else {
        console.warn('LINEJS receipt push skipped: no linked LINE OA');
      }
    } else {
      console.warn('LINEJS receipt push skipped: Messaging API unavailable');
    }
  } catch {
    console.warn('LINEJS receipt push failed; the finance transaction remains saved');
  }
  try {
    await db`
      UPDATE bank_linejs_events
      SET push_status=${successful ? 'sent' : 'failed'}
      WHERE id=${eventId} AND user_id=${userId} AND status='saved'
    `;
  } catch {
    // Push outcome must never roll back a committed financial transaction.
  }
  return successful;
}

/**
 * Notify only the linked LINE OA user when a bank alert could not be classified.
 * No bank account, raw message, sender MID or uncertain amount is transmitted.
 */
export async function pushUnrecognizedBankAlert(
  db: Sql,
  userId: string,
  eventId: string,
  bank: string,
): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const source =
    bank === 'kbank'
      ? 'KBank Live'
      : bank === 'ktb'
        ? 'Krungthai Connext'
        : bank === 'scb'
          ? 'SCB Connect'
          : 'ธนาคาร';
  let successful = false;
  try {
    if (token) {
      const links = await db`
        SELECT line_user_id FROM line_links WHERE user_id=${userId} LIMIT 1
      `;
      if (links.length) {
        const reply = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: links[0].line_user_id,
            messages: [bankUnrecognizedCard(source)],
          }),
          signal: AbortSignal.timeout(8000),
        });
        successful = reply.ok;
        if (!reply.ok) console.warn('LINEJS unrecognized-alert push HTTP', reply.status);
      }
    }
  } catch {
    console.warn('LINEJS unrecognized-alert push unavailable');
  }
  try {
    await db`
      UPDATE bank_linejs_events
      SET push_status=${successful ? 'sent' : 'failed'}
      WHERE id=${eventId} AND user_id=${userId} AND status='pending'
    `;
  } catch {
    // A failed optional notification cannot affect the user's ledger.
  }
  return successful;
}
