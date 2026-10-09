import {test,expect,describe} from 'bun:test';
import {weekRange,budgetTier,mustConfirm,deterministicCoach} from '../server/moneyflow-features.ts';
import {receiptCard,summaryCard,weeklyCard,barChartCard} from '../server/line-flex.ts';

describe('Weekly budget boundaries in Bangkok',()=>{
 test('Monday 00:00 to Sunday 23:59 across UTC',()=>{
  const sunday=weekRange(new Date('2026-10-11T16:59:59Z'));
  expect(sunday.start).toBe('2026-10-05');
  expect(sunday.last).toBe('2026-10-11');
  expect(sunday.daysLeftInWeek).toBe(0);
  const monday=weekRange(new Date('2026-10-11T17:00:00Z'));
  expect(monday.start).toBe('2026-10-12');
  expect(monday.daysLeftInWeek).toBe(6);
 });
 test('month ends remain correct',()=>{
  const day=weekRange(new Date('2026-10-08T08:00:00Z'));
  expect(day.daysLeftInMonth).toBe(23);
  expect(day.daysLeftInWeek).toBe(3);
 });
 test('tiers escalate at 90%, 100%, 120%, 150% and early pace',()=>{
  expect(budgetTier(890,1000)).toBe('ok');
  expect(budgetTier(900,1000)).toBe('near');
  expect(budgetTier(1000,1000)).toBe('reached');
  expect(budgetTier(1001,1000)).toBe('over');
  expect(budgetTier(1500,1000)).toBe('critical');
  expect(budgetTier(790,1000,2)).toBe('ahead');
  expect(budgetTier(50,0)).toBe('ok');
 });
 test('roast notices remain opt-in and grounded to calendar',()=>{
  const range=weekRange(new Date('2026-10-08T12:00:00Z'));
  const w={start:range.start,end:range.last,limitSatang:100000,spentSatang:120000,
    remainingSatang:-20000,progress:1.2,tier:'over' as const,daysLeftInWeek:range.daysLeftInWeek,
    daysLeftInMonth:range.daysLeftInMonth,daysElapsedInWeek:range.daysElapsedInWeek,daily:[]};
  expect(deterministicCoach(w,'roast')).toContain('23 วัน');
  expect(deterministicCoach(w,'roast')).toContain('3 วัน');
 });
});
describe('LINE confirmation preferences and Flex payloads',()=>{
 const items=[{kind:'expense',amount:45,merchant:'กาแฟ',category:'อาหาร',confidence:.98}];
 test('manual confirms, automatic only stores clear items',()=>{
  expect(mustConfirm('always',items,false)).toBe(true);
  expect(mustConfirm('smart',items,false)).toBe(false);
  expect(mustConfirm('auto',items,false)).toBe(false);
  expect(mustConfirm('smart',items,true)).toBe(true);
  expect(mustConfirm('auto',[{...items[0],confidence:0.5}],true)).toBe(true);
  expect(mustConfirm('auto',[{...items[0],merchant:''}],false)).toBe(true);
 });
 test('structured LINE messages have all mandatory fields',()=>{
  const week={start:'2026-10-05',end:'2026-10-11',limitSatang:100000,spentSatang:60000,remainingSatang:40000,
   progress:.6,tier:'ok' as const,daysLeftInWeek:3,daysLeftInMonth:23,daysElapsedInWeek:4,
   daily:Array.from({length:7},(_,i)=>({date:'2026-10-0'+(5+i),label:'จ.',spentSatang:i*1000}))};
  const messages=[
   receiptCard(items,week,'ใกล้หมดงบแล้ว',false),
   receiptCard(items,week,'',true),
   weeklyCard(week),
   summaryCard({month:'2026-10',incomeSatang:200000,expenseSatang:100000,savedSatang:100000},week),
   barChartCard('กราฟสัปดาห์','7 วัน',[{label:'จ.',spentSatang:1000},{label:'อ.',spentSatang:2000}])
  ];
  for(const m of messages){
   expect(m.type).toBe('flex');
   expect(m.contents.type).toBe('bubble');
   expect(m.altText.length).toBeLessThan(350);
   expect(JSON.stringify(m)).not.toContain('undefined');
  }
 });
});
