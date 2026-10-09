import type {Sql} from 'postgres';
import {weeklyStatus} from './moneyflow-features.ts';
import {daySummaryCard} from './line-flex.ts';

const todayTH=()=>new Intl.DateTimeFormat('en-CA',{
 timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date());
const clockTH=()=>Number(new Intl.DateTimeFormat('en-GB',{
 timeZone:'Asia/Bangkok',hour:'2-digit',hourCycle:'h23'
}).format(new Date()));
const nextDay=(iso:string)=>new Date(new Date(iso+'T00:00:00Z').getTime()+86400000).toISOString().slice(0,10);

let running=false;
export async function runDailyDigest(db:Sql){
 if(running||!process.env.LINE_CHANNEL_ACCESS_TOKEN)return;
 running=true;
 try{
  const day=todayTH(),hour=clockTH();
  const rows=await db.unsafe(
   'SELECT fp.user_id,l.line_user_id,fp.weekly_limit_satang FROM finance_preferences fp JOIN line_links l ON l.user_id=fp.user_id WHERE fp.daily_digest_enabled=true AND fp.daily_digest_hour <= $1',
   [hour]
  );
  for(const row of rows){
   const reserved=await db.unsafe(
    'INSERT INTO daily_digest_history(user_id,day) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING user_id',
    [row.user_id,day]
   );
   if(!reserved.length)continue;
   try{
    const totals=await db.unsafe(
     "SELECT kind,COALESCE(SUM(amount_satang),0)::text amount FROM transactions WHERE user_id=$1 AND kind IN('income','expense') AND transacted_at>=$2::timestamptz AND transacted_at<$3::timestamptz GROUP BY kind",
     [row.user_id,day+'T00:00:00+07:00',nextDay(day)+'T00:00:00+07:00']
    );
    const income=Number(totals.find(r=>r.kind==='income')?.amount||0);
    const expense=Number(totals.find(r=>r.kind==='expense')?.amount||0);
    const week=await weeklyStatus(db,row.user_id,new Date(),Number(row.weekly_limit_satang));
    const msg=daySummaryCard(day,expense,income,week);
    const response=await fetch('https://api.line.me/v2/bot/message/push',{
     method:'POST',
     headers:{
      'Content-Type':'application/json',
      'Authorization':'Bearer '+process.env.LINE_CHANNEL_ACCESS_TOKEN
     },
     body:JSON.stringify({to:row.line_user_id,messages:[msg]}),
     signal:AbortSignal.timeout(12000)
    });
    if(!response.ok)throw Error('LINE Push HTTP '+response.status);
   }catch(err:any){
    await db.unsafe('DELETE FROM daily_digest_history WHERE user_id=$1 AND day=$2',[row.user_id,day]);
    console.error('LINE opted-in digest not delivered:',String(err?.message||'unknown').slice(0,120));
   }
  }
 }catch(err:any){
  console.error('Daily digest processing:',String(err?.message||'unknown').slice(0,120));
 }finally{running=false}
}
