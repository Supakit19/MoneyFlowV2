import type { Sql } from 'postgres';
import { parseLineLoginCommand, isLineLoginAttempt } from '../shared/line-login.ts';
import { createHash } from 'node:crypto';
import type { GoogleGenAI } from '@google/genai';
import {
  getPreferences,
  weeklyStatus,
  monthStatus,
  monthCategoryChart,
  coachMessage,
  mustConfirm,
  formatBaht,
  deterministicCoach,
  weekRange,
  budgetTier,
  type WeeklyStatus,
} from './moneyflow-features.ts';
import {
  receiptCard,
  summaryCard,
  daySummaryCard,
  weeklyCard,
  barChartCard,
  simpleHelpCard,
} from './line-flex.ts';
import type { PublishFn } from './realtime.ts';

type Item = {
  kind: 'expense' | 'income';
  amount: number;
  merchant: string;
  category: string;
  note: string;
  confidence?: number;
};
type Send = (to: string, message: any, replyToken?: string) => Promise<void>;
type Extract = (
  text: string,
  base64?: string,
  mime?: string,
) => Promise<{ items: any[]; query: string | null }>;
type BotDeps = {
  db: Sql;
  send: Send;
  extract: Extract;
  publish: PublishFn;
  ai: () => GoogleGenAI | null;
};
const h = (s: string) => createHash('sha256').update(s).digest('hex');
const lineErr = (message: string) => ({ type: 'text', text: message.slice(0, 4500) });
const validAmount = (n: any) => {
  const a = Number(n);
  if (!Number.isFinite(a) || a <= 0 || a > 1e7) throw Error('จำนวนเงินไม่ถูกต้อง');
  return Math.round((a + Number.EPSILON) * 100);
};
const inBangkok = (at: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
const fromAndToToday = (at: Date) => {
  const today = inBangkok(at);
  const dt = new Date(today + 'T00:00:00Z');
  return [
    today + 'T00:00:00+07:00',
    new Date(dt.getTime() + 86400000).toISOString().slice(0, 10) + 'T00:00:00+07:00',
  ];
};
function cleanItems(rows: any[]): Item[] {
  const items: Item[] = [];
  for (const r of rows.slice(0, 15)) {
    if (!['income', 'expense'].includes(r?.kind)) continue;
    const amount = Number(r.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e7) continue;
    items.push({
      kind: r.kind,
      amount: validAmount(amount) / 100,
      merchant: String(r.merchant || r.category || 'รายการใหม่')
        .trim()
        .slice(0, 120),
      category: String(r.category || 'อื่นๆ').slice(0, 60),
      note: String(r.note || '').slice(0, 500),
      confidence: r.confidence === undefined ? undefined : Number(r.confidence),
    });
  }
  return items;
}
async function saveItems(db: Sql, userId: string, items: Item[], sourceKey: string): Promise<number> {
  return await db.begin(async (tx) => {
    const accounts = await tx.unsafe('SELECT id FROM accounts WHERE user_id=$1 ORDER BY name LIMIT 1', [
      userId,
    ]);
    if (!accounts.length) throw Error('ไม่พบบัญชีเงิน');
    let count = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const categories = await tx.unsafe(
        'SELECT id FROM categories WHERE user_id=$1 AND kind=$2 AND name=$3 LIMIT 1',
        [userId, item.kind, item.category],
      );
      const other = categories.length
        ? categories
        : await tx.unsafe(
            "SELECT id FROM categories WHERE user_id=$1 AND kind=$2 ORDER BY (name='อื่นๆ') DESC,name LIMIT 1",
            [userId, item.kind],
          );
      const inserted = await tx.unsafe(
        "INSERT INTO transactions(user_id,account_id,category_id,kind,amount_satang,merchant,note,source,source_message_id) VALUES($1,$2,$3,$4,$5,$6,$7,'line',$8) ON CONFLICT(user_id,source_message_id) DO NOTHING RETURNING id",
        [
          userId,
          accounts[0].id,
          other[0]?.id || null,
          item.kind,
          validAmount(item.amount),
          item.merchant,
          item.note,
          sourceKey + ':' + i,
        ],
      );
      if (inserted.length) count++;
    }
    return count;
  });
}
async function readLineImage(event: any): Promise<{ base64: string; mime: string }> {
  const msgId = String(event.message?.id || '');
  if (!/^[0-9]+$/.test(msgId)) throw Error('รหัสภาพไม่ถูกต้อง');
  const rr = await fetch('https://api-data.line.me/v2/bot/message/' + msgId + '/content', {
    headers: { Authorization: 'Bearer ' + process.env.LINE_CHANNEL_ACCESS_TOKEN },
    signal: AbortSignal.timeout(15000),
  });
  if (!rr.ok) throw Error('อ่านภาพจาก LINE ไม่สำเร็จ');
  const buffer = Buffer.from(await rr.arrayBuffer());
  if (buffer.byteLength > 6_000_000) throw Error('ภาพใหญ่เกิน 6MB');
  return {
    base64: buffer.toString('base64'),
    mime: rr.headers.get('content-type')?.split(';')[0] || 'image/jpeg',
  };
}
export async function handleLineMessage(event: any, { db, send, extract, publish, ai }: BotDeps) {
  const lineId = event.source?.userId;
  if (!lineId || !event.replyToken) return;
  const raw = String(event.message?.text || '').trim();
  const reply = async (message: any) => send(lineId, message, event.replyToken);
  const linked = await db.unsafe('SELECT user_id FROM line_links WHERE line_user_id=$1', [lineId]);

  // One-time LINE sign-in: Login 12345678 (also accepts the old Thai prefix).
  // Verify the linked LINE user ID before approving any browser challenge.
  const loginCode = parseLineLoginCommand(raw);
  if (loginCode) {
    if (!linked.length)
      return reply(
        lineErr(
          'LINE นี้ยังไม่เชื่อมกับบัญชี MoneyFlow ครับ เข้าเว็บก่อนแล้วเชื่อม LINE จากหน้าบัญชีและความปลอดภัย',
        ),
      );
    const code = loginCode;
    const matches = await db.unsafe(
      "UPDATE line_login_challenges SET status='approved',user_id=$1,approved_at=now() WHERE code_hash=$2 AND status='pending' AND expires_at>now() RETURNING id",
      [linked[0].user_id, h('line-login:' + code)],
    );
    return reply(
      lineErr(
        matches.length
          ? '✅ ยืนยันสำเร็จแล้ว! กลับไปที่หน้า MoneyFlow ระบบจะล็อกอินเข้าบัญชีเดิมให้อัตโนมัติครับ'
          : 'รหัสไม่ถูกต้อง หมดอายุ หรือใช้ไปแล้ว กรุณากลับไปหน้า MoneyFlow แล้วขอรหัสใหม่ครับ',
      ),
    );
  }
  if (isLineLoginAttempt(raw)) {
    return reply(
      lineErr(
        '🔐 วิธีเข้าสู่ระบบผ่าน LINE\n1. เปิดเว็บ MoneyFlow → เข้าสู่ระบบด้วย LINE → สร้างรหัส\n2. คัดลอกข้อความทั้งบรรทัด เช่น Login 12345678 (แทนด้วยรหัสจริงจากเว็บ)\n3. ส่งข้อความในแชตนี้ แล้วกลับไปหน้าเว็บ\n\nต้องพิมพ์ Login เว้นวรรค แล้วตามด้วยเลข 8 หลัก ไม่ใช่ส่งเลขอย่างเดียวครับ',
      ),
    );
  }
  if (/^เชื่อม\s*\d{6}$/.test(raw)) {
    const code = raw.match(/\d{6}/)![0];
    const result = await db.begin(async (tx) => {
      const codeRows = await tx.unsafe(
        'SELECT user_id FROM pair_codes WHERE code_hash=$1 AND expires_at>now() FOR UPDATE',
        [h(code)],
      );
      if (!codeRows.length) return 'expired';
      const l = await tx.unsafe('SELECT user_id FROM line_links WHERE line_user_id=$1', [lineId]);
      if (l.length && l[0].user_id !== codeRows[0].user_id) return 'linked';
      await tx.unsafe(
        'INSERT INTO line_links(user_id,line_user_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET line_user_id=excluded.line_user_id,linked_at=now()',
        [codeRows[0].user_id, lineId],
      );
      await tx.unsafe('DELETE FROM pair_codes WHERE code_hash=$1', [h(code)]);
      return codeRows[0].user_id as string;
    });
    if (result === 'expired') return reply(lineErr('รหัสหมดอายุแล้วครับ ขอรหัสใหม่จากเว็บ'));
    if (result === 'linked')
      return reply(
        lineErr('LINE นี้เชื่อมกับ MoneyFlow อีกบัญชีอยู่แล้ว กรุณายกเลิกการเชื่อมในบัญชีเดิมก่อน'),
      );
    publish(result, 'line.connected');
    return reply(
      lineErr('✅ เชื่อม LINE สำเร็จ! ตอนนี้บันทึกรายจ่าย ดูกราฟ และเข้าสู่ระบบผ่าน LINE ได้แล้ว'),
    );
  }

  if (!linked.length)
    return reply(
      lineErr(
        'ยินดีต้อนรับสู่ moneyflow. 💚\nเข้าเว็บ MoneyFlow → บัญชีและความปลอดภัย → สร้างรหัสเชื่อม LINE แล้วพิมพ์ เชื่อม 123456 (ใช้รหัสจริงจากเว็บ)',
      ),
    );

  const userId = linked[0].user_id as string;
  const settings = await getPreferences(db, userId);
  const week = await weeklyStatus(db, userId, new Date(), Number(settings.weekly_limit_satang));
  const monthly = async () => monthStatus(db, userId);

  if (/^(ช่วยเหลือ|เมนู|help|คำสั่ง)$/i.test(raw)) return reply(simpleHelpCard());
  if (/^(ตั้งค่า|เปิดเว็บ)$/i.test(raw))
    return reply(
      lineErr(
        'เข้าเว็บ MoneyFlow → LINE & AI เพื่อปรับงบรายสัปดาห์ บุคลิก AI และโหมดการยืนยันรายการครับ',
      ),
    );

  if (/^(ยืนยัน|ตกลง|บันทึก)$/i.test(raw)) {
    const p = await db.unsafe(
      'SELECT * FROM pending WHERE user_id=$1 AND line_user_id=$2 AND expires_at>now() ORDER BY expires_at DESC LIMIT 1',
      [userId, lineId],
    );
    if (!p.length)
      return reply(lineErr('ไม่มีรายการรอยืนยันครับ หากต้องการบันทึกส่งข้อความ เช่น กาแฟ 45 บาท'));
    const stored = typeof p[0].items === 'string' ? JSON.parse(p[0].items) : p[0].items;
    const items = cleanItems(Array.isArray(stored) ? stored : []);
    if (!items.length) return reply(lineErr('รายการรอยืนยันอ่านไม่ได้ กรุณาส่งข้อมูลใหม่ก่อนบันทึก'));
    const count = await saveItems(db, userId, items, 'pending:' + p[0].id);
    await db.unsafe('DELETE FROM pending WHERE id=$1 AND user_id=$2', [p[0].id, userId]);
    if (count) publish(userId, 'finance.changed');
    const next = await weeklyStatus(db, userId, new Date(), Number(settings.weekly_limit_satang));
    const coach = await composeCoach(db, userId, next, settings, ai);
    return reply(receiptCard(items, next, coach, true));
  }
  if (/^(ยกเลิก|ไม่บันทึก)$/i.test(raw)) {
    await db.unsafe('DELETE FROM pending WHERE user_id=$1 AND line_user_id=$2', [userId, lineId]);
    return reply(lineErr('ยกเลิกรายการรอบนี้แล้วครับ 💚'));
  }

  if (/^(สรุปสัปดาห์|งบคงเหลือ|เหลืองบ)$/i.test(raw)) {
    return reply(weeklyCard(week, deterministicCoach(week, settings.coach_tone)));
  }
  if (/^(สรุปเดือนนี้|สรุปเดือน|ยอดเดือนนี้|เดือนนี้)$/i.test(raw)) {
    return reply(summaryCard(await monthly(), week));
  }
  if (/^(สรุปวันนี้|วันนี้)$/i.test(raw)) {
    const [from, to] = fromAndToToday(new Date());
    const rows = await db.unsafe(
      "SELECT kind,COALESCE(SUM(amount_satang),0)::text total FROM transactions WHERE user_id=$1 AND transacted_at>=$2::timestamptz AND transacted_at<$3::timestamptz AND kind IN('income','expense') GROUP BY kind",
      [userId, from, to],
    );
    const income = Number(rows.find((row) => row.kind === 'income')?.total || 0);
    const expense = Number(rows.find((row) => row.kind === 'expense')?.total || 0);
    return reply(daySummaryCard(weekRange().today, expense, income, week));
  }
  if (/^(กราฟสัปดาห์|กราฟรายสัปดาห์)$/i.test(raw)) {
    return reply(
      barChartCard(
        'กราฟรายจ่าย 7 วัน',
        'วันจันทร์ถึงอาทิตย์',
        week.daily.map((r) => ({ label: r.label, spentSatang: r.spentSatang })),
      ),
    );
  }
  if (/^(กราฟเดือนนี้|กราฟเดือน|กราฟรายจ่าย|หมวดไหนใช้เยอะสุด)$/i.test(raw)) {
    const cats = await monthCategoryChart(db, userId);
    return reply(
      barChartCard(
        'รายจ่ายตามหมวดหมู่',
        'เดือน ' + cats.month,
        cats.categories.map((r) => ({ label: r.label, spentSatang: r.spentSatang })),
        'สรุปเดือนนี้',
      ),
    );
  }
  if (/^(เหลือใช้วันละเท่าไหร่|ใช้วันละเท่าไหร่)$/i.test(raw)) {
    if (!week.limitSatang)
      return reply(
        lineErr('ยังไม่ได้ตั้งงบรายสัปดาห์ ไปที่เว็บ MoneyFlow → งบประมาณ เพื่อตั้งงบก่อนครับ'),
      );
    return reply(
      lineErr(
        '💚 สัปดาห์นี้ใช้อีกได้วันละประมาณ ' +
          formatBaht(Math.max(0, week.remainingSatang) / (week.daysLeftInWeek + 1)) +
          '\nเหลือ ' +
          formatBaht(Math.max(0, week.remainingSatang)) +
          ' จากงบ ' +
          formatBaht(week.limitSatang) +
          '\nอีก ' +
          week.daysLeftInWeek +
          ' วันก่อนขึ้นสัปดาห์ใหม่',
      ),
    );
  }
  if (/^(เป้าหมายการออม|การออม)$/i.test(raw)) {
    const month = await monthly();
    const target = Number(settings.savings_goal_satang);
    return reply(
      lineErr(
        target > 0
          ? '🎯 เป้าหมายออมเดือนนี้ ' +
              formatBaht(target) +
              '\nสุทธิรายรับ-รายจ่าย ' +
              formatBaht(month.savedSatang) +
              '\n' +
              (month.savedSatang >= target
                ? 'ทำได้ตามเป้าแล้ว!'
                : 'ยังขาด ' + formatBaht(target - month.savedSatang) + ' ก่อนถึงเป้าหมาย')
          : 'ยังไม่ได้ตั้งเป้าหมายออมในเว็บ MoneyFlow',
      ),
    );
  }

  let photo = false,
    imageData: { base64: string; mime: string } | undefined;
  if (event.message?.type === 'image') {
    photo = true;
    imageData = await readLineImage(event);
  }
  if (!photo && !raw) return;
  const extracted = await extract(raw, imageData?.base64, imageData?.mime);
  if (extracted.query === 'summary') return reply(summaryCard(await monthly(), week));
  const items = cleanItems(extracted.items || []);
  if (!items.length) {
    if (extracted.query === 'transfer_review')
      return reply(
        lineErr(
          'พบสลิปโอนเงิน แต่ยังอ่านจำนวนเงินที่โอนได้ไม่ชัดครับ เพื่อไม่ให้บันทึกผิด กรุณาพิมพ์ เช่น "จ่าย 45 บาท ค่าอาหาร" แล้วตรวจรายการก่อนยืนยัน',
        ),
      );
    return reply(lineErr('ยังไม่พบรายการครับ ลองส่ง "กาแฟ 55" หรือรูปใบเสร็จที่อ่านได้ชัด'));
  }
  // Text that sounds like a question or a bank transfer should never auto-post.
  const queryLike = /\?|เท่าไหร่|ไหม|หรือไม่|โอนไป|โอนจาก/.test(raw);
  // A transfer slip may be payment or movement between the user's own accounts.
  // Never post it automatically, even when the user's setting is "auto".
  const transferReview = extracted.query === 'transfer_review';
  const confirm = transferReview || queryLike || mustConfirm(settings.confirmation_mode, items, photo);
  if (confirm) {
    await db.unsafe('DELETE FROM pending WHERE user_id=$1 AND line_user_id=$2', [userId, lineId]);
    await db.unsafe(
      "INSERT INTO pending(user_id,line_user_id,items,expires_at) VALUES($1,$2,$3::jsonb,now()+interval '15 minutes')",
      [userId, lineId, JSON.stringify(items)],
    );
    const estimate = items
      .filter((x) => x.kind === 'expense')
      .reduce((sum, x) => sum + validAmount(x.amount), 0);
    const projected = {
      ...week,
      spentSatang: week.spentSatang + estimate,
      remainingSatang: week.remainingSatang - estimate,
      progress: week.limitSatang ? (week.spentSatang + estimate) / week.limitSatang : 0,
      tier: budgetTier(week.spentSatang + estimate, week.limitSatang, week.daysElapsedInWeek),
    };
    return reply(
      receiptCard(
        items,
        projected,
        transferReview
          ? '⚠️ สลิปโอนเงิน: หากเป็นการโอนระหว่างบัญชีตัวเอง หรือ LINEJS บันทึกไปแล้ว ให้กดยกเลิก อย่ายืนยันซ้ำ'
          : 'โปรดตรวจรายการก่อนกดยืนยัน รายการนี้ยังไม่ถูกบันทึก',
        false,
      ),
    );
  }
  const count = await saveItems(
    db,
    userId,
    items,
    'auto:' + String(event.message?.id || event.webhookEventId || 'unknown'),
  );
  if (count) publish(userId, 'finance.changed');
  const next = await weeklyStatus(db, userId, new Date(), Number(settings.weekly_limit_satang));
  const coach = count ? await composeCoach(db, userId, next, settings, ai) : '';
  return reply(receiptCard(items, next, coach, true));
}

async function composeCoach(
  db: Sql,
  userId: string,
  week: WeeklyStatus,
  settings: any,
  ai: () => GoogleGenAI | null,
) {
  if (settings.coach_alerts === 'off' || week.tier === 'ok') return '';
  const model = ai();
  // Chat replies must be fast to preserve LINE replyToken; fallback uses tested templates.
  const fastGenerate = model
    ? async (prompt: string) => {
        const response = await model.models.generateContent({
          model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
          contents: prompt,
          config: { temperature: 0.75, maxOutputTokens: 120 },
        });
        return String(response.text || '').trim();
      }
    : undefined;
  if (!fastGenerate) return coachMessage(db, userId, week, settings);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<string>((_, reject) => {
      timer = setTimeout(() => reject(Error('COACH_TIMEOUT')), 1400);
    });
    return await coachMessage(db, userId, week, settings, async (prompt) =>
      Promise.race([fastGenerate(prompt), timeout]),
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}
