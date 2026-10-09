import postgres from 'postgres';
import {handleLineMessage} from '../server/line-bot.ts';
import {weeklyStatus} from '../server/moneyflow-features.ts';

const testUrl=new URL(process.env.DATABASE_URL||'postgres://unused:unused@127.0.0.1:55432/moneyflow');testUrl.pathname='/moneyflow_features_check';
const databaseUrl=process.env.TEST_DATABASE_URL||testUrl.toString();
if(!databaseUrl.includes('moneyflow_features_check')||!databaseUrl.includes('127.0.0.1'))throw Error('Refusing non-test database');
const db=postgres(databaseUrl,{max:5});
const origin='http://127.0.0.1:5179';
const base=origin+'/api';
const assert=(ok:unknown,message:string)=>{if(!ok)throw Error('FAILED '+message)};
type CallOpts={method?:string;cookie?:string;body?:any};
async function req(path:string,opt:CallOpts={}){
 const res=await fetch(base+path,{
  method:opt.method||'GET',
  headers:{
   origin,
   'content-type':'application/json',
   ...(opt.cookie?{cookie:opt.cookie}:{})
  },
  body:opt.body?JSON.stringify(opt.body):undefined
 });
 return {status:res.status,cookie:res.headers.get('set-cookie')?.split(';')[0]||'',
  data:await res.json()};
}
try{
 const a=await req('/auth/email/register',{method:'POST',body:{name:'Mina',email:'finance-a@example.com',password:'correct123passwordA!'}});
 const b=await req('/auth/email/register',{method:'POST',body:{name:'Ploy',email:'finance-b@example.com',password:'correct123passwordB!'}});
 assert(a.status===200&&b.status===200&&a.cookie&&b.cookie,'registered two separate members');
 const dataA=await req('/data',{cookie:a.cookie});
 const dataB=await req('/data',{cookie:b.cookie});
 assert(dataA.data.accounts.length===3&&dataB.data.accounts.length===3,'default finance accounts are separate');
 const before=await req('/finance/overview',{cookie:a.cookie});
 assert(before.status===200&&Number(before.data.settings.weekly_limit_satang)===0,'weekly budget initially disabled');
 const preference=await req('/finance/preferences',{method:'PUT',cookie:a.cookie,body:{
  weekly_limit:1000,savings_goal:3000,confirmation_mode:'auto',coach_tone:'roast',coach_alerts:'every',daily_digest_enabled:false
 }});
 assert(preference.status===200&&Number(preference.data.settings.weekly_limit_satang)===100000,'weekly budget persisted');
 assert(Number(preference.data.settings.savings_goal_satang)===300000,'monthly savings goal persisted');
 assert(preference.data.settings.confirmation_mode==='auto'&&preference.data.settings.coach_tone==='roast','LINE settings persist');
 const bPreferences=await req('/finance/overview',{cookie:b.cookie});
 assert(Number(bPreferences.data.settings.weekly_limit_satang)===0,'other users never share preferences');
 const data=(await req('/data',{cookie:a.cookie})).data;
 const category=data.categories.find((c:any)=>c.kind==='expense').id;
 const account=data.accounts[0].id;
 const entry=await req('/transactions',{method:'POST',cookie:a.cookie,body:{
  account_id:account,category_id:category,kind:'expense',amount:850,
  merchant:'weekly budget smoke',transacted_at:new Date().toISOString()
 }});
 assert(entry.status===200,'new expense created');
 const first=await req('/finance/overview',{cookie:a.cookie});
 assert(first.data.week.spentSatang===85000&&first.data.week.remainingSatang===15000,'spent and budget remaining calculated in satang');
 assert(first.data.history[7].spentSatang===85000,'weekly history reflects current expense');
 assert(first.data.month.expenseSatang===85000,'monthly expense reflects same item');
 assert((await req('/finance/overview',{cookie:b.cookie})).data.week.spentSatang===0,'other member weekly finances hidden');

 const user=await req('/me',{cookie:a.cookie});
 await db.unsafe('INSERT INTO line_links(user_id,line_user_id) VALUES($1,$2)',[user.data.id,'moneyflow-test-line-a']);
 const sent:any[]=[];
 const sender=async (_to:string,msg:any,_replyToken?:string)=>{sent.push(msg)};
 const publisher=()=>{};
 const extract=async ()=>({items:[{kind:'expense',amount:160,merchant:'coffee',category:'อาหาร',confidence:0.98}],query:null});
 await handleLineMessage({
  type:'message',source:{userId:'moneyflow-test-line-a'},replyToken:'test-reply1',message:{type:'text',id:'test-expense-1',text:'กาแฟ 160'}
 },{db,send:sender,extract,publish:publisher,ai:()=>null});
 assert(sent.at(-1)?.type==='flex','LINE auto confirmation responds Flex card');
 const afterAuto=await req('/finance/overview',{cookie:a.cookie});
 assert(afterAuto.data.week.spentSatang===101000,'automatic LINE record updates weekly spending');
 assert(afterAuto.data.week.tier==='over','LINE spending triggered overbudget warning');
 assert(JSON.stringify(sent.at(-1)).includes('AI MONEY COACH'),'LINE reply has warning included alongside receipt');
 const changed=await req('/finance/preferences',{method:'PUT',cookie:a.cookie,body:{confirmation_mode:'always'}});
 assert(changed.status===200,'confirmation mode toggles');
 const sentCount=sent.length;
 await handleLineMessage({
  type:'message',source:{userId:'moneyflow-test-line-a'},replyToken:'test-reply2',message:{type:'text',id:'test-expense-2',text:'กาแฟ 160'}
 },{db,send:sender,extract,publish:publisher,ai:()=>null});
 assert(sent.length===sentCount+1&&JSON.stringify(sent.at(-1)).includes('ยืนยันบันทึก'),'preview receipt asks to confirm');
 const countBefore=await db.unsafe('SELECT COUNT(*)::int n FROM transactions WHERE user_id=$1',[user.data.id]);
 await handleLineMessage({
  type:'message',source:{userId:'moneyflow-test-line-a'},replyToken:'test-reply3',message:{type:'text',id:'test-confirm-3',text:'ยืนยัน'}
 },{db,send:sender,extract,publish:publisher,ai:()=>null});
 const countAfter=await db.unsafe('SELECT COUNT(*)::int n FROM transactions WHERE user_id=$1',[user.data.id]);
 assert(countAfter[0].n===countBefore[0].n+1,'manual confirm saves exactly one expense');
 await handleLineMessage({
  type:'message',source:{userId:'moneyflow-test-line-a'},replyToken:'test-reply4',message:{type:'text',id:'test-confirm-4',text:'ยืนยัน'}
 },{db,send:sender,extract,publish:publisher,ai:()=>null});
 const countReplay=await db.unsafe('SELECT COUNT(*)::int n FROM transactions WHERE user_id=$1',[user.data.id]);
 assert(countReplay[0].n===countAfter[0].n,'second confirmation does not duplicate');
 const weekNext=await weeklyStatus(db,user.data.id,new Date('2026-10-12T03:00:00Z'),100000);
 assert(weekNext.spentSatang===0&&weekNext.limitSatang===100000,'new Monday resets weekly totals but keeps recurring limit');
 const untouched=await db.unsafe("SELECT COUNT(*)::int n FROM transactions WHERE user_id=$1",[user.data.id]);
 assert(untouched[0].n===3,'previous weeks transactions still in database');
 console.log('PASS: per-member settings, money values and weekly rollover');
 console.log('PASS: automatic and manual LINE receipts with coach warning');
 console.log('PASS: one-time confirmation and no duplicate financial data');
 console.log('PASS: account privacy across two users and graph summaries');
 console.log('PASS: isolated test database only, production finance data untouched');
}catch(err){console.error(err);process.exitCode=1}
finally{await db.end()}
