import {describe,test,expect} from 'bun:test';
import {
 validateAmount,validateFinanceModal,validLocalDate,validateWeeklyPreferences,
 validateLinePreferences,validateAuthForm,validateEmail,validateSecurityPassword,validateAiText
} from '../src/validation.ts';

const accounts=[{id:'bank-a'},{id:'bank-b'}];
const categories=[{id:'food',kind:'expense'},{id:'salary',kind:'income'}];
const base={amount:'45.50',account_id:'bank-a',category_id:'food',merchant:'กาแฟ',transacted_at:'2026-10-09',note:''};

describe('MoneyFlow field validation',()=>{
 test('must enter amounts, never silently store invalid or negative values',()=>{
  expect(validateAmount('')).toContain('กรุณากรอก');
  expect(validateAmount(undefined)).toBeTruthy();
  expect(validateAmount('abc')).toBeTruthy();
  expect(validateAmount('-20')).toBeTruthy();
  expect(validateAmount('0')).toBeTruthy();
  expect(validateAmount('1.005')).toContain('2 ตำแหน่ง');
  expect(validateAmount('1e9')).toBeTruthy();
  expect(validateAmount('10000001')).toContain('10,000,000');
  expect(validateAmount('0.01')).toBeUndefined();
  expect(validateAmount('120.25')).toBeUndefined();
 });
 test('opening balance is the only optional amount and zero is valid',()=>{
  expect(validateAmount('',{optional:true,allowZero:true})).toBeUndefined();
  expect(validateAmount('0',{optional:true,allowZero:true})).toBeUndefined();
  expect(validateAmount('-0.5',{optional:true,allowZero:true})).toBeTruthy();
 });
 test('checks calendar dates including leap years',()=>{
  expect(validLocalDate('2024-02-29')).toBe(true);
  for(const invalid of ['2025-02-29','2026-02-30','2026-13-01','','2026-00-01','tomorrow']){
   expect(validLocalDate(invalid)).toBe(false);
  }
 });
 test('transaction missing required fields yields per-field errors',()=>{
  const e=validateFinanceModal('transaction',{amount:'',account_id:'',category_id:'',merchant:'',transacted_at:''},'expense',accounts,categories,'2026-10');
  expect(Object.keys(e).sort()).toEqual(['account_id','amount','category_id','merchant','transacted_at']);
 });
 test('valid income transaction must choose an income category',()=>{
  const e=validateFinanceModal('transaction',{...base,category_id:'food'},'income',accounts,categories,'2026-10');
  expect(e.category_id).toBeTruthy();
  expect(validateFinanceModal('transaction',{...base,category_id:'salary'},'income',accounts,categories,'2026-10')).toEqual({});
 });
 test('transfer requires a second account and blocks same-account transfers',()=>{
  const transfer={...base,to_account_id:''};
  expect(validateFinanceModal('transaction',transfer,'transfer',accounts,categories,'2026-10').to_account_id).toBeTruthy();
  expect(validateFinanceModal('transaction',{...transfer,to_account_id:'bank-a'},'transfer',accounts,categories,'2026-10').to_account_id).toBeTruthy();
  expect(validateFinanceModal('transaction',{...transfer,to_account_id:'bank-b'},'transfer',accounts,categories,'2026-10')).toEqual({});
 });
 test('transaction description is required and notes are length-limited',()=>{
  const result=validateFinanceModal('transaction',{...base,merchant:'  ',note:'a'.repeat(501)},'expense',accounts,categories,'2026-10');
  expect(result.merchant).toBeTruthy();
  expect(result.note).toBeTruthy();
 });
 test('account requires its name, a supported kind and valid nonnegative opening',()=>{
  const e=validateFinanceModal('account',{name:' ',kind:'invalid',amount:'-3'},'expense',accounts,categories,'2026-10');
  expect(Object.keys(e).sort()).toEqual(['amount','kind','name']);
  expect(validateFinanceModal('account',{name:'เงินสด',kind:'cash',amount:''},'expense',accounts,categories,'2026-10')).toEqual({});
 });
 test('budget category and positive amount must both be present',()=>{
  const e=validateFinanceModal('budget',{amount:'0',category_id:''},'expense',accounts,categories,'2026-13');
  expect(Object.keys(e).sort()).toEqual(['amount','category_id','month']);
  expect(validateFinanceModal('budget',{amount:'1500',category_id:'food'},'expense',accounts,categories,'2026-10')).toEqual({});
 });
 test('recurring requires title, account, category, day integer 1 through 31 and amount',()=>{
  const e=validateFinanceModal('recurring',{title:'',amount:'',account_id:'',category_id:'',day_of_month:'1.5'},'expense',accounts,categories,'2026-10');
  expect(Object.keys(e).sort()).toEqual(['account_id','amount','category_id','day_of_month','title']);
  expect(validateFinanceModal('recurring',{title:'ค่าห้อง',amount:'4000',account_id:'bank-a',category_id:'food',day_of_month:'31'},'expense',accounts,categories,'2026-10')).toEqual({});
 });
 test('weekly budget and savings goals allow zero but reject blanks and excessive decimals',()=>{
  expect(validateWeeklyPreferences('','')).toHaveProperty('weekly_limit');
  expect(validateWeeklyPreferences('0','0')).toEqual({});
  expect(validateWeeklyPreferences('1500.001','-1')).toHaveProperty('savings_goal');
  expect(validateWeeklyPreferences('1500.001','-1')).toHaveProperty('weekly_limit');
 });
 test('LINE options reject invalid confirmation and sending hours',()=>{
  expect(validateLinePreferences({confirmation_mode:'nonsense',coach_tone:'roast',coach_alerts:'every',daily_digest_enabled:true,daily_digest_hour:24})).toHaveProperty('confirmation_mode');
  expect(validateLinePreferences({confirmation_mode:'always',coach_tone:'friend',coach_alerts:'once',daily_digest_enabled:true,daily_digest_hour:20})).toEqual({});
 });
 test('registration requires valid name/email/password/confirmation',()=>{
  const e=validateAuthForm('register',{name:'',email:'bad',password:'abc',confirm:'abc2'});
  expect(Object.keys(e).sort()).toEqual(['confirm','email','name','password']);
  expect(validateAuthForm('register',{name:'บีม',email:'test@example.com',password:'secure-password',confirm:'secure-password'})).toEqual({});
 });
 test('login requires email and password',()=>{
  expect(validateAuthForm('login',{name:'',email:'',password:'',confirm:''})).toHaveProperty('password');
  expect(validateAuthForm('login',{name:'',email:'',password:'',confirm:''})).toHaveProperty('email');
  expect(validateEmail('me@example.com')).toBeUndefined();
 });
 test('password linking/change rejects missing or short passwords',()=>{
  expect(validateSecurityPassword('',null)).toHaveProperty('password');
  expect(validateSecurityPassword('short')).toHaveProperty('password');
  expect(validateSecurityPassword('long-enough-password','me@example.com')).toEqual({});
 });
 test('AI input cannot be blank or oversize',()=>{
  expect(validateAiText('   ')).toContain('กรุณา');
  expect(validateAiText('a'.repeat(2001))).toBeTruthy();
  expect(validateAiText('วันนี้กาแฟ 45')).toBeUndefined();
 });
});
