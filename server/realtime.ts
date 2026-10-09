import type {Sql} from 'postgres';
import {createHash} from 'node:crypto';

type ClientData={userId:string;sessionHash:string};
export type PublishEvent='finance.changed'|'settings.changed'|'line.connected';
export type PublishFn=(userId:string,type?:PublishEvent)=>void;

export function startRealtime(db:Sql,port:number):PublishFn{
 const expected=process.env.NODE_ENV==='production'
  ? [process.env.WEB_ORIGIN||''].filter(Boolean)
  : ['http://localhost:5178','http://127.0.0.1:5178'];
 if(process.env.NODE_ENV!=='production'&&process.env.WEB_ORIGIN)
  expected.push(process.env.WEB_ORIGIN);
 const server=Bun.serve<ClientData>({
  hostname:process.env.LISTEN_HOST||'127.0.0.1',port,
  async fetch(request,instance){
   const url=new URL(request.url);
   if(url.pathname!=='/ws/live')return new Response('Not Found',{status:404});
   if(!expected.includes(request.headers.get('origin')||''))return new Response('Forbidden',{status:403});
   const token=(request.headers.get('cookie')||'').match(/(?:^|;\s*)mf_session=([^;]+)/)?.[1]||'';
   if(!token)return new Response('Unauthorized',{status:401});
   const hash=createHash('sha256').update(token).digest('hex');
   const rows=await db.unsafe(
    'SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now() LIMIT 1',
    [hash]
   );
   if(!rows.length)return new Response('Unauthorized',{status:401});
   if(instance.upgrade(request,{data:{userId:rows[0].user_id,sessionHash:hash}}))return;
   return new Response('WebSocket Upgrade Required',{status:426});
  },
  websocket:{
   open(ws){
    ws.subscribe('moneyflow-user:'+ws.data.userId);
    ws.send(JSON.stringify({type:'ready',at:new Date().toISOString()}));
   },
   async message(ws,data){
    // No write operations over WebSocket. Clients are read-only subscribers.
    if(String(data).length>100)return ws.close(1009,'Message too long');
    if(String(data)==='ping'){
     const rows=await db.unsafe('SELECT 1 FROM sessions WHERE token_hash=$1 AND expires_at>now()', [ws.data.sessionHash]);
     if(!rows.length)return ws.close(1008,'Session expired');
     ws.send(JSON.stringify({type:'pong'}));
    }
   },
   close(ws){ws.unsubscribe('moneyflow-user:'+ws.data.userId)},
   idleTimeout:90,
   maxPayloadLength:1024
  }
 });
 console.log('MoneyFlow WebSocket ws://127.0.0.1:'+port+'/ws/live');
 return (userId,type='finance.changed')=>{
  server.publish('moneyflow-user:'+userId,JSON.stringify({type,at:new Date().toISOString()}));
 };
}
