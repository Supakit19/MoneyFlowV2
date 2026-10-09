export {};
const secret=process.env.LINE_CHANNEL_ACCESS_TOKEN;
const endpoint=process.argv[2]||'';
if(!secret||!endpoint.startsWith('https://')||!endpoint.endsWith('/webhook/line')){console.error('Usage: bun server/configure-webhook.ts https://your-domain/webhook/line. Requires LINE_CHANNEL_ACCESS_TOKEN');process.exit(1)}
const headers={Authorization:'Bearer '+secret,'Content-Type':'application/json'};
const url='https://api.line.me/v2/bot/channel/webhook/endpoint';
const response=await fetch(url,{method:'PUT',headers,body:JSON.stringify({endpoint})});
console.log('LINE endpoint update HTTP',response.status);
if(!response.ok){console.log((await response.text()).slice(0,350));process.exit(1)}
const status=await fetch(url,{headers:{Authorization:'Bearer '+secret}});
const raw=await status.json();
console.log('LINE endpoint status:',JSON.stringify({httpStatus:status.status,configured:raw.endpoint===endpoint,active:raw.active===true}));
const test=await fetch('https://api.line.me/v2/bot/channel/webhook/test',{method:'POST',headers,body:JSON.stringify({endpoint})});
const result=await test.json().catch(()=>({}));
console.log('LINE webhook verify:',JSON.stringify({httpStatus:test.status,success:result.success===true,reason:result.reason?String(result.reason).slice(0,240):null,detail:result.detail?String(result.detail).slice(0,240):null}));
