import {readFileSync, existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {pocketMenuAreas,RICH_MENU_SIZE} from './richmenu-pocket-layout.mjs';

/**
 * No-op by default. To deploy, run:
 * node server/setup-richmenu-pocket.mjs --apply --expect-default=<current menu id>
 *
 * Unlike the original publisher, this script does NOT delete old rich menus.
 * Image & actions are saved under a new menu; existing commands remain intact.
 */
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const envFile=join(root,'.env.production');
function readEnvFile(path){
  const data=new Map();
  if(!existsSync(path))return data;
  for(const line of readFileSync(path,'utf8').split(/\r?\n/)){
    const i=line.indexOf('=');
    if(i<1||line.startsWith('#'))continue;
    const name=line.slice(0,i).trim();
    let value=line.slice(i+1).trim();
    if((value.startsWith("'")&&value.endsWith("'"))||(value.startsWith('"')&&value.endsWith('"')))
      value=value.slice(1,-1);
    data.set(name,value);
  }
  return data;
}
const env=readEnvFile(envFile);
const liffId=process.env.LINE_LIFF_ID||env.get('LINE_LIFF_ID')||'';
const token=process.env.LINE_CHANNEL_ACCESS_TOKEN||env.get('LINE_CHANNEL_ACCESS_TOKEN')||'';
const apply=process.argv.includes('--apply');
const expectedArg=process.argv.find(x=>x.startsWith('--expect-default='));
const expectedDefault=expectedArg?.split('=')[1];
const areas=pocketMenuAreas(liffId);
const imagePath=join(root,'scripts','moneyflow-richmenu-pocket.jpg');
const jpeg=readFileSync(imagePath);
if(jpeg.length>1_000_000||jpeg.length<10_000||jpeg[0]!==0xff||jpeg[1]!==0xd8)
  throw Error('Pocket artwork must be a valid LINE JPEG under 1 MB');
const revision=createHash('sha256').update(jpeg).update(JSON.stringify(areas)).digest('hex').slice(0,12);
const name='MoneyFlow Pocket Rich Menu '+revision;
console.log('POCKET_MENU_PREVIEW',JSON.stringify({name,bytes:jpeg.length,size:RICH_MENU_SIZE,actions:areas.map(({action})=>action)}));
if(!apply){
  console.log('DRY_RUN_ONLY: add --apply after verifying the picture and target');
  process.exit(0);
}
if(!token)throw Error('Messaging API access token is not configured');

const platform='https://api.line.me';
const data='https://api-data.line.me';
async function call(base,path,method='GET',body,contentType='application/json'){
  const headers={Authorization:'Bearer '+token};
  if(body!==undefined)headers['Content-Type']=contentType;
  const response=await fetch(base+path,{
    method,headers,
    body:body===undefined?undefined:contentType==='application/json'?JSON.stringify(body):body,
    signal:AbortSignal.timeout(24000),
  });
  if(!response.ok){
    const details=(await response.text()).slice(0,300);
    throw Error('LINE '+method+' '+path+' HTTP '+response.status+': '+details);
  }
  const content=await response.text();
  try{return JSON.parse(content||'{}')}catch{return {}}
}
const configResponse=await fetch('https://moneyflow.aionixth.com/api/mini/config',{signal:AbortSignal.timeout(9000)});
if(!configResponse.ok)throw Error('Pocket configuration endpoint unavailable');
const config=await configResponse.json();
if(config.enabled!==true||config.liffId!==liffId)
  throw Error('Pocket LIFF is not enabled on the production MoneyFlow API');

const current=await call(platform,'/v2/bot/user/all/richmenu');
if(!current.richMenuId)throw Error('LINE default rich menu not found');
if(expectedDefault&&current.richMenuId!==expectedDefault)
  throw Error('Default rich menu changed since backup; refusing to overwrite it');
const listed=await call(platform,'/v2/bot/richmenu/list');
let id=(listed.richmenus||[]).find(x=>x.name===name &&
  x.size?.width===RICH_MENU_SIZE.width && x.size?.height===RICH_MENU_SIZE.height &&
  JSON.stringify(x.areas)===JSON.stringify(areas))?.richMenuId;

if(!id){
  const created=await call(platform,'/v2/bot/richmenu','POST',{
    size:RICH_MENU_SIZE,selected:true,name,chatBarText:'เมนู MoneyFlow',areas
  });
  id=created.richMenuId;
  if(!id)throw Error('LINE returned no menu ID');
  console.log('POCKET_MENU_CREATED',id);
  try{
    await call(data,'/v2/bot/richmenu/'+id+'/content','POST',jpeg,'image/jpeg');
  }catch(error){
    console.error('IMAGE_UPLOAD_FAILED; default left untouched');
    throw error;
  }
  console.log('POCKET_IMAGE_UPLOADED',jpeg.length);
}else console.log('POCKET_MENU_REUSED',id);
if(current.richMenuId===id){
  console.log('POCKET_MENU_ALREADY_DEFAULT',id);
  process.exit(0);
}
try{
  await call(platform,'/v2/bot/user/all/richmenu/'+id,'POST');
  const verified=await call(platform,'/v2/bot/user/all/richmenu');
  if(verified.richMenuId!==id)throw Error('Pocket rich menu was not set as default');
  console.log('POCKET_RICHMENU_LIVE',id,'previous',current.richMenuId);
}catch(error){
  console.error('POCKET_SWITCH_FAILED, restoring previous default');
  try{await call(platform,'/v2/bot/user/all/richmenu/'+current.richMenuId,'POST')}
  catch(rollback){console.error('ROLLBACK_FAILED',String(rollback))}
  throw error;
}
