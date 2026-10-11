import { describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BankChatIdentityLabel from '../src/components/BankChatIdentityLabel';
import {
  abbreviatedBankChatId,
  bankChatCandidates,
  bankChatIdentity,
} from '../src/components/bankChatCandidates';

const a = 'u' + 'a'.repeat(32);
const b = 'u' + 'b'.repeat(32);
const c = 'u' + 'c'.repeat(32);
const krungthaiMid = 'uce372f6ada1d1a0855973fefc2942f9a';
const kbankMid = 'uc68dc67c3ff75088b7ca7d6006f7df6d';
const possibleLineBkMid = 'u8cc52e369d2bca4a5ce8c506170c712e';

describe('Bank chat discovery is consistent during first-time setup', () => {
  test('the first-time wizard displays all three hosted connector candidates', () => {
    expect(bankChatCandidates({ candidateMid: c, candidateMids: [a, b, c] })).toEqual([a, b, c]);
  });

  test('older LINE workers with only one candidate still work', () => {
    expect(bankChatCandidates({ candidateMid: a })).toEqual([a]);
    expect(bankChatCandidates({ candidateMids: [b], candidateMid: '' })).toEqual([b]);
  });

  test('deduplicates and canonicalizes IDs without inventing bank names', () => {
    expect(bankChatCandidates({ candidateMids: [a.toUpperCase(), a, c], candidateMid: b })).toEqual([
      a,
      c,
      b,
    ]);
  });

  test('ignores untrusted malformed IDs and handles empty connector state', () => {
    expect(bankChatCandidates(null)).toEqual([]);
    expect(bankChatCandidates({})).toEqual([]);
    expect(
      bankChatCandidates({
        candidateMid: '<script>alert(1)</script>',
        candidateMids: ['Hello', 'u' + 'g'.repeat(32), null, 200, b],
      }),
    ).toEqual([b]);
  });

  test('both first-time onboarding and main bank page use the same candidate normalization', async () => {
    const welcome = await Bun.file(
      new URL('../src/components/BankOnboardingSetup.tsx', import.meta.url),
    ).text();
    const main = await Bun.file(
      new URL('../src/components/LineJsHostedAgent.tsx', import.meta.url),
    ).text();
    expect(welcome).toContain('bankChatCandidates(agent)');
    expect(main).toContain('bankChatCandidates(a)');
    expect(welcome).toContain('chatCandidates.map((mid)');
    expect(main).toContain('chatCandidates.map((mid)');
    expect(welcome).toContain('setSenderMid(mid)');
    expect(welcome).toContain('setHasVerifiedSender(false)');
    expect(welcome).toContain('setSaved(false)');
  });
});

describe('Readable bank chat names only match exact, user-reported sender IDs', () => {
  test('associates the two specifically identified senders with their bank', () => {
    expect(krungthaiMid).toHaveLength(33);
    expect(kbankMid).toHaveLength(33);
    expect(bankChatIdentity(krungthaiMid)).toMatchObject({
      name: 'Krungthai Connext · กรุงไทย',
      status: 'user-reported',
      bank: 'ktb',
      selectable: true,
    });
    expect(bankChatIdentity(kbankMid)).toMatchObject({
      name: 'KBank Live · กสิกรไทย',
      status: 'user-reported',
      bank: 'kbank',
      selectable: true,
    });
  });

  test('LINE BK stays explicitly tentative and cannot be bound as KBank Live', () => {
    expect(possibleLineBkMid).toHaveLength(33);
    expect(bankChatIdentity(possibleLineBkMid)).toMatchObject({
      name: 'อาจเป็น LINE BK',
      status: 'tentative',
      bank: null,
      selectable: false,
    });
  });

  test('never infers bank identity from shared "uc" prefixes or unrelated MID', () => {
    expect(bankChatIdentity('uc' + 'a'.repeat(31))).toMatchObject({
      name: 'ยังไม่ทราบชื่อแชต',
      status: 'unknown',
      bank: null,
      selectable: true,
    });
    expect(bankChatIdentity('uce372f6ada1d1a0855973fefc2942f9b').bank).toBeNull();
    expect(bankChatIdentity('u8cc52e369d2bca4a5ce8c506170c712f').bank).toBeNull();
    expect(bankChatIdentity(krungthaiMid.toUpperCase()).bank).toBe('ktb');
  });

  test('shows the human-readable name first, and labels unverified identity truthfully', () => {
    const markup = renderToStaticMarkup(<BankChatIdentityLabel mid={krungthaiMid} />);
    expect(markup).toContain('Krungthai Connext');
    expect(markup).toContain('ผู้ใช้ระบุชื่อ');
    expect(markup).toContain('ดูรหัสเต็ม');
    expect(markup).toContain(krungthaiMid);
    expect(markup.indexOf('Krungthai Connext')).toBeLessThan(markup.indexOf(krungthaiMid));

    const uncertainMarkup = renderToStaticMarkup(<BankChatIdentityLabel mid={possibleLineBkMid} />);
    expect(uncertainMarkup).toContain('อาจเป็น LINE BK');
    expect(uncertainMarkup).toContain('ยังไม่ยืนยัน');
    expect(uncertainMarkup).toContain('ยังไม่มีตัวอ่านแจ้งเตือน LINE BK');
    expect(abbreviatedBankChatId(krungthaiMid)).not.toBe(krungthaiMid);
  });

  test('selection suggests the right bank but always resets manual confirmation', async () => {
    const onboarding = await Bun.file(
      new URL('../src/components/BankOnboardingSetup.tsx', import.meta.url),
    ).text();
    const hosted = await Bun.file(
      new URL('../src/components/LineJsHostedAgent.tsx', import.meta.url),
    ).text();
    expect(onboarding).toContain('if (identity.bank) setChosenBank(identity.bank)');
    expect(onboarding).toContain('setHasVerifiedSender(false)');
    expect(onboarding).toContain('setRiskAccepted(false)');
    expect(onboarding).toContain('disabled={busy || !identity.selectable}');
    expect(hosted).toContain('disabled={!bankChatIdentity(mid).selectable}');
    expect(hosted).toContain('<BankChatIdentityLabel mid={mid} />');
  });
});
