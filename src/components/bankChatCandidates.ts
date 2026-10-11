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

export type BankChatIdentity = {
  name: string;
  status: 'user-reported' | 'tentative' | 'unknown';
  note: string;
  /** Suggests the appropriate bank in the first-time wizard, never confirms it. */
  bank: 'kbank' | 'ktb' | null;
  /** LINE BK is not currently supported by the KBank/KTb parser. */
  selectable: boolean;
};

/**
 * UI hints for *exact* sender IDs reported during MoneyFlow testing.
 * These are NOT LINE-verified identities and must not bypass user review.
 * This temporary table should eventually be replaced with per-user labels.
 * Never match on a short prefix: many LINE accounts begin with "uc".
 */
const userReportedChats: Record<string, BankChatIdentity> = {
  uce372f6ada1d1a0855973fefc2942f9a: {
    name: 'Krungthai Connext · กรุงไทย',
    status: 'user-reported',
    note: 'ชื่อจากข้อมูลที่ผู้ใช้แจ้ง กรุณาตรวจชื่อใน LINE อีกครั้ง',
    bank: 'ktb',
    selectable: true,
  },
  uc68dc67c3ff75088b7ca7d6006f7df6d: {
    name: 'KBank Live · กสิกรไทย',
    status: 'user-reported',
    note: 'ชื่อจากข้อมูลที่ผู้ใช้แจ้ง กรุณาตรวจชื่อใน LINE อีกครั้ง',
    bank: 'kbank',
    selectable: true,
  },
  u8cc52e369d2bca4a5ce8c506170c712e: {
    name: 'อาจเป็น LINE BK',
    status: 'tentative',
    note: 'ยังไม่ยืนยันว่าเป็น LINE BK และยังไม่มีตัวอ่านแจ้งเตือน LINE BK โดยเฉพาะ',
    bank: null,
    selectable: false,
  },
};

const unknownChat: BankChatIdentity = {
  name: 'ยังไม่ทราบชื่อแชต',
  status: 'unknown',
  note: 'ตรวจชื่อและเครื่องหมายรับรองของธนาคารใน LINE ก่อนเลือก',
  bank: null,
  selectable: true,
};

export function bankChatIdentity(mid: string): BankChatIdentity {
  return userReportedChats[mid.toLowerCase()] ?? unknownChat;
}

export function abbreviatedBankChatId(mid: string): string {
  return mid.length > 15 ? `${mid.slice(0, 7)}…${mid.slice(-5)}` : mid;
}
