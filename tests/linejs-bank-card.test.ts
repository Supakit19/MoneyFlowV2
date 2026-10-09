import { describe, expect, test } from 'bun:test';
import {
  extractLineBankContent,
  isPotentialBankNotification,
  isActionableBankAlert,
} from '../integrations/linejs/bank-message-content.ts';
import { parseBankNotification } from '../server/bank-notification-parser.ts';

const bankFlex = {
  type: 'bubble',
  header: {
    type: 'box',
    layout: 'vertical',
    contents: [{ type: 'text', text: 'รายการโอน/ถอน', weight: 'bold' }],
  },
  body: {
    type: 'box',
    layout: 'vertical',
    contents: [
      { type: 'text', text: 'จากบัญชี' },
      { type: 'text', text: 'xxx-x-x9097-x' },
      { type: 'text', text: 'จำนวนเงิน 85.00 บาท' },
      { type: 'text', text: 'ยอดคงเหลือ 2,500.00 บาท' },
      {
        type: 'button',
        action: { type: 'uri', label: 'เปิด K PLUS', uri: 'https://bank.invalid/private' },
      },
    ],
  },
};

describe('LINE KBank Live Flex alerts', () => {
  test('forward signless amount+account Flex to the default-expense server parser', () => {
    const raw = 'แจ้งเตือนธนาคาร\n50.00 บาท\n9 ต.ค. 69\nจากบัญชี\nxxx-x-x9097-x';
    expect(isActionableBankAlert(raw)).toBe(true);
    expect(isActionableBankAlert('จากบัญชี\nxxx-x-x9097-x')).toBe(false);
    expect(isActionableBankAlert('ยอดคงเหลือ\n898.05 บาท')).toBe(false);
  });
  test('LINEJS forwards a signed amount even when Flex inserts an unrelated text node', () => {
    const text = 'รายการโอน/ถอน\nจำนวนเงิน\nรายละเอียดเพิ่มเติม\n-30.00 บาท';
    expect(isActionableBankAlert(text)).toBe(true);
    expect(isActionableBankAlert('ยอดคงเหลือ\n-100.00 บาท')).toBe(false);
  });
  test('actual-style KBank card with a missing Flex header is still classified as outgoing', () => {
    const card = {
      type: 'bubble',
      body: {
        type: 'box',
        contents: [
          { type: 'text', text: 'จากบัญชี' },
          { type: 'text', text: 'xxx-x-x9097-x' },
          { type: 'text', text: 'จำนวนเงิน' },
          { type: 'text', text: '-30.00 บาท' },
        ],
      },
    };
    const extracted = extractLineBankContent({
      contentType: 'FLEX',
      contentMetadata: { FLEX_JSON: JSON.stringify(card) },
    });
    expect(extracted.sourceFormat).toBe('flex_nodes');
    const parsed = parseBankNotification(extracted.text, 'kbank');
    expect(parsed?.kind).toBe('expense');
    expect(parsed?.amountSatang).toBe(3000);
  });
  test('does not mix contradictory ALT_TEXT into a full outgoing Flex card', () => {
    const card = {
      type: 'bubble',
      body: {
        type: 'box',
        contents: [
          { type: 'text', text: 'รายการโอน/ถอน' },
          { type: 'text', text: 'จำนวนเงิน' },
          { type: 'text', text: '25.00' },
        ],
      },
    };
    const result = extractLineBankContent({
      contentType: 'FLEX',
      contentMetadata: {
        ALT_TEXT: 'เงินเข้า 25.00 บาท',
        FLEX_JSON: JSON.stringify(card),
      },
    });
    expect(result.sourceFormat).toBe('flex_nodes');
    expect(result.text).not.toContain('เงินเข้า');
    expect(parseBankNotification(result.text, 'kbank')?.kind).toBe('expense');
  });
  test('a card with text only in ALT_TEXT is a fallback, not a trusted auto-save source', () => {
    const result = extractLineBankContent({
      contentType: 'FLEX',
      contentMetadata: {
        ALT_TEXT: 'เงินเข้า 25.00 บาท',
        FLEX_JSON: { type: 'bubble', hero: { type: 'image', url: 'https://bank.invalid/private' } },
      },
    });
    expect(result.sourceFormat).toBe('flex_fallback');
    expect(result.hasImageNodes).toBe(true);
    expect(result.text).not.toContain('bank.invalid');
  });
  test('plain text records its source for conservative auto-save checks', () => {
    const result = extractLineBankContent({ contentType: 'NONE', text: 'เงินออก 15.00 บาท' });
    expect(result.sourceFormat).toBe('text');
    expect(result.hasReadableText).toBe(true);
  });
  test('parses outgoing card with separate amount and balance text nodes', () => {
    const card = {
      type: 'bubble',
      body: {
        type: 'box',
        contents: [
          { type: 'text', text: 'รายการโอน/ถอน' },
          { type: 'text', text: 'จากบัญชี' },
          { type: 'text', text: 'xxx-x-x9097-x' },
          { type: 'text', text: 'จำนวนเงิน' },
          { type: 'text', text: '25.50' },
          { type: 'text', text: 'ยอดคงเหลือ' },
          { type: 'text', text: '1,200.50' },
        ],
      },
    };
    const text = extractLineBankContent({
      contentType: 'FLEX',
      contentMetadata: { FLEX_JSON: JSON.stringify(card) },
    }).text;
    const result = parseBankNotification(text, 'kbank');
    expect(result?.kind).toBe('expense');
    expect(result?.amountSatang).toBe(2550);
    expect(result?.needsReview).toBe(true);
    expect(result?.transferAutoCandidate).toBe(true);
    expect(text).not.toContain('https:');
  });
  test('sends only transaction-like alerts, not OTP or generic bank promotions', () => {
    expect(isActionableBankAlert('รายการโอน/ถอน จำนวนเงิน -10.00 บาท')).toBe(true);
    expect(isActionableBankAlert('จำนวนเงิน\n+10.00 บาท')).toBe(true);
    expect(isActionableBankAlert('รายการโอน/ถอน จำนวนเงิน 10.00 บาท')).toBe(true);
    expect(isActionableBankAlert('เงินเข้า 15.00 บาท')).toBe(true);
    expect(isActionableBankAlert('KBank Live โปรโมชั่นพิเศษเดือนนี้')).toBe(false);
    expect(isActionableBankAlert('KBank Live รหัส OTP สำหรับยืนยันตัวตน 123456')).toBe(false);
  });
  test('finds the transaction title and amount in JSON-encoded Flex cards', () => {
    const result = extractLineBankContent({
      text: '',
      contentType: 'FLEX',
      contentMetadata: { ALT_TEXT: 'แจ้งเตือนธุรกรรม', FLEX_JSON: JSON.stringify(bankFlex) },
    });
    expect(result.flex).toBe(true);
    expect(result.hasReadableText).toBe(true);
    expect(result.text).toContain('รายการโอน/ถอน');
    expect(result.text).toContain('85.00 บาท');
    expect(result.text).not.toContain('bank.invalid');
    expect(isPotentialBankNotification(result.text)).toBe(true);
    const parsed = parseBankNotification(result.text, 'kbank');
    expect(parsed?.amountSatang).toBe(8500);
    expect(parsed?.kind).toBe('expense');
    expect(parsed?.needsReview).toBe(true);
  });

  test('extracts supported Flex as an object even without ALT_TEXT', () => {
    const result = extractLineBankContent({
      contentType: 'FLEX',
      contentMetadata: { FLEX_JSON: bankFlex },
    });
    expect(result.hasReadableText).toBe(true);
    expect(result.text).toContain('รายการโอน/ถอน');
    expect(isPotentialBankNotification(result.text)).toBe(true);
  });

  test('does not infer amount from a masked account or date', () => {
    const result = extractLineBankContent({
      contentType: 'FLEX',
      contentMetadata: {
        FLEX_JSON: {
          type: 'bubble',
          body: {
            type: 'box',
            contents: [
              { type: 'text', text: 'รายการโอน/ถอน' },
              { type: 'text', text: 'xxx-x-x9097-x' },
            ],
          },
        },
      },
    });
    expect(isPotentialBankNotification(result.text)).toBe(true);
    expect(parseBankNotification(result.text, 'kbank')).toBeNull();
  });

  test('ignores HTML, image URL and action payloads', () => {
    const card = {
      type: 'bubble',
      body: {
        type: 'box',
        contents: [
          {
            type: 'text',
            text: 'เงินเข้า ฿65',
            action: { type: 'postback', data: 'secret=leak' },
          },
        ],
      },
      hero: { type: 'image', url: 'https://private.invalid' },
    };
    const result = extractLineBankContent({ contentType: 'FLEX', contentMetadata: { FLEX_JSON: card } });
    expect(result.text).toBe('เงินเข้า ฿65');
    expect(result.text).not.toContain('leak');
    expect(result.text).not.toContain('private.invalid');
  });

  test('supports LINEJS normal text notifications without regression', () => {
    const parsed = extractLineBankContent({
      contentType: 'NONE',
      text: 'เงินออก 45.00 บาท',
    });
    expect(parsed.flex).toBe(false);
    expect(parsed.text).toBe('เงินออก 45.00 บาท');
    expect(isPotentialBankNotification(parsed.text)).toBe(true);
    expect(parseBankNotification(parsed.text, 'kbank')?.amountSatang).toBe(4500);
  });

  test('rejects malformed and huge cards safely', () => {
    expect(
      extractLineBankContent({
        contentType: 'FLEX',
        contentMetadata: { FLEX_JSON: '{broken' },
      }).hasReadableText,
    ).toBe(false);
    expect(
      extractLineBankContent({
        contentType: 'FLEX',
        contentMetadata: { FLEX_JSON: 'x'.repeat(100_001) },
      }).hasReadableText,
    ).toBe(false);
  });
});
