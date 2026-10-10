import { describe, expect, test } from 'bun:test';
import { barChartCard } from '../server/line-flex.ts';
import { monthCategoryChart } from '../server/moneyflow-features.ts';

function walk(node: any, callback: (node: any) => void) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((item) => walk(item, callback));
    return;
  }
  callback(node);
  Object.values(node).forEach((value) => walk(value, callback));
}
function texts(message: any): string[] {
  const result: string[] = [];
  walk(message, (item) => {
    if (item.type === 'text') result.push(item.text);
  });
  return result;
}
function barWidths(message: any): string[] {
  const result: string[] = [];
  walk(message.contents.body, (item) => {
    if (item.type === 'box' && item.height === '7px' && typeof item.width === 'string') {
      result.push(item.width);
    }
  });
  return result;
}

describe('Monthly category totals remain accurate across more than six categories', () => {
  test('the query returns every category and respects user and month filters', async () => {
    let query = '';
    const fakeDb = {
      unsafe: async (statement: string, args: unknown[]) => {
        query = statement;
        expect(args).toEqual(['owner-1', '2026-10']);
        return Array.from({ length: 12 }, (_, index) => ({
          label: 'หมวด ' + index,
          total: '1000',
        }));
      },
    };
    const result = await monthCategoryChart(fakeDb as any, 'owner-1', new Date('2026-10-10T05:00:00Z'));
    expect(query).toContain('t.user_id=$1');
    expect(query).toContain("t.kind='expense'");
    expect(query).not.toMatch(/LIMIT\s+6/i);
    expect(result.categories).toHaveLength(12);
    const card = barChartCard('รายจ่ายตามหมวดหมู่', 'เดือน 2026-10', result.categories);
    expect(card.altText).toContain('฿120');
    expect(texts(card)).toContain('หมวดอื่น ๆ (7)');
    expect(barWidths(card)).toHaveLength(6);
  });
});

describe('LINE Flex spending chart fits constrained chat bubbles', () => {
  const categories = [
    { label: 'อาหาร', spentSatang: 18000 },
    { label: 'เดินทาง', spentSatang: 9000 },
    { label: 'ช้อปปิ้งออนไลน์และการใช้จ่ายยาวมากยาวมาก', spentSatang: 4020 },
    { label: 'ที่พัก', spentSatang: 2000 },
    { label: 'อื่น ๆ', spentSatang: 1200 },
    { label: 'สุขภาพ', spentSatang: 800 },
  ];

  test('category total includes all entries and percentages use total, not max value', () => {
    const card = barChartCard('รายจ่ายตามหมวดหมู่', 'เดือน 2026-10', categories, 'สรุปเดือนนี้');
    const content = texts(card);
    expect(card.type).toBe('flex');
    expect(card.contents.type).toBe('bubble');
    expect(card.contents.size).toBe('mega');
    expect(card.altText).toContain('฿350.2');
    expect(content).toContain('฿350.2');
    expect(content).toContain('6 หมวด');
    expect(content).toContain('หมวดอื่น ๆ (1)');
    expect(content).toContain('51%');
    expect(content).toContain('26%');
    expect(barWidths(card)).toEqual(['51%', '26%', '11%', '6%', '3%', '2%']);
    expect(content).not.toContain('SPENDING INSIGHT');
    expect(content).not.toContain('YOUR MONEY, IN FLOW');
    expect(content).toContain('รายจ่ายตามหมวด');
    expect(JSON.stringify(card)).not.toContain('"type":"image"');
    expect(card.contents.header.paddingAll).toBe('18px');
    expect(card.contents.body.paddingAll).toBe('18px');
    expect(card.contents.footer.contents[0].contents[0].action.text).toBe('สรุปเดือนนี้');
    expect(card.contents.footer.contents[0].contents[1].action.text).toBe('งบคงเหลือ');
  });

  test('empty month has a readable state and no misleading bars', () => {
    const card = barChartCard('รายจ่ายตามหมวดหมู่', 'เดือน 2026-10', [], 'สรุปเดือนนี้');
    expect(texts(card)).toContain('ยังไม่มีรายจ่ายในช่วงนี้');
    expect(barWidths(card)).toHaveLength(0);
    expect(texts(card)).toContain('฿0');
  });

  test('weekly chart remains chronological, with seven days and zero amounts supported', () => {
    const card = barChartCard('กราฟรายจ่าย 7 วัน', 'วันจันทร์ถึงอาทิตย์', [
      { label: 'จ.', spentSatang: 5000 },
      { label: 'อ.', spentSatang: 0 },
      { label: 'พ.', spentSatang: 2000 },
      { label: 'พฤ.', spentSatang: 3000 },
    ]);
    const text = texts(card);
    expect(text.indexOf('จ.')).toBeLessThan(text.indexOf('อ.'));
    expect(text.indexOf('อ.')).toBeLessThan(text.indexOf('พ.'));
    expect(barWidths(card)).toEqual(['50%', '1%', '20%', '30%']);
    expect(text).toContain('0%');
    expect(card.contents.footer.contents[0].contents[0].action.text).toBe('สรุปสัปดาห์');
  });

  test('limits chart size and does not render non-finite or negative values', () => {
    const long = 'หมวดรายการใช้จ่าย'.repeat(14);
    const categories = Array.from({ length: 40 }, (_, i) => ({
      label: i === 0 ? long : 'หมวด ' + i,
      spentSatang: i === 39 ? -100 : 2000,
    }));
    const card = barChartCard('รายจ่ายตามหมวดหมู่', 'เดือน 2026-10', categories);
    const text = texts(card).join(' ');
    expect(text).not.toContain(long);
    expect(text).toContain('หมวดอื่น ๆ');
    expect(barWidths(card).length).toBeLessThanOrEqual(6);
    expect(JSON.stringify(card).length).toBeLessThan(50_000);
  });
});
