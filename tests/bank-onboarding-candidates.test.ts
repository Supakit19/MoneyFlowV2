import { describe, expect, test } from 'bun:test';
import { bankChatCandidates } from '../src/components/bankChatCandidates';

const a = 'u' + 'a'.repeat(32);
const b = 'u' + 'b'.repeat(32);
const c = 'u' + 'c'.repeat(32);

describe('Bank chat discovery is consistent during first-time setup', () => {
  test('the first-time wizard displays all three hosted connector candidates', () => {
    expect(
      bankChatCandidates({
        candidateMid: c,
        candidateMids: [a, b, c],
      }),
    ).toEqual([a, b, c]);
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
