/**
 * Source-aware LINE bank alert interpreter.
 *
 * LINEJS exposes KBank Live alerts as a Flex body plus, often, an ALT_TEXT
 * description. They are independent inputs: mixing them before classifying
 * may turn incoming bank alerts into outgoing transfers (or vice versa).
 *
 * This parser only outputs a complete transaction. It never stores raw bank
 * messages, guesses from an account number, or uses "balance" as an amount.
 */
import {
  BANK_CHANNELS,
  parseSignedBankNotification,
  type BankChannel,
  type ParsedBankAlert,
} from './bank-notification-parser.ts';

export type BankMessageSources = {
  /** Actual Flex text nodes, or the normal text of a LINE message. */
  text: string;
  /** Accessible fallback caption/ALT_TEXT for a Flex card. */
  altText?: string;
  /** raw.text when LINEJS returned separate text and Flex fields. */
  rawText?: string;
};

const block =
  /(?:ไม่สำเร็จ|ทำรายการไม่สำเร็จ|ยกเลิก|ถูกปฏิเสธ|ล้มเหลว|failed|declined|cancelled|\botp\b|รหัสผ่าน|รหัสยืนยัน|รหัสผ่านใช้ครั้งเดียว)/i;
const balanceLabel = /(?:ยอดคงเหลือ|คงเหลือ|balance|available|วงเงินคงเหลือ)/i;
const txnLabel =
  /(?:จำนวนเงิน|ยอด(?:เงิน)?ที่(?:รับ|เข้า|โอน|จ่าย|ถอน)|ยอด(?:โอน|จ่าย|ถอน|รายการ)|จำนวนที่(?:โอน|ถอน|จ่าย)|amount(?:\s+paid)?)/i;
const concreteIn =
  /(?:เงินเข้า|รับโอน|โอนเข้า|รับเงิน|รายการเครดิต|ได้รับเงิน|ฝากเงิน|deposit(?:ed)?|credited)/i;
const concreteOut =
  /(?:เงินออก|โอนออก|โอนเงินออก|ชำระ(?:เงิน)?|จ่าย(?:เงิน)?|หักบัญชี|ตัดเงิน|สแกนจ่าย|รายการเดบิต|ถอนเงิน|debit(?:ed)?|withdrawal|paid)/i;
const genericWithdrawal = /(?:รายการ\s*โอน\s*[\/／-]\s*ถอน|รายการถอน|transfer\s*out)/i;
const ownTransfer =
  /(?:บัญชีตัวเอง|บัญชีตนเอง|บัญชีของตนเอง|ระหว่างบัญชี(?:ตนเอง|ตัวเอง)?|own account|my account)/i;

// Match decimals only, not times, dates, IDs, or unseparated integer account suffixes.
const decimals = /(?<![\d.,/])([+−-]?\d{1,9}(?:,\d{3})*\.\d{2})(?![\d.,/])/g;
const labelledInteger =
  /(?:จำนวนเงิน|ยอด(?:เงิน)?ที่(?:โอน|จ่าย|ถอน)|amount)[ \t]*[:：]?[ \t]*(?:\r?\n[ \t]*)?([+-]?\d{1,9})[ \t]*(?:บาท|THB|฿)(?!\S)/gi;

function normalize(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  return value
    .slice(0, limit)
    .replace(/[\u200b-\u200d\ufeff\u00a0\u202f]/g, ' ')
    .replace(/[−‒–﹣－]/g, '-')
    .replace(/＋/g, '+')
    .trim();
}

function toSatang(number: string): number | null {
  const normalized = number.replace(/,/g, '').replace(/^[+-]/, '');
  if (!/^\d{1,9}(?:\.\d{2})?$/.test(normalized)) return null;
  const [whole, cents = '00'] = normalized.split('.');
  const result = Number(whole) * 100 + Number(cents);
  return Number.isSafeInteger(result) && result > 0 && result <= 1_000_000_000 ? result : null;
}

type Direction = 'income' | 'expense';
function direction(text: string): { kind: Direction | null; conflict: boolean } {
  const inwards = concreteIn.test(text);
  const outwards = concreteOut.test(text);
  if (inwards && outwards) return { kind: null, conflict: true };
  if (inwards) return { kind: 'income', conflict: false };
  if (outwards) return { kind: 'expense', conflict: false };
  if (genericWithdrawal.test(text)) return { kind: 'expense', conflict: false };
  return { kind: null, conflict: false };
}

/**
 * Monetary values inside the actual transaction section (not balance).
 * A labelled amount is preferred; otherwise accept exactly one unlabelled
 * decimal from Flex, only when the accompanying bank caption gives direction.
 */
function amountCandidates(text: string): { labelled: number[]; other: number[] } {
  const labelled: number[] = [];
  const other: number[] = [];
  let section: 'transaction' | 'balance' | 'other' = 'other';
  let labelDistance = 99;

  for (const line of text.split(/\r?\n/).slice(0, 60)) {
    const isBalance = balanceLabel.test(line);
    const isTransaction = txnLabel.test(line);
    if (isBalance && !isTransaction) {
      section = 'balance';
      labelDistance = 99;
    } else if (isTransaction && !isBalance) {
      section = 'transaction';
      labelDistance = 0;
    } else if (labelDistance < 99) labelDistance++;

    if (isBalance) continue;

    for (const match of line.matchAll(decimals)) {
      const amount = toSatang(match[1]);
      if (amount === null || section === 'balance') continue;
      if (labelDistance <= 2 || (isTransaction && !isBalance)) labelled.push(amount);
      else other.push(amount);
    }
  }

  // Some messages contain "จำนวนเงิน 30 บาท" without decimals.
  for (const match of text.matchAll(labelledInteger)) {
    const amount = toSatang(match[1]);
    if (amount !== null) labelled.push(amount);
  }
  return { labelled: [...new Set(labelled)], other: [...new Set(other)] };
}

/**
 * LINEJS can also return a signed amount without the "จำนวนเงิน" label.
 * Exclude balance sections so the balance's own sign never sets direction.
 */
function signedWithoutLabel(
  text: string,
): { kind: Direction; amountSatang: number } | 'conflict' | null {
  const found: { kind: Direction; amountSatang: number }[] = [];
  let insideBalance = false;
  const signedDecimal = /(?<![\d.,/])([+-])\s*(\d{1,9}(?:,\d{3})*\.\d{2})(?![\d.,/])/g;
  for (const line of text.split(/\r?\n/).slice(0, 60)) {
    if (balanceLabel.test(line) && !txnLabel.test(line)) insideBalance = true;
    else if (txnLabel.test(line)) insideBalance = false;
    if (insideBalance) continue;
    for (const match of line.matchAll(signedDecimal)) {
      const amountSatang = toSatang(match[2]);
      if (amountSatang !== null)
        found.push({ kind: match[1] === '+' ? 'income' : 'expense', amountSatang });
    }
  }
  if (!found.length) return null;
  if (found.some((v) => v.kind !== found[0].kind || v.amountSatang !== found[0].amountSatang))
    return 'conflict';
  return found[0];
}

/**
 * Krungthai Connext sends alerts such as "เงินเข้า 25,000 บาท"
 * and "เงินออก 350 บาท". Never infer a debit from an unsigned amount.
 * The ingestion API separately verifies the exact LINE Sender MID.
 */
export function parseKrungthaiConnext(text: string): ParsedBankAlert | null {
  const value = normalize(text, 3500);
  if (!value || block.test(value) || ownTransfer.test(value)) return null;
  const matches: { kind: Direction; amountSatang: number }[] = [];
  const pattern =
    /(?:^|\n)\s*(?:เงิน\s*(เข้า|ออก)|รับเงิน|จ่ายเงิน)\s*[:：]?\s*(?:฿\s*)?([+-]?\d{1,9}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:บาท|฿|THB)/gim;
  for (const line of value.split(/\r?\n/)) {
    if (balanceLabel.test(line)) continue;
    for (const m of line.matchAll(pattern)) {
      const amountSatang = toSatang(m[2]);
      if (!amountSatang) continue;
      const kind: Direction = m[1] === 'เข้า' || /รับเงิน/.test(m[0]) ? 'income' : 'expense';
      // A +/- symbol contradicting the label must never generate a transaction.
      if ((kind === 'income' && m[2].startsWith('-')) || (kind === 'expense' && m[2].startsWith('+')))
        return null;
      matches.push({ kind, amountSatang });
    }
  }
  if (matches.length !== 1) return null;
  if (concreteIn.test(value) && concreteOut.test(value)) return null;
  if (matches[0].kind === 'income' && concreteOut.test(value)) return null;
  if (matches[0].kind === 'expense' && concreteIn.test(value)) return null;
  return {
    kind: matches[0].kind,
    amountSatang: matches[0].amountSatang,
    merchant: (matches[0].kind === 'income' ? 'เงินเข้าผ่าน ' : 'เงินออกผ่าน ') + 'Krungthai Connext',
    bank: 'Krungthai Connext',
    needsReview: false,
    transferAutoCandidate: false,
    reason: null,
  };
}

export function parseBankAlertFromSources(
  sources: BankMessageSources,
  bank: BankChannel,
): ParsedBankAlert | null {
  if (!BANK_CHANNELS.includes(bank) || !sources || typeof sources.text !== 'string') return null;
  const primary = normalize(sources.text, 3500);
  const alt = normalize(sources.altText, 400);
  const raw = normalize(sources.rawText, 500);
  if ((!primary && !alt && !raw) || block.test([primary, alt, raw].join('\n'))) return null;
  // Krungthai messages use explicit direction labels. KBank fallback is
  // intentionally NOT applied to this bank.
  if (bank === 'ktb') {
    const results = [primary, alt, raw]
      .map(parseKrungthaiConnext)
      .filter((x): x is ParsedBankAlert => x !== null);
    if (
      !results.length ||
      results.some((x) => x.kind !== results[0].kind || x.amountSatang !== results[0].amountSatang)
    )
      return null;
    return results[0];
  }

  // Check *all* signed transaction amounts before accepting the first
  // labelled one. A single Flex card with both +20 and -50 is ambiguous.
  const unlabelledSign = signedWithoutLabel(primary);
  if (unlabelledSign === 'conflict') return null;
  // A signed amount in the real transaction text is strongest evidence.
  const signed = parseSignedBankNotification(primary, bank);
  if (signed) return { ...signed, needsReview: false, reason: null };

  // The real amount's +/- symbol still wins when the Flex card omitted the
  // amount label. Do not apply the unknown=>expense fallback to a visible +.
  const signedInPrimary = /(?:^|[\s(])[+-]\s*\d[\d,]*\.\d{2}(?=\s|$)/m;
  if (unlabelledSign) {
    const amounts = amountCandidates(primary);
    const money = amounts.labelled.length ? amounts.labelled : amounts.other;
    const hasTransactionContext =
      txnLabel.test(primary) || /(?:จากบัญชี|เข้าบัญชี|รายการโอน|รายการถอน|บาท|THB|฿)/i.test(primary);
    if (
      !hasTransactionContext ||
      money.length !== 1 ||
      money[0] !== unlabelledSign.amountSatang ||
      (concreteIn.test(primary) && unlabelledSign.kind !== 'income') ||
      (concreteOut.test(primary) && unlabelledSign.kind !== 'expense')
    )
      return null;
    const bankName = bank === 'kbank' ? 'KBank Live' : bank === 'scb' ? 'SCB Connect' : 'ธนาคาร';
    return {
      kind: unlabelledSign.kind,
      amountSatang: unlabelledSign.amountSatang,
      merchant: (unlabelledSign.kind === 'income' ? 'เงินเข้าผ่าน ' : 'เงินออกผ่าน ') + bankName,
      bank: bankName,
      needsReview: false,
      transferAutoCandidate: false,
      reason: null,
    };
  }

  // A signed transaction which failed labelled parsing may contain
  // contradictory information; never reinterpret its sign as an expense.
  if (txnLabel.test(primary) && signedInPrimary.test(primary)) return null;
  const fromPrimary = amountCandidates(primary);
  const fromRaw = amountCandidates(raw);
  const fromAlt = amountCandidates(alt);
  // ALT_TEXT and raw.text sometimes contain the original signed amount
  // even when the Flex body only contains an unsigned rendering.
  for (const secondary of [
    { text: raw, candidates: fromRaw },
    { text: alt, candidates: fromAlt },
  ]) {
    if (!secondary.text) continue;
    const alternativeSign = parseSignedBankNotification(secondary.text, bank);
    if (alternativeSign) {
      const primaryValues = fromPrimary.labelled.length ? fromPrimary.labelled : fromPrimary.other;
      if (
        primaryValues.length &&
        (primaryValues.length !== 1 || primaryValues[0] !== alternativeSign.amountSatang)
      )
        return null;
      const explicitPrimary = direction(primary);
      if (
        explicitPrimary.conflict ||
        (explicitPrimary.kind && concreteIn.test(primary) && alternativeSign.kind !== 'income') ||
        (explicitPrimary.kind && concreteOut.test(primary) && alternativeSign.kind !== 'expense')
      )
        return null;
      return { ...alternativeSign, needsReview: false, reason: null };
    }
    // Signed secondary source with invalid/conflicting direction must not
    // be interpreted as an opposite unsigned amount.
    if (txnLabel.test(secondary.text) && signedInPrimary.test(secondary.text)) return null;
  }
  const hasAmount = (c: { labelled: number[]; other: number[] }) =>
    c.labelled.length > 0 || c.other.length > 0;
  const candidates = hasAmount(fromPrimary) ? fromPrimary : hasAmount(fromRaw) ? fromRaw : fromAlt;
  const directionOnPrimary = direction(primary);
  const directionOnAlt = direction(alt);
  const directionOnRaw = direction(raw);
  if (directionOnPrimary.conflict || directionOnAlt.conflict || directionOnRaw.conflict) return null;

  // Explicit incoming/outgoing words beat a generic "transfer/withdrawal"
  // heading. Truly conflicting concrete directions are never auto-booked.
  const highPriority = [primary, alt, raw].map((t) => ({
    incoming: concreteIn.test(t),
    outgoing: concreteOut.test(t),
  }));
  if (highPriority.some((d) => d.incoming) && highPriority.some((d) => d.outgoing)) return null;

  const identifiedKind = highPriority.some((d) => d.incoming)
    ? 'income'
    : highPriority.some((d) => d.outgoing)
      ? 'expense'
      : directionOnPrimary.kind || directionOnAlt.kind || directionOnRaw.kind;

  // KBank Live sometimes omits the debit symbol and card title from the
  // text delivered to LINEJS. Per MoneyFlow's configured behaviour,
  // incoming alerts retain priority; a complete but undirected KBank
  // transaction is treated as expense, never a missing/uncertain amount.
  const bankTransactionContext =
    txnLabel.test(primary) ||
    /(?:จากบัญชี|เข้าบัญชี|บัญชีต้นทาง|บัญชีปลายทาง|รายการโอน|รายการถอน)/i.test(primary) ||
    genericWithdrawal.test(alt) ||
    genericWithdrawal.test(raw);
  const usedDefaultExpense = !identifiedKind && bank === 'kbank' && bankTransactionContext;
  const kind = identifiedKind || (usedDefaultExpense ? 'expense' : null);
  if (!kind) return null;

  const picked = candidates.labelled.length ? candidates.labelled : candidates.other;
  if (picked.length !== 1) return null;
  const amountSatang = picked[0];

  // When ALT/raw provides a transaction amount too, it must agree with Flex.
  for (const aux of [alt, raw]) {
    if (!aux || aux === primary) continue;
    const a = amountCandidates(aux);
    const labelled = a.labelled.length ? a.labelled : a.other;
    if (labelled.length && (labelled.length !== 1 || labelled[0] !== amountSatang)) return null;
  }

  // Ignore generic bank statements without a recognisable transaction cue.
  if (
    !txnLabel.test(primary) &&
    !concreteIn.test([primary, alt, raw].join('\n')) &&
    !concreteOut.test([primary, alt, raw].join('\n')) &&
    !genericWithdrawal.test([primary, alt, raw].join('\n')) &&
    !usedDefaultExpense
  )
    return null;

  const bankName = bank === 'kbank' ? 'KBank Live' : bank === 'scb' ? 'SCB Connect' : 'ธนาคาร';
  return {
    kind,
    amountSatang,
    merchant:
      (kind === 'income' ? 'เงินเข้าผ่าน ' : 'เงินออกผ่าน ') +
      bankName +
      (usedDefaultExpense ? ' (ตั้งต้นเป็นเงินออก)' : ''),
    bank: bankName,
    needsReview: false,
    transferAutoCandidate: false,
    reason: usedDefaultExpense
      ? 'ไม่พบข้อมูลยืนยันเงินเข้า จัดเป็นเงินออกตามกฎ MoneyFlow'
      : ownTransfer.test([primary, alt, raw].join('\n'))
        ? 'โอนระหว่างบัญชีตัวเอง'
        : null,
  };
}
