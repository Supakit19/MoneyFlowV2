import { describe, expect, test } from 'bun:test';
import { parseBankAlertFromSources } from '../server/bank-source-parser.ts';

describe('KBank alert source recovery', () => {
  test('restores unsigned Flex amount combined with explicit incoming ALT_TEXT', () => {
    const parsed = parseBankAlertFromSources(
      {
        text: 'แจ้งเตือนธนาคาร\n25.00 บาท\n9 ต.ค. 69\nจากบัญชี\nxxx-x-x9097-x\nข้อมูลรายการ',
        altText: 'ธนาคารกสิกรแจ้งเตือนเงินเข้า',
      },
      'kbank',
    );
    expect(parsed?.kind).toBe('income');
    expect(parsed?.amountSatang).toBe(2500);
  });
  test('expense is parsed from a KBank transfer withdrawal card even without signed digits', () => {
    const parsed = parseBankAlertFromSources(
      {
        text: 'รายการโอน/ถอน\nจากบัญชี\nxxx-x-x9097-x\nจำนวนเงิน\n30.00 บาท',
        altText: 'รายการโอน/ถอน KBank Live',
      },
      'kbank',
    );
    expect(parsed?.kind).toBe('expense');
    expect(parsed?.amountSatang).toBe(3000);
  });
  test('actual negative amount outranks incorrect generic incoming caption', () => {
    const parsed = parseBankAlertFromSources(
      {
        text: 'รายการโอน/ถอน\nจำนวนเงิน\n-30.00 บาท',
        altText: 'เงินเข้า KBank Live',
      },
      'kbank',
    );
    expect(parsed?.kind).toBe('expense');
    expect(parsed?.amountSatang).toBe(3000);
  });
  test('actual positive amount overrides incorrect outgoing caption', () => {
    const parsed = parseBankAlertFromSources(
      {
        text: 'จำนวนเงิน +30.00 บาท',
        altText: 'รายการโอน/ถอน',
      },
      'kbank',
    );
    expect(parsed?.kind).toBe('income');
  });
  test('specific incoming direction outranks generic transfer/withdrawal title', () => {
    const parsed = parseBankAlertFromSources(
      {
        text: 'รายการโอน/ถอน\n25.00 บาท\nจากบัญชี xxx-x-x9097-x',
        altText: 'เงินเข้า KBank Live',
      },
      'kbank',
    );
    expect(parsed?.kind).toBe('income');
  });
  test('conflicting explicit incoming/outgoing sources are never auto-booked', () => {
    expect(
      parseBankAlertFromSources(
        {
          text: 'โอนออก\nจำนวนเงิน\n30.00 บาท',
          altText: 'แจ้งเตือนเงินเข้า',
        },
        'kbank',
      ),
    ).toBeNull();
  });
  test('unknown KBank card defaults to expense when it has exactly one transaction amount', () => {
    const parsed = parseBankAlertFromSources(
      {
        text: 'แจ้งเตือนธนาคาร\n50.00 บาท\n9 ต.ค. 69\nจากบัญชี\nxxx-x-x9097-x',
        altText: 'แจ้งเตือนธนาคาร',
      },
      'kbank',
    );
    expect(parsed?.kind).toBe('expense');
    expect(parsed?.amountSatang).toBe(5000);
    expect(parsed?.merchant).toContain('ตั้งต้นเป็นเงินออก');
  });
  test('unknown amount label also defaults to outgoing expense', () => {
    const parsed = parseBankAlertFromSources(
      { text: 'จำนวนเงิน\n30.00 บาท', altText: 'แจ้งเตือนจาก KBank Live' },
      'kbank',
    );
    expect(parsed?.kind).toBe('expense');
    expect(parsed?.amountSatang).toBe(3000);
  });
  test('unlabelled +20.00 with a source account is still income, not default expense', () => {
    const parsed = parseBankAlertFromSources(
      { text: 'แจ้งเตือนธนาคาร\nจากบัญชี\nxxx-x-x9097-x\n+20.00 บาท' },
      'kbank',
    );
    expect(parsed?.kind).toBe('income');
    expect(parsed?.amountSatang).toBe(2000);
  });
  test('unlabelled -50.00 is expense and ignores signed balances', () => {
    const parsed = parseBankAlertFromSources(
      { text: 'จากบัญชี\nxxx-x-x9097-x\n-50.00 บาท\nยอดคงเหลือ\n+898.00 บาท' },
      'kbank',
    );
    expect(parsed?.kind).toBe('expense');
    expect(parsed?.amountSatang).toBe(5000);
  });
  test('a + symbol only in the balance never invents an income', () => {
    expect(
      parseBankAlertFromSources({ text: 'จากบัญชี\nxxx-x-x9097-x\nยอดคงเหลือ\n+898.00 บาท' }, 'kbank'),
    ).toBeNull();
  });
  test('contradictory signed amounts cannot fall through to default expense', () => {
    expect(
      parseBankAlertFromSources({ text: 'จำนวนเงิน\n+20.00 บาท\n-50.00 บาท\nจากบัญชี' }, 'kbank'),
    ).toBeNull();
  });
  test('incoming description always has priority over default outgoing rule', () => {
    const parsed = parseBankAlertFromSources(
      { text: 'จากบัญชี\nxxx-x-x9097-x\n20.00 บาท', altText: 'แจ้งเตือนเงินเข้า' },
      'kbank',
    );
    expect(parsed?.kind).toBe('income');
    expect(parsed?.amountSatang).toBe(2000);
    expect(parsed?.merchant).not.toContain('ตั้งต้นเป็นเงินออก');
  });
  test('a unique balance amount alone cannot be imported', () => {
    expect(
      parseBankAlertFromSources(
        {
          text: 'ยอดคงเหลือ\n500.00 บาท',
          altText: 'เงินเข้า KBank Live',
        },
        'kbank',
      ),
    ).toBeNull();
  });
  test('multiple unlabelled amounts are ambiguous and skipped', () => {
    expect(
      parseBankAlertFromSources(
        {
          text: 'รายการโอน/ถอน\n25.00 บาท\n500.00 บาท',
          altText: 'เงินออก KBank Live',
        },
        'kbank',
      ),
    ).toBeNull();
  });
  test('a labelled amount beats an explicitly labelled balance', () => {
    const parsed = parseBankAlertFromSources(
      {
        text: 'จำนวนเงิน\n-30.00 บาท\nยอดคงเหลือ\n500.00 บาท',
        altText: 'แจ้งเตือนธนาคาร',
      },
      'kbank',
    );
    expect(parsed?.kind).toBe('expense');
    expect(parsed?.amountSatang).toBe(3000);
  });
  test('reference account suffix and dates are not treated as transaction amounts', () => {
    expect(
      parseBankAlertFromSources(
        {
          text: 'แจ้งเตือนรับเงิน\nจากบัญชี xxx-x-x9097-x\n9.10.2026',
          altText: 'รับโอนเงินเข้า',
        },
        'kbank',
      ),
    ).toBeNull();
  });
  test('security and failed payment alerts are ignored', () => {
    expect(
      parseBankAlertFromSources(
        {
          text: 'เงินเข้า 35.00 บาท รหัส OTP 123456',
          altText: 'แจ้งเตือนธนาคาร',
        },
        'kbank',
      ),
    ).toBeNull();
    expect(
      parseBankAlertFromSources(
        {
          text: 'จำนวนเงิน -20.00 บาท\nรายการถูกยกเลิก',
        },
        'kbank',
      ),
    ).toBeNull();
  });
  test('ALT_TEXT-only full transaction with a signed amount can be used conservatively', () => {
    const parsed = parseBankAlertFromSources(
      {
        text: '',
        altText: 'เงินเข้า จำนวนเงิน +30.00 บาท',
      },
      'kbank',
    );
    expect(parsed?.kind).toBe('income');
    expect(parsed?.amountSatang).toBe(3000);
  });
  test('ALT_TEXT alone without amount cannot invent a transaction', () => {
    expect(
      parseBankAlertFromSources(
        {
          text: '',
          altText: 'เงินเข้า KBank Live',
        },
        'kbank',
      ),
    ).toBeNull();
  });
});
