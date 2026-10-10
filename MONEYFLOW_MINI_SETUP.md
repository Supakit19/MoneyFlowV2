# MoneyFlow · หน้าจัดการเงินใน LINE

หน้าจอ `/mini` เป็น Mobile-first Experience ของ MoneyFlow เอง ไม่ได้คัดลอกหน้าตาหรือแบรนด์ของผู้ให้บริการรายอื่น

## สิ่งที่ใช้งานได้

- หน้าหลัก: ยอดเงินรวมของทุกบัญชี รายรับ-รายจ่ายเดือนนี้ งบรายสัปดาห์ และรายการล่าสุด
- ดูรายจ่ายตามหมวดหมู่ บันทึกเงินเข้า/เงินออก และปรับงบรายสัปดาห์
- ดูรายการและบัญชีโดยอ้างอิงฐานข้อมูล MoneyFlow เดิม ไม่แยกชุดข้อมูลใหม่
- ใช้ผ่านเว็บที่ `https://moneyflow.aionixth.com/mini` ได้ทันทีหลัง Login บนเว็บไซต์
- เปิดจาก LINE ได้เมื่อ LIFF app ถูกสร้างใน LINE Login Channel เดิมและตั้ง `LINE_LIFF_ID` ถูกต้อง

## เปิดให้ใช้งานจริงผ่าน LINE

1. เข้า LINE Developers Console (บัญชี LINE ที่มีสิทธิ์ดูแล MoneyFlow)
2. เปิด **LINE Login channel เดิม** ที่ใช้ยืนยันตัวตน MoneyFlow ซึ่งอยู่ใต้ Provider เดียวกับ MoneyFlow Official Account
3. ในแท็บ **LIFF** กด **Add** (หาก Console แนะนำ LINE MINI App ให้ตรวจสอบช่องทางการสร้าง LIFF ก่อนดำเนินการ)
4. ตั้งค่าดังนี้:
   - ชื่อ: `MoneyFlow Pocket`
   - Size: `Full`
   - Endpoint URL: `https://moneyflow.aionixth.com/mini`
   - Scopes: **openid** และ **profile** (ไม่ต้องขอ email หรือ chat_message.write)
   - Add friend: เลือกได้ตามความเหมาะสม หากเชื่อม OA อยู่แล้วอาจใช้ Off
5. เมื่อ LINE ออก LIFF ID รูปแบบ `1234567890-AbcdEfgh` ให้เพิ่มเป็น `LINE_LIFF_ID` ใน `/opt/moneyflow/.env.production` — ตัวเลขก่อนเครื่องหมายขีดกลางต้องตรงกับ `LINE_LOGIN_CHANNEL_ID`
6. Apply ค่า env เฉพาะ MoneyFlow API container โดย **ห้ามใช้** `docker compose down -v` และห้ามล้างข้อมูล
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
