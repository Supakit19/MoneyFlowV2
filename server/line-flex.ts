import {formatBaht,type WeeklyStatus} from './moneyflow-features.ts';

type Item={kind:string;amount:number;merchant?:string;category?:string;note?:string};
type AnyNode=Record<string,any>;
const C={
 ink:'#1D4233',muted:'#718B7D',light:'#EDF5ED',green:'#119A77',
 lime:'#D6ECB5',white:'#FFFFFF',gold:'#DA9448',warn:'#B56B36',red:'#C8544A',
 dark:'#133E32'
};
const text=(value:unknown,size='sm',color=C.ink,weight='regular'):AnyNode=>({
 type:'text',text:String(value??'').slice(0,500),size,color,weight,wrap:true
});
const hbox=(children:AnyNode[],spacing='sm'):AnyNode=>({type:'box',layout:'horizontal',contents:children,spacing});
const vbox=(children:AnyNode[],spacing='sm'):AnyNode=>({type:'box',layout:'vertical',contents:children,spacing});
const divider=()=>({type:'separator',margin:'md',color:'#E5EEE6'});
const action=(label:string,message:string,primary=false):AnyNode=>({
 type:'button',style:primary?'primary':'secondary',height:'sm',
 color:primary?C.green:C.light,
 action:{type:'message',label,text:message}
});
const linkAction=(label:string,uri:string):AnyNode=>({
 type:'button',style:'primary',height:'sm',color:C.green,
 action:{type:'uri',label,uri}
});
const weeklyMeter=(status:WeeklyStatus):AnyNode=>{
 if(!status.limitSatang)return vbox([
  text('ยังไม่ได้ตั้งงบรายสัปดาห์','sm',C.muted)
 ]);
 const percent=Math.min(100,Math.round(status.progress*100));
 const color=status.progress>=1?C.red:status.progress>=0.9?C.gold:C.green;
 return vbox([
  hbox([text('งบประจำสัปดาห์','sm',C.ink,'bold'),
   {...text(Math.round(status.progress*100)+'%','sm',color,'bold'),align:'end',flex:1}]),
  {type:'box',layout:'horizontal',height:'9px',backgroundColor:'#E7EEE7',
   contents:[{type:'box',layout:'vertical',width:Math.max(1,percent)+'%',
    backgroundColor:color,height:'9px',contents:[]}]},
  hbox([text('ใช้ไป '+formatBaht(status.spentSatang),'xs',C.muted),
   {...text('เหลือ '+formatBaht(Math.max(0,status.remainingSatang)),'xs',status.remainingSatang<0?C.red:C.ink,'bold'),align:'end',flex:1}]),
  text('เหลืออีก '+status.daysLeftInWeek+' วันก่อนเริ่มสัปดาห์ใหม่','xs',C.muted)
 ],'md');
};
const wrap=(title:string,subtitle:string,body:AnyNode[],buttons?:AnyNode[]):AnyNode=>({
 type:'bubble',size:'mega',
 styles:{header:{backgroundColor:C.dark},footer:{backgroundColor:C.white},body:{backgroundColor:C.white}},
 header:vbox([
  hbox([text('●  moneyflow.','md',C.lime,'bold'),
   {...text('YOUR MONEY, IN FLOW','xxs','#B0D6BF'),flex:1,align:'end'}]),
  text(title,'xl',C.white,'bold'),
  text(subtitle,'xs','#C1D9CA')
 ],'sm'),
 body:vbox(body,'md'),
 ...(buttons?.length?{footer:vbox([divider(),hbox(buttons)],'sm')}:{})
});
export function flexMessage(altText:string,bubble:AnyNode,quick?:string[]):AnyNode{
 const message:any={type:'flex',altText:altText.slice(0,350),contents:bubble};
 if(quick?.length)message.quickReply={items:quick.slice(0,7).map(name=>({
  type:'action',action:{type:'message',label:name.slice(0,20),text:name}
 }))};
 return message;
}
const itemRows=(items:Item[])=>items.slice(0,6).map(item=>
 hbox([
  {...vbox([text(item.merchant||'รายการใช้จ่าย','sm',C.ink,'bold'),
     text(item.category||'อื่นๆ','xxs',C.muted)],'xs'),flex:3},
  {...text((item.kind==='income'?'+':'−')+formatBaht(Math.round(Number(item.amount)*100)),
    'md',item.kind==='income'?C.green:C.ink,'bold'),align:'end',flex:2}
 ])
);
export function receiptCard(items:Item[],week:WeeklyStatus,notice:string,confirmed:boolean){
 const total=items.reduce((n,item)=>n+Math.round(Number(item.amount)*100),0);
 const body:AnyNode[]=[
  text(confirmed?'บันทึกรายการสำเร็จ':'ตรวจสอบรายการก่อนบันทึก','sm',C.muted),
  text(formatBaht(total),'xxl',C.ink,'bold'),
  divider(),...itemRows(items)
 ];
 if(items.length>6)body.push(text('และอีก '+(items.length-6)+' รายการ','xs',C.muted));
 if(week.limitSatang){body.push(divider(),weeklyMeter(week))}
 if(notice)body.push(divider(),{
  type:'box',layout:'vertical',paddingAll:'12px',
  backgroundColor:week.progress>=1?'#FFF1EB':'#FFF8EA',
  contents:[text('💬 AI MONEY COACH','xs',C.warn,'bold'),text(notice,'sm',C.ink)]
 });
 return flexMessage(
  confirmed?'MoneyFlow บันทึก '+items.length+' รายการแล้ว':'MoneyFlow รอยืนยัน '+items.length+' รายการ',
  wrap(confirmed?'เรียบร้อยแล้ว ✓':'ตรวจสอบรายการ 🧾',
   confirmed?'บันทึกเข้าบัญชีเงินของคุณแล้ว':'กรุณาตรวจข้อมูลก่อนบันทึก',
   body,confirmed?[action('สรุปสัปดาห์','สรุปสัปดาห์'),action('ดูกราฟ','กราฟเดือนนี้')]:
   [action('ยกเลิก','ยกเลิก'),action('ยืนยันบันทึก','ยืนยัน',true)]),
   confirmed?['สรุปวันนี้','สรุปเดือนนี้','กราฟสัปดาห์']:undefined
 );
}
export function summaryCard(month:{month:string;incomeSatang:number;expenseSatang:number;savedSatang:number},week?:WeeklyStatus){
 const contents:AnyNode[]=[
  text('ภาพรวมเดือน '+month.month,'sm',C.muted),
  hbox([text('รายรับ','sm'),{...text(formatBaht(month.incomeSatang),'md',C.green,'bold'),flex:1,align:'end'}]),
  hbox([text('รายจ่าย','sm'),{...text(formatBaht(month.expenseSatang),'md',C.red,'bold'),flex:1,align:'end'}]),
  divider(),hbox([text('สุทธิ','sm',C.ink,'bold'),{...text(formatBaht(month.savedSatang),'lg',C.ink,'bold'),flex:1,align:'end'}])
 ];
 if(week){contents.push(divider(),weeklyMeter(week))}
 return flexMessage('รายงานการเงิน '+month.month,
  wrap('สรุปการเงิน 📊','สรุปข้อมูลจาก PostgreSQL',contents,
  [action('กราฟเดือนนี้','กราฟเดือนนี้'),action('งบสัปดาห์','สรุปสัปดาห์')]),
  ['กราฟสัปดาห์','หมวดไหนใช้เยอะสุด','สรุปวันนี้']);
}
export function daySummaryCard(dayLabel:string,spent:number,income:number,week:WeeklyStatus){
 return flexMessage('MoneyFlow สรุปวันนี้ '+dayLabel,
  wrap('สรุปวันนี้ ✨',dayLabel,[
   hbox([text('รายรับ','sm'),{...text(formatBaht(income),'lg',C.green,'bold'),align:'end',flex:1}]),
   hbox([text('รายจ่าย','sm'),{...text(formatBaht(spent),'lg',C.red,'bold'),align:'end',flex:1}]),
   divider(),weeklyMeter(week)
  ],[action('สรุปสัปดาห์','สรุปสัปดาห์'),action('กราฟ','กราฟเดือนนี้')])
 );
}
export function weeklyCard(week:WeeklyStatus,notice=''){
 const children:AnyNode[]=[
  text('สัปดาห์ '+week.start+' ถึง '+week.end,'xs',C.muted),
  text(formatBaht(week.spentSatang),'xxl',C.ink,'bold'),
  text('รายจ่ายในสัปดาห์นี้','xs',C.muted),divider(),weeklyMeter(week)
 ];
 if(notice)children.push(divider(),text('💬 '+notice,'sm'));
 return flexMessage('MoneyFlow งบสัปดาห์ '+week.start,
  wrap('งบสัปดาห์ 💚','แผนเดิมใช้ต่อทุกสัปดาห์',children,
   [action('กราฟสัปดาห์','กราฟสัปดาห์'),action('เดือนนี้','สรุปเดือนนี้')]),
  ['กราฟสัปดาห์','เหลือใช้วันละเท่าไหร่']
 );
}
export function barChartCard(title:string,subtitle:string,
 rows:{label:string;spentSatang:number}[],back='สรุปสัปดาห์'){
 const max=Math.max(1,...rows.map(x=>x.spentSatang));
 const chart=rows.map(row=>vbox([
  hbox([text(row.label.slice(0,40),'sm',C.ink,'bold'),
   {...text(formatBaht(row.spentSatang),'sm',C.ink),align:'end',flex:1}]),
  {type:'box',layout:'horizontal',height:'10px',backgroundColor:'#E7EEE7',
   contents:[
    {type:'box',layout:'vertical',width:Math.max(1,Math.round(row.spentSatang/max*100))+'%',
     height:'10px',backgroundColor:C.green,contents:[]}
   ]}
 ],'xs'));
 return flexMessage('MoneyFlow '+title,wrap(title,subtitle,
  chart.length?chart:[text('ยังไม่มีรายจ่ายในช่วงเวลานี้','sm',C.muted)],
  [action('กลับไปสรุป',back),action('งบคงเหลือ','งบคงเหลือ')]),
  ['สรุปวันนี้','กราฟเดือนนี้','กราฟสัปดาห์']);
}
export const simpleHelpCard=(miniUrl?:string)=>flexMessage(
 'คำสั่ง MoneyFlow',wrap('สั่งงานได้ง่ายๆ','เลือกคำสั่งใน LINE เพื่อดูข้อมูล',[
  text('🧾 กาแฟ 45 · พิมพ์รายจ่ายหรือส่งรูปใบเสร็จ'),
  text('📊 สรุปวันนี้ / สรุปสัปดาห์ / สรุปเดือนนี้'),
  text('📈 กราฟสัปดาห์ / กราฟเดือนนี้'),
  text('💚 งบคงเหลือ / เหลือใช้วันละเท่าไหร่'),
  text('🔐 Login 12345678 (ใส่รหัสจริงจากหน้าเว็บ)')
 ],[action('สรุปสัปดาห์','สรุปสัปดาห์'),
     miniUrl ? linkAction('เปิดสมุดเงินของฉัน',miniUrl) : action('กราฟเดือนนี้','กราฟเดือนนี้')]),
 miniUrl ? ['สรุปเดือนนี้','กราฟเดือนนี้','งบคงเหลือ'] : undefined
);
