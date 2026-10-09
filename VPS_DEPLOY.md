# MoneyFlow — Deploy ขึ้น VPS ด้วย Docker (Production)

สำหรับ VPS Ubuntu/Debian ที่มี Docker Engine + Docker Compose plugin อยู่แล้ว
โค้ดนี้ **ยังไม่ได้ Deploy ไป VPS ของคุณ** จนกว่าจะทราบ SSH/Domain

## โครงสร้าง

```text
Internet (HTTPS)
   |
   +-- Caddy :80/:443  [เลือก --tls; ออก cert และต่ออายุอัตโนมัติ]
   |     |
   |     v
   +-- nginx (React SPA) ----> API / Bun :3011 ----> PostgreSQL 16 (private)
         |                       |                  (volume postgres_data)
         |                       +----> 4x Node 24 LINEJS workers
         |                              (volume linejs_sessions เข้ารหัส AES-GCM)
         +--> /ws/live :3061
         +--> LINE-only Webhook gateway :3012
                (ตรวจ LINE signature)
```

- **ไม่มีพอร์ตของ PostgreSQL, API, WebSocket หรือ Gateway เปิดออกอินเทอร์เน็ต**
- เครือข่าย PostgreSQL เป็น internal-only; API ต่อเครือข่าย application อีกเส้นเพื่อออกไปหา LINE, Google, Gemini ได้
- หาก VPS มี Nginx/Traefik/Caddy ของโปรเจกต์อื่นใช้ :80/:443 อยู่แล้ว เลือก **--existing-proxy**
- nginx ของ MoneyFlow ผูกเฉพาะ `127.0.0.1:8080`; ให้ Reverse Proxy HTTPS เดิมส่งต่อมาที่พอร์ตนี้

## 1. เตรียม VPS

แนะนำเริ่มที่ 2 vCPU / RAM 4 GB / SSD 40 GB สำหรับผู้ทดสอบ 3–4 คน (ติดตาม RAM จริงและขยายถ้าจำเป็น)

ต้องมี Docker Engine + Compose plugin ที่รองรับ Compose `env_file.required`. ตรวจด้วย:

```bash
docker --version
docker compose version
docker info
```

กำหนด DNS A Record ของ `moneyflow.yourdomain.com` ให้ชี้ IPv4 ของ VPS
(หากตั้ง AAAA ให้ชี้ IPv6 ของ VPS จริงด้วย)

ถ้ารัน Caddy ใน Docker ให้พอร์ต **80/tcp, 443/tcp, 443/udp** ว่างและอนุญาตผ่านไฟร์วอลล์
เปิด SSH (22/tcp) ให้พร้อมก่อนเปลี่ยนไฟร์วอลล์ อย่าเปิด 5432, 3011, 3012, 3061, 8080 สู่สาธารณะ

## 2. ส่งไฟล์ขึ้น VPS

เพราะโค้ด MoneyFlow บน Mac อาจมีการแก้ไขที่ยังไม่ได้ Git commit จึงมีตัวส่งออก release ที่รวมเวอร์ชันปัจจุบัน **ไม่รวม .env, Session, Node Modules หรือข้อมูลการเงินจริง**

บน Mac:

```bash
cd ~/Desktop/moneyflow
bash deploy/export-release.sh
# จะได้ไฟล์ ~/Desktop/moneyflow-vps-release-YYYYMMDD-HHMMSS.tar.gz
scp ~/Desktop/moneyflow-vps-release-*.tar.gz YOUR_USER@YOUR_VPS_IP:~/
```

บน VPS:

```bash
mkdir -p ~/apps/moneyflow
tar -xzf ~/moneyflow-vps-release-YYYYMMDD-HHMMSS.tar.gz -C ~/apps/moneyflow
cd ~/apps/moneyflow
```

อีกทางคือ Commit/Push โค้ดแล้ว `git clone` ลง VPS แต่ระวังไฟล์ใหม่ที่ยังไม่ได้ commit

## 3. สร้างไฟล์ .env.production

```bash
bash deploy/init-env.sh moneyflow.yourdomain.com you@example.com
nano .env.production
```

ตัวเริ่มต้นจะสร้าง DB password และ `LINEJS_SESSION_ENCRYPTION_KEY` ใหม่แบบสุ่ม
และตั้ง `LINEJS_HOSTED_ENABLED=1`, จำนวน 4 Worker
**ห้ามรัน init-env ใหม่ทับไฟล์เดิม** และห้ามเอา `.env` จาก Mac มาใส่ตรง ๆ

ต้องกรอกอย่างน้อย:
- `LINE_CHANNEL_SECRET` จาก LINE Messaging API
- `LINE_CHANNEL_ACCESS_TOKEN` จาก LINE Messaging API
- `GOOGLE_CLIENT_ID` ถ้าจะเปิด Google Login
- `LINE_LOGIN_CHANNEL_ID` และ `LINE_LOGIN_CHANNEL_SECRET` ถ้าจะใช้ LINE OAuth Login
- `GEMINI_API_KEY` ถ้าจะใช้ Gemini AI

ไฟล์ผลิตจริงต้องอยู่สิทธิ์ `600`; **ห้ามส่งไฟล์นี้ในแชต / Commit / ขึ้น GitHub**
ให้เก็บกุญแจ LINEJS Session แบบส่วนตัวและแยกจาก Backup DB

## 4. เริ่ม Docker

**แบบ A: VPS มีพอร์ต 80/443 ว่าง (ง่ายสุด)**
```bash
bash deploy/doctor.sh --tls
bash deploy/deploy.sh --tls
```

Caddy จะขอ TLS Certificate อัตโนมัติเมื่อ Domain ชี้มาที่ VPS และพอร์ตเข้าได้จริง
เปิดเว็บที่ `https://moneyflow.yourdomain.com`

**แบบ B: VPS มี Reverse Proxy ของโปรเจกต์อื่นอยู่แล้ว**
```bash
bash deploy/doctor.sh --existing-proxy
bash deploy/deploy.sh --existing-proxy
```

ที่ Reverse Proxy เดิมตั้งให้ Domain MoneyFlow ส่งทั้งเว็บ, API, WebSocket และ Webhook ไปที่ `http://127.0.0.1:8080` แล้วเปิด HTTPS หน้า Proxy เท่านั้น

ตัวอย่าง Caddyfile ของ Proxy เดิม:

```caddy
moneyflow.yourdomain.com {
    reverse_proxy 127.0.0.1:8080
}
```

ถ้าใช้ nginx เดิม ให้ตั้ง `proxy_set_header Host $host`,
`X-Forwarded-Proto $scheme`, `Upgrade $http_upgrade`,
`Connection "upgrade"` เพื่อรองรับ WebSocket ด้วย

## 5. ตั้งค่าผู้ให้บริการภายนอก

ต้องตั้งให้ตรง Domain สุดท้าย:

| บริการ | URL / ค่า |
|---|---|
| Google Cloud OAuth Web Client | Authorized JavaScript origins: `https://moneyflow.yourdomain.com` |
| LINE Messaging API | Webhook URL: `https://moneyflow.yourdomain.com/webhook/line` |
| LINE Login Channel | Callback URL: `https://moneyflow.yourdomain.com/api/auth/line/qr/callback` |
| MoneyFlow API | `https://moneyflow.yourdomain.com/api/health` |

ตรวจ Webhook ที่ LINE Developers ว่า **Verify = Success**
ใช้ LINE Login Channel และ Messaging API ภายใต้ Provider ที่เชื่อมถึงผู้ใช้คนเดียวกันตามการตั้งค่าของ LINE

## 6. ทดสอบหลังขึ้น VPS

1. สมัครสมาชิกใหม่ด้วยอีเมลหรือ Google
2. Wizard บัญชีเงิน / งบประมาณ / LINE OA / LINEJS ปรากฏครบ
3. เชื่อม LINE OA แล้วลองสั่งสรุปรายวันจากแชต
4. ล็อกอินด้วยผู้ใช้ทดสอบอีก 2–4 คน สแกน QR กับ LINE ของแต่ละคนโดยเฉพาะ
5. ยืนยันว่าผู้ใช้ A ดู QR/ข้อมูลธุรกรรมของ B ไม่ได้
6. ทดสอบหยุดและเริ่ม LINEJS อีกครั้ง แล้วรีสตาร์ต Container ว่า Session ยังอยู่
7. ตรวจรายการจาก KBank Live โดยไม่จำเป็นต้องทำธุรกรรมเงินจริงเพื่อทดสอบโครงสร้าง

CLI เช็ก:
```bash
docker compose --env-file .env.production -f docker-compose.production.yml ps
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=80 api gateway web
curl -fsS https://moneyflow.yourdomain.com/api/health
```

## 7. Backup / Update

```bash
# สำรอง PostgreSQL และ Session LINEJS (เก็บส่วนตัว โหมดไฟล์ 600)
bash deploy/backup.sh

# ก่อนอัปเดต: สำรอง แล้ว rebuild โดยไม่ลบ Volumes
bash deploy/deploy.sh --tls
```

**แนะนำตั้งค่า age backup encryption** บน VPS ด้วย Public Recipient:
```bash
export MONEYFLOW_BACKUP_AGE_RECIPIENT='age1YOUR_PUBLIC_RECIPIENT'
bash deploy/backup.sh
```

ถ้าไม่มี age/recipient สคริปต์จะบันทึกไฟล์ธรรมดาแบบสิทธิ์ส่วนตัว (ต้องจัดเก็บบน Disk เข้ารหัสและจำกัดผู้เข้าถึง)
แนะนำส่ง Backup เข้าพื้นที่เข้ารหัสนอก VPS และทดสอบ Restore ใน Container แยกต่างหากเป็นระยะ
**Backup ไม่รวมกุญแจ LINEJS_SESSION_ENCRYPTION_KEY ต้องเก็บแยกต่างหาก**

### ตั้ง Backup อัตโนมัติทุกวัน (แนะนำ)

สร้างคีย์สำหรับ Age **บนเครื่องที่เชื่อถือได้และเก็บ Private Key นอก VPS** แล้วนำมาเฉพาะ Public Recipient ซึ่งขึ้นต้นด้วย `age1...` บน VPS

ตั้ง Cron ของผู้ใช้ที่รัน Docker ได้ (ตัวอย่าง 03:17 ทุกวัน):

```cron
17 3 * * * cd /home/ubuntu/apps/moneyflow && MONEYFLOW_BACKUP_AGE_RECIPIENT=age1YOUR_PUBLIC_RECIPIENT bash deploy/backup.sh >> /home/ubuntu/moneyflow-backup.log 2>&1
```

Backup script จะหยุดพร้อม Error ถ้าตั้ง Recipient แต่ไม่มีโปรแกรม `age` ติดตั้ง
ตรวจไฟล์สำรองและจำลองการ Restore เป็นระยะ และคัดลอกไฟล์สำรองที่เข้ารหัสไปเก็บนอก VPS
(การล่มของดิสก์ VPS ลูกเดียวต้องไม่ทำให้ข้อมูลทั้งหมดหาย)

ห้ามสั่ง `docker compose down -v`, `docker volume prune` หรือ `docker system prune --volumes` เพราะอาจลบฐานข้อมูล/LINE Session ของผู้ใช้จริง

## หมายเหตุสำคัญ

LINEJS เป็น Library ที่ไม่ใช่ API อย่างเป็นทางการของ LINE หรือธนาคาร
การใช้งานกับบัญชี LINE ส่วนตัวบน VPS อาจถูกตัดการเชื่อมต่อหรือบัญชีถูกจำกัด
ควรแจ้งความเสี่ยงผู้ใช้ และให้ Disconnect ได้ง่าย มี Backup/Monitoring
กฎ KBank Live ที่ยังไม่ทราบประเภทแต่พบยอดอาจตั้งต้นเป็นรายจ่ายผิดได้
MoneyFlow จึงไม่ใช่เอกสารยืนยันยอดเงินจากธนาคาร
