import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Elysia } from 'elysia';
import type { Sql } from 'postgres';
import { BANK_CHANNELS, type BankChannel } from './bank-notification-parser.ts';
import type { PublishFn } from './realtime.ts';
import { lineJsLocalManager } from './linejs-local-manager.ts';
import { hostedLineJsManager } from './linejs-hosted-manager.ts';
import type { BankSourceFormat } from '../integrations/linejs/bank-message-content.ts';
import { parseBankAlertFromSources } from './bank-source-parser.ts';
import { pushBankReceipt, pushUnrecognizedBankAlert } from './bank-linejs-push.ts';
type SafeBankSource = BankSourceFormat | 'legacy';

type AuthHandler = (ctx: any, userId: string) => Promise<any>;
type Guarded = (handler: AuthHandler) => (ctx: any) => Promise<any>;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const validMid = (value: unknown): value is string =>
  typeof value === 'string' && /^u[0-9a-f]{32}$/i.test(value);
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const isBank = (value: unknown): value is BankChannel =>
  typeof value === 'string' && BANK_CHANNELS.includes(value as BankChannel);
const originOk = (ctx: any) => {
  const origin = String(ctx.request.headers.get('origin') || '');
  if (process.env.NODE_ENV === 'production') {
    return origin === String(process.env.WEB_ORIGIN || '');
  }
  const origins = [process.env.WEB_ORIGIN, 'http://127.0.0.1:5178', 'http://localhost:5178'].filter(
    Boolean,
  );
  return origins.includes(origin);
};
const rejectOrigin = (ctx: any) => {
  if (originOk(ctx)) return false;
  ctx.set.status = 403;
  return true;
};
const requireLocalWeb = (ctx: any) => {
  const host = String(ctx.request.headers.get('host') || '');
  if (/^(?:localhost|127[.]0[.]0[.]1)(?::[0-9]+)?$/i.test(host)) return true;
  ctx.set.status = 403;
  return false;
};
function shapeSettings(row: any) {
  return {
    enabled: row.enabled === true,
    bank: row.bank,
    senderMid: row.sender_mid || '',
    accountId: row.account_id || '',
    tokenConfigured: !!row.token_hash,
    pushLine: row.push_line === true,
    lastEventAt: row.last_event_at || null,
  };
}

async function settings(db: Sql, userId: string) {
  const rows = await db`
    INSERT INTO bank_linejs_settings(user_id) VALUES(${userId})
    ON CONFLICT(user_id) DO UPDATE SET user_id=excluded.user_id
    RETURNING *
  `;
  return rows[0];
}

async function saveBankEvent(db: Sql, userId: string, event: any, accountId: string): Promise<boolean> {
  const saved = await db.begin(async (tx) => {
    const row = await tx.unsafe(
      "SELECT * FROM bank_linejs_events WHERE id=$1 AND user_id=$2 AND status='pending' FOR UPDATE",
      [event.id, userId],
    );
    if (!row.length) return false;
    const x = row[0];
    if (!x.amount_satang || !['expense', 'income'].includes(x.kind)) return false;
    const acct = await tx.unsafe('SELECT id FROM accounts WHERE id=$1 AND user_id=$2', [
      accountId,
      userId,
    ]);
    if (!acct.length) throw Error('กรุณาเลือกบัญชีเงินที่ถูกต้องก่อนบันทึก');
    const category = await tx.unsafe(
      "SELECT id FROM categories WHERE user_id=$1 AND kind=$2 ORDER BY (name='อื่นๆ') DESC,name LIMIT 1",
      [userId, x.kind],
    );
    const inserted = await tx.unsafe(
      "INSERT INTO transactions(user_id,account_id,category_id,kind,amount_satang,merchant,note,source,source_message_id) VALUES($1,$2,$3,$4,$5,$6,$7,'bank_linejs',$8) ON CONFLICT(user_id,source_message_id) DO NOTHING RETURNING id",
      [
        userId,
        accountId,
        category[0]?.id || null,
        x.kind,
        x.amount_satang,
        x.summary,
        'นำเข้าจากแจ้งเตือนธนาคารผ่าน LINEJS',
        'bankline:' + x.event_hash,
      ],
    );
    if (!inserted.length) throw Error('ตรวจพบรายการที่เคยบันทึกแล้ว');
    await tx.unsafe(
      "UPDATE bank_linejs_events SET status='saved',transaction_id=$1,reason=NULL WHERE id=$2 AND user_id=$3",
      [inserted[0].id, event.id, userId],
    );
    return true;
  });
  return saved;
}

/** Web configuration and source-aware bank notification ingestion bridge.
 * Worker calls are bearer-only, MID-allowlisted, and deduplicated by message ID.
 */
export function createBankLineJsRoutes(db: Sql, guarded: Guarded, publish: PublishFn) {
  return (
    new Elysia({ name: 'moneyflow-bank-linejs' })
      .get(
        '/api/bank/linejs/settings',
        guarded(async (_ctx, userId) => {
          const row = await settings(db, userId);
          return { ok: true, settings: shapeSettings(row) };
        }),
      )
      .put(
        '/api/bank/linejs/settings',
        guarded(async (ctx, userId) => {
          if (rejectOrigin(ctx)) return { error: 'คำขอจากเว็บไม่ได้รับอนุญาต' };
          const body = ctx.body || {};
          const current = await settings(db, userId);
          const enabled = body.enabled === undefined ? current.enabled : body.enabled;
          const pushLine = body.pushLine === undefined ? current.push_line : body.pushLine;
          // The old booking modes remain removed. LINE OA receipt notification is independent.
          if (body.autoSave === true || body.autoTransfer === true) {
            ctx.set.status = 410;
            return { error: 'LINEJS อ่านเครื่องหมาย +/- และไม่ส่งแจ้งเตือน LINE OA' };
          }
          const bank = body.bank === undefined ? current.bank : body.bank;
          const senderMid = body.senderMid === undefined ? current.sender_mid : body.senderMid;
          const accountId = body.accountId === undefined ? current.account_id : body.accountId;
          if (typeof enabled !== 'boolean' || typeof pushLine !== 'boolean')
            throw Error('กรุณาเลือกสถานะสวิตช์ให้ถูกต้อง');
          if (!isBank(bank)) throw Error('เลือกธนาคารที่รองรับก่อน');
          if (senderMid !== null && senderMid !== '' && !validMid(senderMid))
            throw Error('LINE Sender MID ต้องเป็นตัวอักษร u ตามด้วยตัวเลข/อักษร 32 ตัว');
          if (accountId !== null && accountId !== '' && !isUuid(accountId))
            throw Error('กรุณาเลือกบัญชี MoneyFlow ที่ถูกต้อง');
          if (accountId) {
            const owned = await db`SELECT id FROM accounts WHERE user_id=${userId} AND id=${accountId}`;
            if (!owned.length) throw Error('บัญชีเงินที่เลือกไม่ใช่บัญชีของคุณ');
          }
          if (pushLine) {
            const linked = await db`SELECT 1 FROM line_links WHERE user_id=${userId} LIMIT 1`;
            if (!linked.length) throw Error('กรุณาเชื่อม LINE OA กับบัญชี MoneyFlow ก่อนเปิดแจ้งเตือน');
          }
          if (enabled && (!current.token_hash || !senderMid || !accountId))
            throw Error('กรุณาสร้างโทเค็น เช็ก Sender MID ของธนาคาร และเลือกบัญชีเงิน ก่อนเปิดใช้งาน');
          const rows = await db`
        UPDATE bank_linejs_settings
        SET enabled=${enabled},auto_save=false,auto_transfer=false,push_line=${pushLine},
          bank=${bank},sender_mid=${senderMid || null},account_id=${accountId || null},
          updated_at=now()
        WHERE user_id=${userId} RETURNING *
      `;
          // A hosted user finishing Sender MID/account setup is switched from
          // discovery into bank-listening mode without a terminal or restart.
          let connectorWarning = '';
          const updated = rows[0];
          if (
            updated.connector_mode === 'hosted' &&
            updated.connector_run_enabled &&
            updated.connector_token_encrypted
          ) {
            try {
              await hostedLineJsManager.start({
                userId,
                tokenEncrypted: updated.connector_token_encrypted,
                enabled: updated.enabled === true,
                senderMid: updated.sender_mid,
                accountId: updated.account_id,
              });
            } catch {
              connectorWarning =
                'บันทึกการตั้งค่าแล้ว แต่ Hosted LINEJS ยังเริ่มไม่ได้ กรุณากดเริ่มอีกครั้ง';
            }
          }
          publish(userId, 'settings.changed');
          return { ok: true, settings: shapeSettings(updated), connectorWarning };
        }),
      )
      // Old clients must not be able to re-enable the removed Auto Save mode.
      .put(
        '/api/bank/linejs/mode',
        guarded(async (ctx) => {
          if (rejectOrigin(ctx)) return { error: 'คำขอจากเว็บไม่ได้รับอนุญาต' };
          ctx.set.status = 410;
          return { error: 'ไม่มีโหมดการบันทึกให้เลือก ระบบอ่านเครื่องหมาย +/- โดยตรง' };
        }),
      )
      .post(
        '/api/bank/linejs/token',
        guarded(async (ctx, userId) => {
          if (rejectOrigin(ctx)) return { error: 'คำขอจากเว็บไม่ได้รับอนุญาต' };
          const newToken = 'mfbank_' + randomBytes(32).toString('hex');
          const current = await settings(db, userId);
          if (current.connector_mode === 'hosted') {
            ctx.set.status = 409;
            return { error: 'บัญชี Hosted LINEJS ต้องจัดการโทเค็นผ่านหน้าเชื่อม LINE เท่านั้น' };
          }
          await db`UPDATE bank_linejs_settings
        SET enabled=false,token_hash=${hash(newToken)},updated_at=now()
        WHERE user_id=${userId}
      `;
          publish(userId, 'settings.changed');
          return {
            ok: true,
            token: newToken,
            settings: { ...shapeSettings(current), enabled: false, tokenConfigured: true },
          };
        }),
      )
      .get(
        '/api/bank/linejs/events',
        guarded(async (_ctx, userId) => {
          const rows = await db`
        SELECT id,bank,kind,amount_satang,summary,status,reason,source_format,created_at,push_status
        FROM bank_linejs_events WHERE user_id=${userId} AND status='saved'
        ORDER BY created_at DESC LIMIT 100
      `;
          return { ok: true, events: rows };
        }),
      )
      .get(
        '/api/bank/linejs/local/status',
        guarded(async (ctx, userId) => {
          if (!requireLocalWeb(ctx)) return { error: 'ใช้ได้เฉพาะเครื่องนี้' };
          ctx.set.headers['Cache-Control'] = 'no-store';
          const conf = await settings(db, userId);
          return { ok: true, agent: lineJsLocalManager.status(userId, conf.token_hash) };
        }),
      )
      .post(
        '/api/bank/linejs/local/connect',
        guarded(async (ctx, userId) => {
          if (rejectOrigin(ctx) || !requireLocalWeb(ctx)) return { error: 'คำขอไม่ได้รับอนุญาต' };
          const conf = await settings(db, userId);
          if (conf.connector_mode === 'hosted') {
            ctx.set.status = 409;
            return { error: 'บัญชีนี้ใช้ Hosted LINEJS อยู่ กรุณายกเลิกเชื่อม Hosted ก่อน' };
          }
          const agent = lineJsLocalManager.status(userId, conf.token_hash);
          if (!agent.available) throw Error(agent.reason || 'Local Agent ไม่พร้อมใช้');
          if (agent.running || agent.externalRunning) throw Error('กรุณาหยุด Worker เดิมก่อนเชื่อมใหม่');
          const nextToken = 'mfbank_' + randomBytes(32).toString('hex');
          lineJsLocalManager.configure(userId, nextToken, Number(process.env.APP_PORT || 3011));
          await db`UPDATE bank_linejs_settings
          SET token_hash=${hash(nextToken)},enabled=false,updated_at=now()
          WHERE user_id=${userId}`;
          publish(userId, 'settings.changed');
          return {
            ok: true,
            settings: { ...shapeSettings(conf), enabled: false, tokenConfigured: true },
            agent: lineJsLocalManager.status(userId, hash(nextToken)),
          };
        }),
      )
      .post(
        '/api/bank/linejs/local/start',
        guarded(async (ctx, userId) => {
          if (rejectOrigin(ctx) || !requireLocalWeb(ctx)) return { error: 'คำขอไม่ได้รับอนุญาต' };
          const conf = await settings(db, userId);
          lineJsLocalManager.start(
            userId,
            conf.token_hash,
            conf.enabled,
            conf.sender_mid,
            Number(process.env.APP_PORT || 3011),
          );
          return { ok: true, agent: lineJsLocalManager.status(userId, conf.token_hash) };
        }),
      )
      .post(
        '/api/bank/linejs/local/stop',
        guarded(async (ctx, userId) => {
          if (rejectOrigin(ctx) || !requireLocalWeb(ctx)) return { error: 'คำขอไม่ได้รับอนุญาต' };
          const conf = await settings(db, userId);
          lineJsLocalManager.stop(userId);
          return { ok: true, agent: lineJsLocalManager.status(userId, conf.token_hash) };
        }),
      )
      .get('/api/integrations/linejs/status', async (ctx: any) => {
        const header = String(ctx.request.headers.get('authorization') || '');
        if (!/^Bearer mfbank_[0-9a-f]{64}$/.test(header)) {
          ctx.set.status = 401;
          return { error: 'โทเค็น Worker ไม่ถูกต้อง' };
        }
        const rows = await db`
        SELECT enabled,connector_mode,connector_run_enabled,
          (sender_mid IS NOT NULL) AS sender_configured,
          (account_id IS NOT NULL) AS account_configured
        FROM bank_linejs_settings WHERE token_hash=${hash(header.slice(7))} LIMIT 1
      `;
        if (!rows.length) {
          ctx.set.status = 401;
          return { error: 'ไม่พบโทเค็น Worker' };
        }
        return {
          ok: true,
          enabled:
            rows[0].enabled && (rows[0].connector_mode !== 'hosted' || rows[0].connector_run_enabled),
          configured: rows[0].sender_configured && rows[0].account_configured,
        };
      })
      .post('/api/integrations/linejs/event', async (ctx: any) => {
        const header = String(ctx.request.headers.get('authorization') || '');
        if (!/^Bearer mfbank_[0-9a-f]{64}$/.test(header)) {
          ctx.set.status = 401;
          return { error: 'โทเค็นตัวรับแจ้งเตือนไม่ถูกต้อง' };
        }
        const bearer = header.slice(7);
        const confRows = await db`
        SELECT * FROM bank_linejs_settings
        WHERE token_hash=${hash(bearer)} LIMIT 1
      `;
        if (!confRows.length) {
          ctx.set.status = 401;
          return { error: 'ไม่พบโทเค็นตัวรับแจ้งเตือน' };
        }
        const conf = confRows[0],
          userId = conf.user_id;
        if (!conf.enabled || (conf.connector_mode === 'hosted' && !conf.connector_run_enabled))
          return { ok: true, status: 'paused' };
        const b = ctx.body || {};
        // Source class is provided by LINEJS; never store its raw chat metadata.
        const sourceFormat: SafeBankSource = [
          'text',
          'flex_nodes',
          'flex_partial',
          'flex_fallback',
          'unreadable',
        ].includes(b.sourceFormat)
          ? b.sourceFormat
          : 'legacy';
        const senderMid = b.senderMid,
          id = b.messageId,
          text = b.text,
          altText = b.altText === undefined ? '' : b.altText,
          rawText = b.rawText === undefined ? '' : b.rawText;
        if (
          !validMid(senderMid) ||
          typeof id !== 'string' ||
          !/^\d{5,30}$/.test(id) ||
          typeof text !== 'string' ||
          text.length > 3500 ||
          typeof altText !== 'string' ||
          altText.length > 400 ||
          typeof rawText !== 'string' ||
          rawText.length > 500 ||
          text.length + altText.length + rawText.length < 4
        ) {
          ctx.set.status = 400;
          return { error: 'ข้อมูลข้อความจาก LINEJS ไม่ถูกต้อง' };
        }
        if (senderMid.toLowerCase() !== String(conf.sender_mid || '').toLowerCase()) {
          ctx.set.status = 403;
          return { error: 'ผู้ส่งไม่ตรงกับ LINE Sender MID ของธนาคาร' };
        }
        const eventHash = hash(senderMid.toLowerCase() + ':' + id);
        const prev = await db`
        SELECT status FROM bank_linejs_events WHERE user_id=${userId}
        AND event_hash=${eventHash} LIMIT 1
      `;
        if (prev.length) return { ok: true, status: 'duplicate' };
        // Restore the previous ALT_TEXT + Flex reading path, while keeping
        // each source separate so a generic caption cannot override a signed
        // transaction or introduce a balance as the transaction amount.
        if (!['text', 'flex_nodes', 'flex_fallback'].includes(sourceFormat))
          return { ok: true, status: 'ignored', pushed: false };

        const parsed = parseBankAlertFromSources({ text, altText, rawText }, conf.bank);
        if (!conf.account_id) return { ok: true, status: 'ignored', pushed: false };
        if (!parsed) {
          // When LINE OA notifications are enabled, never leave an
          // unrecognized bank transaction completely silent. Store only a
          // deduplication hash and a generic reason, not message contents.
          const transactionAmountVisible = /\d[\d,]*\.\d{2}/.test(text);
          if (
            !conf.push_line ||
            !transactionAmountVisible ||
            (sourceFormat !== 'text' && sourceFormat !== 'flex_nodes')
          ) {
            return { ok: true, status: 'ignored', pushed: false };
          }
          const ignored = await db`
            INSERT INTO bank_linejs_events
              (user_id,event_hash,sender_mid,bank,kind,amount_satang,
               summary,source_format,status,reason)
            VALUES (
              ${userId},${eventHash},${senderMid.toLowerCase()},${String(conf.bank)},
              NULL,NULL,'แจ้งเตือนธนาคารที่ยังอ่านประเภทเงินไม่ได้',
              ${sourceFormat},'ignored','ข้อความธนาคารไม่มีทิศทางหรือยอดที่ยืนยันได้'
            )
            ON CONFLICT(user_id,event_hash) DO NOTHING RETURNING id
          `;
          if (!ignored.length) return { ok: true, status: 'duplicate', pushed: false };
          const pushed = await pushUnrecognizedBankAlert(db, userId, ignored[0].id, String(conf.bank));
          return { ok: true, status: 'ignored', pushed };
        }

        const inserted = await db`
          INSERT INTO bank_linejs_events
            (user_id,event_hash,sender_mid,bank,kind,amount_satang,summary,source_format,status,reason)
          VALUES(
            ${userId},${eventHash},${senderMid.toLowerCase()},${parsed.bank},
            ${parsed.kind},${parsed.amountSatang},${parsed.merchant},
            ${sourceFormat},'pending',NULL
          )
          ON CONFLICT(user_id,event_hash) DO NOTHING RETURNING id
        `;
        if (!inserted.length) return { ok: true, status: 'duplicate', pushed: false };

        let saved = false;
        try {
          saved = await saveBankEvent(db, userId, { id: inserted[0].id }, conf.account_id);
        } catch {
          console.warn('LINEJS signed transaction import could not be completed');
        }
        if (saved) {
          try {
            await db`
              UPDATE bank_linejs_settings SET last_event_at=now()
              WHERE user_id=${userId}
            `;
          } catch {
            // A timestamp update must not change the outcome of a committed transaction.
          }
          publish(userId, 'finance.changed');
          const pushed =
            conf.push_line === true ? await pushBankReceipt(db, userId, inserted[0].id, parsed) : false;
          return { ok: true, status: 'saved', pushed };
        }

        // Failed imports are skipped, not placed into a manual review queue.
        await db`
          UPDATE bank_linejs_events
          SET status='ignored',reason='นำเข้ารายการไม่สำเร็จ'
          WHERE id=${inserted[0].id} AND user_id=${userId} AND status='pending'
        `;
        return { ok: true, status: 'ignored', pushed: false };
      })
  );
}
