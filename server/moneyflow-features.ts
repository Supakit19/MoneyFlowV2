import type { Sql } from 'postgres';
import {validateAmount} from '../src/validation.ts';

export type ConfirmationMode='always'|'smart'|'auto';
export type CoachTone='polite'|'friend'|'roast';
export type CoachAlerts='every'|'once'|'off';
export type CoachTier='ok'|'ahead'|'near'|'reached'|'over'|'critical';
export type Preferences={
 weekly_limit_satang:string|number;
 savings_goal_satang:string|number;
 confirmation_mode:ConfirmationMode;
 coach_tone:CoachTone;
 coach_alerts:CoachAlerts;
 daily_digest_enabled:boolean;
 daily_digest_hour:number;
};
export type WeeklyStatus={
 start:string;end:string;limitSatang:number;spentSatang:number;remainingSatang:number;
 progress:number;tier:CoachTier;daysLeftInWeek:number;daysLeftInMonth:number;
 daysElapsedInWeek:number;daily:{date:string;label:string;spentSatang:number}[];
};
const DEFAULT:Preferences={
 weekly_limit_satang:0,savings_goal_satang:0,confirmation_mode:'always',coach_tone:'friend',
 coach_alerts:'every',daily_digest_enabled:false,daily_digest_hour:20
};
const DAY=86400000;
const toBkkDate=(date:Date)=>new Intl.DateTimeFormat('en-CA',{
 timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'
}).format(date);
const isoToDate=(iso:string)=>new Date(iso+'T00:00:00.000Z');
const addDays=(iso:string,count:number)=>new Date(isoToDate(iso).getTime()+count*DAY).toISOString().slice(0,10);
const labelDay=(iso:string)=>['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'][isoToDate(iso).getUTCDay()];
export const satang=(n:unknown,allowZero=true)=>{
 const error=validateAmount(n,{allowZero,max:10_000_000});
 if(error)throw Error(error);
 return Math.round((Number(n)+Number.EPSILON)*100);
};
export const formatBaht=(n:number)=>'฿'+(n/100).toLocaleString('th-TH',{maximumFractionDigits:2});

export function weekRange(now:Date=new Date()){
 const today=toBkkDate(now);
 const dt=isoToDate(today);
 const monday=(dt.getUTCDay()+6)%7;
 const start=addDays(today,-monday);
 return {today,start,end:addDays(start,7),last:addDays(start,6),
  daysLeftInWeek:6-monday,daysElapsedInWeek:monday+1,
  daysLeftInMonth:new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth()+1,0)).getUTCDate()-dt.getUTCDate()};
}
export function budgetTier(spent:number,limit:number,daysElapsedInWeek=7):CoachTier{
 if(limit<=0)return 'ok';
 const ratio=spent/limit;
 if(ratio>=1.5)return 'critical';
 if(ratio>1)return 'over';
 if(ratio>=1)return 'reached';
 if(ratio>=0.9)return 'near';
 if(ratio>=0.7 && ratio>Math.max(0.01,daysElapsedInWeek/7)*1.3)return 'ahead';
 return 'ok';
}
export async function getPreferences(db:Sql,userId:string):Promise<Preferences>{
 const rows=await db.unsafe(
  'SELECT weekly_limit_satang,savings_goal_satang,confirmation_mode,coach_tone,coach_alerts,daily_digest_enabled,daily_digest_hour FROM finance_preferences WHERE user_id=$1',
  [userId]);
 return (rows[0] as unknown as Preferences)||DEFAULT;
}
export async function setPreferences(db:Sql,userId:string,input:any):Promise<Preferences>{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('การตั้งค่าไม่ถูกต้อง');
 const existing=await getPreferences(db,userId);
 const limit=input.weekly_limit===undefined?Number(existing.weekly_limit_satang):satang(input.weekly_limit);
 const savings=input.savings_goal===undefined?Number(existing.savings_goal_satang):satang(input.savings_goal);
 const confirm=input.confirmation_mode??existing.confirmation_mode;
 const tone=input.coach_tone??existing.coach_tone;
 const alerts=input.coach_alerts??existing.coach_alerts;
 const daily=input.daily_digest_enabled??existing.daily_digest_enabled;
 const hour=input.daily_digest_hour??existing.daily_digest_hour;
 if(!['always','smart','auto'].includes(confirm))throw Error('กรุณาเลือกโหมดยืนยันรายการ');
 if(!['polite','friend','roast'].includes(tone))throw Error('กรุณาเลือกบุคลิก AI');
 if(!['every','once','off'].includes(alerts))throw Error('กรุณาเลือกรูปแบบการเตือน');
 if(typeof daily!=='boolean')throw Error('การรายงานรายวันต้องเป็น เปิด หรือ ปิด');
 if(!Number.isInteger(Number(hour))||Number(hour)<0||Number(hour)>23)throw Error('กรุณาเลือกเวลารายงานให้ถูกต้อง');
 const rows=await db.unsafe(
  'INSERT INTO finance_preferences(user_id,weekly_limit_satang,savings_goal_satang,confirmation_mode,coach_tone,coach_alerts,daily_digest_enabled,daily_digest_hour) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id) DO UPDATE SET weekly_limit_satang=excluded.weekly_limit_satang,savings_goal_satang=excluded.savings_goal_satang,confirmation_mode=excluded.confirmation_mode,coach_tone=excluded.coach_tone,coach_alerts=excluded.coach_alerts,daily_digest_enabled=excluded.daily_digest_enabled,daily_digest_hour=excluded.daily_digest_hour,updated_at=now() RETURNING weekly_limit_satang,savings_goal_satang,confirmation_mode,coach_tone,coach_alerts,daily_digest_enabled,daily_digest_hour',
  [userId,limit,savings,confirm,tone,alerts,daily,Number(hour)]);
 return rows[0] as unknown as Preferences;
}
export async function weeklyStatus(db:Sql,userId:string,now:Date=new Date(),limitSatang?:number):Promise<WeeklyStatus>{
 const w=weekRange(now);
 let limit=limitSatang;
 if(limit===undefined)limit=Number((await getPreferences(db,userId)).weekly_limit_satang);
 const from=w.start+'T00:00:00+07:00',to=w.end+'T00:00:00+07:00';
 const rows=await db.unsafe(
  "SELECT to_char(transacted_at AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS expense_day,COALESCE(SUM(amount_satang),0)::text amount FROM transactions WHERE user_id=$1 AND kind='expense' AND transacted_at>=$2::timestamptz AND transacted_at<$3::timestamptz GROUP BY 1",
  [userId,from,to]);
 const expense=new Map(rows.map(row=>[row.expense_day,Number(row.amount)]));
 const daily=Array.from({length:7},(_,i)=>{
  const date=addDays(w.start,i);
  return {date,label:labelDay(date),spentSatang:expense.get(date)||0};
 });
 const spent=daily.reduce((s,r)=>s+r.spentSatang,0);
 return {start:w.start,end:w.last,limitSatang:limit||0,spentSatang:spent,
  remainingSatang:(limit||0)-spent,progress:limit?spent/limit:0,
  tier:budgetTier(spent,limit||0,w.daysElapsedInWeek),
  daysLeftInWeek:w.daysLeftInWeek,daysLeftInMonth:w.daysLeftInMonth,
  daysElapsedInWeek:w.daysElapsedInWeek,daily};
}
export async function monthStatus(db:Sql,userId:string,now:Date=new Date()){
 const month=toBkkDate(now).slice(0,7);
 const rows=await db.unsafe(
  "SELECT kind,COALESCE(SUM(amount_satang),0)::text total FROM transactions WHERE user_id=$1 AND to_char(transacted_at AT TIME ZONE 'Asia/Bangkok','YYYY-MM')=$2 AND kind IN('income','expense') GROUP BY kind",
  [userId,month]);
 const income=Number(rows.find(r=>r.kind==='income')?.total||0);
 const expense=Number(rows.find(r=>r.kind==='expense')?.total||0);
 return {month,incomeSatang:income,expenseSatang:expense,savedSatang:income-expense};
}
export async function monthCategoryChart(db:Sql,userId:string,now:Date=new Date()){
 const month=toBkkDate(now).slice(0,7);
 const rows=await db.unsafe(
  "SELECT COALESCE(c.name,'อื่นๆ') label,SUM(t.amount_satang)::text total FROM transactions t LEFT JOIN categories c ON c.id=t.category_id AND c.user_id=t.user_id WHERE t.user_id=$1 AND t.kind='expense' AND to_char(t.transacted_at AT TIME ZONE 'Asia/Bangkok','YYYY-MM')=$2 GROUP BY COALESCE(c.name,'อื่นๆ') ORDER BY SUM(t.amount_satang) DESC LIMIT 6",
  [userId,month]);
 return {month,categories:rows.map(r=>({label:r.label as string,spentSatang:Number(r.total)}))};
}
export async function weeklyHistory(db:Sql,userId:string,now:Date=new Date(),limitSatang?:number){
 const {start}=weekRange(now);
 const beginning=addDays(start,-7*7);
 const rows=await db.unsafe(
  "SELECT to_char(transacted_at AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS expense_date,amount_satang::text amount FROM transactions WHERE user_id=$1 AND kind='expense' AND transacted_at>=$2::timestamptz AND transacted_at<$3::timestamptz",
  [userId,beginning+'T00:00:00+07:00',addDays(start,7)+'T00:00:00+07:00']);
 return Array.from({length:8},(_,i)=>{
  const weekStart=addDays(start,(i-7)*7);
  const weekEnd=addDays(weekStart,7);
  const amount=rows.reduce((v,r)=>v+(r.expense_date>=weekStart&&r.expense_date<weekEnd?Number(r.amount):0),0);
  return {start:weekStart,label:weekStart.slice(5).replace('-','/'),spentSatang:amount,limitSatang:limitSatang||0};
 });
}
export async function fullFinanceOverview(db:Sql,userId:string,now:Date=new Date()){
 const settings=await getPreferences(db,userId);
 const limit=Number(settings.weekly_limit_satang);
 const [week,history,month,categories]=await Promise.all([
  weeklyStatus(db,userId,now,limit),weeklyHistory(db,userId,now,limit),
  monthStatus(db,userId,now),monthCategoryChart(db,userId,now)
 ]);
 return {settings,week,history,month,categories,
  goal:{targetSatang:Number(settings.savings_goal_satang),savedSatang:month.savedSatang}};
}
const tones:Record<CoachTone,Record<CoachTier,string>>={
 polite:{
  ok:'ยอดใช้จ่ายยังอยู่ในแผนครับ ทำต่อได้เลย 🌿',
  ahead:'เงินกำลังลดเร็วกว่าจังหวะของสัปดาห์ ลองชะลอรายจ่ายที่ไม่จำเป็นนะครับ',
  near:'งบสัปดาห์นี้ใกล้หมดแล้วครับ ลองวางแผนรายการจำเป็นก่อนนะ',
  reached:'ใช้ครบงบสัปดาห์นี้แล้วครับ ลองพักรายการที่ไม่จำเป็นไว้ก่อน',
  over:'เกินงบสัปดาห์นี้แล้วครับ มาทบทวนการใช้เงินที่เหลือกัน',
  critical:'ใช้เกินแผนค่อนข้างมากแล้วครับ ขอแนะนำให้ตรวจรายการและปรับแผนในสัปดาห์นี้'
 },
 friend:{
  ok:'วันนี้ยังพอไหว เก็บเงินไว้ใช้วันข้างหน้าด้วยนะ 😎',
  ahead:'โหเพื่อน! เพิ่งต้นสัปดาห์เอง เงินวิ่งเร็วไปแล้ว 😂',
  near:'ใจเย็นก่อนเพื่อน! งบใกล้หมดแล้ว เหลืออีกหลายวันนะ 😭',
  reached:'เฮ้ยย งบครบแล้วเพื่อน! พักช้อปก่อนนน 💸',
  over:'งบแตกแล้วว! ยังมีเวลาประหยัดพลิกเกมอยู่นะ 🔥',
  critical:'กระเป๋าตังค์ส่งสัญญาณ SOS แล้วเพื่อน! ช่วยน้องพักหน่อย 😂'
 },
 roast:{
  ok:'วันนี้ยังรักษาวินัยได้อยู่ อย่าเพิ่งฉลองด้วยการช้อปละ 😂',
  ahead:'นี่มันต้นสัปดาห์นะ! เงินวิ่งเร็วกว่าวันหยุดอีก 😂',
  near:'เดี๋ยวก่อนนน! งบเกือบหมดแล้ว เงินไม่ได้เกิดจากเครื่องปริ้นนะโว้ย 🔥',
  reached:'ครบงบแล้วนะ! มือที่กำลังจะกดจ่ายนั่น หยุดก่อน! 😂',
  over:'งบแตกอีกแล้วว! รูดเพลินเหมือนเงินไม่มีวันหมดเลยนะ 🔥',
  critical:'ประกาศฉุกเฉิน! กระเป๋าตังค์อยากลาพักร้อน หยุดช้อปก่อนสักวันเถอะ 😂🔥'
 }
};
export function deterministicCoach(status:WeeklyStatus,tone:CoachTone){
 if(status.limitSatang<=0||status.tier==='ok')return '';
 const info=' เหลืออีก '+status.daysLeftInWeek+' วันก่อนขึ้นสัปดาห์ใหม่ และ '+status.daysLeftInMonth+' วันก่อนสิ้นเดือน';
 return tones[tone][status.tier]+info;
}
export async function coachMessage(db:Sql,userId:string,status:WeeklyStatus,preferences:Preferences,
 generate?: (prompt:string)=>Promise<string>){
 if(!status.limitSatang||status.tier==='ok'||preferences.coach_alerts==='off')return '';
 if(preferences.coach_alerts==='once'){
  const rows=await db.unsafe(
   "INSERT INTO coach_alert_history(user_id,week_start,tier) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING tier",
   [userId,status.start,status.tier]);
  if(!rows.length)return '';
 }
 const fallback=deterministicCoach(status,preferences.coach_tone);
 if(!generate)return fallback;
 try{
  const prompt='คุณคือ MoneyFlow Coach สร้างคำเตือนสั้นๆ ภาษาไทย 1-2 ประโยค ไม่เกิน 100 ตัวอักษร บุคลิก '+preferences.coach_tone+
  ' (polite=สุภาพ friend=เพื่อนแซว roast=แซวแรงแบบขำๆไม่ทำให้อับอาย) สถานะ '+status.tier+
  ' ใช้เงิน '+formatBaht(status.spentSatang)+' จากงบ '+formatBaht(status.limitSatang)+
  ' เหลืออีก '+status.daysLeftInWeek+' วันในสัปดาห์ และ '+status.daysLeftInMonth+
  ' วันในเดือน ห้ามสร้างตัวเลขเพิ่ม ห้ามด่ารูปลักษณ์หรืออัตลักษณ์ ตอบคำเตือนล้วน ไม่มี markdown.';
  const generated=await generate(prompt);
  return generated&&generated.length<250?generated.trim():fallback;
 }catch{return fallback}
}
export function mustConfirm(mode:ConfirmationMode,
 items:Array<{kind:string;amount:number;merchant?:string;confidence?:number}>,fromImage:boolean){
 if(mode==='always')return true;
 const ambiguous=items.length===0||items.some(item=>!['expense','income'].includes(item.kind)
  ||!Number.isFinite(Number(item.amount))||Number(item.amount)<=0
  ||!String(item.merchant||'').trim()||Number(item.confidence??(fromImage?0.5:0.95))<0.85);
 if(ambiguous)return true;
 if(mode==='smart')return fromImage||items.length>3||items.some(item=>Number(item.confidence??0.95)<0.9);
 return false;
}
