import postgres from 'postgres';
import {handleLineMessage} from '../server/line-bot.ts';
const url=new URL(process.env.DATABASE_URL||'postgres://unused:unused@127.0.0.1:55432/moneyflow');
url.pathname='/moneyflow_features_check';
const db=postgres(url.toString(),{max:3});
const user=await db.unsafe("SELECT user_id FROM line_links WHERE line_user_id='moneyflow-test-line-a'");
const seen:any[]=[];
const send=async(_userId:string,message:any)=>{seen.push(message)};
const deps={db,send,publish:()=>{},ai:()=>null,extract:async()=>({items:[{kind:'expense',amount:160,merchant:'กาแฟ',category:'อาหาร',confidence:.98}],query:null})};
const ev=(message:string,suffix:string)=>({
 source:{userId:'moneyflow-test-line-a'},replyToken:'test-only-'+suffix,type:'message',message:{type:'text',id:'test-debug-'+suffix,text:message}
});
try{
 await handleLineMessage(ev('กาแฟ 160','a'),deps);
 const p=await db.unsafe('SELECT id,items,expires_at FROM pending WHERE user_id=$1',[user[0].user_id]);
 console.log('PENDING',JSON.stringify({n:p.length,items:p[0]?.items,itemsIsArray:Array.isArray(p[0]?.items),itemsType:typeof p[0]?.items}));
 await handleLineMessage(ev('ยืนยัน','b'),deps);
 const transactions=await db.unsafe('SELECT merchant,source_message_id FROM transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 4',[user[0].user_id]);
 console.log('TRANSACTIONS',JSON.stringify(transactions));
 console.log('MESSAGES',JSON.stringify(seen.map(x=>typeof x==='string'?x:x.altText||x.text)));
}finally{await db.end()}
