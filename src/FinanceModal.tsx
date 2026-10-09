import React,{useState} from 'react';
import {AlertTriangle,Check,Info,X} from 'lucide-react';
import {pushToast} from './feedback';
import {
 type FieldErrors,type FinanceKind,type FinanceModalType,validateFinanceModal
} from './validation';

type Account={id:string;name:string};
type Category={id:string;kind:string;name:string};
type Props={
 modal:FinanceModalType;initialKind:FinanceKind;accounts:Account[];
 categories:Category[];month:string;demo:boolean;
 onClose:()=>void;
 onSaved:(mode:FinanceModalType,payload:Record<string,unknown>)=>Promise<void>;
};
const thaiToday=()=>new Intl.DateTimeFormat('en-CA',{
 timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date());

export default function FinanceModal({modal,initialKind,accounts,categories,month,demo,onClose,onSaved}:Props){
 const [kind,setKind]=useState<FinanceKind>(modal==='recurring'&&initialKind==='transfer'?'expense':initialKind);
 const [form,setForm]=useState<Record<string,string>>(()=>({
  name:'',title:'',merchant:'',note:'',amount:'',
  kind:modal==='account'?'bank':initialKind,
  account_id:accounts[0]?.id||'',
  to_account_id:'',
  category_id:categories.find(x=>x.kind===(initialKind==='transfer'?'expense':initialKind))?.id||'',
  transacted_at:thaiToday(),
  day_of_month:'1'
 }));
 const [errors,setErrors]=useState<FieldErrors>({});
 const [serverError,setServerError]=useState('');
 const [busy,setBusy]=useState(false);

 const update=(name:string,value:string)=>{
  setForm(current=>({...current,[name]:value}));
  setErrors(current=>{if(!current[name])return current;const copy={...current};delete copy[name];return copy});
  setServerError('');
 };
 const setTransactionKind=(next:FinanceKind)=>{
  setKind(next);
  setErrors({});
  setServerError('');
  setForm(current=>({...current,kind:next,category_id:categories.find(x=>x.kind===next)?.id||'',to_account_id:''}));
 };
 function field(name:string,label:string,content:React.ReactNode,required=true){
  return <div className={'mf-form-field '+(errors[name]?'has-error':'')} key={name}>
   <label htmlFor={'mf-form-'+name}>{label}{required&&<span className="mf-required" aria-hidden="true"> *</span>}</label>
   {content}
   {errors[name]&&<p className="mf-field-error" id={'mf-form-'+name+'-error'} role="alert"><AlertTriangle size={13}/>{errors[name]}</p>}
  </div>;
 }
 const invalid=(name:string)=>({
  'aria-invalid':!!errors[name] as boolean,
  'aria-describedby':errors[name]?'mf-form-'+name+'-error':undefined,
  className:errors[name]?'mf-invalid':''
 });
 const input=(name:string,attributes:React.InputHTMLAttributes<HTMLInputElement>)=>
  <input id={'mf-form-'+name} {...attributes} {...invalid(name)}
   value={form[name]||''} onChange={event=>update(name,event.target.value)}/>;
 const select=(name:string,options:React.ReactNode)=>
  <select id={'mf-form-'+name} {...invalid(name)} value={form[name]||''}
   onChange={event=>update(name,event.target.value)}>{options}</select>;
 const accountOptions=<><option value="">เลือกบัญชีเงิน</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</>;
 const categoryOptions=(selectedKind:string)=><><option value="">เลือกหมวดหมู่</option>{
  categories.filter(c=>c.kind===selectedKind).map(c=><option key={c.id} value={c.id}>{c.name}</option>)
 }</>;
 const titles:Record<FinanceModalType,string>={
  transaction:'เพิ่มรายการใหม่',account:'เพิ่มบัญชีเงิน',budget:'ตั้งงบประมาณ',recurring:'เพิ่มรายการประจำ'
 };
 const notification:Record<FinanceModalType,string>={
  transaction:'บันทึกรายการการเงินเรียบร้อยแล้ว',
  account:'เพิ่มบัญชีเงินเรียบร้อยแล้ว',
  budget:'บันทึกงบประมาณเรียบร้อยแล้ว',
  recurring:'เพิ่มรายการประจำเรียบร้อยแล้ว'
 };
 async function save(e:React.FormEvent){
  e.preventDefault();
  if(busy)return;
  setServerError('');
  const problems=validateFinanceModal(modal,form,kind,accounts,categories,month);
  setErrors(problems);
  if(Object.keys(problems).length){
   pushToast('error','กรุณาตรวจสอบข้อมูลที่กรอกไม่ครบหรือไม่ถูกต้อง');
   requestAnimationFrame(()=>document.querySelector<HTMLElement>('.modal-card [aria-invalid="true"]')?.focus());
   return;
  }
  if(demo){pushToast('warning','โหมดตัวอย่างไม่สามารถบันทึกได้ กรุณาเข้าสู่ระบบก่อน');return}
  setBusy(true);
  try{
   let payload:Record<string,unknown>={};
   const amount=Number(form.amount||0);
   if(modal==='transaction')payload={
    amount,kind,account_id:form.account_id,
    category_id:kind==='transfer'?null:form.category_id,
    to_account_id:kind==='transfer'?form.to_account_id:null,
    merchant:kind==='transfer'?'โอนเงิน':form.merchant.trim(),
    note:form.note.trim(),transacted_at:form.transacted_at+'T12:00:00+07:00'
   };
   if(modal==='account')payload={name:form.name.trim(),kind:form.kind,opening_satang:Math.round(amount*100)};
   if(modal==='budget')payload={month,category_id:form.category_id,amount};
   if(modal==='recurring')payload={
    title:form.title.trim(),kind,amount,account_id:form.account_id,
    category_id:form.category_id,day_of_month:Number(form.day_of_month)
   };
   await onSaved(modal,payload);
   onClose();
   pushToast('success',notification[modal]);
  }catch(error:any){
   const message=String(error?.message||'บันทึกข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง');
   setServerError(message);
   pushToast('error',message);
  }finally{setBusy(false)}
 }
 return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose()}}>
  <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="mf-modal-title">
   <div className="modal-title">
    <div><span className="eyebrow">MONEYFLOW</span><h2 id="mf-modal-title">{titles[modal]}</h2>
     <p className="mf-form-subtitle">ช่องที่มีเครื่องหมาย <span className="mf-required">*</span> จำเป็นต้องกรอก</p></div>
    <button type="button" className="iconbtn" disabled={busy} aria-label="ปิดฟอร์ม" onClick={onClose}><X size={20}/></button>
   </div>
   <form noValidate onSubmit={save}>
    {['transaction','recurring'].includes(modal)&&<div className="type-switch" role="group" aria-label="ประเภทรายการ">
     {(['expense','income',...(modal==='transaction'?['transfer']:[])] as FinanceKind[]).map(option=>
      <button type="button" key={option} className={kind===option?'selected':''} aria-pressed={kind===option}
       onClick={()=>setTransactionKind(option)}>{option==='expense'?'รายจ่าย':option==='income'?'รายรับ':'โอนเงิน'}</button>
     )}
    </div>}
    {modal==='account'&&<>
     {field('name','ชื่อบัญชี',input('name',{type:'text',autoFocus:true,maxLength:60,placeholder:'เช่น KBank, เงินสด'}))}
     {field('kind','ประเภทบัญชี',select('kind',<>
      <option value="bank">ธนาคาร</option><option value="cash">เงินสด</option><option value="wallet">วอลเล็ต</option>
     </>))}
    </>}
    {modal==='recurring'&&field('title','ชื่อรายการประจำ',input('title',{type:'text',autoFocus:true,maxLength:80,placeholder:'เช่น ค่าเช่าห้อง'}))}
    {modal==='transaction'&&kind!=='transfer'&&field('merchant','ชื่อรายการ / ร้านค้า',input('merchant',{
     type:'text',autoFocus:true,maxLength:120,placeholder:'เช่น กาแฟลาเต้'
    }))}
    {field('amount',modal==='budget'?'วงเงินงบประมาณ (บาท)':modal==='account'?'ยอดตั้งต้น (บาท)':'จำนวนเงิน (บาท)',
     <div className={'money-input '+(errors.amount?'mf-invalid':'')}><span>฿</span>
      {input('amount',{type:'number',min:modal==='account'?0:0.01,max:10000000,step:'0.01',inputMode:'decimal',placeholder:modal==='account'?'ไม่กรอกเท่ากับ 0':'0.00'})}
     </div>,modal!=='account')}
    {modal==='account'&&<p className="mf-optional-help"><Info size={14}/> ถ้าเริ่มบัญชีด้วยยอด 0 บาท สามารถเว้นว่างได้</p>}
    {modal==='budget'&&field('category_id','หมวดหมู่งบประมาณ',select('category_id',categoryOptions('expense')))}
    {['transaction','recurring'].includes(modal)&&<>
     {field('account_id','บัญชีเงิน',select('account_id',accountOptions))}
     {kind==='transfer'&&modal==='transaction'?
      field('to_account_id','โอนไปบัญชี',select('to_account_id',<>
       <option value="">เลือกบัญชีปลายทาง</option>
       {accounts.filter(a=>a.id!==form.account_id).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
      </>)):
      field('category_id','หมวดหมู่',select('category_id',categoryOptions(kind)))}
    </>}
    {modal==='transaction'&&<>
     {field('transacted_at','วันที่',input('transacted_at',{type:'date'}))}
     {field('note','หมายเหตุ',input('note',{type:'text',maxLength:500,placeholder:'รายละเอียดเพิ่มเติม (ไม่บังคับ)'}),false)}
    </>}
    {modal==='recurring'&&field('day_of_month','วันที่ของทุกเดือน',input('day_of_month',{
     type:'number',inputMode:'numeric',min:1,max:31,step:1,placeholder:'1 ถึง 31'
    }))}
    {serverError&&<p className="mf-form-banner-error" role="alert"><AlertTriangle size={15}/>{serverError}</p>}
    <div className="modal-actions">
     <button className="button outline" type="button" disabled={busy} onClick={onClose}>ยกเลิก</button>
     <button className="button primary" type="submit" disabled={busy}>
      <Check size={17}/>{busy?'กำลังบันทึก...':'บันทึกข้อมูล'}
     </button>
    </div>
   </form>
  </div>
 </div>;
}
