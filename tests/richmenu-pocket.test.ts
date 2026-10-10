import {describe,expect,test} from 'bun:test';
import {pocketMenuAreas,RICH_MENU_SIZE} from '../server/richmenu-pocket-layout.mjs';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';

const id='2011955989-OUGIQOBk';
describe('MoneyFlow Pocket Rich Menu',()=>{
  test('preserves all five established finance commands',()=>{
    const a=pocketMenuAreas(id);
    expect(a).toHaveLength(6);
    expect(a.slice(0,5).map(x=>[x.action.type,x.action.text])).toEqual([
      ['message','สรุปวันนี้'],
      ['message','สรุปสัปดาห์'],
      ['message','กราฟเดือนนี้'],
      ['message','งบคงเหลือ'],
      ['message','สรุปเดือนนี้'],
    ]);
  });
  test('only bottom-right tile opens verified LIFF URL',()=>{
    const areas=pocketMenuAreas(id);
    const button=areas[5];
    expect(button.action).toEqual({type:'uri',label:'สมุดเงิน',uri:'https://liff.line.me/'+id});
    expect(button.bounds).toEqual({x:1667,y:843,width:833,height:843});
    expect(areas.filter(x=>x.action.type==='uri')).toHaveLength(1);
    expect(()=>pocketMenuAreas('https://malicious.example/')).toThrow();
    expect(()=>pocketMenuAreas('')).toThrow();
  });
  test('all six clickable regions tile LINE richmenu without gaps or overlap',()=>{
    const a=pocketMenuAreas(id);
    expect(RICH_MENU_SIZE).toEqual({width:2500,height:1686});
    expect(a.reduce((sum,x)=>sum+x.bounds.width*x.bounds.height,0)).toBe(2500*1686);
    for(const r of a) {
      expect(r.bounds.x).toBeGreaterThanOrEqual(0);
      expect(r.bounds.y).toBeGreaterThanOrEqual(0);
      expect(r.bounds.x+r.bounds.width).toBeLessThanOrEqual(2500);
      expect(r.bounds.y+r.bounds.height).toBeLessThanOrEqual(1686);
    }
    for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){
      const x=a[i].bounds,y=a[j].bounds;
      const intersection=Math.max(0,Math.min(x.x+x.width,y.x+y.width)-Math.max(x.x,y.x))*
        Math.max(0,Math.min(x.y+x.height,y.y+y.height)-Math.max(x.y,y.y));
      expect(intersection).toBe(0);
    }
  });
  test('uploaded JPEG meets LINE image dimensions and size constraints',async()=>{
    const jpeg=await readFile('scripts/moneyflow-richmenu-pocket.jpg');
    expect(jpeg.length).toBeLessThanOrEqual(1_000_000);
    expect(jpeg[0]).toBe(255);
    expect(jpeg[1]).toBe(216);
    const meta=await sharp(jpeg).metadata();
    expect([meta.width,meta.height,meta.format]).toEqual([2500,1686,'jpeg']);
  });
});
