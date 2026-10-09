import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,X} from 'lucide-react';

type ConfirmOptions={
 title:string;
 description:string;
 confirmLabel?:string;
 cancelLabel?:string;
 tone?:'danger'|'normal';
};
type ConfirmRequest={options:ConfirmOptions;resolve:(confirmed:boolean)=>void};
const CONFIRM_EVENT='moneyflow:confirm-dialog';

/** A styled, non-blocking replacement for native window.confirm. */
export function askConfirm(options:ConfirmOptions):Promise<boolean>{
 return new Promise(resolve=>{
  window.dispatchEvent(new CustomEvent<ConfirmRequest>(CONFIRM_EVENT,{
   detail:{options,resolve}
  }));
 });
}

export function ConfirmDialogHost(){
 const [request,setRequest]=useState<ConfirmRequest|null>(null);
 const cancelRef=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  const onRequest=(event:Event)=>{
   const next=(event as CustomEvent<ConfirmRequest>).detail;
   setRequest(previous=>{
    if(previous)previous.resolve(false);
    return next;
   });
  };
  window.addEventListener(CONFIRM_EVENT,onRequest);
  return ()=>window.removeEventListener(CONFIRM_EVENT,onRequest);
 },[]);
 const finish=(result:boolean)=>{
  if(!request)return;
  setRequest(null);
  request.resolve(result);
 };
 useEffect(()=>{
  if(!request)return;
  const previousFocus=document.activeElement as HTMLElement|null;
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  cancelRef.current?.focus();
  const onKeydown=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){
    event.preventDefault();
    finish(false);
   }
   if(event.key==='Tab'){
    const dialog=document.querySelector<HTMLElement>('.mf-confirm-card');
    const buttons=Array.from(dialog?.querySelectorAll<HTMLButtonElement>('button:not([disabled])')||[]);
    if(buttons.length===0)return;
    const current=buttons.indexOf(document.activeElement as HTMLButtonElement);
    if(event.shiftKey&&current<=0){event.preventDefault();buttons[buttons.length-1].focus();}
    else if(!event.shiftKey&&current===buttons.length-1){event.preventDefault();buttons[0].focus();}
   }
  };
  window.addEventListener('keydown',onKeydown);
  return ()=>{
   document.body.style.overflow=previousOverflow;
   window.removeEventListener('keydown',onKeydown);
   previousFocus?.focus();
  };
 },[request]);
 if(!request)return null;
 const {title,description,confirmLabel='ยืนยัน',cancelLabel='ยกเลิก',tone='danger'}=request.options;
 return <div className="mf-confirm-backdrop" onMouseDown={event=>{
  if(event.target===event.currentTarget)finish(false);
 }}>
  <section className="mf-confirm-card" role="alertdialog" aria-modal="true"
   aria-labelledby="mf-confirm-title" aria-describedby="mf-confirm-description">
   <button className="mf-confirm-close" type="button" aria-label="ปิดหน้าต่าง" onClick={()=>finish(false)}>
    <X size={18}/>
   </button>
   <div className={'mf-confirm-symbol '+(tone==='danger'?'is-danger':'')}>
    <AlertTriangle size={25} strokeWidth={1.9}/>
   </div>
   <div className="mf-confirm-eyebrow">ยืนยันการดำเนินการ</div>
   <h2 id="mf-confirm-title">{title}</h2>
   <p id="mf-confirm-description">{description}</p>
   <div className="mf-confirm-actions">
    <button ref={cancelRef} type="button" className="mf-confirm-cancel" onClick={()=>finish(false)}>
     {cancelLabel}
    </button>
    <button type="button" className={'mf-confirm-accept '+(tone==='danger'?'is-danger':'')}
     onClick={()=>finish(true)}>{confirmLabel}</button>
   </div>
  </section>
 </div>;
}
