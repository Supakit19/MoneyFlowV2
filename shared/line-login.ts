/** One supported LINE sign-in command, shared by the website and LINE bot. */
export const LINE_LOGIN_PREFIX = 'Login';

/** Always copy/paste the complete message, not the one-time number alone. */
export const formatLineLoginCommand = (code: string) => `${LINE_LOGIN_PREFIX} ${code}`;

/** Retain backward compatibility with the old Thai command. */
export function parseLineLoginCommand(raw: string): string | null {
  const match = raw.trim().match(/^(?:login|เข้าสู่ระบบ)\s+([0-9]{8})$/i);
  return match?.[1] ?? null;
}

/**
 * Recognize incomplete sign-in attempts before handing them to Gemini, so the
 * LINE bot explains the required prefix rather than treating codes as expenses.
 */
export function isLineLoginAttempt(raw: string): boolean {
  const text = raw.trim();
  return /^(?:login|เข้าสู่ระบบ)(?:\s|$)/i.test(text) || /^[0-9]{8}$/.test(text);
}

/**
 * Generate a LINE URL-scheme link to the exact Official Account that handles
 * MoneyFlow sign-in. LINE pre-fills the message but never sends it without the
 * user tapping Send, which is the confirmation step for QR sign-in.
 */
export function buildLineLoginChatUrl(basicId: string | null | undefined, code: string): string | null {
  const id = (basicId || '').trim();
  if (!/^@[a-z0-9._-]{3,40}$/i.test(id) || !/^[0-9]{8}$/.test(code)) return null;
  return `https://line.me/R/oaMessage/${encodeURIComponent(id)}/?${encodeURIComponent(formatLineLoginCommand(code))}`;
}
