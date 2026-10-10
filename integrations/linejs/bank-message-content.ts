/**
 * Read only text nodes of bank Flex messages.
 *
 * Financial data in images or ALT_TEXT is NOT trusted for automatic booking:
 * a notification can have a generic/contradictory ALT_TEXT, or render the
 * monetary amount inside an image. Never fetch arbitrary Flex URLs.
 */
export type LineMessageLike = {
  text?: unknown;
  contentType?: unknown;
  contentMetadata?: Record<string, unknown> | null;
};
export type BankSourceFormat = 'text' | 'flex_nodes' | 'flex_partial' | 'flex_fallback' | 'unreadable';
export type LineBankContent = {
  text: string;
  type: string;
  flex: boolean;
  hasReadableText: boolean;
  sourceFormat: BankSourceFormat;
  hasImageNodes: boolean;
};

const MAX_TEXT = 3500;
const MAX_FLEX_JSON = 100_000;
const MAX_NODES = 450;
const MAX_DEPTH = 16;
const MAX_PARTS = 45;
const MAX_FRAGMENT = 350;

function cardTextFragments(raw: unknown): {
  parts: string[];
  partial: boolean;
  hasImageNodes: boolean;
} {
  const parts: string[] = [];
  let visited = 0;
  let partial = false;
  let hasImageNodes = false;

  function visit(node: unknown, depth: number) {
    if (visited >= MAX_NODES || depth > MAX_DEPTH || parts.length >= MAX_PARTS) {
      partial = true;
      return;
    }
    visited++;
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1);
      return;
    }
    const data = node as Record<string, unknown>;
    if (data.type === 'image') hasImageNodes = true;
    if (data.type === 'text' && typeof data.text === 'string') {
      const part = data.text.trim();
      if (part && part.length <= MAX_FRAGMENT) parts.push(part);
      else if (part) partial = true;
    }
    for (const [key, value] of Object.entries(data)) {
      if (
        key === 'action' ||
        key === 'url' ||
        key === 'uri' ||
        key === 'data' ||
        key === 'imageUrl' ||
        key === 'videoUrl'
      )
        continue;
      if (value && typeof value === 'object') visit(value, depth + 1);
    }
  }
  visit(raw, 0);
  return { parts, partial, hasImageNodes };
}

export function extractLineBankContent(raw: LineMessageLike): LineBankContent {
  const type = typeof raw?.contentType === 'string' ? raw.contentType.toUpperCase() : 'UNKNOWN';
  const original = typeof raw?.text === 'string' ? raw.text.trim() : '';
  const meta =
    raw?.contentMetadata && typeof raw.contentMetadata === 'object' ? raw.contentMetadata : {};
  const isFlex = type === 'FLEX' || meta.FLEX_JSON !== undefined;
  const alt = typeof meta.ALT_TEXT === 'string' ? meta.ALT_TEXT.trim().slice(0, 400) : '';
  let flex: unknown = meta.FLEX_JSON;
  let validFlex = !!flex;

  if (typeof flex === 'string') {
    if (flex.length <= MAX_FLEX_JSON) {
      try {
        flex = JSON.parse(flex);
      } catch {
        validFlex = false;
        flex = null;
      }
    } else {
      validFlex = false;
      flex = null;
    }
  }

  const scan =
    isFlex && validFlex ? cardTextFragments(flex) : { parts: [], partial: false, hasImageNodes: false };
  let text = '';
  let sourceFormat: BankSourceFormat = 'unreadable';

  if (isFlex && scan.parts.length) {
    const combined = scan.parts.join('\n');
    text = combined.slice(0, MAX_TEXT);
    sourceFormat = scan.partial || combined.length > MAX_TEXT ? 'flex_partial' : 'flex_nodes';
    // Deliberately do not combine ALT_TEXT/raw.text with Flex body: this
    // previously caused contradictory income/outgoing signals.
  } else if (isFlex && (original || alt)) {
    text = (original || alt).slice(0, MAX_TEXT);
    sourceFormat = 'flex_fallback';
  } else if (!isFlex && original) {
    text = original.slice(0, MAX_TEXT);
    sourceFormat = original.length > MAX_TEXT ? 'flex_partial' : 'text';
  }

  return {
    text,
    type,
    flex: isFlex,
    hasReadableText: text.trim().length > 0,
    sourceFormat,
    hasImageNodes: scan.hasImageNodes,
  };
}

export function isPotentialBankNotification(text: string): boolean {
  if (isActionableBankAlert(text)) return true;
  return /(?:เงิน(?:เข้า|ออก)|โอน(?:เงิน)?|ถอน|ยอด(?:เงิน|คงเหลือ)|KBank|Krungthai|Connext|กรุงไทย|SCB|กสิกร|รายการโอน|ชำระ|payment|debit|credit|withdrawal|deposit)/i.test(
    text.slice(0, MAX_TEXT),
  );
}

/** Never forward security/OTP chats as banking transactions. */
export function isActionableBankAlert(text: string): boolean {
  if (/(?:\botp\b|รหัส(?:ยืนยัน|ผ่าน|ใช้ครั้งเดียว)|one.time.password|security.code)/i.test(text)) {
    return false;
  }
  // The previous worker forwarded bank captions such as "เงินเข้า" even
  // when Flex stripped the +/- sign. Restore that behaviour. The server
  // still requires a definite monetary amount and an unambiguous direction.
  return (
    /(?:เงิน(?:เข้า|ออก)|รับโอน|โอน(?:เข้า|ออก|เงิน)?|ถอนเงิน|ชำระ(?:เงิน)?|จ่ายเงิน|สแกนจ่าย|รายการเครดิต|รายการเดบิต|รายการโอน|ฝากเงิน|หักบัญชี|credited|debited|deposit|withdrawal)/i.test(
      text,
    ) ||
    (/(?:จำนวนเงิน|ยอด(?:โอน|จ่าย|ถอน|รายการ)|amount)/i.test(text) &&
      /[+＋−‒–﹣－-]\s*\d[\d,]*\.\d{2}(?=\s|$)/m.test(text)) ||
    // A KBank Flex may omit the title/sign but retain an amount plus a
    // masked-account label. Forward it for the server's default-expense rule.
    // The worker already restricts delivery to the selected bank sender MID.
    (/(?:จากบัญชี|เข้าบัญชี|บัญชีต้นทาง|บัญชีปลายทาง|จำนวนเงิน)/i.test(text) &&
      /(?<![\d.,/])\d{1,9}(?:,\d{3})*\.\d{2}(?![\d.,/])/.test(text))
  );
}
