/**
 * Candidate bank chat sender IDs from the same connector status used by
 * both onboarding and the bank settings page. A hosted connector returns
 * candidateMids[], while older/local workers may return candidateMid.
 * These are only candidate sender IDs; the user must verify the bank in LINE.
 */
export function bankChatCandidates(
  agent: { candidateMids?: unknown; candidateMid?: unknown } | null | undefined,
): string[] {
  if (!agent) return [];
  const mids = [...(Array.isArray(agent.candidateMids) ? agent.candidateMids : []), agent.candidateMid];
  return [
    ...new Set(
      mids
        .filter((mid): mid is string => typeof mid === 'string' && /^u[0-9a-f]{32}$/i.test(mid))
        .map((mid) => mid.toLowerCase()),
    ),
  ];
}
