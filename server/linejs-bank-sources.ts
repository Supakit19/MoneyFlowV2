/**
 * Additional sender routing for one MoneyFlow user and one LINEJS session.
 * The legacy primary bank remains in bank_linejs_settings; secondary banks
 * are stored in extra_sources JSONB. No credentials or alert texts here.
 */
import { BANK_CHANNELS, type BankChannel } from './bank-notification-parser.ts';

export type AdditionalBankSource = {
  bank: BankChannel;
  senderMid: string;
  accountId: string;
  enabled: boolean;
};
const validMid = (value: unknown): value is string =>
  typeof value === 'string' && /^u[0-9a-f]{32}$/i.test(value);
const validUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function extraBankSources(row: any): AdditionalBankSource[] {
  if (!Array.isArray(row?.extra_sources)) return [];
  return row.extra_sources
    .filter(
      (x: any) =>
        x &&
        typeof x === 'object' &&
        BANK_CHANNELS.includes(x.bank) &&
        validMid(x.senderMid) &&
        validUuid(x.accountId) &&
        typeof x.enabled === 'boolean',
    )
    .slice(0, 3)
    .map((x: AdditionalBankSource) => ({
      bank: x.bank,
      senderMid: x.senderMid.toLowerCase(),
      accountId: x.accountId.toLowerCase(),
      enabled: x.enabled,
    }));
}

export function activeBankSources(row: any): AdditionalBankSource[] {
  const primary: AdditionalBankSource[] =
    validMid(row?.sender_mid) && validUuid(row?.account_id) && BANK_CHANNELS.includes(row?.bank)
      ? [
          {
            bank: row.bank,
            senderMid: row.sender_mid.toLowerCase(),
            accountId: row.account_id.toLowerCase(),
            enabled: true,
          },
        ]
      : [];
  return [...primary, ...extraBankSources(row).filter((x) => x.enabled)];
}

export function activeBankMids(row: any): string[] {
  return [...new Set(activeBankSources(row).map((x) => x.senderMid))];
}

export function sourceByMid(row: any, mid: string): AdditionalBankSource | null {
  return activeBankSources(row).find((x) => x.senderMid === mid.toLowerCase()) || null;
}

export function validateAdditionalBankSources(value: unknown, primary: any): AdditionalBankSource[] {
  if (!Array.isArray(value) || value.length > 3) {
    throw Error('เชื่อมธนาคารเพิ่มเติมได้สูงสุด 3 แชต');
  }
  const uniqueBanks = new Set<string>();
  const uniqueMids = new Set<string>();
  const primaryMid = String(primary?.sender_mid || '').toLowerCase();
  const primaryBank = validMid(primary?.sender_mid) ? String(primary?.bank) : '';
  return value.map((row) => {
    if (
      !row ||
      typeof row !== 'object' ||
      !BANK_CHANNELS.includes(row.bank) ||
      !validMid(row.senderMid) ||
      !validUuid(row.accountId) ||
      typeof row.enabled !== 'boolean'
    )
      throw Error('กรุณาตรวจสอบธนาคาร Sender MID และบัญชีปลายทาง');
    const bank = row.bank as BankChannel;
    const senderMid = row.senderMid.toLowerCase();
    const accountId = row.accountId.toLowerCase();
    if (
      bank === primaryBank ||
      senderMid === primaryMid ||
      uniqueBanks.has(bank) ||
      uniqueMids.has(senderMid)
    )
      throw Error('ธนาคารหรือ Sender MID ซ้ำกับแชตที่เชื่อมอยู่แล้ว');
    uniqueBanks.add(bank);
    uniqueMids.add(senderMid);
    return { bank, senderMid, accountId, enabled: row.enabled };
  });
}
