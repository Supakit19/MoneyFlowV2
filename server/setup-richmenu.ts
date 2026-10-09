import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

/**
 * Publish the approved illustrated MoneyFlow Rich Menu (3 columns × 2 rows).
 *
 * bun server/setup-richmenu.ts          # prepares + checks image only
 * bun server/setup-richmenu.ts --apply  # publishes to LINE and makes default
 *
 * Source: scripts/moneyflow-richmenu-cute.webp (the user-approved artwork).
 * Requires LINE_CHANNEL_ACCESS_TOKEN via .env, never hard-code tokens.
 */
const apply=process.argv.includes('--apply');
const token=process.env.LINE_CHANNEL_ACCESS_TOKEN;
const W=2500;
const H=1686;
const source=join(process.cwd(),'scripts','moneyflow-richmenu-cute.webp');
const output=join(process.cwd(),'scripts','moneyflow-richmenu-cute.jpg');

const buttons=[
 {label:'วันนี้',command:'สรุปวันนี้'},
 {label:'สัปดาห์',command:'สรุปสัปดาห์'},
 {label:'กราฟ',command:'กราฟเดือนนี้'},
 {label:'งบเหลือ',command:'งบคงเหลือ'},
 {label:'เดือนนี้',command:'สรุปเดือนนี้'},
 {label:'ช่วยเหลือ',command:'ช่วยเหลือ'}
] as const;

const cols=[{x:0,width:833},{x:833,width:834},{x:1667,width:833}];
const rows=[{y:0,height:843},{y:843,height:843}];
const areas=buttons.map((item,index)=>{
 const col=cols[index%3];
 const row=rows[Math.floor(index/3)];
 return {
  bounds:{x:col.x,y:row.y,width:col.width,height:row.height},
  action:{type:'message' as const,label:item.label,text:item.command}
 };
});

// LINE's large Rich Menu accepts 2500x1686 JPEG or PNG, up to 1MB.
const input=await readFile(source);
const metadata=await sharp(input).metadata();
if(!metadata.width||!metadata.height)throw Error('Source image is invalid');
let jpeg:Buffer|undefined;
for(const quality of [87,83,78,72]){
 const candidate=await sharp(input).resize(W,H,{fit:'fill'})
  .jpeg({quality,mozjpeg:true}).toBuffer();
 if(candidate.byteLength<=1_000_000){jpeg=candidate;break}
}
if(!jpeg)throw Error('Rich Menu image is still larger than 1 MB');
await writeFile(output,jpeg);
const imageHash=createHash('sha256').update(jpeg).digest('hex');
const name='MoneyFlow Cute Rich Menu '+imageHash.slice(0,12);
console.log('Image:',output,'size:',W+'x'+H,'bytes:',jpeg.byteLength,'sha256:',imageHash.slice(0,16));
console.log('Tap regions:',JSON.stringify(areas));
if(!apply){
 console.log('Preview prepared. Add --apply to publish and set as default.');
 process.exit(0);
}
if(!token)throw Error('LINE_CHANNEL_ACCESS_TOKEN is not set');

async function call(base:string,path:string,method='GET',body?:unknown,contentType='application/json'){
 const headers:Record<string,string>={Authorization:'Bearer '+token};
 if(body!==undefined)headers['Content-Type']=contentType;
 const response=await fetch(base+path,{
  method,headers,
  body:body===undefined?undefined:contentType==='application/json'?JSON.stringify(body):body as BodyInit,
  signal:AbortSignal.timeout(25000)
 });
 const text=await response.text();
 if(!response.ok)throw Error('LINE '+method+' '+path+' HTTP '+response.status+': '+text.slice(0,450));
 try{return JSON.parse(text||'{}')}catch{return {}}
}

const platform='https://api.line.me';
const data='https://api-data.line.me';
const existing=await call(platform,'/v2/bot/richmenu/list');
let id:string|undefined=(existing.richmenus||[]).find((m:any)=>m.name===name && m.size?.width===W && m.size?.height===H)?.richMenuId;
if(id){
 console.log('Reusing previously uploaded version:',id);
}else{
 const newMenu={
  size:{width:W,height:H},
  selected:true,
  name,
  chatBarText:'เมนู MoneyFlow',
  areas
 };
 const created=await call(platform,'/v2/bot/richmenu','POST',newMenu);
 id=created.richMenuId;
 if(!id)throw Error('LINE did not return richMenuId');
 console.log('Created Rich Menu:',id);
 try{
  await call(data,'/v2/bot/richmenu/'+id+'/content','POST',jpeg,'image/jpeg');
  console.log('Uploaded approved artwork');
 }catch(e){
  console.error('Image upload failed; leaving the previous default untouched');
  try{await call(platform,'/v2/bot/richmenu/'+id,'DELETE')}catch{}
  throw e;
 }
}

// New menu becomes default only after image upload succeeds.
await call(platform,'/v2/bot/user/all/richmenu/'+id,'POST');
const assigned=await call(platform,'/v2/bot/user/all/richmenu');
if(assigned.richMenuId!==id)throw Error('Could not verify the new default Rich Menu');
console.log('LIVE_RICH_MENU_READY:',id,'name:',name);
