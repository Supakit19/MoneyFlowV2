/**
 * LINE's 2500 × 1686 Rich Menu is exactly three columns by two rows.
 * Existing command semantics are preserved. Only tile #6 opens the Pocket LIFF app.
 */
export const RICH_MENU_SIZE = Object.freeze({width:2500,height:1686});
const columns=[{x:0,width:833},{x:833,width:834},{x:1667,width:833}];
const rows=[{y:0,height:843},{y:843,height:843}];

export function pocketMenuAreas(liffId){
  if(!/^[0-9]{5,20}-[A-Za-z0-9]{5,64}$/.test(liffId || ''))
    throw Error('Valid LINE_LIFF_ID required for Pocket Rich Menu');
  const buttons=[
    {label:'วันนี้',action:{type:'message',label:'วันนี้',text:'สรุปวันนี้'}},
    {label:'สัปดาห์',action:{type:'message',label:'สัปดาห์',text:'สรุปสัปดาห์'}},
    {label:'กราฟ',action:{type:'message',label:'กราฟ',text:'กราฟเดือนนี้'}},
    {label:'งบเหลือ',action:{type:'message',label:'งบเหลือ',text:'งบคงเหลือ'}},
    {label:'เดือนนี้',action:{type:'message',label:'เดือนนี้',text:'สรุปเดือนนี้'}},
    {label:'สมุดเงิน',action:{type:'uri',label:'สมุดเงิน',uri:'https://liff.line.me/'+liffId}},
  ];
  return buttons.map((item,index)=>{
    const col=columns[index%3],row=rows[Math.floor(index/3)];
    return {
      bounds:{x:col.x,y:row.y,width:col.width,height:row.height},
      action:item.action,
    };
  });
}
