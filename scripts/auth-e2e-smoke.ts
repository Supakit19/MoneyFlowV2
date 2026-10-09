import postgres from 'postgres';
import {createHash} from 'node:crypto';
import {findOrCreateGoogleUser} from '../server/google-auth.ts';
import type {Sql} from 'postgres';
const dbUrl=process.env.TEST_DATABASE_URL||'';
if(!dbUrl.includes('moneyflow_auth_check')||!dbUrl.includes('127.0.0.1'))throw Error('Isolated test DB required');
const sql=postgres(dbUrl,{max:4});
const base='http://127.0.0.1:3146';
const origin='http://127.0.0.1:5178';
const assert=(a:any,msg:string)=>{if(!a)throw Error('FAILED: '+msg)};
async function call(path:string,opts:{body?:any;cookie?:string;method?:string;origin?:string}={}){
 const res=await fetch(base+'/api'+path,{
  method:opts.method||'POST',
  headers:{'Content-Type':'application/json','Origin':opts.origin||origin,...(opts.cookie?{'Cookie':opts.cookie}:{})},
  body:opts.method==='GET'?undefined:JSON.stringify(opts.body||{})
 });
 const result=await res.json();
 return {status:res.status,data:result,cookie:res.headers.get('set-cookie')?.split(';')[0]||''};
}
try {
 const a=await call('/auth/email/register',{body:{name:'A Test',email:'testa@example.com',password:'strongpasswordA!'}});
 const b=await call('/auth/email/register',{body:{name:'B Test',email:'testb@example.com',password:'strongpasswordB!'}});
 assert(a.status===200&&b.status===200&&a.cookie&&b.cookie,'Two independent email accounts created');
 assert(a.cookie!==b.cookie,'Session cookies unique');
 const aData=await call('/data',{method:'GET',cookie:a.cookie});
 const bData=await call('/data',{method:'GET',cookie:b.cookie});
 assert(aData.status===200&&bData.status===200&&aData.data.accounts.length===3&&bData.data.accounts.length===3,'Default accounts created');
 assert(aData.data.categories.length===10&&bData.data.categories.length===10,'Default categories created');
 assert(aData.data.accounts[0].user_id!==bData.data.accounts[0].user_id,'Account ownership isolated');
 const duplicate=await call('/auth/email/register',{body:{name:'Other',email:'TESTA@example.com',password:'strongpasswordC!'}});
 assert(duplicate.status===400,'Emails unique without case sensitivity');
 const wrong=await call('/auth/email/login',{body:{email:'testa@example.com',password:'not-correct'}});
 assert(wrong.status===401,'Wrong password rejected');
 const signed=await call('/auth/email/login',{body:{email:'TESTA@example.com',password:'strongpasswordA!'}});
 assert(signed.status===200&&signed.cookie,'Existing email logs into original profile');
 const me=await call('/me',{method:'GET',cookie:signed.cookie});
 assert(me.data.email==='testa@example.com'&&me.data.password_set===true,'Email owner profile correct');
 const catA=aData.data.categories.find((c:any)=>c.kind==='expense');
 const tran=await call('/transactions',{cookie:a.cookie,body:{kind:'expense',amount:80,account_id:aData.data.accounts[0].id,category_id:catA.id,merchant:'PRIVATE_A',transacted_at:'2026-10-08T12:00:00+07:00'}});
 assert(tran.status===200,'Account A can create finance transaction');
 const bAfter=await call('/data',{method:'GET',cookie:b.cookie});
 assert(bAfter.data.transactions.length===0,'Account B cannot read A transactions');
 const writeB=await call('/transactions',{cookie:b.cookie,body:{kind:'expense',amount:20,account_id:aData.data.accounts[0].id,category_id:catA.id}});
 assert(writeB.status!==200,'B cannot write A transactions');
 console.log('PASS email register/login and account isolation');

 const challenge=await call('/auth/line/start');
 assert(challenge.status===200&&challenge.data.code.length===8,'Created 8-digit LINE login code');
 const body={id:challenge.data.id,secret:challenge.data.secret};
 const pending=await call('/auth/line/status',{body});
 assert(pending.status===200&&pending.data.approved===false,'Challenge starts pending');
 const before=await call('/auth/line/complete',{body});
 assert(before.status===403,'Cannot login without LINE confirmation');
 const bad=await call('/auth/line/status',{body:{id:body.id,secret:'f'.repeat(64)}});
 assert(bad.status!==200,'Secret mismatch rejected');
 const aId=me.data.id;
 const hash=createHash('sha256').update('line-login:'+challenge.data.code).digest('hex');
 await sql`UPDATE line_login_challenges SET status='approved',user_id=${aId},approved_at=now() WHERE code_hash=${hash}`;
 const approved=await call('/auth/line/status',{body});
 assert(approved.data.approved===true,'LINE confirmation allows browser challenge');
 const complete=await call('/auth/line/complete',{body});
 assert(complete.status===200&&complete.cookie,'One-time LINE login creates session');
 const replay=await call('/auth/line/complete',{body});
 assert(replay.status===403,'LINE login token cannot be replayed');
 const lineProfile=await call('/me',{method:'GET',cookie:complete.cookie});
 assert(lineProfile.data.id===aId,'LINE login returns to same MoneyFlow account');
 console.log('PASS LINE challenge approval, token secrecy, and replay protection');

 const reset=await call('/auth/password/change',{cookie:complete.cookie,body:{password:'newverystrongpasswordA!'}});
 assert(reset.status===200,'Recent LINE session permits password recovery');
 const old=await call('/auth/email/login',{body:{email:'testa@example.com',password:'strongpasswordA!'}});
 const newer=await call('/auth/email/login',{body:{email:'testa@example.com',password:'newverystrongpasswordA!'}});
 assert(old.status===401&&newer.status===200,'Password reset invalidates old credential');
 console.log('PASS password reset using linked LINE auth');

 // Simulate a Google-verified new member and an explicitly recent Google session.
 const google=await sql.begin(tx=>findOrCreateGoogleUser(tx as unknown as Sql,{
  sub:'google-c-test',email:'googlec@example.com',name:'Google C',picture:null
 }));
 assert(google.created,'Google member created');
 const token='googlec-test-session-only';
 await sql`INSERT INTO sessions(token_hash,user_id,expires_at,auth_method) VALUES(${createHash('sha256').update(token).digest('hex')},${google.userId},now()+interval '1 day','google')`;
 const connected=await call('/auth/email/connect',{cookie:'mf_session='+token,body:{email:'googlec@example.com',password:'googlecNewStrongPassword!'}});
 assert(connected.status===200,'Google account can add same verified email and password');
 const cLogin=await call('/auth/email/login',{body:{email:'googlec@example.com',password:'googlecNewStrongPassword!'}});
 assert(cLogin.status===200,'New email login opens existing Google account');
 const cMe=await call('/me',{cookie:cLogin.cookie,method:'GET'});
 assert(cMe.data.id===google.userId,'Google and email login share same finance user ID');
 const otherEmail=await call('/auth/email/connect',{cookie:'mf_session='+token,body:{email:'someoneelse@example.com',password:'strongpassword999'}});
 assert(otherEmail.status!==200,'Cannot attach other emails to verified Google identity');
 console.log('PASS optional email linking to existing Google finance account');

 const unauthorized=await call('/me',{method:'GET'});
 assert(unauthorized.status===401,'Finance profile requires authentication');
 const malformed=await call('/auth/email/register',{body:{email:'bad',name:'x',password:'foo'},origin:'https://bad.example'});
 assert(malformed.status===403,'Cross-site account registration blocked');
 console.log('PASS auth origin checks');
 const totals=await sql`SELECT count(*)::int n FROM transactions`;
 assert(totals[0].n===1,'Only 1 test finance transaction stored');
 console.log('AUTH_SMOKE_ALL_PASS',JSON.stringify({users:3,financeRows:totals[0].n}));
} finally {await sql.end()}
