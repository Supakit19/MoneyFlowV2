import postgres from 'postgres';
const url=process.env.TEST_DATABASE_URL||'';
const parsed=new URL(url);
if(parsed.hostname!=='127.0.0.1'||parsed.pathname!=='/moneyflow_validation_check_20261009')
 throw Error('SAFETY: only isolated validation test database allowed');
const db=postgres(url,{max:2});
const base=process.env.TEST_API_URL||'http://127.0.0.1:3159';
const origin='http://127.0.0.1:5180';
const assert=(condition:unknown,label:string)=>{if(!condition)throw Error('FAILED: '+label)};
const checks:string[]=[];
let session='';
async function http(path:string,body:any={},method='POST',cookie=session){
 const r=await fetch(base+'/api'+path,{
  method,
  headers:{Origin:origin,'content-type':'application/json',...(cookie?{Cookie:cookie}:{})},
  body:method==='GET'||method==='DELETE'?undefined:JSON.stringify(body)
 });
 const value=await r.json();
 return {code:r.status,value,cookie:r.headers.get('set-cookie')?.split(';')[0]||''};
}
async function reject(path:string,payload:any,label:string,method='POST'){
 const response=await http(path,payload,method);
 assert(response.code===400,label+': expected HTTP400, got '+response.code);
 assert(typeof response.value.error==='string'&&response.value.error.trim().length>0,label+': missing readable error');
 checks.push('REJECT '+label);
}
async function ok(path:string,payload:any,label:string,method='POST'){
 const response=await http(path,payload,method);
 assert(response.code===200,label+': expected HTTP200, got '+response.code+'; body '+JSON.stringify(response.value).slice(0,220));
 checks.push('PASS '+label);
 return response.value;
}
try{
 const register=await http('/auth/email/register',{email:'validation-a@example.com',name:'Validation A',password:'test-strong-password-a!'});
 assert(register.code===200&&register.cookie,'register test user');
 session=register.cookie;
 const data=await http('/data',{},'GET');
 assert(data.code===200&&data.value.accounts.length===3&&data.value.categories.length>0,'default finance data created');
 const account=data.value.accounts[0].id;
 const anotherAccount=data.value.accounts[1].id;
 const food=data.value.categories.find((x:any)=>x.kind==='expense').id;
 const salary=data.value.categories.find((x:any)=>x.kind==='income').id;
 const baseTransaction={kind:'expense',account_id:account,category_id:food,merchant:'ข้าว',note:'',amount:45.50,transacted_at:'2026-10-09T12:00:00+07:00'};
 await reject('/accounts',{name:'',kind:'bank',opening_satang:0},'missing account name');
 await reject('/accounts',{name:'Cash',kind:'wrong',opening_satang:0},'invalid account kind');
 await reject('/accounts',{name:'Cash',kind:'cash',opening_satang:-25},'negative opening balance');
 await reject('/accounts',{name:'Cash',kind:'cash',opening_satang:1.5},'noninteger opening balance');
 await ok('/accounts',{name:'ธนาคารทดสอบ',kind:'bank',opening_satang:2500},'valid bank account');
 await reject('/transactions',{...baseTransaction,merchant:''},'missing transaction title');
 await reject('/transactions',{...baseTransaction,amount:''},'missing transaction amount');
 await reject('/transactions',{...baseTransaction,amount:0},'zero transaction amount');
 await reject('/transactions',{...baseTransaction,amount:-5},'negative transaction amount');
 await reject('/transactions',{...baseTransaction,amount:'5.009'},'transaction precision > 2 digits');
 await reject('/transactions',{...baseTransaction,transacted_at:'2026-02-30T12:00:00+07:00'},'invalid calendar date');
 await reject('/transactions',{...baseTransaction,category_id:salary},'income category for expense');
 await reject('/transactions',{...baseTransaction,kind:'transfer',to_account_id:account},'same source/destination transfer');
 const created=await ok('/transactions',baseTransaction,'valid expense');
 assert(created.amount_satang==='4550'||created.amount_satang===4550,'expense stored as exact satang');
 await reject('/budgets',{month:'2026-10',category_id:food,amount:0},'zero budget limit','PUT');
 await reject('/budgets',{month:'2026-13',category_id:food,amount:1000},'invalid budget month','PUT');
 await reject('/budgets',{month:'2026-10',category_id:salary,amount:1000},'income category in budget','PUT');
 await ok('/budgets',{month:'2026-10',category_id:food,amount:1200},'valid monthly budget','PUT');
 const recurring={title:'ค่าห้อง',kind:'expense',account_id:account,category_id:food,amount:3200,day_of_month:5};
 await reject('/recurring',{...recurring,title:''},'missing recurring title');
 await reject('/recurring',{...recurring,day_of_month:0},'recurring day zero');
 await reject('/recurring',{...recurring,day_of_month:32},'recurring day 32');
 await reject('/recurring',{...recurring,day_of_month:1.5},'recurring noninteger day');
 await reject('/recurring',{...recurring,category_id:salary},'invalid recurring category');
 const rule=await ok('/recurring',recurring,'valid recurring rule');
 await reject('/ai/parse',{text:'  '},'blank AI text');
 await reject('/ai/parse',{text:'a'.repeat(2001)},'oversize AI text');
 await reject('/finance/preferences',{weekly_limit:'',savings_goal:100},'blank weekly limit','PUT');
 await reject('/finance/preferences',{weekly_limit:100,savings_goal:'0.009'},'savings decimal precision','PUT');
 await reject('/finance/preferences',{weekly_limit:-1,savings_goal:0},'negative weekly budget','PUT');
 await reject('/finance/preferences',{confirmation_mode:'always',daily_digest_enabled:true,daily_digest_hour:25},'invalid digest hour','PUT');
 await ok('/finance/preferences',{weekly_limit:1500,savings_goal:250},'valid weekly & savings setting','PUT');
 await ok('/finance/preferences',{confirmation_mode:'smart',coach_tone:'friend',coach_alerts:'once',daily_digest_enabled:false,daily_digest_hour:20},'valid LINE AI setting','PUT');
 const after=await http('/data',{},'GET');
 assert(after.value.transactions.length===1,'no invalid writes occurred');
 assert(after.value.recurring.length===1,'only one valid recurring rule exists');
 await ok('/transactions/'+created.id,{},'delete expense','DELETE');
 await ok('/recurring/'+rule.id,{},'delete recurring','DELETE');
 const afterDelete=await http('/data',{},'GET');
 assert(afterDelete.value.transactions.length===0&&afterDelete.value.recurring.length===0,'deletion confirmed');
 const b=await http('/auth/email/register',{email:'validation-b@example.com',name:'Validation B',password:'test-strong-password-b!'},'POST','');
 assert(b.code===200&&b.cookie,'second user created');
 const bData=await http('/data',{},'GET',b.cookie);
 assert(bData.code===200&&bData.value.budgets.length===0,'user B does not see user A budgets');
 const totals=await db`SELECT
  (SELECT count(*)::int FROM users) AS users,
  (SELECT count(*)::int FROM transactions) AS transactions,
  (SELECT count(*)::int FROM recurring_rules) AS recurring`;
 console.log('VALIDATION_API_CHECKS',checks.length);
 console.log(checks.join('\n'));
 console.log('TEST_DB_COUNTS',JSON.stringify(totals[0]));
 console.log('PRODUCTION_DB_UNTOUCHED: independent test database used');
}finally{await db.end()}
