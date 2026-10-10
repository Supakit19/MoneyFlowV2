import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Keep the five existing MoneyFlow illustrations that users already recognise,
 * and replace only the bottom-right card with a distinctive green Pocket card.
 * Unlike an all-new image, existing command tap locations remain familiar.
 *
 * Run: bun scripts/build-richmenu-pocket.ts
 */
const width = 2500;
const height = 1686;
const tileWidth = 833;
const tileHeight = 843;
const root = process.cwd();
const source = join(root, 'scripts/moneyflow-richmenu-cute.webp');
const dest = join(root, 'scripts/moneyflow-richmenu-pocket.png');
const published = join(root, 'scripts/moneyflow-richmenu-pocket.jpg');

// All art stays inside column three, row two. This is the actual LINE tappable region.
const pocketTile = `<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${tileHeight}" viewBox="0 0 833 843">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F5FFF4"/>
      <stop offset="100%" stop-color="#D0F6DF"/>
    </linearGradient>
    <linearGradient id="pill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#28B284"/>
      <stop offset="100%" stop-color="#117956"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="0.8" y2="1">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#EDF9F3"/>
    </linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="170%" height="170%">
      <feDropShadow dx="0" dy="14" stdDeviation="13" flood-opacity="0.13" flood-color="#346B52"/>
    </filter>
  </defs>
  <!-- tile frame / atmospheric shapes -->
  <rect x="16" y="15" width="801" height="813" rx="63" fill="url(#bg)" stroke="#B6E9CA" stroke-width="11"/>
  <circle cx="410" cy="285" r="247" fill="#B5EBD0" opacity=".49"/>
  <circle cx="713" cy="170" r="105" fill="#E4FFF0" opacity=".45"/>
  <!-- gentle decorative coins and sparkle -->
  <g fill="#F3C85E" stroke="#F4AA36" stroke-width="3">
    <path d="M146 246 l12 36 37 12 -37 12 -12 36 -12 -36 -37 -12 37 -12z"/>
    <path d="M685 232 l9 29 30 10 -30 10 -9 29 -10 -29 -29 -10 29 -10z"/>
    <circle cx="189" cy="115" r="9" />
    <circle cx="674" cy="432" r="10"/>
  </g>
  <!-- floating pocket-dashboard phone illustration -->
  <g transform="rotate(9 423 292)" filter="url(#shadow)">
    <rect x="281" y="66" width="287" height="442" rx="55" fill="#243E3C" stroke="#1B3032" stroke-width="9"/>
    <rect x="301" y="90" width="248" height="394" rx="33" fill="url(#glass)"/>
    <path d="M371 83 h105 q12 0 12 12 v15 q0 15-15 15 h-94 q-15 0-15-15 v-15 q0-12 7-12z" fill="#243E3C"/>
    <circle cx="427" cy="103" r="5" fill="#8CA9A1"/>
    <rect x="334" y="164" width="123" height="13" rx="7" fill="#B2DCC8"/>
    <rect x="334" y="192" width="97" height="12" rx="7" fill="#CEE9DD"/>
    <circle cx="488" cy="166" r="11" fill="#A6D8C2"/>
    <circle cx="516" cy="166" r="11" fill="#A6D8C2"/>
    <path d="M332 317 L370 291 L415 304 L451 254 L485 278 L521 232" fill="none" stroke="#43B78B" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M499 231 h24 v24" fill="none" stroke="#43B78B" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="343" y="351" width="39" height="39" rx="8" fill="#A5D9BD"/>
    <rect x="397" y="329" width="39" height="61" rx="8" fill="#84CDA9"/>
    <rect x="451" y="305" width="39" height="85" rx="8" fill="#58BB90"/>
    <rect x="505" y="280" width="26" height="110" rx="8" fill="#36AC7F"/>
    <rect x="341" y="414" width="174" height="12" rx="6" fill="#C2E6D3"/>
    <rect x="341" y="439" width="132" height="11" rx="6" fill="#DBEEE1"/>
  </g>
  <!-- strong action chip for the only app-opening button -->
  <rect x="65" y="522" width="707" height="152" rx="77" fill="url(#pill)" filter="url(#shadow)"/>
  <text x="417" y="624" font-family="Thonburi, Noto Sans Thai, sans-serif" font-size="122" font-weight="bold" fill="#FFFFFF" text-anchor="middle">สมุดเงิน</text>
  <text x="417" y="777" font-family="Thonburi, Noto Sans Thai, sans-serif" font-size="69" font-weight="bold" fill="#15754F" text-anchor="middle">เปิดหน้าจัดการเงิน</text>
</svg>`;

const base = await sharp(await readFile(source))
  .resize(width, height, { fit: 'fill' }).png().toBuffer();
const pocket = await sharp(Buffer.from(pocketTile)).png().toBuffer();
const combined = await sharp(base).composite([{input:pocket,left:1667,top:843}]).png().toBuffer();
await writeFile(dest, combined);
const meta=await sharp(combined).metadata();
if(meta.width!==2500||meta.height!==1686)throw Error('Unexpected LINE richmenu dimensions');
let jpeg:Buffer|undefined;
for(const quality of [86,81,77,72,67]){
  const trial=await sharp(combined).jpeg({quality,mozjpeg:true}).toBuffer();
  if(trial.byteLength<=1_000_000){jpeg=trial;break}
}
if(!jpeg)throw Error('Pocket menu JPEG must be under 1MB for LINE');
await writeFile(published,jpeg);
console.log('Rich menu Pocket artwork ready:',dest,meta.width+'x'+meta.height,combined.length);
console.log('Publishable LINE JPEG:',published,'bytes:',jpeg.byteLength);
