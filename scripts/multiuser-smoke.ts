import postgres from 'postgres';
import {createHash} from 'node:crypto';
import {findOrCreateGoogleUser,type GoogleIdentity} from '../server/google-auth';
import type {Sql} from 'postgres';

const url=process.env.TEST_DATABASE_URL||'';
if(!url.endsWith('/moneyflow_multiuser_smoke')||!url.includes('127.0.0.1'))throw Error('Refusing to run on non-isolated test database');
const api=process.env.TEST_API_URL||'http://127.0.0.1:3148';
const db=postgres(url,{max:8});

const assert=(condition:unknown,message:string)=>{if(!condition)throw Error('FAILED: '+message)};
const google=(sub:string,email:string):GoogleIdentity=>({sub,email,name:email.split('@')[0],picture:null});
const signUp=async(sub:string,email:string,legacy='')=>db.begin(tx=>findOrCreateGoogleUser(tx as unknown as Sql,google(sub,email),legacy));
const session=async (userId:string,token:string)=>db`INSERT INTO sessions(user_id,token_hash,expires_at) VALUES(${userId},${createHash('sha256').update(token).digest('hex')},now()+interval '1 day')`;
async function call(path:string,token:string,method='GET',body?:unknown){
 const r=await fetch(api+path,{method,headers:{'Cookie':'mf_session='+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status, data:await r.json()};
}
try {
 const alex=await signUp('test-sub-alex','alex@example.com');
 const bella=await signUp('test-sub-bella','bella@example.com');
 assert(alex.created&&bella.created&&alex.userId!==bella.userId,'Separate Google accounts must be created');
 const again=await signUp('test-sub-alex','alex@example.com');
 assert(again.userId===alex.userId&&!again.created,'Google returning account must be stable');
 const third=await Promise.all([signUp('test-sub-charlie','charlie@example.com'),signUp('test-sub-charlie','charlie@example.com')]);
 assert(third[0].userId===third[1].userId,'Concurrent Google callbacks must not duplicate users');
 const checks=await db`SELECT user_id,(SELECT count(*) FROM accounts a WHERE a.user_id=u.user_id)::int accounts,(SELECT count(*) FROM categories c WHERE c.user_id=u.user_id)::int categories FROM google_links u WHERE google_sub IN ('test-sub-alex','test-sub-bella','test-sub-charlie') ORDER BY google_sub`;
 assert(checks.length===3 && checks.every(x=>x.accounts===3&&x.categories===10),'Every user gets 3 separate accounts and 10 categories');
 await session(alex.userId,'alex-session');
 await session(bella.userId,'bella-session');
 const a=await call('/api/data','alex-session');
 const b=await call('/api/data','bella-session');
 assert(a.status===200&&b.status===200,'Both Google users can fetch their own dashboard');
 assert(a.data.accounts.every((x:any)=>x.user_id===alex.userId)&&b.data.accounts.every((x:any)=>x.user_id===bella.userId),'Accounts scoped by owner');
 const aAccount=a.data.accounts[0].id,aCategory=a.data.categories.find((x:any)=>x.kind==='expense').id;
 const inserted=await call('/api/transactions','alex-session','POST',{kind:'expense',amount:57.5,account_id:aAccount,category_id:aCategory,merchant:'ALICE_PRIVATE_EXPENSE',transacted_at:'2026-10-08T12:00:00+07:00'});
 assert(inserted.status===200,'Owner A can add transaction');
 const other=await call('/api/data','bella-session');
 assert(other.data.transactions.length===0,'Owner B must see zero owner A transactions');
 const blocked=await call('/api/transactions','bella-session','POST',{kind:'expense',amount:30,account_id:aAccount,category_id:aCategory,merchant:'SHOULD_NOT_INSERT'});
 assert(blocked.status!==200,'Owner B must not write to owner A account');
 const meA=await call('/api/me','alex-session'),meB=await call('/api/me','bella-session');
 assert(meA.status===200&&meB.status===200&&meA.data.email==='alex@example.com'&&meB.data.email==='bella@example.com','Identity profile must be scoped');
 const legacy=await db`INSERT INTO users(username,password_hash) VALUES('owner','legacy-unusable') RETURNING id`;
 const recovered=await signUp('test-sub-legacy','legacy@example.com','legacy@example.com');
 assert(recovered.userId===legacy[0].id&&!recovered.created&&recovered.recoveredLegacy,'Explicitly approved Google identity recovers original owner');
 const strangers=await signUp('test-sub-stranger','stranger@example.com','legacy@example.com');
 assert(strangers.userId!==legacy[0].id&&strangers.created,'Other Google accounts never inherit legacy data');
 const count=await db`SELECT count(*)::int AS n FROM transactions`;
 assert(count[0].n===1,'Only the expected transaction is in test database');
 console.log('PASS: New Google accounts created with isolated accounts/categories');
 console.log('PASS: Returning Google login is stable; concurrent login is idempotent');
 console.log('PASS: User B cannot read or write user A transactions');
 console.log('PASS: Google profiles show only the active user');
 console.log('PASS: Old owner data can be claimed only by explicit approved Google email');
 console.log('PASS: No production MoneyFlow database modified');
}finally{await db.end();}
