import { formatBaht, type WeeklyStatus } from './moneyflow-features.ts';

type Item = { kind: string; amount: number; merchant?: string; category?: string; note?: string };
type FlexNode = Record<string, any>;
const P = {
  pine: '#123D32',
  pine2: '#205A46',
  ink: '#193F32',
  soft: '#729080',
  faded: '#98A99D',
  lime: '#C8ED98',
  mint: '#E9F6ED',
  line: '#E4ECE5',
  paper: '#FFFFFF',
  canvas: '#F8FBF7',
  green: '#11986D',
  red: '#CF6257',
  warm: '#D38D48',
  amberBg: '#FFF5E6',
  redBg: '#FFF0EC',
};
const txt = (value: unknown, size = 'sm', color = P.ink, weight = 'regular'): FlexNode => ({
  type: 'text',
  text: String(value ?? '').slice(0, 450),
  size,
  color,
  weight,
  wrap: true,
});
const hbox = (contents: FlexNode[], spacing = 'sm'): FlexNode => ({
  type: 'box',
  layout: 'horizontal',
  contents,
  spacing,
});
const vbox = (contents: FlexNode[], spacing = 'sm'): FlexNode => ({
  type: 'box',
  layout: 'vertical',
  contents,
  spacing,
});
const rule = (): FlexNode => ({ type: 'separator', margin: 'md', color: P.line });
const button = (label: string, message: string, primary = false): FlexNode => ({
  type: 'button',
  style: primary ? 'primary' : 'secondary',
  height: 'sm',
  ...(primary ? { color: P.pine2 } : {}),
  action: { type: 'message', label, text: message },
});
const linkButton = (label: string, url: string): FlexNode => ({
  type: 'button',
  style: 'primary',
  height: 'sm',
  color: P.pine2,
  action: { type: 'uri', label, uri: url },
});
const card = (label: string, amount: string, color = P.ink, bg = P.canvas): FlexNode => ({
  type: 'box',
  layout: 'vertical',
  backgroundColor: bg,
  cornerRadius: '13px',
  paddingAll: '13px',
  contents: [txt(label, 'xxs', P.soft, 'bold'), txt(amount, 'lg', color, 'bold')],
  spacing: 'sm',
  flex: 1,
});
const eyebrow = (value: string, color = P.soft): FlexNode => txt(value, 'xxs', color, 'bold');
const detailRow = (label: string, value: string, color = P.ink): FlexNode =>
  hbox(
    [
      { ...txt(label, 'sm', P.soft), flex: 1 },
      { ...txt(value, 'sm', color, 'bold'), align: 'end', flex: 1 },
    ],
    'sm',
  );
const subCard = (items: FlexNode[], background = P.canvas): FlexNode => ({
  type: 'box',
  layout: 'vertical',
  cornerRadius: '15px',
  backgroundColor: background,
  paddingAll: '15px',
  spacing: 'md',
  contents: items,
});
const pill = (label: string, background = P.mint, color = P.green): FlexNode => ({
  type: 'box',
  layout: 'vertical',
  backgroundColor: background,
  cornerRadius: '12px',
  paddingAll: '7px',
  contents: [txt(label, 'xxs', color, 'bold')],
});
const makeBubble = (
  title: string,
  subtitle: string,
  body: FlexNode[],
  actions?: FlexNode[],
  badge = 'MONEYFLOW • FINANCE',
): FlexNode => ({
  type: 'bubble',
  size: 'mega',
  styles: {
    header: { backgroundColor: P.pine },
    body: { backgroundColor: P.paper },
    footer: { backgroundColor: P.paper, separator: true, separatorColor: P.line },
  },
  header: {
    ...vbox(
      [
        hbox([
          { ...txt('●  moneyflow.', 'md', P.lime, 'bold'), flex: 1 },
          { ...txt('YOUR MONEY, IN FLOW', 'xxs', '#B4D4C0'), align: 'end', flex: 1 },
        ]),
        {
          type: 'box',
          layout: 'vertical',
          height: '2px',
          width: '48px',
          backgroundColor: P.lime,
          contents: [],
        },
        txt(badge, 'xxs', '#A5D1B9', 'bold'),
        txt(title, 'xl', P.paper, 'bold'),
        txt(subtitle, 'xs', '#D1E7D9'),
      ],
      'sm',
    ),
    paddingAll: '20px',
  },
  body: { ...vbox(body, 'md'), paddingAll: '20px' },
  ...(actions?.length ? { footer: { ...vbox([hbox(actions, 'sm')], 'sm'), paddingAll: '13px' } } : {}),
});
export function flexMessage(altText: string, bubble: FlexNode, quick?: string[]): FlexNode {
  const result: FlexNode = { type: 'flex', altText: altText.slice(0, 350), contents: bubble };
  if (quick?.length)
    result.quickReply = {
      items: quick.slice(0, 7).map((value) => ({
        type: 'action',
        action: { type: 'message', label: value.slice(0, 20), text: value },
      })),
    };
  return result;
}
const percentage = (numerator: number, denominator: number) =>
  denominator > 0 ? Math.max(0, Math.round((numerator / denominator) * 100)) : 0;
const meter = (spent: number, limit: number, color = P.green): FlexNode => ({
  type: 'box',
  layout: 'horizontal',
  height: '9px',
  backgroundColor: P.line,
  cornerRadius: '6px',
  contents: [
    {
      type: 'box',
      layout: 'vertical',
      height: '9px',
      width: Math.max(1, Math.min(100, percentage(spent, limit))) + '%',
      cornerRadius: '6px',
      backgroundColor: color,
      contents: [],
    },
  ],
});
const weeklyBlock = (week: WeeklyStatus): FlexNode => {
  if (!week.limitSatang)
    return subCard([
      hbox([{ ...txt('งบประจำสัปดาห์', 'sm', P.ink, 'bold'), flex: 1 }, pill('ยังไม่ตั้งงบ')]),
      txt('ตั้งงบสัปดาห์บนเว็บหรือสมุดเงิน เพื่อดูว่าแต่ละวันใช้เพิ่มได้อีกเท่าไหร่', 'xs', P.soft),
    ]);
  const percent = percentage(week.spentSatang, week.limitSatang);
  const over = week.spentSatang > week.limitSatang;
  const color = over ? P.red : percent >= 90 ? P.warm : P.green;
  return subCard([
    hbox([
      { ...txt('งบของสัปดาห์นี้', 'sm', P.ink, 'bold'), flex: 1 },
      pill(percent + '%', over ? P.redBg : percent >= 90 ? P.amberBg : P.mint, color),
    ]),
    meter(week.spentSatang, week.limitSatang, color),
    hbox([
      {
        ...vbox([eyebrow('ใช้ไป'), txt(formatBaht(week.spentSatang), 'md', P.ink, 'bold')], 'xs'),
        flex: 1,
      },
      {
        ...vbox(
          [
            eyebrow(over ? 'เกินงบ' : 'ยังเหลือ'),
            txt(formatBaht(Math.abs(week.remainingSatang)), 'md', color, 'bold'),
          ],
          'xs',
        ),
        flex: 1,
      },
    ]),
    txt('อีก ' + week.daysLeftInWeek + ' วัน จะเริ่มงบสัปดาห์ใหม่', 'xs', P.soft),
  ]);
};
const itemRows = (items: Item[]) =>
  items.slice(0, 6).map((item) => {
    const isIncome = item.kind === 'income';
    return hbox(
      [
        {
          type: 'box',
          layout: 'vertical',
          width: '32px',
          height: '32px',
          cornerRadius: '10px',
          backgroundColor: isIncome ? P.mint : P.amberBg,
          contents: [
            { ...txt(isIncome ? '↓' : '↑', 'md', isIncome ? P.green : P.warm, 'bold'), align: 'center' },
          ],
        },
        {
          ...vbox(
            [
              txt(item.merchant?.trim() || 'รายการใหม่', 'sm', P.ink, 'bold'),
              txt(item.category || 'รายการเงิน', 'xxs', P.soft),
            ],
            'xs',
          ),
          flex: 1,
        },
        {
          ...txt(
            (isIncome ? '+' : '−') + formatBaht(Math.round(Number(item.amount) * 100)),
            'sm',
            isIncome ? P.green : P.ink,
            'bold',
          ),
          align: 'end',
        },
      ],
      'sm',
    );
  });

export function receiptCard(items: Item[], week: WeeklyStatus, notice: string, confirmed: boolean) {
  const total = items.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0);
  const body: FlexNode[] = [
    hbox([
      eyebrow(confirmed ? 'บันทึกรายการสำเร็จ' : 'กำลังรอคุณตรวจสอบ', confirmed ? P.green : P.warm),
      pill(items.length + ' รายการ'),
    ]),
    txt(formatBaht(total), 'xxl', P.ink, 'bold'),
    txt(
      confirmed ? 'รายการนี้อยู่ในสมุดเงินของคุณแล้ว' : 'ตรวจชื่อรายการ ยอดเงิน และหมวดหมู่ก่อนกดยืนยัน',
      'xs',
      P.soft,
    ),
    rule(),
    ...itemRows(items),
  ];
  if (items.length > 6) body.push(txt('และอีก ' + (items.length - 6) + ' รายการ', 'xs', P.soft));
  if (week.limitSatang) body.push(rule(), weeklyBlock(week));
  if (notice)
    body.push(
      subCard(
        [eyebrow('✦ ข้อสังเกตจากผู้ช่วย', P.warm), txt(notice, 'sm', P.ink)],
        week.progress >= 1 ? P.redBg : P.amberBg,
      ),
    );
  return flexMessage(
    confirmed
      ? 'MoneyFlow บันทึกรายการ ' + items.length + ' รายการแล้ว'
      : 'MoneyFlow รอตรวจสอบ ' + items.length + ' รายการ',
    makeBubble(
      confirmed ? 'บันทึกเรียบร้อย ✓' : 'เช็กรายการอีกนิด',
      confirmed ? 'ทุกยอดมีที่อยู่ในสมุดเงินแล้ว' : 'ตรวจให้ชัวร์ก่อนเข้าบัญชี',
      body,
      confirmed
        ? [button('สรุปสัปดาห์', 'สรุปสัปดาห์'), button('ดูกราฟ', 'กราฟเดือนนี้', true)]
        : [button('ยกเลิก', 'ยกเลิก'), button('ยืนยันบันทึก', 'ยืนยัน', true)],
      confirmed ? 'TRANSACTION SAVED' : 'REVIEW BEFORE SAVING',
    ),
    confirmed ? ['สรุปวันนี้', 'สรุปเดือนนี้', 'กราฟสัปดาห์'] : undefined,
  );
}
export function summaryCard(
  month: { month: string; incomeSatang: number; expenseSatang: number; savedSatang: number },
  week?: WeeklyStatus,
) {
  const surplus = month.savedSatang >= 0;
  const body: FlexNode[] = [
    eyebrow('เดือน ' + month.month + ' / ภาพรวม'),
    subCard(
      [
        eyebrow(surplus ? 'เงินคงเหลือสุทธิ' : 'รายจ่ายมากกว่ารายรับ'),
        txt(formatBaht(month.savedSatang), 'xxl', surplus ? P.pine : P.red, 'bold'),
        txt('รายรับ − รายจ่าย ในเดือนนี้', 'xs', P.soft),
      ],
      surplus ? P.mint : P.redBg,
    ),
    hbox([
      card('↙ เงินเข้า', formatBaht(month.incomeSatang), P.green, P.canvas),
      card('↗ เงินออก', formatBaht(month.expenseSatang), P.red, P.canvas),
    ]),
  ];
  if (week) body.push(weeklyBlock(week));
  return flexMessage(
    'MoneyFlow สรุปเดือน ' + month.month,
    makeBubble(
      'เงินเดือนนี้เป็นยังไง',
      'รายรับ รายจ่าย และงบที่ยังใช้ได้',
      body,
      [button('ดูรายจ่าย', 'กราฟเดือนนี้', true), button('งบสัปดาห์', 'สรุปสัปดาห์')],
      'MONTHLY INSIGHT',
    ),
    ['กราฟสัปดาห์', 'หมวดไหนใช้เยอะสุด', 'สรุปวันนี้'],
  );
}
export function daySummaryCard(date: string, spent: number, income: number, week: WeeklyStatus) {
  const body: FlexNode[] = [
    eyebrow('วันที่ ' + date),
    subCard([eyebrow('ใช้ไปวันนี้'), txt(formatBaht(spent), 'xxl', P.ink, 'bold')], P.canvas),
    hbox([card('↙ รายรับ', formatBaht(income), P.green), card('↗ รายจ่าย', formatBaht(spent), P.red)]),
    weeklyBlock(week),
  ];
  return flexMessage(
    'MoneyFlow สรุปวันนี้ ' + date,
    makeBubble(
      'วันนี้เงินเป็นยังไง',
      'เห็นยอดวันนี้แบบไม่ต้องคำนวณเอง',
      body,
      [button('สรุปสัปดาห์', 'สรุปสัปดาห์', true), button('ดูกราฟ', 'กราฟเดือนนี้')],
      'DAILY SNAPSHOT',
    ),
  );
}
export function weeklyCard(week: WeeklyStatus, notice = '') {
  const hasLimit = week.limitSatang > 0;
  const remain = week.remainingSatang;
  const body: FlexNode[] = [
    eyebrow('ช่วง ' + week.start + ' ถึง ' + week.end),
    subCard(
      [
        eyebrow(!hasLimit ? 'ใช้ไปในสัปดาห์นี้' : remain < 0 ? 'ใช้เกินงบไป' : 'ยังใช้ได้อีก'),
        txt(
          formatBaht(!hasLimit ? week.spentSatang : Math.abs(remain)),
          'xxl',
          remain < 0 ? P.red : P.pine,
          'bold',
        ),
        txt(
          hasLimit ? 'จากงบ ' + formatBaht(week.limitSatang) : 'ยังไม่ได้กำหนดงบรายสัปดาห์',
          'xs',
          P.soft,
        ),
      ],
      remain < 0 ? P.redBg : P.mint,
    ),
    weeklyBlock(week),
  ];
  if (notice) body.push(subCard([eyebrow('✦ ข้อแนะนำ', P.warm), txt(notice, 'sm')], P.amberBg));
  return flexMessage(
    'MoneyFlow สรุปงบ ' + week.start,
    makeBubble(
      'งบสัปดาห์ของคุณ',
      'ใช้เงินอย่างมีแผน แบบที่คุณเลือกได้',
      body,
      [button('กราฟสัปดาห์', 'กราฟสัปดาห์', true), button('เดือนนี้', 'สรุปเดือนนี้')],
      'WEEKLY BUDGET',
    ),
    ['กราฟสัปดาห์', 'เหลือใช้วันละเท่าไหร่'],
  );
}
// Compact, image-free LINE Flex spending chart. All proportions use the total,
// not the highest row, so the percentages and bars mean the same thing.
const chartRow = (
  rank: number,
  name: string,
  amountSatang: number,
  totalSatang: number,
  accent: string,
): FlexNode => {
  const percent = totalSatang > 0 ? Math.round((amountSatang / totalSatang) * 100) : 0;
  const visibleWidth = amountSatang > 0 ? Math.max(2, Math.min(100, percent)) : 1;
  return vbox(
    [
      hbox(
        [
          {
            type: 'box',
            layout: 'vertical',
            width: '24px',
            height: '24px',
            flex: 0,
            cornerRadius: '7px',
            backgroundColor: P.mint,
            justifyContent: 'center',
            contents: [{ ...txt(String(rank), 'xs', P.green, 'bold'), align: 'center' }],
          },
          {
            ...txt(name, 'sm', P.ink, 'bold'),
            flex: 1,
            maxLines: 2,
            wrap: true,
            margin: 'xs',
          },
          {
            ...txt(formatBaht(amountSatang), 'sm', P.ink, 'bold'),
            flex: 0,
            maxLines: 1,
            wrap: false,
            adjustMode: 'shrink-to-fit',
            align: 'end',
          },
        ],
        'xs',
      ),
      hbox(
        [
          {
            type: 'box',
            layout: 'horizontal',
            flex: 1,
            height: '7px',
            backgroundColor: '#E6EEE8',
            cornerRadius: '5px',
            contents: [
              {
                type: 'box',
                layout: 'vertical',
                height: '7px',
                width: visibleWidth + '%',
                backgroundColor: amountSatang > 0 ? accent : '#E6EEE8',
                cornerRadius: '5px',
                contents: [],
              },
            ],
          },
          {
            ...txt(percent + '%', 'xs', P.soft, 'bold'),
            flex: 0,
            maxLines: 1,
            wrap: false,
            align: 'end',
          },
        ],
        'sm',
      ),
    ],
    'sm',
  );
};

function chartPeriodLabel(subtitle: string): string {
  const match = /^เดือน\s+(\d{4})-(\d{2})$/.exec(subtitle);
  if (!match) return subtitle;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return subtitle;
  return new Intl.DateTimeFormat('th-TH', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(Number(match[1]), month - 1, 1)));
}

export function barChartCard(
  title: string,
  subtitle: string,
  rows: { label: string; spentSatang: number }[],
  back = 'สรุปสัปดาห์',
) {
  const byCategory = /หมวด/.test(title + subtitle);
  const entries = rows
    .filter((row) => Number.isSafeInteger(row.spentSatang) && row.spentSatang >= 0)
    .map((row) => ({
      label:
        String(row.label || 'ไม่ระบุ')
          .trim()
          .slice(0, 70) || 'ไม่ระบุ',
      spentSatang: row.spentSatang,
    }));
  const ordered = byCategory ? [...entries].sort((a, b) => b.spentSatang - a.spentSatang) : entries;
  const total = ordered.reduce((sum, row) => sum + row.spentSatang, 0);
  const top = byCategory ? ordered.slice(0, 5) : ordered.slice(0, 7);
  if (byCategory && ordered.length > 5) {
    top.push({
      label: 'หมวดอื่น ๆ (' + (ordered.length - 5) + ')',
      spentSatang: ordered.slice(5).reduce((sum, row) => sum + row.spentSatang, 0),
    });
  }
  const colors = ['#149A70', '#249D82', '#47A58C', '#6FAE97', '#8BBEA7', '#A3CAB4', '#B3CFBF'];
  const period = chartPeriodLabel(subtitle);
  const label = byCategory ? 'รายจ่ายตามหมวด' : 'รายจ่ายรายวัน';
  const header: FlexNode = {
    ...vbox(
      [
        hbox([
          { ...txt('●  moneyflow.', 'sm', P.lime, 'bold'), flex: 1 },
          { ...txt('สรุปการเงิน', 'xxs', '#B5D7C3', 'bold'), flex: 0, align: 'end' },
        ]),
        txt(label, 'lg', P.paper, 'bold'),
        txt(period, 'xs', '#C7E3D4'),
      ],
      'sm',
    ),
    paddingAll: '18px',
  };
  const summary: FlexNode = subCard(
    [
      hbox(
        [
          { ...eyebrow('ยอดรวมรายจ่ายที่แสดง'), flex: 1 },
          pill(ordered.length + (byCategory ? ' หมวด' : ' วัน')),
        ],
        'sm',
      ),
      txt(formatBaht(total), 'xxl', P.pine, 'bold'),
    ],
    P.mint,
  );
  const body: FlexNode[] = [summary];
  if (!ordered.length || total === 0) {
    body.push(
      subCard(
        [
          txt('ยังไม่มีรายจ่ายในช่วงนี้', 'md', P.ink, 'bold'),
          txt('เมื่อมีรายการบันทึก ระบบจะแสดงยอดและสัดส่วนตรงนี้', 'xs', P.soft),
        ],
        P.canvas,
      ),
    );
  } else {
    body.push(
      hbox([
        { ...eyebrow(byCategory ? 'ใช้จ่ายในหมวดไหนบ้าง' : 'ใช้จ่ายวันไหนบ้าง'), flex: 1 },
        { ...eyebrow('สัดส่วนจากยอดรวม'), flex: 0, align: 'end' },
      ]),
    );
    top.forEach((row, index) => {
      body.push(chartRow(index + 1, row.label, row.spentSatang, total, colors[index % colors.length]));
      if (index < top.length - 1) {
        body.push({ type: 'separator', color: '#F0F4F0', margin: 'xs' });
      }
    });
  }
  const bubble: FlexNode = {
    type: 'bubble',
    size: 'mega',
    styles: {
      header: { backgroundColor: P.pine },
      body: { backgroundColor: P.paper },
      footer: { backgroundColor: P.paper, separator: true, separatorColor: P.line },
    },
    header,
    body: { ...vbox(body, 'lg'), paddingAll: '18px' },
    footer: {
      ...vbox([
        hbox(
          [
            button(byCategory ? 'สรุปเดือนนี้' : 'สรุปสัปดาห์', back, true),
            button('งบคงเหลือ', 'งบคงเหลือ'),
          ],
          'sm',
        ),
      ]),
      paddingAll: '12px',
    },
  };
  return flexMessage('MoneyFlow ' + title + ' ' + period + ' รวม ' + formatBaht(total), bubble, [
    'สรุปวันนี้',
    'กราฟเดือนนี้',
    'กราฟสัปดาห์',
  ]);
}

export const simpleHelpCard = (miniUrl?: string) => {
  const body: FlexNode[] = [
    subCard(
      [eyebrow('บันทึกรายการใหม่'), txt('ลองพิมพ์ “กาแฟ 45 บาท” หรือส่งรูปใบเสร็จ', 'sm', P.ink)],
      P.mint,
    ),
    detailRow('✦ ดูยอดวันนี้', 'พิมพ์ “สรุปวันนี้”'),
    detailRow('✦ เช็กงบที่เหลือ', 'พิมพ์ “งบคงเหลือ”'),
    detailRow('✦ ดูรายจ่ายตามหมวด', 'พิมพ์ “กราฟเดือนนี้”'),
    detailRow('✦ เปิดสมุดเงิน', 'กดปุ่มด้านล่าง'),
    txt('ทุกยอดตรวจสอบในสมุดเงินได้ และรายการที่ไม่ชัดเจนอาจต้องยืนยันก่อนบันทึก', 'xs', P.soft),
  ];
  const validMini =
    typeof miniUrl === 'string' &&
    /^https:\/\/liff\.line\.me\/[0-9]{5,20}-[A-Za-z0-9]{5,64}$/.test(miniUrl);
  return flexMessage(
    'วิธีใช้ MoneyFlow',
    makeBubble(
      'เริ่มตรงนี้ได้เลย',
      'เรื่องเงินไม่ต้องยุ่งยาก เลือกสิ่งที่อยากทำ',
      body,
      [
        button('สรุปสัปดาห์', 'สรุปสัปดาห์'),
        validMini ? linkButton('เปิดสมุดเงินของฉัน', miniUrl!) : button('ดูกราฟ', 'กราฟเดือนนี้', true),
      ],
      'LET’S GET STARTED',
    ),
    ['สรุปเดือนนี้', 'กราฟเดือนนี้', 'งบคงเหลือ'],
  );
};

/** Bank alert summaries share the same user-facing design as all other MoneyFlow cards. */
export function bankReceiptCard(kind: 'income' | 'expense', amountSatang: number, bankName: string) {
  if (!Number.isSafeInteger(amountSatang) || amountSatang <= 0) throw Error('Invalid bank amount');
  const incoming = kind === 'income';
  const label = incoming ? 'เงินเข้าบัญชี' : 'เงินออกจากบัญชี';
  const body: FlexNode[] = [
    hbox([eyebrow('บันทึกจากแจ้งเตือนธนาคาร', P.green), pill('✓ สำเร็จแล้ว')]),
    subCard(
      [
        eyebrow(label),
        txt(
          (incoming ? '+' : '−') + formatBaht(amountSatang),
          'xxl',
          incoming ? P.green : P.red,
          'bold',
        ),
        detailRow('จากแจ้งเตือน', bankName),
      ],
      incoming ? P.mint : P.redBg,
    ),
    txt('บันทึกรายการนี้ใน MoneyFlow แล้ว ตรวจสอบรายละเอียดและยอดกับแอปธนาคารได้ทุกเมื่อ', 'xs', P.soft),
  ];
  return flexMessage(
    'MoneyFlow บันทึก' + (incoming ? 'เงินเข้า' : 'เงินออก') + 'จาก ' + bankName + ' แล้ว',
    makeBubble(
      'เงิน' + (incoming ? 'เข้า' : 'ออก') + 'เรียบร้อย',
      'อัปเดตสมุดเงินของคุณแล้ว',
      body,
      [button('ดูสรุปวันนี้', 'สรุปวันนี้', true), button('เช็กงบ', 'งบคงเหลือ')],
      'BANK ALERT • SAVED',
    ),
  );
}
export function bankUnrecognizedCard(bankName: string) {
  return flexMessage(
    'MoneyFlow ได้รับแจ้งเตือนจาก ' + bankName + ' แต่ยังไม่บันทึกรายการ',
    makeBubble(
      'มีรายการที่ต้องเช็ก',
      'เรายังไม่เพิ่มรายการนี้เข้าบัญชี',
      [
        subCard(
          [
            eyebrow('ยังไม่ได้บันทึก', P.warm),
            txt('ได้รับแจ้งเตือนจาก ' + bankName, 'sm', P.ink, 'bold'),
            txt('ระบบยังอ่านยอดหรือประเภทเงินไม่ชัดเจน จึงไม่เดาหรือบันทึกแทนคุณ', 'sm', P.ink),
          ],
          P.amberBg,
        ),
        txt('กรุณาตรวจรายการจริงในแอปธนาคารก่อนบันทึกเอง', 'xs', P.soft),
      ],
      [button('เปิดสรุปวันนี้', 'สรุปวันนี้', true)],
      'BANK ALERT • NEEDS REVIEW',
    ),
  );
}

export function dailyAllowanceCard(week: WeeklyStatus) {
  const amount =
    week.limitSatang > 0 ? Math.max(0, week.remainingSatang) / (week.daysLeftInWeek + 1) : 0;
  return flexMessage(
    'MoneyFlow เหลือใช้วันละ ' + formatBaht(amount),
    makeBubble(
      'ใช้ต่อได้วันละเท่าไหร่',
      'วางแผนใช้เงินก่อนสัปดาห์ใหม่',
      [
        subCard(
          [
            eyebrow('งบที่ใช้ต่อได้ต่อวัน'),
            txt(formatBaht(amount), 'xxl', P.pine, 'bold'),
            txt('คำนวณจากงบที่เหลือและวันที่เหลือในสัปดาห์นี้', 'xs', P.soft),
          ],
          P.mint,
        ),
        weeklyBlock(week),
      ],
      [button('สรุปสัปดาห์', 'สรุปสัปดาห์', true), button('ดูกราฟ', 'กราฟสัปดาห์')],
      'DAILY ALLOWANCE',
    ),
  );
}
export function savingsGoalCard(goalSatang: number, savedSatang: number) {
  const hasGoal = goalSatang > 0;
  const progress = hasGoal ? percentage(Math.max(0, savedSatang), goalSatang) : 0;
  const body: FlexNode[] = [
    subCard(
      [
        eyebrow(hasGoal ? 'เป้าหมายเก็บเงินเดือนนี้' : 'เริ่มต้นตั้งเป้าหมายออมเงิน'),
        txt(hasGoal ? formatBaht(goalSatang) : 'ตั้งเป้าหมายของคุณ', 'xxl', P.pine, 'bold'),
        ...(hasGoal
          ? [
              meter(Math.max(0, savedSatang), goalSatang, P.green),
              detailRow(
                'เงินสุทธิ ณ ตอนนี้',
                formatBaht(savedSatang),
                savedSatang >= 0 ? P.green : P.red,
              ),
              txt(
                savedSatang >= goalSatang
                  ? 'ถึงเป้าหมายแล้ว ยอดเยี่ยม!'
                  : 'อีก ' + formatBaht(goalSatang - savedSatang) + ' ก็จะถึงเป้าหมาย',
                'xs',
                P.soft,
              ),
            ]
          : [txt('ตั้งค่าได้ในหน้า MoneyFlow แล้วค่อยกลับมาตรวจความคืบหน้า', 'xs', P.soft)]),
      ],
      P.mint,
    ),
  ];
  return flexMessage(
    'MoneyFlow เป้าหมายการออม',
    makeBubble(
      'ค่อย ๆ ไปให้ถึงเป้าหมาย',
      'ทุกก้าวเล็ก ๆ มีความหมาย',
      body,
      [button('สรุปเดือนนี้', 'สรุปเดือนนี้', true), button('ดูงบสัปดาห์', 'สรุปสัปดาห์')],
      'SAVINGS PROGRESS',
    ),
  );
}
