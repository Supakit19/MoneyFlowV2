# MoneyFlow · หน้าจัดการเงินใน LINE

หน้าจอ `/mini` เป็น Mobile-first Experience ของ MoneyFlow เอง ไม่ได้คัดลอกหน้าตาหรือแบรนด์ของผู้ให้บริการรายอื่น

## สิ่งที่ใช้งานได้

- หน้าหลัก: ยอดเงินรวมของทุกบัญชี รายรับ-รายจ่ายเดือนนี้ งบรายสัปดาห์ และรายการล่าสุด
- ดูรายจ่ายตามหมวดหมู่ บันทึกเงินเข้า/เงินออก และปรับงบรายสัปดาห์
- ดูรายการและบัญชีโดยอ้างอิงฐานข้อมูล MoneyFlow เดิม ไม่แยกชุดข้อมูลใหม่
- ใช้ผ่านเว็บที่ `https://moneyflow.aionixth.com/mini` ได้ทันทีหลัง Login บนเว็บไซต์
- เปิดจาก LINE ได้เมื่อสร้าง/เลือก LINE Login channel ภายใต้ Provider เดียวกับ MoneyFlow OA และตั้ง `LINE_LIFF_ID` ถูกต้อง

## เปิดให้ใช้งานจริงผ่าน LINE

1. เข้า LINE Developers Console ด้วยบัญชีผู้ดูแล MoneyFlow
2. ใน **Provider เดียวกับ MoneyFlow Official Account** ให้เลือกช่อง **LINE Login** ที่มีอยู่ หรือสร้าง LINE Login channel ใหม่ (ประเภท Web app) หากยังไม่มี (Production ณ 10 ต.ค. 2569 ยังไม่มีค่า `LINE_LOGIN_CHANNEL_ID` / `LINE_LOGIN_CHANNEL_SECRET`)
3. ใน LINE Login channel ไปที่แท็บ **LIFF** แล้วกด **Add** (หรือเลือกสร้าง LINE MINI App ตามตัวเลือกปัจจุบันของ LINE)
4. ตั้งค่าดังนี้:
   - ชื่อ: `MoneyFlow Pocket`
   - Size: `Full`
   - Endpoint URL: `https://moneyflow.aionixth.com/mini`
   - Scopes: **openid** และ **profile** (ไม่ต้องขอ email หรือ chat_message.write)
   - Add friend: เลือกได้ตามความเหมาะสม หากเชื่อม OA อยู่แล้วอาจใช้ Off
5. ใน `/opt/moneyflow/.env.production` กำหนด **ทั้งสามค่า**: `LINE_LOGIN_CHANNEL_ID` (Channel ID), `LINE_LOGIN_CHANNEL_SECRET` (Channel Secret) และ `LINE_LIFF_ID` (LIFF ID รูปแบบ `1234567890-AbcdEfgh`) โดยเลขก่อน `-` ของ LIFF ID ต้องตรงกับ Channel ID **ห้ามส่ง Channel Secret ในแชตหรือ Commit ลง Git**
6. Apply ค่า env **เฉพาะ MoneyFlow API container** หลังสำรองข้อมูลและตรวจ Compose โดยห้าม `docker compose down -v` หรือล้างข้อมูล
7. ตรวจ `GET /api/mini/config` ว่า `enabled: true` และทดสอบจาก LINE URL `https://liff.line.me/<LIFF_ID>`
8. หากเปิด LINE ด้วยบัญชีที่ยังไม่เชื่อม MoneyFlow ระบบจะไม่สร้างผู้ใช้อัตโนมัติ ผู้ใช้ต้องเชื่อมบัญชีจากเว็บไซต์เดิมก่อน

### ความปลอดภัย

- เบราว์เซอร์ส่ง **ID token** ไปยัง `POST /api/mini/auth` เท่านั้น
- Backend ยืนยัน ID token กับ LINE Platform และตรวจ `issuer`, `audience`, `expiration`, `subject`
- ตรวจว่าบัญชี LINE เชื่อมกับ MoneyFlow user ที่มีอยู่ใน `line_links` ก่อนออก Session แบบ HttpOnly / SameSite / Secure
- ไม่มีการเก็บ LINE token ใน LocalStorage และไม่มีการสร้างบัญชีใหม่จากคำขอ LIFF
- ข้อมูลรายรับ/รายจ่ายใช้ API เดิมที่แยกสิทธิ์ผู้ใช้ด้วย Session
- หากไม่ได้ตั้ง LIFF ID หน้า `/mini` จะแสดงหน้าชี้แจงการเปิดผ่าน LINE และผู้ใช้ยังเข้าใช้งานผ่านบัญชีเว็บไซต์ได้

## การทดสอบ

```bash
bun test tests/mini-app-auth.test.ts
bun test
bun run build
```

เพื่อทำให้เข้าถึงจากแชตสะดวกขึ้น สามารถเพิ่ม URI action ที่ชี้ไป `https://liff.line.me/<LIFF_ID>` ใน Rich Menu รุ่นถัดไป โดยออกแบบภาพและตำแหน่งปุ่มให้สอดคล้องกันก่อน ไม่ควรเปลี่ยน Action ใต้รูปเมนูเดิมโดยไม่แก้รูปปุ่มให้ตรงความหมาย
