/** Shared, browser-independent validation rules for MoneyFlow forms and API. */
export type FieldErrors=Record<string,string>;
export type FinanceModalType='transaction'|'account'|'budget'|'recurring';
export type FinanceKind='expense'|'income'|'transfer';
export type SimpleAccount={id:string};
export type SimpleCategory={id:string;kind:string};

export function validateAmount(value:unknown,{optional=false,allowZero=false,max=10_000_000}:{
 optional?:boolean;allowZero?:boolean;max?:number
}={}):string|undefined{
 if(value===null||value===undefined||String(value).trim()===''){
  return optional?undefined:'กรุณากรอกจำนวนเงิน';
 }
 const raw=String(value).trim();
 if(!/^\d+(?:\.\d{1,2})?$/.test(raw))return 'กรุณากรอกจำนวนเงินเป็นตัวเลขและทศนิยมไม่เกิน 2 ตำแหน่ง';
 const n=Number(raw);
 if(!Number.isFinite(n))return 'จำนวนเงินไม่ถูกต้อง';
 if(allowZero?n<0:n<=0)return allowZero?'จำนวนเงินต้องไม่ติดลบ':'จำนวนเงินต้องมากกว่า 0 บาท';
 if(n>max)return 'จำนวนเงินต้องไม่เกิน '+max.toLocaleString('th-TH')+' บาท';
 return undefined;
}

export function validLocalDate(value:unknown):boolean{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const dt=new Date(value+'T00:00:00Z');
 return !Number.isNaN(dt.getTime())&&dt.toISOString().slice(0,10)===value;
}

export function validateFinanceModal(
 modal:FinanceModalType,
 form:Record<string,unknown>,
 kind:FinanceKind,
 accounts:SimpleAccount[],
 categories:SimpleCategory[],
 month:string
):FieldErrors{
 const result:FieldErrors={};
 const amountError=validateAmount(form.amount,{optional:modal==='account',allowZero:modal==='account'});
 if(amountError)result.amount=amountError;
 if(modal==='account'){
  const name=String(form.name||'').trim();
  if(!name)result.name='กรุณากรอกชื่อบัญชี';
  else if(name.length>60)result.name='ชื่อบัญชีต้องไม่เกิน 60 ตัวอักษร';
  if(!['bank','cash','wallet'].includes(String(form.kind)))result.kind='กรุณาเลือกประเภทบัญชี';
  return result;
 }
 if(modal==='budget'){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))result.month='เดือนที่เลือกไม่ถูกต้อง';
  if(!categories.some(x=>x.kind==='expense'&&x.id===form.category_id))result.category_id='กรุณาเลือกหมวดหมู่งบประมาณ';
  return result;
 }
 if(!accounts.some(x=>x.id===form.account_id))result.account_id='กรุณาเลือกบัญชีเงิน';
 if(!['expense','income','transfer'].includes(kind)||modal==='recurring'&&kind==='transfer'){
  result.kind='กรุณาเลือกประเภทรายการที่ถูกต้อง';
 }
 if(kind==='transfer'&&modal==='transaction'){
  if(!accounts.some(x=>x.id===form.to_account_id))result.to_account_id='กรุณาเลือกบัญชีปลายทาง';
  else if(form.to_account_id===form.account_id)result.to_account_id='บัญชีต้นทางและปลายทางต้องต่างกัน';
 }else if(!categories.some(x=>x.kind===kind&&x.id===form.category_id)){
  result.category_id='กรุณาเลือกหมวดหมู่ที่ตรงกับประเภทรายการ';
 }
 if(modal==='transaction'){
  if(kind!=='transfer'){
   const merchant=String(form.merchant||'').trim();
   if(!merchant)result.merchant='กรุณากรอกชื่อรายการหรือร้านค้า';
   else if(merchant.length>120)result.merchant='ชื่อรายการต้องไม่เกิน 120 ตัวอักษร';
  }
  if(!validLocalDate(form.transacted_at))result.transacted_at='กรุณาเลือกวันที่ที่ถูกต้อง';
  if(String(form.note||'').length>500)result.note='หมายเหตุต้องไม่เกิน 500 ตัวอักษร';
 }
 if(modal==='recurring'){
  const title=String(form.title||'').trim();
  if(!title)result.title='กรุณากรอกชื่อรายการประจำ';
  else if(title.length>80)result.title='ชื่อรายการต้องไม่เกิน 80 ตัวอักษร';
  const day=Number(form.day_of_month);
  if(!Number.isInteger(day)||day<1||day>31||form.day_of_month===''||form.day_of_month===null){
   result.day_of_month='กรุณาระบุวันที่เป็นเลขจำนวนเต็ม 1–31';
  }
 }
 return result;
}

export function validateWeeklyPreferences(weekly:unknown,savings:unknown):FieldErrors{
 const errors:FieldErrors={};
 const w=validateAmount(weekly,{allowZero:true});
 const s=validateAmount(savings,{allowZero:true});
 if(w)errors.weekly_limit=w;
 if(s)errors.savings_goal=s;
 return errors;
}
export function validateLinePreferences(input:{confirmation_mode:string;coach_tone:string;coach_alerts:string;daily_digest_enabled?:boolean;daily_digest_hour?:number}):FieldErrors{
 const errors:FieldErrors={};
 if(!['always','smart','auto'].includes(input.confirmation_mode))errors.confirmation_mode='กรุณาเลือกโหมดยืนยันรายการ';
 if(!['polite','friend','roast'].includes(input.coach_tone))errors.coach_tone='กรุณาเลือกบุคลิก AI';
 if(!['every','once','off'].includes(input.coach_alerts))errors.coach_alerts='กรุณาเลือกรูปแบบการเตือน';
 if(input.daily_digest_enabled&&(input.daily_digest_hour===undefined||!Number.isInteger(input.daily_digest_hour)||input.daily_digest_hour<0||input.daily_digest_hour>23)){
  errors.daily_digest_hour='กรุณาเลือกเวลารับรายงานที่ถูกต้อง';
 }
 return errors;
}
export function validateEmail(value:unknown):string|undefined{
 const email=String(value||'').trim();
 if(!email)return 'กรุณากรอกอีเมล';
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return 'กรุณากรอกอีเมลให้ถูกต้อง';
 return undefined;
}
export function validatePassword(value:unknown):string|undefined{
 if(typeof value!=='string'||!value)return 'กรุณากรอกรหัสผ่าน';
 if(value.length<10)return 'รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร';
 if(value.length>128)return 'รหัสผ่านต้องไม่เกิน 128 ตัวอักษร';
 return undefined;
}
export function validateAuthForm(mode:'login'|'register',input:{name:string;email:string;password:string;confirm:string}):FieldErrors{
 const e:FieldErrors={};
 if(mode==='register'){
  const n=input.name.trim();
  if(!n)e.name='กรุณากรอกชื่อแสดงผล';
  else if(n.length>100)e.name='ชื่อแสดงผลต้องไม่เกิน 100 ตัวอักษร';
 }
 const emailError=validateEmail(input.email);
 if(emailError)e.email=emailError;
 if(mode==='register'){
  const passError=validatePassword(input.password);
  if(passError)e.password=passError;
  if(!input.confirm)e.confirm='กรุณายืนยันรหัสผ่าน';
  else if(input.password!==input.confirm)e.confirm='ยืนยันรหัสผ่านไม่ตรงกัน';
 }else if(!input.password)e.password='กรุณากรอกรหัสผ่าน';
 return e;
}
export function validateSecurityPassword(password:unknown,email?:unknown):FieldErrors{
 const errors:FieldErrors={};
 const p=validatePassword(password);
 if(p)errors.password=p;
 if(email!==undefined){
  const e=validateEmail(email);
  if(e)errors.email=e;
 }
 return errors;
}
export function validateAiText(value:unknown):string|undefined{
 const text=String(value||'').trim();
 if(!text)return 'กรุณาพิมพ์ข้อความที่ต้องการให้ AI อ่านก่อน';
 if(text.length>2000)return 'ข้อความต้องไม่เกิน 2,000 ตัวอักษร';
 return undefined;
}
