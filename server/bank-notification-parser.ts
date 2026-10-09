/**
 * Conservative LINE bank-alert parser.
 * Treat bank chat content as untrusted. Never persist the raw message or
 * masked account identifiers, and never infer an amount from a bank balance.
 */
export type ParsedBankAlert = {
  kind: 'income' | 'expense';
  amountSatang: number;
  merchant: string;
  bank: string;
  needsReview: boolean;
  /** Transfer auto-save is an independent, explicit opt-in, never default. */
  transferAutoCandidate: boolean;
  reason: string | null;
};

export const BANK_CHANNELS = ['kbank', 'scb', 'other'] as const;
export type BankChannel = (typeof BANK_CHANNELS)[number];

const BANK_NAMES: Record<BankChannel, string> = {
  kbank: 'KBank Live',
  scb: 'SCB Connect',
  other: 'แจ้งเตือนธนาคาร',
};
const BANK_FAIL =
  /(?:ไม่สำเร็จ|ทำรายการไม่สำเร็จ|ยกเลิก|ถูกปฏิเสธ|ล้มเหลว|failed|declined|cancelled|\botp\b|รหัสผ่าน|รหัสยืนยัน)/i;
const BANK_OWN_TRANSFER =
  /(?:บัญชีตนเอง|บัญชีตัวเอง|ระหว่างบัญชี(?:ของคุณ|ตัวเอง|ตนเอง)?|โอนเข้าบัญชีตนเอง|บัญชีของตนเอง|own account|my account)/i;
const CARD_TRANSFER_WITHDRAWAL = /รายการ\s*โอน\s*[\/／-]\s*ถอน/i;
const TRANSFER = /(?:โอน|transfer|ถอน(?:เงิน)?|withdrawal)/i;
const OUTGOING =
  /(?:เงินออก|โอนออก|โอนเงินออก|ชำระ(?:เงิน)?|จ่าย(?:เงิน)?|ใช้จ่าย|หักบัญชี|ตัดเงิน|ถอนเงิน|สแกนจ่าย|รายการเดบิต|รายการ\s*โอน\s*[\/／-]\s*ถอน)/i;
const INCOMING = /(?:เงินเข้า|รับโอน|โอนเข้า|รับเงิน|ฝากเงิน|รายการเครดิต)/i;
const BALANCE_LABEL = /(?:ยอดคงเหลือ|คงเหลือ|available(?:\s+balance)?|balance|วงเงินคงเหลือ)/i;
const TRANSACTION_LABEL =
  /(?:จำนวนเงิน|ยอด(?:เงิน)?ที่(?:โอน|จ่าย|ถอน)|ยอด(?:โอน|จ่าย|ถอน|รายการ)|เงินออก|เงินเข้า|รับเงิน|จ่าย|ชำระ|ถอนเงิน|amount)/i;

function satang(input: string): number | null {
  const numeric = input.replace(/,/g, '').replace(/^[+−-]/, '');
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(numeric)) return null;
  const [whole, fraction = ''] = numeric.split('.');
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(value) && value > 0 && value <= 1_000_000_000 ? value : null;
}

function amountCandidates(text: string): number[] {
  const found: number[] = [];

  // Currency-bearing numbers from anywhere in a statement. Unlike a generic
  // number matcher, this excludes dates, times and bank account suffixes.
  const withCurrency =
    /(?:฿\s*|THB\s*)?([+-]?\d[\d,]{0,12}(?:\.\d{1,2})?)\s*(?:บาท|THB|฿)|(?:฿|THB)\s*([+-]?\d[\d,]{0,12}(?:\.\d{1,2})?)/gi;
  for (const match of text.matchAll(withCurrency)) {
    const before = text.slice(Math.max(0, (match.index || 0) - 110), match.index || 0);
    // A balance may be written on the same line OR on the next Flex text node.
    const adjacent = before.split('\n').slice(-2).join(' ').trim();
    if (
      BALANCE_LABEL.test(adjacent) &&
      !TRANSACTION_LABEL.test(adjacent.split(/ยอดคงเหลือ|คงเหลือ|balance|available/i).pop() || '')
    ) {
      continue;
    }
    const value = satang(match[1] || match[2] || '');
    if (value !== null) found.push(value);
  }

  // KBank Live Flex cards can render "จำนวนเงิน" and "100.00" in two
  // separate text nodes, WITHOUT "บาท". Require an explicit transaction
  // label and exactly two decimal digits if currency is not given.
  const lineAmount =
    /(?:^|\n)[ \t]*(?:จำนวนเงิน|ยอด(?:เงิน)?ที่(?:โอน|จ่าย|ถอน)|ยอด(?:โอน|จ่าย|ถอน|รายการ)|amount(?:\s+paid)?)[ \t]*[:：]?[ \t]*(?:\r?\n[ \t]*)?([+-]?\d[\d,]{0,12}(?:\.\d{1,2})?)[ \t]*(บาท|THB|฿)?(?=\s|$)/gim;
  for (const match of text.matchAll(lineAmount)) {
    const raw = match[1] || '';
    if (!raw.includes('.') && !match[2]) continue;
    const value = satang(raw);
    if (value !== null) found.push(value);
  }
  return found;
}

/**
 * KBank Live sometimes delivers the Flex body without its visual header.
 * A signed transaction amount is still an explicit debit/credit signal:
 *   จำนวนเงิน -30.00 บาท => expense; จำนวนเงิน +30.00 บาท => income.
 * Never inspect balance amounts or naked account numbers for direction.
 */
function signedTransactionDirection(text: string): 'income' | 'expense' | 'conflict' | null {
  const labelledAmount =
    /(?:จำนวนเงิน|ยอด(?:เงิน)?ที่(?:โอน|จ่าย|ถอน)|ยอด(?:โอน|จ่าย|ถอน|รายการ)|amount(?:\s+paid)?)[ \t]*[:：]?[ \t]*(?:\r?\n[ \t]*)?([+-])\s*(\d[\d,]{0,12}(?:\.\d{1,2})?)/gi;
  let direction: 'income' | 'expense' | null = null;
  for (const match of text.matchAll(labelledAmount)) {
    if (satang(match[2]) === null) continue;
    const current = match[1] === '-' ? 'expense' : 'income';
    if (direction && direction !== current) return 'conflict';
    direction = current;
  }
  return direction;
}

function normalizeBankText(message: string): string {
  return message
    .replace(/[\u200b-\u200d\ufeff\u00a0]/g, ' ')
    .replace(/[−‒–﹣－]/g, '-')
    .replace(/＋/g, '+')
    .trim();
}

export type BankAlertAnalysis = {
  kind: 'income' | 'expense' | null;
  amountSatang: number | null;
  issue: 'ok' | 'no_direction' | 'direction_conflict' | 'no_amount' | 'multiple_amounts' | 'blocked';
};

/** Safe classification hints only. Never use a partial result for auto-save. */
export function analyzeBankNotification(message: string): BankAlertAnalysis {
  const blocked: BankAlertAnalysis = { kind: null, amountSatang: null, issue: 'blocked' };
  if (typeof message !== 'string') return blocked;
  const text = normalizeBankText(message);
  if (!text || text.length > 3500 || BANK_FAIL.test(text)) return blocked;

  const outgoing = OUTGOING.test(text);
  const incoming = INCOMING.test(text);
  const signed = signedTransactionDirection(text);
  const directions = new Set<'income' | 'expense'>();
  if (outgoing) directions.add('expense');
  if (incoming) directions.add('income');
  if (signed === 'expense' || signed === 'income') directions.add(signed);
  const conflicting = signed === 'conflict' || directions.size > 1;
  const kind = conflicting ? null : directions.values().next().value || null;
  const values = [...new Set(amountCandidates(text))];
  const amountSatang = values.length === 1 ? values[0] : null;

  return {
    kind,
    amountSatang,
    issue: conflicting
      ? 'direction_conflict'
      : !kind
        ? 'no_direction'
        : values.length === 0
          ? 'no_amount'
          : values.length > 1
            ? 'multiple_amounts'
            : 'ok',
  };
}

export function parseBankNotification(message: string, bank: BankChannel): ParsedBankAlert | null {
  if (!BANK_CHANNELS.includes(bank) || typeof message !== 'string') return null;
  const analysis = analyzeBankNotification(message);
  if (analysis.issue !== 'ok' || !analysis.kind || !analysis.amountSatang) return null;
  const text = normalizeBankText(message);
  const kind = analysis.kind;
  const ownTransfer = BANK_OWN_TRANSFER.test(text);
  const transferLike =
    TRANSFER.test(text) ||
    CARD_TRANSFER_WITHDRAWAL.test(text) ||
    (bank === 'kbank' && /จากบัญชี/.test(text));
  const needsReview = ownTransfer || transferLike;
  const bankName = BANK_NAMES[bank];

  return {
    kind,
    amountSatang: analysis.amountSatang,
    merchant: (kind === 'expense' ? 'จ่ายผ่าน ' : 'รับเงินผ่าน ') + bankName,
    bank: bankName,
    needsReview,
    transferAutoCandidate: transferLike && !ownTransfer && kind === 'expense' && bank !== 'other',
    reason: ownTransfer
      ? 'อาจเป็นการโอนระหว่างบัญชีตัวเอง กรุณาตรวจสอบก่อนบันทึก'
      : transferLike
        ? kind === 'income'
          ? 'เป็นรายการรับโอน ต้องตรวจสอบประเภทและยอดเงินจริงก่อนบันทึก'
          : 'เป็นรายการโอน/ถอน กรุณาตรวจยอดและยืนยันก่อนบันทึก'
        : null,
  };
}

/**
 * Minimal signed-amount parser for automatic LINEJS transactions.
 * The sign MUST be attached to the transaction's labelled amount.
 * A bank balance, account number, unsigned amount or conflicting signs never qualifies.
 */
export function parseSignedBankNotification(message: string, bank: BankChannel): ParsedBankAlert | null {
  if (!BANK_CHANNELS.includes(bank) || typeof message !== 'string') return null;
  const text = normalizeBankText(message);
  if (!text || text.length > 3500 || BANK_FAIL.test(text)) return null;

  const signedAmount =
    /(?:จำนวนเงิน|ยอด(?:เงิน)?ที่(?:โอน|จ่าย|ถอน)|ยอด(?:โอน|จ่าย|ถอน|รายการ)|amount(?:\s+paid)?)[ \t]*[:：]?[ \t]*(?:\r?\n[ \t]*)?([+-])\s*(\d[\d,]{0,12}(?:\.\d{1,2})?)(?:[ \t]*(?:บาท|THB|฿))?(?=\s|$)/gi;
  const matches = [...text.matchAll(signedAmount)]
    .map((m) => ({
      kind: m[1] === '-' ? ('expense' as const) : ('income' as const),
      amountSatang: satang(m[2]),
    }))
    .filter((x): x is { kind: 'income' | 'expense'; amountSatang: number } => x.amountSatang !== null);

  // Some KBank Flex layouts separate the "จำนวนเงิน" label and signed value
  // with unrelated text nodes. Fall back to a unique signed money value in
  // the transaction section, while excluding all balance-labelled values.
  if (!matches.length) {
    if (
      !/(?:จำนวนเงิน|ยอด(?:เงิน)?ที่(?:โอน|จ่าย|ถอน)|รายการโอน|รับโอน|เงินเข้า|เงินออก|amount)/i.test(
        text,
      )
    )
      return null;
    let section: 'transaction' | 'balance' | 'other' = 'other';
    const signedValue = /(?:^|[\s(])([+-])\s*(\d[\d,]{0,12}\.\d{2})(?:\s*(?:บาท|THB|฿))?(?=\s|$)/gi;
    for (const line of text.split(/\r?\n/)) {
      if (BALANCE_LABEL.test(line) && !TRANSACTION_LABEL.test(line)) section = 'balance';
      else if (TRANSACTION_LABEL.test(line) && !BALANCE_LABEL.test(line)) section = 'transaction';
      for (const match of line.matchAll(signedValue)) {
        if (section === 'balance' || BALANCE_LABEL.test(line)) continue;
        const amountSatang = satang(match[2]);
        if (amountSatang !== null) {
          matches.push({ kind: match[1] === '-' ? 'expense' : 'income', amountSatang });
        }
      }
    }
  }

  if (!matches.length) return null;
  if (matches.some((m) => m.kind !== matches[0].kind || m.amountSatang !== matches[0].amountSatang))
    return null;

  const { kind, amountSatang } = matches[0];
  // Reject explicit contradictions, but not generic "รายการโอน/ถอน" card titles.
  const explicitIncoming = /(?:เงินเข้า|รับโอน|โอนเข้า|รับเงิน|รายการเครดิต)/i.test(text);
  const explicitOutgoing =
    /(?:เงินออก|โอนออก|โอนเงินออก|ชำระเงิน|จ่ายเงิน|หักบัญชี|ตัดเงิน|สแกนจ่าย|รายการเดบิต)/i.test(text);
  if ((kind === 'income' && explicitOutgoing) || (kind === 'expense' && explicitIncoming)) return null;

  const bankName = BANK_NAMES[bank];
  return {
    kind,
    amountSatang,
    merchant: (kind === 'expense' ? 'เงินออกผ่าน ' : 'เงินเข้าผ่าน ') + bankName,
    bank: bankName,
    needsReview: false,
    transferAutoCandidate: false,
    reason: null,
  };
}
