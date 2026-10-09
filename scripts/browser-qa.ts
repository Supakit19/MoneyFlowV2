import postgres from 'postgres';
import {createHash,randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';

const projectUrl=new URL(process.env.DATABASE_URL||'postgres://unused:unused@127.0.0.1:55432/moneyflow');
projectUrl.pathname='/moneyflow_features_check';
const db=postgres(projectUrl.toString(),{max:1});
const member=await db.unsafe('SELECT id FROM users WHERE email=$1',['finance-a@example.com']);
if(!member.length)throw Error('Missing isolated QA member');
const testToken=randomBytes(32).toString('hex');
await db.unsafe("INSERT INTO sessions(token_hash,user_id,expires_at,auth_method) VALUES($1,$2,now()+interval '1 hour','email')",
 [createHash('sha256').update(testToken).digest('hex'),member[0].id]);
const tabs=await fetch('http://127.0.0.1:9272/json/list').then(r=>r.json());
const tab=tabs.find(x=>x.type==='page'&&x.url.includes('127.0.0.1:5179'));
if(!tab)throw Error('No browser tab');
const client=new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((ok,no)=>{client.onopen=ok;client.onerror=no});
let n=0;const callbacks=new Map();
client.onmessage=(event)=>{
 const value=JSON.parse(event.data);if(!value.id)return;
 const cb=callbacks.get(value.id);if(!cb)return;
 callbacks.delete(value.id);value.error?cb.no(Error(JSON.stringify(value.error))):cb.ok(value.result);
};
const send=(method,params={})=>new Promise((ok,no)=>{
 const id=++n;callbacks.set(id,{ok,no});client.send(JSON.stringify({id,method,params}));
});
const run=async expression=>{
 const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
 return result.result?.value;
};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const metrics=()=>run("(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,menu:document.querySelector('.breadcrumb b')?.textContent,cardCount:document.querySelectorAll('.mf-week-card,.mf-savings-card,.mf-setting-card,.mf-insight').length,ws:document.querySelector('.mf-sync')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth+2}))()");
const clickView=name=>run("(()=>{let e=[...document.querySelectorAll('.nav-item')].find(x=>x.textContent.includes("+JSON.stringify(name)+"));if(e)e.click();return !!e})()");
const shot=async label=>{
 const snap=await send('Page.captureScreenshot',{format:'png'});
 await writeFile('/tmp/moneyflow-ui-'+label+'.png',Buffer.from(snap.data,'base64'));
};
try{
 await send('Network.enable');
 await send('Network.setCookie',{name:'mf_session',value:testToken,domain:'127.0.0.1',path:'/',httpOnly:true});
 await send('Page.enable');
 await send('Runtime.enable');
 await send('Page.navigate',{url:'http://127.0.0.1:5179/'});
 await wait(1500);
 console.log('DESKTOP_DASH',JSON.stringify(await metrics()));
 const before=await run("document.querySelector('.mf-week-total strong')?.textContent?.trim()");
 const post=await run("(async()=>{const d=await fetch('/api/data').then(r=>r.json());const c=d.categories.find(x=>x.kind==='expense');const resp=await fetch('/api/transactions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'expense',amount:25,merchant:'WS LIVE TEST',account_id:d.accounts[0].id,category_id:c.id,transacted_at:new Date().toISOString()})});return resp.status})()");
 await wait(1250);
 const after=await run("document.querySelector('.mf-week-total strong')?.textContent?.trim()");
 console.log('WEBSOCKET_REFRESH',JSON.stringify({before,after,postHttp:post,updated:before!==after}));
 if(before===after||post!==200)process.exitCode=1;
 await clickView('งบประมาณ');await wait(200);
 console.log('DESKTOP_BUDGET',JSON.stringify(await metrics()));
 await shot('budget-desktop');
 await clickView('LINE & AI');await wait(200);
 console.log('DESKTOP_LINE',JSON.stringify(await metrics()));
 await shot('line-desktop');
 for(const width of [320,360,375,390,414,430,768]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:width<=430?790:900,deviceScaleFactor:1,mobile:width<=430,screenWidth:width,screenHeight:width<=430?790:900});
  await wait(250);
  const m=await metrics();
  console.log('MOBILE',width,JSON.stringify(m));
  if(m.overflow)process.exitCode=1;
  if([320,375,390,414].includes(width))await shot('line-'+width);
  if(width===390){
   await clickView('งบประมาณ');await wait(180);
   console.log('MOBILE_BUDGET_390',JSON.stringify(await metrics()));await shot('budget-390');
   await clickView('LINE & AI');
  }
 }
}finally{
 client.close();
 await db.unsafe('DELETE FROM sessions WHERE token_hash=$1',[createHash('sha256').update(testToken).digest('hex')]);
 await db.end();
}
