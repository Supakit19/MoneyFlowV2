import { describe, expect, test } from 'bun:test';
import {
  activeBankMids,
  extraBankSources,
  sourceByMid,
  validateAdditionalBankSources,
} from '../server/linejs-bank-sources.ts';
import { parseBankAlertFromSources } from '../server/bank-source-parser.ts';

const kbank = 'u' + 'a'.repeat(32);
const krungthai = 'u' + 'b'.repeat(32);
const unrelated = 'u' + 'c'.repeat(32);
const mainAccount = '00000000-0000-4000-a000-000000000001';
const ktbAccount = '00000000-0000-4000-a000-000000000002';
const config = {
  bank: 'kbank',
  sender_mid: kbank,
  account_id: mainAccount,
  extra_sources: [{ bank: 'ktb', senderMid: krungthai, accountId: ktbAccount, enabled: true }],
};

describe('Two Thai bank LINE chats in a single encrypted LINEJS session', () => {
  test('KBank Live maps only to KBank account, Connext only to Krungthai account', () => {
    expect(activeBankMids(config)).toEqual([kbank, krungthai]);
    expect(sourceByMid(config, kbank)).toMatchObject({ bank: 'kbank', accountId: mainAccount });
    expect(sourceByMid(config, krungthai)).toMatchObject({
      bank: 'ktb',
      accountId: ktbAccount,
    });
    expect(sourceByMid(config, unrelated)).toBeNull();
  });
  test('user may pause only Connext, leaving KBank active', () => {
    const paused = {
      ...config,
      extra_sources: [{ ...config.extra_sources[0], enabled: false }],
    };
    expect(activeBankMids(paused)).toEqual([kbank]);
    expect(sourceByMid(paused, krungthai)).toBeNull();
  });
  test('Krungthai messages may be the primary bank too', () => {
    const ktbOnly = { bank: 'ktb', sender_mid: krungthai, account_id: ktbAccount, extra_sources: [] };
    expect(activeBankMids(ktbOnly)).toEqual([krungthai]);
    expect(sourceByMid(ktbOnly, krungthai)?.bank).toBe('ktb');
  });
  test('validates additional banks without exposing cross-account MID duplicates', () => {
    const sources = validateAdditionalBankSources(config.extra_sources, config);
    expect(sources).toEqual(config.extra_sources);
    expect(() => validateAdditionalBankSources([{ ...sources[0], senderMid: kbank }], config)).toThrow(
      'ซ้ำ',
    );
    expect(() => validateAdditionalBankSources([{ ...sources[0], bank: 'kbank' }], config)).toThrow(
      'ซ้ำ',
    );
    expect(() =>
      validateAdditionalBankSources([{ ...sources[0], senderMid: 'invalid' }], config),
    ).toThrow();
    expect(() => validateAdditionalBankSources([sources[0], sources[0]], config)).toThrow('ซ้ำ');
  });
  test('does not trust malformed or unverified saved secondary bank descriptors', () => {
    expect(
      extraBankSources({
        extra_sources: [{ bank: 'ktb', senderMid: unrelated, accountId: 'bad', enabled: true }],
      }),
    ).toEqual([]);
  });
});

describe('Krungthai Connext strictly labelled financial notifications', () => {
  test('accepts explicit income with integer amount but ignores account balance', () => {
    const alert = parseBankAlertFromSources(
      {
        text: 'Krungthai Connext\nเงินเข้า 25,000 บาท\nยอดคงเหลือ 30,000 บาท',
      },
      'ktb',
    );
    expect(alert).toMatchObject({ kind: 'income', amountSatang: 2_500_000, bank: 'Krungthai Connext' });
  });
  test('accepts explicit expense with satang', () => {
    expect(
      parseBankAlertFromSources(
        {
          text: 'เงินออก 350.50 บาท\nวันที่ 10/10/2569',
        },
        'ktb',
      ),
    ).toMatchObject({ kind: 'expense', amountSatang: 35_050 });
  });
  test('does not infer direction from a number alone', () => {
    expect(parseBankAlertFromSources({ text: 'โอนสำเร็จ 350.00 บาท' }, 'ktb')).toBeNull();
    expect(parseBankAlertFromSources({ text: 'ยอดคงเหลือ 3,500.00 บาท' }, 'ktb')).toBeNull();
    expect(parseBankAlertFromSources({ text: 'โปรโมชั่น 500 บาท' }, 'ktb')).toBeNull();
  });
  test('rejects ambiguous/failed/multiple notifications', () => {
    expect(parseBankAlertFromSources({ text: 'เงินเข้า 100 บาท\nเงินออก 50 บาท' }, 'ktb')).toBeNull();
    expect(parseBankAlertFromSources({ text: 'เงินออก 250 บาท ทำรายการไม่สำเร็จ' }, 'ktb')).toBeNull();
    expect(parseBankAlertFromSources({ text: 'เงินออก 250 บาท\nเงินออก 80 บาท' }, 'ktb')).toBeNull();
    expect(parseBankAlertFromSources({ text: 'เงินออก 0 บาท' }, 'ktb')).toBeNull();
  });
  test('incoming primary Flex and ALT must agree if both contain amounts', () => {
    expect(
      parseBankAlertFromSources(
        {
          text: 'เงินเข้า 250 บาท',
          altText: 'เงินออก 250 บาท',
        },
        'ktb',
      ),
    ).toBeNull();
  });
  test('KBank-only fallback never classifies undirected Krungthai amounts as expenses', () => {
    expect(
      parseBankAlertFromSources(
        {
          text: 'จากบัญชี\nจำนวนเงิน\n50.00 บาท',
        },
        'ktb',
      ),
    ).toBeNull();
  });
});
