/**
 * MoneyFlow experimental LINEJS bank notification listener.
 *
 * Never runs as part of the MoneyFlow API. Users explicitly run this separate
 * process after accepting the risks of unofficial personal LINE automation.
 * Receives all LINE messages locally but forwards ONLY the exact allowlisted
 * sender MID. No conversation text, tokens, or keys are logged.
 *
 * Setup: see ./README.md. The MoneyFlow website has an independent switch.
 */
import { existsSync, mkdirSync, chmodSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BaseClient } from '@evex/linejs/base';
import { Client } from '@evex/linejs';
import qrcode from 'qrcode-terminal';
import {
  extractLineBankContent,
  isPotentialBankNotification,
  isActionableBankAlert,
  type BankSourceFormat,
} from './bank-message-content.ts';
import { FileStorage } from '@evex/linejs/storage';
import { HISTORY_BACKFILL_MS, recentBankMessages } from './recent-bank-history.ts';
import { parseBankAlertFromSources } from '../../server/bank-source-parser.ts';
import {
  parseSignedBankNotification,
  parseBankNotification,
} from '../../server/bank-notification-parser.ts';

process.umask(0o077);

const enabled = process.env.LINEJS_WORKER_ENABLED === '1';
const token = (process.env.MONEYFLOW_BANK_INGEST_TOKEN || '').trim();
const senderMid = (process.env.LINEJS_BANK_SENDER_MID || '').trim().toLowerCase();
const apiUrl = (process.env.MONEYFLOW_BANK_API || 'http://127.0.0.1:3011').replace(/\/+$/, '');
const discovery = process.env.LINEJS_DISCOVER_SENDER === '1';

if (!enabled) {
  console.log('LINEJS worker is OFF. Set LINEJS_WORKER_ENABLED=1 explicitly to start.');
  process.exit(0);
}
// LINEJS's streaming PUSH needs HTTP/2. Its transport explicitly disables
// the Node HTTP/2 dispatcher when it detects Bun, so Bun can appear logged in
// while its message/event stream never connects. Run this worker on Node 24+.
if (typeof process.versions.bun === 'string') {
  console.error('LINEJS requires the Node.js HTTP/2 runtime for real-time messages.');
  console.error('Start with `bun start` (package script launches Node), not `bun worker.ts`.');
  process.exit(1);
}
console.log('LINEJS runtime: Node.js ' + process.versions.node + ' (HTTP/2 PUSH enabled)');
if (!/^mfbank_[0-9a-f]{64}$/.test(token)) {
  console.error('Missing or invalid MONEYFLOW_BANK_INGEST_TOKEN. Create a token from LINE & AI.');
  process.exit(1);
}
if (!discovery && !/^u[0-9a-f]{32}$/.test(senderMid)) {
  console.error(
    'LINEJS_BANK_SENDER_MID must be the exact u + 32 characters MID from the real bank chat.',
  );
  console.error('To learn the sender MID, use LINEJS_DISCOVER_SENDER=1 temporarily.');
  process.exit(1);
}
const localHost = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(apiUrl);
if (!localHost && !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(apiUrl)) {
  console.error('Only localhost HTTP or public HTTPS is allowed for MoneyFlow bridge.');
  process.exit(1);
}
async function bridgeState(): Promise<boolean> {
  try {
    const response = await fetch(apiUrl + '/api/integrations/linejs/status', {
      headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { enabled: boolean; configured: boolean };
    return result.enabled === true && result.configured === true;
  } catch {
    return false;
  }
}
if (!discovery && !(await bridgeState())) {
  console.error('MoneyFlow Flow is OFF or unavailable. Enable it on LINE & AI before starting Worker.');
  process.exit(0);
}

const sessionDir = join(homedir(), '.moneyflow-linejs');
if (!existsSync(sessionDir)) mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
chmodSync(sessionDir, 0o700);
const sessionPath = join(sessionDir, 'session.json');
const storage = new FileStorage(sessionPath);
const base = new BaseClient({ device: 'ANDROIDSECONDARY', storage });

// LINEJS silently reports transport errors through BaseClient's "log" event.
// The previous Worker treated a successful login as an active PUSH connection.
// Print SAFE transport status only: never print log.data or error.message,
// which can contain LINE tokens, URLs, packet bytes, or chat contents.
const pushStatus = {
  attempts: 0,
  responses: 0,
  talkResponses: 0,
  talkSyncs: 0,
  talkRequests: 0,
  talkParseErrors: 0,
  pushReadPackets: 0,
  pingFrames: 0,
  streamClosed: 0,
  errors: 0,
};
base.on('log', (event: any) => {
  try {
    const type = String(event?.type || '');
    if (type.startsWith('[LEGY/PUSH] Using ')) {
      pushStatus.attempts += 1;
      if (pushStatus.attempts === 1) {
        console.log('[LINEJS PUSH] Opening an HTTP/2 connection to LINE...');
      }
    } else if (type.startsWith('[LEGY/PUSH] receives sign-on-response frame.')) {
      pushStatus.responses += 1;
      if (pushStatus.responses === 1) {
        console.log('[LINEJS PUSH] LINE server responded to the event stream.');
        if (process.send) process.send({ type: 'push' });
      }
    } else if (type.startsWith('[LEGY/PUSH] [H2][PUSH] send sign-on-request.')) {
      pushStatus.talkRequests += 1;
    } else if (type.startsWith('[LEGY/PUSH] request talk fetcher:')) {
      pushStatus.talkSyncs += 1;
    } else if (type.startsWith('[LEGY/PUSH] [PUSH] parse error:')) {
      pushStatus.talkParseErrors += 1;
    } else if (type.startsWith('[LEGY/PUSH] sync error:')) {
      pushStatus.talkParseErrors += 1;
    } else if (type === '[LEGY/PUSH] readByte') {
      pushStatus.pushReadPackets += 1;
    } else if (type.startsWith('[LEGY/PUSH] [PUSH] receives ping frame.')) {
      pushStatus.pingFrames += 1;
    } else if (type.startsWith('[LEGY/PUSH] CONN died on PingId=')) {
      pushStatus.streamClosed += 1;
    } else if (type === 'LegyPusherError' || type === 'LegyPusherError_cannot_init') {
      pushStatus.errors += 1;
      if (pushStatus.errors <= 3 || pushStatus.errors % 10 === 0) {
        const rawCode = String(event?.data?.error?.code || '');
        const code = /^[A-Z][A-Z0-9_]{1,42}$/.test(rawCode) ? ' (' + rawCode + ')' : '';
        console.warn(
          '[LINEJS PUSH] Transport error' +
            code +
            '; attempt restarting with Node.js. Error count=' +
            pushStatus.errors,
        );
      }
    }
  } catch {
    // Diagnostics must never interrupt the stream or leak sensitive error data.
  }
});
const authKey = '.auth';
let saveQueue = Promise.resolve();

base.on('qrcall', (url: string) => {
  if (process.send) {
    process.send({ type: 'qr', url });
    return;
  }
  console.log('\nLINEJS QR login is ready on this Mac.');
  console.log('On your PHONE: open LINE > QR scanner, then scan the code BELOW from your Mac screen.');
  console.log('Do NOT open the login link directly on your phone; it opens the scanner instead.');
  qrcode.generate(url, { small: true }, (qr: string) => {
    console.log('\n' + qr);
    console.log('Confirm this new-device login in your LINE app.');
    console.log('PRIVATE: Never screenshot or share this QR, PIN, or login link.');
    console.log('This is an unofficial LINE client, NOT a bank payment.\n');
  });
});
base.on('pincall', (pin: string) => {
  if (process.send) {
    process.send({ type: 'pin', pin });
    return;
  }
  console.log('LINEJS pairing PIN (enter only on your own LINE):', pin);
});
base.on('update:authtoken', (updated: string) => {
  saveQueue = saveQueue
    .then(async () => {
      await storage.set(authKey, updated);
      if (existsSync(sessionPath)) chmodSync(sessionPath, 0o600);
    })
    .catch(() => console.error('Could not securely save LINEJS token'));
});

async function sendBankAlert(
  messageId: string,
  from: string,
  text: string,
  sourceFormat: BankSourceFormat,
  altText: string,
  rawText: string,
) {
  const reply = await fetch(apiUrl + '/api/integrations/linejs/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ messageId, senderMid: from, text, sourceFormat, altText, rawText }),
    signal: AbortSignal.timeout(9500),
  });
  if (!reply.ok) {
    console.warn('MoneyFlow rejected alert:', reply.status, '(no message content logged)');
    return null;
  }
  const result = (await reply.json()) as { status?: string };
  console.log('MoneyFlow notification:', result.status || 'processed');
  if (process.send) process.send({ type: 'bank', outcome: result.status || 'processed' });
  return result.status || 'processed';
}

console.log('Connecting personal LINE via LINEJS; notifications are filtered locally by Sender MID.');
console.log('Mode:', discovery ? 'SENDER DISCOVERY ONLY' : 'ALLOWLIST ONLY (MoneyFlow opt-in enforced)');
console.log('Destination:', apiUrl);
const saved = await storage.get(authKey);
try {
  await base.loginProcess.login(typeof saved === 'string' && saved ? { authToken: saved } : {});
  await saveQueue;
  if (existsSync(sessionPath)) chmodSync(sessionPath, 0o600);
} catch (error) {
  console.error(
    'LINEJS login failed; check the LINE app approval or revoke this session if unexpected.',
  );
  process.exit(1);
}
const client = new Client(base);
console.log('LINEJS session established. Waiting for permitted bank notifications.');
if (process.send) process.send({ type: 'login' });
let lastDiscovery = new Set<string>();
const diagnostics = {
  events: 0,
  receiveOps: 0,
  received: 0,
  otherType: 0,
  flexCards: 0,
  unreadableFlex: 0,
  candidate: 0,
  own: 0,
  dropped: 0,
};
if (discovery) {
  // Log COUNTS only: no message texts, private sender IDs or account numbers.
  client.on('event', (event: any) => {
    diagnostics.events += 1;
    if (event?.type === 'RECEIVE_MESSAGE') diagnostics.receiveOps += 1;
  });
  let previous = '';
  console.log('LINEJS diagnostics enabled (message counts only; no chat content will be logged).');
  setInterval(() => {
    const state = JSON.stringify({ ...diagnostics, ...pushStatus });
    if (state === previous) return;
    previous = state;
    console.log(
      '[LINEJS diagnostics]',
      'push attempts=' + pushStatus.attempts,
      'push responses=' + pushStatus.responses,
      'sync requests=' + pushStatus.talkRequests,
      'sync cycles=' + pushStatus.talkSyncs,
      'sync parse errors=' + pushStatus.talkParseErrors,
      'push chunks=' + pushStatus.pushReadPackets,
      'ping frames=' + pushStatus.pingFrames,
      'stream closed=' + pushStatus.streamClosed,
      'push errors=' + pushStatus.errors,
      'talk events=' + diagnostics.events,
      'receive events=' + diagnostics.receiveOps,
      'incoming messages=' + diagnostics.received,
      'non-text=' + diagnostics.otherType,
      'flex-cards=' + diagnostics.flexCards,
      'flex-unreadable=' + diagnostics.unreadableFlex,
      'bank-like=' + diagnostics.candidate,
      'filtered=' + diagnostics.dropped,
      'sent-by-me=' + diagnostics.own,
    );
  }, 15000);
}
// PUSH can stop delivering events while login still appears healthy.
// This shared handler also accepts read-only history fetches of the exact
// allowlisted bank chat, with no other chat content inspected or logged.
// On this migration do not retroactively import old bank alerts that could
// already have been entered manually. New PUSH events and messages fetched
// after this worker starts are still processed automatically.
const listenerStartedAt = Date.now();
const recentlyForwarded = new Set<string>();
const recentlyObserved = new Set<string>();
const recentlySkipped = new Set<string>();
const inFlight = new Set<string>();
const historyStatus = {
  checks: 0,
  failures: 0,
  recent: 0,
  state: 'not_checked',
  lastCheckedAt: '',
  lastSuccessAt: '',
};
let lastSafeShape = {
  readable: 0,
  flexNodes: 0,
  flexFallback: 0,
  otherFormat: 0,
  withImageNodes: 0,
  hasAmountLabel: 0,
  hasSignedDecimal: 0,
  validSignedTransaction: 0,
  filterAccepted: 0,
  transferTitle: 0,
  decimalPresent: 0,
  rawTextSigned: 0,
  rawTextAmountLabel: 0,
  alternateTextNodes: 0,
  flexSpanNodes: 0,
  standaloneSign: 0,
  hasAnyPlusOrMinus: 0,
  hasAccountLabel: 0,
  textParts: 0,
  linePatterns: [] as string[][],
  altPresent: 0,
  altDirectionIn: 0,
  altDirectionOut: 0,
  altSignedAmount: 0,
  altAmountHint: 0,
  altDecimal: 0,
  altCurrency: 0,
  rawTextPresent: 0,
  rawTextDirection: 0,
  rawTextSigned: 0,
  legacyPartsSigned: 0,
  legacyParsedIncome: 0,
  legacyParsedExpense: 0,
  historicalReadOnly: 0,
  historicalLegacyIncome: 0,
  historicalLegacyExpense: 0,
  historicalLegacyUnknown: 0,
  historicalImprovedIncome: 0,
  historicalImprovedExpense: 0,
  historicalImprovedUnknown: 0,
  unknownWithAmount: 0,
  unknownWithFromAccount: 0,
  unknownWithIntoAccount: 0,
  unknownWithTransferTitle: 0,
  unknownWithSpecificOut: 0,
  unknownWithSpecificIn: 0,
  unknownWithAlt: 0,
  unknownWithMultipleDecimals: 0,
  unknownWithBalance: 0,
  unknownWithTxnLabel: 0,
  unknownFlexFullOutLabel: 0,
  unknownFlexFullInLabel: 0,
  unknownFlexFullSignedDecimal: 0,
  unknownFlexFullTransactionLabel: 0,
  unknownMetadataKeys: [] as string[],
  unknownRawObjectKeys: [] as string[],
  unknownPrimaryOneUniqueDecimal: 0,
  unknownPrimaryManyUniqueDecimals: 0,
  unknownPrimaryNoDecimal: 0,
  amountColorsIncoming: {} as Record<string, number>,
  amountColorsUnknown: {} as Record<string, number>,
  legacyUnparsed: 0,
};
function remember(cache: Set<string>, id: string) {
  cache.add(id);
  if (cache.size > 400) cache.delete(cache.values().next().value!);
}
function reportSeen(id: string) {
  if (recentlyObserved.has(id)) return;
  remember(recentlyObserved, id);
  if (process.send) process.send({ type: 'observed' });
}
function reportSkipped(id: string) {
  if (recentlySkipped.has(id)) return;
  remember(recentlySkipped, id);
  if (process.send) process.send({ type: 'skipped' });
}
function handleBankMessage(m: any) {
  try {
    if (discovery) {
      if (m?.isMyMessage) diagnostics.own += 1;
      else if (!m?.isEdited) {
        diagnostics.received += 1;
        const preview = extractLineBankContent(m?.raw || {});
        if (preview.flex) diagnostics.flexCards += 1;
        if (preview.flex && !preview.hasReadableText) diagnostics.unreadableFlex += 1;
      }
    }
    if (m?.isMyMessage || m?.isEdited) return;
    const from = String(m?.from?.id || '').toLowerCase();
    const id = String(m?.raw?.id || '');
    if (!/^u[0-9a-f]{32}$/.test(from) || !/^\d{5,30}$/.test(id)) return;

    // Parse only local text/Flex nodes; never fetch images or expose raw chats.
    const content = extractLineBankContent(m.raw || {});
    const text = content.text;
    const altText =
      typeof m.raw?.contentMetadata?.ALT_TEXT === 'string'
        ? m.raw.contentMetadata.ALT_TEXT.slice(0, 400)
        : '';
    const rawText = typeof m.raw?.text === 'string' ? m.raw.text.slice(0, 500) : '';
    const combinedText = [text, altText, rawText].filter(Boolean).join('\n');
    if (discovery) {
      if (combinedText && isPotentialBankNotification(combinedText)) {
        diagnostics.candidate++;
        if (!lastDiscovery.has(from)) {
          lastDiscovery.add(from);
          if (lastDiscovery.size > 200) lastDiscovery = new Set();
          if (process.send) process.send({ type: 'discovery', mid: from });
        }
      } else diagnostics.dropped++;
      return;
    }
    if (from !== senderMid) return;
    reportSeen(id);
    if (recentlyForwarded.has(id) || inFlight.has(id)) return;
    if (!combinedText || !isActionableBankAlert(combinedText)) {
      reportSkipped(id);
      return;
    }
    inFlight.add(id);
    void sendBankAlert(id, from, text, content.sourceFormat, altText, rawText)
      .then((outcome) => {
        if (outcome) remember(recentlyForwarded, id);
      })
      .catch(() => {
        // Transient failures are retried on the next bank-history fetch.
        console.warn('[LINEJS] Bank alert delivery failed (no content logged).');
      })
      .finally(() => inFlight.delete(id));
  } catch {
    console.warn('[LINEJS] Unsupported incoming notification; no content logged.');
  }
}
client.on('message', handleBankMessage);

// Once per minute, inspect at most 18 recent messages from ONLY the selected
// bank chat. This is read-only, does not mark messages as read, and can recover
// an alert missed by the unreliable unofficial PUSH connection.
let historyBusy = false;
async function pollBankHistory() {
  if (discovery || historyBusy) return;
  historyBusy = true;
  historyStatus.checks++;
  historyStatus.lastCheckedAt = new Date().toISOString();
  try {
    const response = await client.base.talk.getMessageBoxes({ messageBoxListRequest: {} });
    const box = response.messageBoxes?.find(
      (entry: any) => String(entry.id || '').toLowerCase() === senderMid,
    );
    if (!box?.lastDeliveredMessageId) {
      historyStatus.state = 'bank_chat_unavailable';
      historyStatus.failures++;
      return;
    }
    const fetched = await client.base.talk.getPreviousMessagesV2WithRequest({
      request: {
        messageBoxId: box.id,
        endMessageId: {
          messageId: box.lastDeliveredMessageId.messageId,
          deliveredTime: box.lastDeliveredMessageId.deliveredTime,
        },
        messagesCount: 18,
      },
    });
    const now = Date.now();
    // Limit backfill to after this worker started to avoid replaying events
    // skipped by previous broken parser versions.
    const eligibleAge = Math.min(HISTORY_BACKFILL_MS, Math.max(0, now - listenerStartedAt) + 2000);
    const recent = recentBankMessages(
      Array.isArray(fetched) ? fetched : [],
      senderMid,
      now,
      eligibleAge,
    );
    historyStatus.recent = recent.length;
    historyStatus.state = 'ok';
    historyStatus.lastSuccessAt = historyStatus.lastCheckedAt;
    const shape = {
      readable: 0,
      flexNodes: 0,
      flexFallback: 0,
      otherFormat: 0,
      withImageNodes: 0,
      hasAmountLabel: 0,
      hasSignedDecimal: 0,
      validSignedTransaction: 0,
      filterAccepted: 0,
      transferTitle: 0,
      decimalPresent: 0,
      rawTextSigned: 0,
      rawTextAmountLabel: 0,
      alternateTextNodes: 0,
      flexSpanNodes: 0,
      standaloneSign: 0,
      hasAnyPlusOrMinus: 0,
      hasAccountLabel: 0,
      textParts: 0,
      linePatterns: [] as string[][],
      altPresent: 0,
      altDirectionIn: 0,
      altDirectionOut: 0,
      altSignedAmount: 0,
      altAmountHint: 0,
      altDecimal: 0,
      altCurrency: 0,
      rawTextPresent: 0,
      rawTextDirection: 0,
      rawTextSigned: 0,
      legacyPartsSigned: 0,
      legacyParsedIncome: 0,
      legacyParsedExpense: 0,
      historicalReadOnly: 0,
      historicalLegacyIncome: 0,
      historicalLegacyExpense: 0,
      historicalLegacyUnknown: 0,
      historicalImprovedIncome: 0,
      historicalImprovedExpense: 0,
      historicalImprovedUnknown: 0,
      unknownWithAmount: 0,
      unknownWithFromAccount: 0,
      unknownWithIntoAccount: 0,
      unknownWithTransferTitle: 0,
      unknownWithSpecificOut: 0,
      unknownWithSpecificIn: 0,
      unknownWithAlt: 0,
      unknownWithMultipleDecimals: 0,
      unknownWithBalance: 0,
      unknownWithTxnLabel: 0,
      unknownFlexFullOutLabel: 0,
      unknownFlexFullInLabel: 0,
      unknownFlexFullSignedDecimal: 0,
      unknownFlexFullTransactionLabel: 0,
      unknownMetadataKeys: [] as string[],
      unknownRawObjectKeys: [] as string[],
      unknownPrimaryOneUniqueDecimal: 0,
      unknownPrimaryManyUniqueDecimals: 0,
      unknownPrimaryNoDecimal: 0,
      amountColorsIncoming: {} as Record<string, number>,
      amountColorsUnknown: {} as Record<string, number>,
      legacyUnparsed: 0,
    };
    for (const raw of recent) {
      const candidate = extractLineBankContent(raw);
      const value = candidate.text;
      if (candidate.hasReadableText) shape.readable++;
      if (candidate.sourceFormat === 'flex_nodes') shape.flexNodes++;
      else if (candidate.sourceFormat === 'flex_fallback') shape.flexFallback++;
      else shape.otherFormat++;
      if (candidate.hasImageNodes) shape.withImageNodes++;
      if (/(?:จำนวนเงิน|amount)/i.test(value)) shape.hasAmountLabel++;
      if (/[+＋−‒–﹣－-]\s*\d[\d,]*\.\d{2}(?=\s|$)/m.test(value)) shape.hasSignedDecimal++;
      if (parseSignedBankNotification(value, 'kbank')) shape.validSignedTransaction++;
      if (isActionableBankAlert(value)) shape.filterAccepted++;
      if (/(?:รายการโอน|ถอนเงิน|เงินเข้า|เงินออก)/i.test(value)) shape.transferTitle++;
      if (/\d[\d,]*\.\d{2}/.test(value)) shape.decimalPresent++;
      if (/(?:^|\n)\s*[+＋−‒–﹣－-]\s*(?:\n|$)/m.test(value)) shape.standaloneSign++;
      if (/[+＋−‒–﹣－-]/.test(value)) shape.hasAnyPlusOrMinus++;
      if (/จากบัญชี|เข้าบัญชี/i.test(value)) shape.hasAccountLabel++;
      shape.textParts += value.split('\n').length;
      const patterns = value
        .split('\n')
        .slice(0, 24)
        .map((line) => {
          if (/(?:ยอดคงเหลือ|balance)/i.test(line)) return 'balance_label';
          if (/(?:จากบัญชี|เข้าบัญชี|account)/i.test(line)) return 'account_label';
          if (/(?:จำนวน|amount)/i.test(line)) return 'amount_hint';
          if (/^[ \t]*[+＋−‒–﹣－-]\s*\d/.test(line)) return 'signed_value';
          if (/\d[\d,]*\.\d{2}/.test(line)) return 'decimal_value';
          if (/\d/.test(line)) return 'identifier_or_date';
          if (/^[ \t]*[+＋−‒–﹣－-][ \t]*$/.test(line)) return 'standalone_sign';
          return 'other_text';
        });
      if (shape.linePatterns.length < 6) shape.linePatterns.push(patterns);
      const plain = typeof raw.text === 'string' ? raw.text : '';
      const alt =
        typeof raw.contentMetadata?.ALT_TEXT === 'string'
          ? raw.contentMetadata.ALT_TEXT.slice(0, 400)
          : '';
      if (alt) shape.altPresent++;
      if (/เงินเข้า|รับโอน|โอนเข้า|รับเงิน|รายการเครดิต/i.test(alt)) shape.altDirectionIn++;
      if (/เงินออก|โอนออก|รายการโอน|ถอนเงิน|ชำระเงิน|รายการเดบิต/i.test(alt)) shape.altDirectionOut++;
      if (/[+＋−‒–﹣－-]\\s*\\d[\\d,]*\\.\\d{2}(?=\\s|$)/m.test(alt)) shape.altSignedAmount++;
      if (/จำนวนเงิน|ยอดเงิน|amount/i.test(alt)) shape.altAmountHint++;
      if (/\\d[\\d,]*\\.\\d{2}/.test(alt)) shape.altDecimal++;
      if (/บาท|฿|THB/i.test(alt)) shape.altCurrency++;
      if (plain) shape.rawTextPresent++;
      if (/เงินเข้า|รับโอน|โอนออก|เงินออก|รายการโอน|ชำระ/i.test(plain)) shape.rawTextDirection++;
      if (/[+＋−‒–﹣－-]\\s*\\d[\\d,]*\\.\\d{2}(?=\\s|$)/m.test(plain)) shape.rawTextSigned++;
      if (
        /[+＋−‒–﹣－-]\\s*\\d[\\d,]*\\.\\d{2}(?=\\s|$)/m.test(
          [plain, alt, value].filter(Boolean).join('\\n'),
        )
      )
        shape.legacyPartsSigned++;

      const reconstructed = [plain, alt, value].filter(Boolean).join('\n');
      const legacyResult = parseBankNotification(reconstructed, 'kbank');
      if (legacyResult?.kind === 'income') shape.legacyParsedIncome++;
      else if (legacyResult?.kind === 'expense') shape.legacyParsedExpense++;
      else shape.legacyUnparsed++;
      if (/(?:จำนวนเงิน|amount)/i.test(plain)) shape.rawTextAmountLabel++;
      if (/[+＋−‒–﹣－-]\s*\d[\d,]*\.\d{2}(?=\s|$)/m.test(plain)) shape.rawTextSigned++;
      try {
        const metadata = raw.contentMetadata || {};
        const rawFlex = metadata.FLEX_JSON;
        const root =
          typeof rawFlex === 'string' && rawFlex.length <= 100_000 ? JSON.parse(rawFlex) : rawFlex;
        let walked = 0;
        function inspectNode(node: any, depth: number) {
          if (!node || typeof node !== 'object' || depth > 15 || walked++ > 450) return;
          if (Array.isArray(node)) {
            for (const child of node) inspectNode(child, depth + 1);
            return;
          }
          if (node.type === 'span') shape.flexSpanNodes++;
          if (typeof node.text === 'string' && node.type !== 'text') shape.alternateTextNodes++;
          for (const sub of Object.values(node)) {
            if (sub && typeof sub === 'object') inspectNode(sub, depth + 1);
          }
        }
        inspectNode(root, 0);
      } catch {
        // Only inspect the JSON structure; never output message values.
      }
    }
    // Compare historical formats read-only. NEVER replay these older messages
    // into the MoneyFlow ledger; old transactions may already exist.
    const historical = recentBankMessages(
      Array.isArray(fetched) ? fetched : [],
      senderMid,
      Date.now(),
      3 * 60 * 60 * 1000,
    );
    shape.historicalReadOnly = historical.length;
    for (const raw of historical) {
      const info = extractLineBankContent(raw);
      const alt =
        typeof raw.contentMetadata?.ALT_TEXT === 'string'
          ? raw.contentMetadata.ALT_TEXT.slice(0, 400)
          : '';
      const plain = typeof raw.text === 'string' ? raw.text : '';
      const replay = parseBankNotification([plain, alt, info.text].filter(Boolean).join('\n'), 'kbank');
      if (replay?.kind === 'income') shape.historicalLegacyIncome++;
      else if (replay?.kind === 'expense') shape.historicalLegacyExpense++;
      else shape.historicalLegacyUnknown++;
      const restored = parseBankAlertFromSources(
        { text: info.text, altText: alt, rawText: plain },
        'kbank',
      );
      // Record only the CSS color associated with a numeric Flex text node;
      // never record the node's text, value, MID or bank account.
      try {
        const rawFlex = raw.contentMetadata?.FLEX_JSON;
        const data =
          typeof rawFlex === 'string' && rawFlex.length < 100000 ? JSON.parse(rawFlex) : rawFlex;
        let walked = 0;
        function visit(node: any, depth: number) {
          if (!node || typeof node !== 'object' || depth > 14 || walked++ > 450) return;
          if (Array.isArray(node)) {
            for (const x of node) visit(x, depth + 1);
            return;
          }
          if (
            node.type === 'text' &&
            typeof node.text === 'string' &&
            /\d[\d,]*\.\d{2}/.test(node.text)
          ) {
            const css =
              typeof node.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(node.color)
                ? node.color.toLowerCase()
                : 'none';
            const histogram =
              restored?.kind === 'income' ? shape.amountColorsIncoming : shape.amountColorsUnknown;
            histogram[css] = (histogram[css] || 0) + 1;
          }
          for (const [key, val] of Object.entries(node)) {
            if (key === 'action' || key === 'data' || key === 'uri' || key === 'url') continue;
            if (val && typeof val === 'object') visit(val, depth + 1);
          }
        }
        visit(data, 0);
      } catch {
        // Read-only structural inspection never blocks message processing.
      }
      if (restored?.kind === 'income') shape.historicalImprovedIncome++;
      else if (restored?.kind === 'expense') shape.historicalImprovedExpense++;
      else {
        shape.historicalImprovedUnknown++;
        // Diagnostic booleans and structural keys only. Never store raw
        // card JSON, message content, bank amount or account identifiers.
        const fullFlexSource = raw.contentMetadata?.FLEX_JSON;
        const fullFlex =
          typeof fullFlexSource === 'string'
            ? fullFlexSource.slice(0, 100_000)
            : fullFlexSource && typeof fullFlexSource === 'object'
              ? JSON.stringify(fullFlexSource).slice(0, 100_000)
              : '';
        if (/รายการโอน|รายการถอน|โอนออก|ถอนเงิน|เงินออก/i.test(fullFlex))
          shape.unknownFlexFullOutLabel++;
        if (/เงินเข้า|รับโอน|รับเงิน|โอนเข้า/i.test(fullFlex)) shape.unknownFlexFullInLabel++;
        if (/[+−-]\s*\d[\d,]*\.\d{2}/.test(fullFlex)) shape.unknownFlexFullSignedDecimal++;
        if (/จำนวนเงิน|amount|ยอด(?:โอน|จ่าย)/i.test(fullFlex)) shape.unknownFlexFullTransactionLabel++;
        for (const key of Object.keys(raw)) {
          if (
            /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key) &&
            shape.unknownRawObjectKeys.length < 25 &&
            !shape.unknownRawObjectKeys.includes(key)
          ) {
            shape.unknownRawObjectKeys.push(key);
          }
        }
        for (const key of Object.keys(raw.contentMetadata || {})) {
          if (
            /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key) &&
            shape.unknownMetadataKeys.length < 25 &&
            !shape.unknownMetadataKeys.includes(key)
          ) {
            shape.unknownMetadataKeys.push(key);
          }
        }
        const all = [info.text, alt, plain].filter(Boolean).join('\n');
        const decimals = [...all.matchAll(/(?<![\d.,/])\d{1,9}(?:,\d{3})*\.\d{2}(?![\d.,/])/g)];
        if (decimals.length) shape.unknownWithAmount++;
        if (decimals.length > 1) shape.unknownWithMultipleDecimals++;
        const primaryAmounts = new Set(
          [...info.text.matchAll(/(?<![\d.,/])\d{1,9}(?:,\d{3})*\.\d{2}(?![\d.,/])/g)].map((m) => m[0]),
        );
        if (primaryAmounts.size === 1) shape.unknownPrimaryOneUniqueDecimal++;
        else if (primaryAmounts.size > 1) shape.unknownPrimaryManyUniqueDecimals++;
        else shape.unknownPrimaryNoDecimal++;
        if (/จากบัญชี/i.test(all)) shape.unknownWithFromAccount++;
        if (/เข้าบัญชี/i.test(all)) shape.unknownWithIntoAccount++;
        if (/รายการ\s*โอน\s*[\/／-]\s*ถอน/i.test(all)) shape.unknownWithTransferTitle++;
        if (/เงินออก|โอนออก|ถอนเงิน|ชำระเงิน/i.test(all)) shape.unknownWithSpecificOut++;
        if (/เงินเข้า|รับโอน|รับเงิน/i.test(all)) shape.unknownWithSpecificIn++;
        if (alt) shape.unknownWithAlt++;
        if (/ยอดคงเหลือ|balance/i.test(all)) shape.unknownWithBalance++;
        if (/จำนวนเงิน|ยอดโอน|ยอดจ่าย|amount/i.test(all)) shape.unknownWithTxnLabel++;
      }
    }
    lastSafeShape = shape;
    for (const raw of recent) {
      handleBankMessage({
        raw,
        from: { id: raw.from },
        isMyMessage: false,
        isEdited: false,
      });
    }
  } catch {
    historyStatus.state = 'fetch_error';
    historyStatus.failures++;
    if (historyStatus.failures <= 2 || historyStatus.failures % 10 === 0)
      console.warn('[LINEJS] History fallback unavailable; PUSH listener remains active.');
  } finally {
    historyBusy = false;
    const safe = {
      lastCheckedAt: historyStatus.lastCheckedAt,
      lastSuccessAt: historyStatus.lastSuccessAt,
      state: historyStatus.state,
      checks: historyStatus.checks,
      failures: historyStatus.failures,
      recent: historyStatus.recent,
      observed: recentlyObserved.size,
      skipped: recentlySkipped.size,
      forwarded: recentlyForwarded.size,
      pushResponses: pushStatus.responses,
      shape: lastSafeShape,
    };
    try {
      writeFileSync(join(sessionDir, 'health.json'), JSON.stringify(safe), { mode: 0o600 });
    } catch {
      // Health telemetry must never prevent message delivery.
    }
    if (process.send) process.send({ type: 'history', ...safe });
  }
}
const listenerAbort = new AbortController();
if (!discovery) {
  let checkingStatus = false;
  setInterval(() => {
    if (checkingStatus) return;
    checkingStatus = true;
    void bridgeState()
      .then((active) => {
        if (!active) {
          console.warn('MoneyFlow Flow was switched OFF or is unavailable. LINEJS worker is stopping.');
          listenerAbort.abort();
          process.exit(0);
        }
      })
      .finally(() => {
        checkingStatus = false;
      });
  }, 15000);
}
client.listen({ talk: true, signal: listenerAbort.signal });
if (!discovery) {
  setTimeout(() => void pollBankHistory(), 7000);
  setInterval(() => void pollBankHistory(), 60_000);
}
