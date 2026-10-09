import { describe, expect, test } from 'bun:test';
import {
  parseBankNotification,
  analyzeBankNotification,
  parseSignedBankNotification,
} from '../server/bank-notification-parser.ts';

describe('MoneyFlow bank notifications are conservative and deterministic', () => {
  test('signed KBank amount survives interleaved Flex text nodes without trusting balance', () => {
    const message =
      'รายการโอน/ถอน\nจากบัญชี\nxxx-x-x9097-x\nจำนวนเงิน\nธนาคารกสิกรไทย\n-30.00 บาท\nยอดคงเหลือ\n+1,200.00 บาท';
    const parsed = parseSignedBankNotification(message, 'kbank');
    expect(parsed?.kind).toBe('expense');
    expect(parsed?.amountSatang).toBe(3000);
  });
  test('unsigned transaction plus signed balance must not create a financial entry', () => {
    const message = 'รายการโอน/ถอน\nจำนวนเงิน 25.00 บาท\nยอดคงเหลือ\n-1,200.00 บาท';
    expect(parseSignedBankNotification(message, 'kbank')).toBeNull();
  });
  test('balance-only negative amount is not a transaction', () => {
    expect(parseSignedBankNotification('ยอดคงเหลือ\n-30.00 บาท', 'kbank')).toBeNull();
  });
  test('negative signed amount means money out even if Flex header is missing', () => {
    const message = 'จากบัญชี\nxxx-x-x9097-x\nจำนวนเงิน\n-30.00 บาท';
    expect(analyzeBankNotification(message)).toEqual({
      kind: 'expense',
      amountSatang: 3000,
      issue: 'ok',
    });
    const parsed = parseBankNotification(message, 'kbank');
    expect(parsed?.kind).toBe('expense');
    expect(parsed?.amountSatang).toBe(3000);
    expect(parsed?.needsReview).toBe(true);
  });
  test('positive signed amount means money in when there is no direction title', () => {
    const parsed = parseBankNotification('เข้าบัญชี\nจำนวนเงิน\n+30.00 บาท', 'kbank');
    expect(parsed?.kind).toBe('income');
    expect(parsed?.amountSatang).toBe(3000);
  });
  test('a negative balance cannot be mistaken for money out', () => {
    const data = analyzeBankNotification('ยอดคงเหลือ\n-300.00 บาท');
    expect(data.kind).toBeNull();
    expect(data.amountSatang).toBeNull();
  });
  test('explicit income and signed debit conflict requires review', () => {
    const data = analyzeBankNotification('เงินเข้า\nจำนวนเงิน\n-30.00 บาท');
    expect(data.kind).toBeNull();
    expect(data.issue).toBe('direction_conflict');
  });
  test('unsigned unlabeled direction is still ambiguous', () => {
    expect(analyzeBankNotification('จำนวนเงิน\n30.00 บาท').issue).toBe('no_direction');
  });
  test('Unicode minus is recognized as a debit', () => {
    expect(analyzeBankNotification('จำนวนเงิน −30.00 บาท').kind).toBe('expense');
  });
  test('classifies outgoing direction but does not invent a missing transaction amount', () => {
    const result = analyzeBankNotification('รายการโอน/ถอน\nจากบัญชี\nxxx-x-x9097-x');
    expect(result.kind).toBe('expense');
    expect(result.issue).toBe('no_amount');
    expect(result.amountSatang).toBeNull();
  });
  test('detects conflicting direction labels and blocks auto-save', () => {
    const result = analyzeBankNotification('โอนออก 25.00 บาท\nเงินเข้า 25.00 บาท');
    expect(result.kind).toBeNull();
    expect(result.issue).toBe('direction_conflict');
    expect(parseBankNotification('โอนออก 25.00 บาท\nเงินเข้า 25.00 บาท', 'kbank')).toBeNull();
  });
  test('incoming transfers are labeled for review rather than described as outgoing', () => {
    const parsed = parseBankNotification('รับโอนเงินเข้า 25.00 บาท', 'kbank');
    expect(parsed?.kind).toBe('income');
    expect(parsed?.needsReview).toBe(true);
    expect(parsed?.transferAutoCandidate).toBe(false);
    expect(parsed?.reason).toContain('รับโอน');
  });
  test('reads KBank Live transfer/withdraw Flex amount across text nodes without a currency suffix', () => {
    const parsed = parseBankNotification(
      'รายการโอน/ถอน\nจากบัญชี\nxxx-x-x9097-x\nจำนวนเงิน\n25.50\nยอดคงเหลือ\n1,200.50',
      'kbank',
    );
    expect(parsed?.kind).toBe('expense');
    expect(parsed?.amountSatang).toBe(2550);
    expect(parsed?.needsReview).toBe(true);
    expect(parsed?.transferAutoCandidate).toBe(true);
  });
  test('ignores a next-line balance even when it has a baht suffix', () => {
    const parsed = parseBankNotification(
      'รายการโอน/ถอน\nจากบัญชี\nxxx-x-x9097-x\nจำนวนเงิน\n85.00 บาท\nยอดคงเหลือ\n1,234.56 บาท',
      'kbank',
    );
    expect(parsed?.kind).toBe('expense');
    expect(parsed?.amountSatang).toBe(8500);
  });
  test('never guesses an amount from a masked account or balance alone', () => {
    expect(
      parseBankNotification('รายการโอน/ถอน\nจากบัญชี\nxxx-x-x9097-x\nยอดคงเหลือ\n1,234.56 บาท', 'kbank'),
    ).toBeNull();
  });
  test('marks own-account transfers as ineligible even when extra opt-in is active', () => {
    const parsed = parseBankNotification('โอนออกเข้าบัญชีตัวเอง\nจำนวนเงิน\n90.00', 'kbank');
    expect(parsed?.amountSatang).toBe(9000);
    expect(parsed?.transferAutoCandidate).toBe(false);
  });
  test('refuses conflicting clearly labeled amounts in a transfer card', () => {
    expect(parseBankNotification('รายการโอน/ถอน\nจำนวนเงิน\n100.00\nยอดโอน\n50.00', 'kbank')).toBeNull();
  });
  test('KBank expense with another bank balance only saves the expense amount', () => {
    const got = parseBankNotification(
      'แจ้งเตือน KBank Live\nเงินออก 85.00 บาท\nยอดคงเหลือ 1,234.56 บาท',
      'kbank',
    );
    expect(got?.amountSatang).toBe(8500);
    expect(got?.kind).toBe('expense');
    expect(got?.needsReview).toBe(false);
    expect(got?.merchant).toBe('จ่ายผ่าน KBank Live');
  });
  test('SCB incoming transfer requires user review and excludes the account balance', () => {
    const got = parseBankNotification(
      'SCB Connect รับโอนเงิน 2,500.00 บาท\nยอดคงเหลือ 22,500.00 บาท',
      'scb',
    );
    expect(got?.amountSatang).toBe(250000);
    expect(got?.kind).toBe('income');
    expect(got?.needsReview).toBe(true);
  });
  test('QR payment with clear amount has precise integer satang', () => {
    const got = parseBankNotification('ชำระเงินผ่าน K PLUS ฿49.75', 'kbank');
    expect(got?.amountSatang).toBe(4975);
    expect(got?.kind).toBe('expense');
  });
  test('refuses ambiguous transfer directions', () => {
    expect(parseBankNotification('เงินเข้า 100 บาท และเงินออก 100 บาท', 'kbank')).toBeNull();
  });
  test('refuses multiple transaction amounts rather than selecting an arbitrary one', () => {
    expect(parseBankNotification('จ่าย 100 บาท และชำระอีก 50 บาท', 'kbank')).toBeNull();
  });
  test('refuses a message with only an account balance', () => {
    expect(parseBankNotification('ยอดคงเหลือ 5,000.00 บาท', 'kbank')).toBeNull();
  });
  test('refuses failed transfers and OTC promotions', () => {
    expect(parseBankNotification('เงินออก 500 บาท แต่ทำรายการไม่สำเร็จ', 'kbank')).toBeNull();
    expect(parseBankNotification('โปรโมชั่นกสิกร ลดราคา 50 บาท', 'kbank')).toBeNull();
  });
  test('refuses unsupported and oversized or zero values', () => {
    expect(parseBankNotification('จ่ายเงิน 0.00 บาท', 'kbank')).toBeNull();
    expect(parseBankNotification('จ่ายเงิน 99999999.00 บาท', 'kbank')).toBeNull();
    expect(parseBankNotification('จ่ายเงิน 50 บาท'.repeat(500), 'kbank')).toBeNull();
  });
  test('does not store the original message or bank account identifiers in parsed result', () => {
    const raw = 'เงินออก 45 บาท จากเลขบัญชี 123-4-56789-0';
    const got = parseBankNotification(raw, 'kbank');
    expect(got).toBeTruthy();
    expect(JSON.stringify(got)).not.toContain('123-4-56789-0');
  });
  test('marks transfers between own accounts as review-only', () => {
    const got = parseBankNotification('โอนออก 200 บาท ไปบัญชีตัวเอง', 'kbank');
    expect(got?.needsReview).toBe(true);
  });
});
