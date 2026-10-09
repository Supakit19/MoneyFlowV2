# MoneyFlow — Personal Finance × LINE × Gemini

แอปบันทึกรายรับรายจ่ายส่วนตัวภาษาไทย สร้างด้วย Bun + Elysia + PostgreSQL + React + Vite + LINE Messaging API + Gemini AI

## เปิดเว็บ (รันบน Mac เครื่องนี้แล้ว)
- Dashboard: http://127.0.0.1:5178
- API: http://127.0.0.1:3011
- API health: http://127.0.0.1:3011/api/health

## Deploy ขึ้น VPS ด้วย Docker
อ่านคู่มือภาษาไทย [VPS_DEPLOY.md](./VPS_DEPLOY.md) สำหรับ HTTPS, Docker Compose, Backup และขั้นตอนส่งชุด Release ขึ้น VPS โดยไม่ส่งไฟล์ความลับ

## LINEJS สำหรับผู้ใช้หลายคน (Hosted Connector)
- สมาชิกแต่ละคนเชื่อม LINE ส่วนตัวด้วย QR บนเว็บ ไม่ต้องเปิด Terminal
- แยก Worker, Token และ LINE Session ที่เข้ารหัสตาม user_id
- ค่าเริ่มต้นจำกัดไว้ที่ 4 Worker พร้อมกัน โดยไม่รบกวน Local Agent เดิมบน Mac
- สำหรับคนละเครือข่ายต้องเปิดเว็บผ่าน HTTPS/VPS ก่อนใช้งานจริง
- คู่มือการตั้งค่าและ Deploy: [LINEJS_MULTIUSER_SETUP.md](./LINEJS_MULTIUSER_SETUP.md)

## เริ่มใช้งานหลังสมัคร/ล็อกอิน
ผู้ใช้ใหม่ที่สมัครด้วยอีเมลหรือ Google จะเห็นหน้า Setup Guide ตามลำดับ:
1. เลือกชื่อบัญชีเงินและยอดเริ่มต้น
2. ตั้งงบรายสัปดาห์และเป้าหมายออม (ข้ามได้)
3. เชื่อม LINE Official Account เพื่อใช้แชตและรับแจ้งเตือน (ข้ามได้)
4. เชื่อม LINE ส่วนตัวผ่าน QR ด้วย Hosted LINEJS, ยืนยันแชตธนาคารและเลือกบัญชีที่บันทึกรายการ (ข้ามได้)

หลังเสร็จสิ้นจะเข้าสู่ Dashboard และกลับมาตั้งค่าใหม่ได้ที่เมนูบัญชีและความปลอดภัย
การเชื่อม LINEJS ต้องได้รับความยินยอมผู้ใช้ เพราะ LINEJS ไม่ใช่ API ทางการของ LINE หรือธนาคาร

## รีเซ็ตข้อมูล Local สำหรับทดลองเริ่มใหม่
คำสั่งอ่านอย่างเดียว: `bun run reset:preview` ตรวจจำนวนผู้ใช้และรายการที่จะถูกลบ โดยไม่มีการเปลี่ยนข้อมูล
คำสั่งล้างข้อมูลจริงอยู่ใน `scripts/reset-local-data.ts` โดยบังคับตรวจว่าใช้ DB local เท่านั้น,
ให้หยุด MoneyFlow API และ LINEJS Worker ก่อนลบ, ต้องยืนยันคำสั่งชัดเจน,
และต้องสำรองฐานข้อมูลกับ LINE Session พร้อมตรวจสอบไฟล์สำรองสำเร็จก่อน
**การรีเซ็ตลบผู้ใช้ทุกคน รายการเงินทั้งหมด LINE OA link, Session และ Token**
ไม่ลบซอร์สโค้ดหรือการตั้งค่า API หลักใน `.env` ห้ามใช้กับ Production

## ติดตั้ง / เปิดใหม่ภายหลัง
```bash
cd ~/Desktop/moneyflow
bun install
docker compose up -d
bun run dev
```
เมื่อเปิดครั้งแรกสามารถสมัครด้วยอีเมลและรหัสผ่านหรือ Google ได้ และเชื่อม LINE ภายหลังได้ ข้อมูล Demo ไม่บันทึกลง PostgreSQL

## ตั้งค่า Gemini และ LINE
แก้ไข `.env` ของโปรเจกต์ (ไฟล์นี้ถูก ignore ไม่ควร commit):
```env
GEMINI_API_KEY=ใส่คีย์จาก_Google_AI_Studio
GEMINI_MODEL=gemini-3.5-flash-lite
LINE_CHANNEL_SECRET=ใส่_channel_secret
LINE_CHANNEL_ACCESS_TOKEN=ใส่_long_lived_channel_access_token
```
จากนั้น restart `bun run dev` (process ปัจจุบันต้อง restart เมื่อแก้ .env)

1. เปิด https://developers.line.biz/console/
2. ใช้ LINE Official Account และเปิด Messaging API
3. กรอก Token และ Channel Secret จาก LINE Developers ใน .env
4. ให้ LINE Webhook URL เป็น `https://YOUR-PUBLIC-DOMAIN/webhook/line`
5. Backend ต้องเปิดให้ LINE เข้าถึงผ่าน HTTPS — `localhost` ใช้งานจริงจาก LINE ไม่ได้ ใช้ reverse proxy, Cloudflare Tunnel หรือ deploy บน VPS
6. เปิดหน้า LINE & AI ในเว็บ เลือก "สร้างรหัสเชื่อมต่อ" 6 หลัก มีอายุ 10 นาที
7. ส่งข้อความ `เชื่อม 123456` จาก LINE ที่ต้องการจับคู่
8. ทดลอง `กาแฟ 65` หรือส่งรูปสลิป/ใบเสร็จ จากนั้นพิมพ์ `ยืนยัน` เพื่อบันทึก (หรือ `ยกเลิก`)
9. พิมพ์ `สรุปเดือนนี้` เพื่อถามยอดจากฐานข้อมูลจริง

**สำคัญ:** Gemini จะทำหน้าที่แยกข้อความเป็นรายการ ระบบให้ยืนยันก่อนเขียนลงฐานข้อมูล และคำนวณยอดรวมจาก PostgreSQL ไม่ให้ AI คาดเดาตัวเลข รุ่น Gemini เปลี่ยนได้ผ่าน GEMINI_MODEL ตามโมเดลที่ Key ของคุณเข้าถึงได้ เมื่อไม่มี Gemini Key ยังบันทึกข้อความง่ายๆ ได้ แต่การอ่านภาพจะใช้ไม่ได้

## ฟีเจอร์
- Multi-user Google Sign-In: บัญชี Google แต่ละคนมีพื้นที่การเงินแยกจากกัน, Backend ตรวจสอบ Google ID Token, session hash และ HttpOnly cookie
- บัญชีเงินหลายใบ/ยอดตั้งต้น + การโอนระหว่างบัญชี
- เพิ่มรายการ รับ/จ่าย/โอน ค้นหา ลบ ดูย้อนหลังรายเดือน
- กราฟรายรับรายจ่าย การแยกหมวดหมู่ และ dashboard responsive
- งบประมาณรายเดือนต่อหมวดหมู่
- ตั้ง recurring rules และกดบันทึกที่ถึงกำหนด (ไม่ซ้ำเดือน)
- LINE Webhook ตรวจ HMAC SHA-256 และคิว PostgreSQL แบบกัน event ซ้ำ
- LINE pair ด้วย OTP 6 หลักที่เก็บเป็น hash และผูกกับ user ที่ล็อกอิน
- Gemini อ่านข้อความ/รูป แล้วให้ผู้ใช้ยืนยันก่อนบันทึก

## ข้อจำกัดปัจจุบัน
- ไม่ใช่บริการธนาคารและไม่ได้เชื่อม API ธนาคารโดยตรง LINEJS รับแจ้งเตือนแบบไม่เป็นทางการและอาจอ่านยอดผิดหรือขาดรายการได้ กรุณาตรวจยอดกับธนาคารจริง
- การจัดหมวดหมู่เป็นการเลือกหมวดหมู่ที่มีในระบบ หาก AI ให้หมวดหมู่ที่ไม่มีจะใช้ “อื่นๆ”
- ฟีเจอร์ recurring ไม่ใช่ background scheduler ต้องกดบันทึกรายการที่ครบกำหนดจากเว็บ
- หน้าเว็บมีเพิ่ม/ลบรายการ แต่ยังไม่มีหน้าแก้ไขรายการเดิม
- รายการล่าสุดแสดงสูงสุด 1,000 รายการเพื่อจำกัดการโหลด
- บัญชีเงินถูกจับคู่ default account เมื่อบันทึกผ่าน LINE; เลือกบัญชีเฉพาะรายการจากเว็บได้
- หากประมวลผลรูปด้วย Gemini ช้าจน replyToken หมดอายุ อาจได้รับข้อความแจ้งข้อผิดพลาด/ต้องส่งใหม่
- `docker-compose.yml` ใช้รหัสผ่าน PostgreSQL สำหรับ local development เท่านั้น ก่อนเผยแพร่จริงเปลี่ยน credentials, ตั้ง TLS/HTTPS, backup และ rate limiting, จำกัดการเข้าถึง PostgreSQL

## ทดสอบ
```bash
bun run build
curl http://127.0.0.1:3011/api/health
curl http://127.0.0.1:3011/api/auth/status
```

## สถานะการเชื่อมต่อบน Mac (8 ต.ค. 2026)
- Gemini: ใส่ API Key แล้ว เปลี่ยนเป็น gemini-3.5-flash-lite และทดสอบแยกรายจ่ายสำเร็จ
- LINE: ใส่ Channel Secret / Access Token แล้ว ตั้ง HTTPS Webhook URL และทดสอบ Verify ผ่าน (HTTP 200)
- LINE Developers: Use webhook เปิด ON แล้วตามที่ตรวจสอบ และปิด Auto-reply เดิมแล้ว
- ในหน้า LINE & AI บนเว็บมีปุ่ม "ตรวจสถานะอีกครั้ง" เพื่อเช็กว่า LINE เปิด Webhook แล้วหรือยัง

**อย่าแชร์ .env หรือ API Keys ลงแชตหรือ GitHub**

## Webhook ที่ตั้งค่าให้ทดสอบแล้ว (8 ต.ค. 2026)
- Test URL ชั่วคราว: `https://traveller-beverages-wedding-alter.trycloudflare.com/webhook/line`
- ทดสอบ Verify กับ LINE สำเร็จ (HTTP 200)
- ยังต้องเปิด **Use webhook** ใน LINE Developers > Messaging API ด้วยตนเอง
- ไปที่ LINE Official Account Manager > ตั้งค่า > ตั้งค่าการตอบกลับ แล้วปิด **ข้อความตอบกลับอัตโนมัติ (Auto-reply messages)** เพื่อให้ตอบผ่าน API อย่างเดียว
- หลังเปิด Webhook กลับเข้า MoneyFlow > LINE & AI > กด "ตรวจสถานะอีกครั้ง" แล้วสร้างรหัสจับคู่ **ใหม่** (รหัสเดิมอายุเพียง 10 นาที)
- ที่เครื่อง Mac ปัจจุบันมี `bun run dev`, `bun server/webhook-gateway.ts` และ `cloudflared tunnel --url http://127.0.0.1:3012` ทำงานอยู่
- Tunnel แบบ Quick เป็นแบบชั่วคราวและ URL จะเปลี่ยนทุกครั้งที่เริ่มใหม่ ต้องใช้ `bun server/configure-webhook.ts https://<new-tunnel-host>/webhook/line` เพื่ออัปเดต LINE
- Gateway ตอบเฉพาะ POST `/webhook/line` และตรวจลายเซ็นของ LINE ไม่เปิดหน้าเว็บ Dashboard หรือ API การเงินผ่าน Tunnel
- Gemini เปลี่ยนเป็น `gemini-3.5-flash-lite` เพราะ `gemini-2.5-pro` ไม่พร้อมให้ Key นี้ใช้งาน และรุ่น Lite ทดสอบแยกค่าใช้จ่ายสำเร็จ



## Google Sign-In สำหรับสมาชิกทุกคน

ทุกบัญชี Google ที่ยืนยันตัวตนผ่าน สามารถสมัครและเข้าสู่ระบบ MoneyFlow ได้โดยไม่ต้องสร้างรหัสผ่าน ผู้ใช้ใหม่จะมีบัญชีเงิน 3 ใบและหมวดหมู่เริ่มต้น 10 หมวดโดยอัตโนมัติ ข้อมูลรายรับรายจ่าย งบประมาณ และ LINE ของแต่ละ User ID เป็นอิสระจากกัน

### ตั้งค่า Google OAuth Client ID หนึ่งครั้ง

1. ไปที่ https://console.cloud.google.com/auth/clients
2. เลือก Google Cloud Project แล้วตั้ง Google Auth Platform > Branding ชื่อ MoneyFlow
3. ตั้ง Audience เป็น External เพื่ออนุญาตบัญชี Google ทั่วไป และตั้ง Publishing status เป็น Production เมื่อพร้อมใช้งานกับทุกคน (ในโหมด Testing เข้าได้เฉพาะ Test users)
4. Clients > Create client > Web application
5. Authorized JavaScript origins: http://localhost:5178 และ http://127.0.0.1:5178
6. ไม่ต้องใส่ Authorized redirect URIs เพราะเว็บใช้ Google Identity Services JavaScript callback
7. คัดลอก OAuth Web Client ID ที่ลงท้ายด้วย .apps.googleusercontent.com ใส่ในไฟล์ Desktop/moneyflow/.env:

    GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com

8. รีสตาร์ต Bun/Elysia แล้วเปิด http://127.0.0.1:5178
9. ผู้ใช้คนใดก็สามารถ Sign in with Google; คนใหม่จะสมัครและตั้งค่าพื้นที่บัญชีอัตโนมัติ

ไม่ต้องใช้ GOOGLE_CLIENT_SECRET และ Gemini API Key ไม่ใช่ Google OAuth Client ID

### ข้อมูลก่อนเริ่มต้นใหม่

ฐานข้อมูล MoneyFlow ถูกรีเซ็ตสำหรับการเริ่มต้นใหม่แล้ว ผู้ใช้ใหม่ทุกคนสมัครด้วย Google โดยไม่มีการกู้บัญชีแบบรหัสผ่านเก่า ข้อมูลของผู้ใช้ถูกแยกด้วย user ID

### ก่อนเปิดเว็บให้คนอื่นเข้า

ตอนนี้เว็บยังเปิดเฉพาะ localhost บน Mac เท่านั้น Cloudflare Tunnel เดิมเปิดเฉพาะ LINE Webhook ไม่ได้เปิดหน้าเว็บ MoneyFlow ให้คนอื่นเข้า หากต้องการให้ผู้ใช้อื่นเข้าจากมือถือหรือคอมพิวเตอร์ตนเอง ต้อง Deploy เว็บ + API บนโดเมน HTTPS ที่กำหนดและเพิ่มโดเมนใน OAuth Authorized JavaScript origins

ตั้ง WEB_ORIGIN เป็นโดเมนจริง ตั้ง NODE_ENV=production เพื่อเปิด Secure cookie ตั้ง database backup, secrets, TLS, HTTPS, rate limiting และ privacy policy ก่อนเปิดบริการจริง

Official Google docs:
https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
https://support.google.com/cloud/answer/15549945

### ทดสอบ

    bun test
    bun run build

Integration test ระบบบัญชีและการแยกข้อมูลอยู่ใน scripts/auth-e2e-smoke.ts ต้องชี้ TEST_DATABASE_URL ไปฐานทดสอบแยกจากข้อมูลจริงเท่านั้น

## บัญชีและการล็อกอิน (อัปเดต)

หน้าแรกของ MoneyFlow มีสามแท็บ: อีเมล, Google และ LINE

- **อีเมล**: สมัครสมาชิกด้วยชื่อ อีเมล และรหัสผ่านอย่างน้อย 10 ตัวอักษร; ใช้อีเมลกับรหัสผ่านเดิมกลับเข้าบัญชีได้
- **Google**: กด Sign in with Google ถ้าเป็นผู้ใช้ใหม่จะสร้างบัญชี; ถ้ามีบัญชีอีเมลอยู่ก่อน ให้ล็อกอินด้วยอีเมลแล้วเชื่อม Google จากเมนู "บัญชีและความปลอดภัย" ก่อน เพื่อไม่สร้างบัญชีซ้ำ
- **LINE**: เป็นวิธีเข้าสู่ระบบทางเลือก หลังจากเชื่อม LINE จากในบัญชี MoneyFlow แล้วเท่านั้น

เมนู **บัญชีและความปลอดภัย** (Sidebar) ใช้เชื่อม Google, ตั้งรหัสผ่านสำหรับคนที่สมัคร Google, เปลี่ยนรหัสผ่าน หรือเชื่อม/ยกเลิกเชื่อม LINE ทั้งหมดเป็นตัวเลือกเสริม

**เชื่อม LINE ครั้งแรก:** ขณะล็อกอินอยู่ ไปหน้า "บัญชีและความปลอดภัย" กด "สร้างรหัสเชื่อม LINE" แล้วส่งคำสั่ง `เชื่อม 123456` ด้วยรหัส 6 หลักจากเว็บไปยังแชต MoneyFlow OA รหัสมีอายุ 10 นาที

**เข้าบัญชีเดิมเมื่อลืมรหัสผ่าน:** หน้า Login > LINE > สร้างรหัสเข้าสู่ระบบ จากนั้นส่ง `Login 12345678` โดยแทนตัวเลขด้วยรหัสจริง 8 หลักจากเว็บและส่งข้อความทั้งบรรทัดไป LINE OA ที่เคยเชื่อมไว้ (อย่าส่งเฉพาะตัวเลข) ระบบยืนยันกับ LINE แล้วเว็บจะเข้าสู่บัญชีเดิมโดยอัตโนมัติ รหัสมีอายุ 5 นาที ใช้ครั้งเดียว จากนั้นเข้า Security เปลี่ยนรหัสผ่านใหม่ได้ภายใน 15 นาทีหลังล็อกอินด้วย LINE

**ข้อจำกัดด้านความปลอดภัยก่อนใช้งานสาธารณะ:** ยังไม่ได้ทำ email verification/ยืนยันเจ้าของอีเมลผ่าน SMTP และไม่มีลิงก์รีเซ็ตรหัสผ่านทางอีเมล ถ้าไม่ได้เชื่อม Google หรือ LINE และลืมรหัสผ่าน จะยังไม่มีช่องทางกู้คืนด้วยตนเอง กรุณาเพิ่มระบบยืนยันอีเมล, rate limit ระดับ gateway, audit logging, HTTPS, Backup และ Security Review ก่อนเปิดเป็นบริการข้อมูลการเงินจริง

Backend ต้องรีสตาร์ตหลังแก้ `.env` เมื่อเข้า Google Cloud OAuth ให้ Authorized JavaScript origins ตรงกับเว็บ (`http://localhost:5178` และ `http://127.0.0.1:5178`) การทดสอบ login Google จริงต้องกดด้วยบัญชี Google ของคุณ

Integration tests ใช้ฐานข้อมูลทดสอบแยกผ่าน `scripts/auth-e2e-smoke.ts` เท่านั้น


## Page routing and deployment architecture (October 2026)

MoneyFlow now uses React Router with dedicated page components: /dashboard,
/transactions, /budgets, /accounts, /recurring, /line-ai, /settings and /login.
The entrypoint src/main.tsx only mounts the app/router/global dialogs.
See src/app/App.tsx, src/app/navigation.ts and src/pages/ for the new structure.

The login flash on refresh is fixed by showing a neutral session-loading screen
while verifying the existing session, instead of briefly rendering the login form.
A signed-in user retains the exact URL after refresh. The frontend distinguishes
unauthorized sessions (401) from backend or network errors.

Production deployment templates are in deploy/README.md, Dockerfile,
docker-compose.production.yml, deploy/nginx.conf, and .env.production.example.
A real HTTPS domain, private credentials and a deployment host must be configured
separately. This refactor does not move or delete the real finance database.

Code formatting: bun run format, bun run format:check.


## LINE Rich Menu (approved cute artwork)

The LINE OA uses the illustrated six-tile menu from `scripts/moneyflow-richmenu-cute.webp`. The publisher at `server/setup-richmenu.ts` converts the artwork to a 2500x1686 JPEG under LINE's 1 MB limit, registers six equal tap areas, and sets the uploaded menu as the OA default only **after** image upload succeeds.

- `bun run line:menu:preview` checks and regenerates the image without changing LINE.
- `bun run line:menu:publish` uploads the new version and makes it the default.

Buttons send: วันนี้ → สรุปวันนี้, สัปดาห์ → สรุปสัปดาห์, กราฟ → กราฟเดือนนี้, งบเหลือ → งบคงเหลือ, เดือนนี้ → สรุปเดือนนี้, ช่วยเหลือ → ช่วยเหลือ. No webhook logic change is required. A running publicly accessible LINE webhook is still necessary for tap replies.


## New-user setup and UX audit (October 2026)

After registration, new MoneyFlow accounts use /welcome to configure primary account balance, weekly budget, monthly savings, and optional LINE linking. Skip is allowed; existing accounts are not forced through onboarding. /settings links back to the welcome guide. Setup status is per-user in PostgreSQL.

See UX_AUDIT_2026-10-09.md for the page-by-page findings, screenshots, browser checks and limitations. Run bun test and bun run build before shipping.

## Experimental bank notifications via LINEJS

The opt-in personal-LINE bank alert prototype lives at `integrations/linejs/`.
Open LINE & AI in MoneyFlow and read `integrations/linejs/README.md` before enabling the receiver. All three feature switches are OFF by default. This requires the bank to send actual messages in LINE; it does not read K PLUS device notifications. LINEJS is not an official LINE SDK.
