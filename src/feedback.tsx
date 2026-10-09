import React,{useEffect,useRef,useState} from 'react';
import {CheckCircle2,AlertTriangle,Info,X,XCircle} from 'lucide-react';

export type FeedbackType='success'|'error'|'warning'|'info';
type Message={id:number;type:FeedbackType;text:string};
let sequence=0;
const EVENT='moneyflow:feedback';

export function pushToast(type:FeedbackType,text:string){
 if(typeof window==='undefined')return;
 const clean=String(text||'').trim();
 if(!clean)return;
 window.dispatchEvent(new CustomEvent(EVENT,{detail:{id:++sequence,type,text:clean.slice(0,300)}}));
}
export const success=(text:string)=>pushToast('success',text);
export const failure=(text:string)=>pushToast('error',text);

export function ToastHost(){
 const [messages,setMessages]=useState<Message[]>([]);
 const timers=useRef(new Map<number,number>());
 useEffect(()=>{
  function onMessage(event:Event){
   const item=(event as CustomEvent<Message>).detail;
   setMessages(current=>[...current,item].slice(-3));
   const timeout=window.setTimeout(()=>{
    setMessages(current=>current.filter(x=>x.id!==item.id));
    timers.current.delete(item.id);
   },item.type==='error'?6500:4400);
   timers.current.set(item.id,timeout);
  }
  window.addEventListener(EVENT,onMessage);
  return ()=>{window.removeEventListener(EVENT,onMessage);for(const timer of timers.current.values())window.clearTimeout(timer);timers.current.clear()};
 },[]);
 function dismiss(id:number){
  const timer=timers.current.get(id);
  if(timer)window.clearTimeout(timer);
  timers.current.delete(id);
  setMessages(current=>current.filter(x=>x.id!==id));
 }
 return <div className="mf-toast-stack" aria-label="การแจ้งเตือนจาก MoneyFlow">
  {messages.map(message=>{
   const Icon=message.type==='success'?CheckCircle2:message.type==='error'?XCircle:message.type==='warning'?AlertTriangle:Info;
   const heading=message.type==='success'?'สำเร็จ':message.type==='error'?'ทำรายการไม่สำเร็จ':message.type==='warning'?'กรุณาตรวจสอบ':'แจ้งให้ทราบ';
   return <div key={message.id} className={'mf-toast mf-toast-'+message.type} role={message.type==='error'?'alert':'status'} aria-live={message.type==='error'?'assertive':'polite'}>
    <span className="mf-toast-icon"><Icon size={20}/></span>
    <div className="mf-toast-copy"><b>{heading}</b><p>{message.text}</p></div>
    <button type="button" className="mf-toast-dismiss" aria-label="ปิดการแจ้งเตือน" onClick={()=>dismiss(message.id)}><X size={16}/></button>
   </div>;
  })}
 </div>;
}
