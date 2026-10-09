# LINE Rich Menu (ทดลอง)

Rich Menu 2 แท็บ ("DTC GPS & IoT" + "DTC SHOPS") สำหรับ LINE Official Account — ตั้งผ่าน Messaging API
ตอนนี้ใช้กับ **OA ทดสอบเท่านั้น** ยังไม่แตะ OA จริงของบริษัท

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `rich-menu.html` | ภาพจำลองหน้าแชต + rich menu (เปิดในเบราว์เซอร์ได้) และเป็นต้นแบบของรูปเมนู |
| `render-menu.js` | ถ่ายรูปเมนูจาก `rich-menu.html` → `menu-gps.jpg`, `menu-shop.jpg` (2500 × 1686) |
| `setup-richmenu.js` | สร้างเมนู 2 ชุด + พื้นที่กด + อัปโหลดรูป + alias `tab-gps`/`tab-shop` + ตั้งเป็นเมนูเริ่มต้น |
| `check.js` | เช็กว่ารหัสใน `.env` ใช้ได้ และดูว่ามีเมนูอยู่กี่ชุด |
| `env.js` | อ่านรหัสจาก `line/.env` และเรียก LINE API |
| `handler.js` | ส่วนตอบข้อความ (ค้นหา/การ์ด/สาขา/postback) + ตรวจลายเซ็น — ใช้ร่วมกันระหว่าง `bot.js` กับ Vercel Function `frontend/api/line/webhook.js` |
| `searchState.js` | จำว่าใครอยู่ในโหมด "รอคำค้น" — ในหน่วยความจำ หรือตาราง `line_search_state` ใน Supabase เมื่อมี `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` |
| `bot.js` | `npm run bot` — เซิร์ฟเวอร์ :4100 + tunnel + ส่งต่อรูป/หน้าเว็บ dev แล้วเรียก `handler.js` |
| `package.json` | คำสั่ง `npm run …` + Playwright (ใช้เฉพาะ `render`) |
| `Dockerfile` | image สำหรับ production (รัน `bot.js --no-tunnel`) — ใช้กับ `database/docker-compose.prod.yml --profile line` |
| `.env.example` | แบบไฟล์ `line/.env` |

## ตั้งค่า

สร้างไฟล์ `line/.env` จาก `.env.example` (ห้าม commit — `.env` อยู่ใน `.gitignore` แล้ว) · ค่าในตัวแปรสภาพแวดล้อมทับค่าในไฟล์ (ใช้ตอนรันใน Docker)

```
# LINE Developers › Basic settings › Channel secret (32 ตัวอักษร)
LINE_CHANNEL_SECRET=
# LINE Developers › Messaging API › Channel access token (long-lived)
LINE_CHANNEL_ACCESS_TOKEN=
```

## ใช้งาน

ต้องใช้ Node 18 ขึ้นไป

```bash
cd line
npm run check     # เช็กรหัส
npm run setup     # ตั้งเมนูจากรูปใน repo (รันซ้ำได้ — ลบชุดเดิมที่สคริปต์สร้างก่อน)
npm run remove    # ลบเมนู → OA กลับไปใช้เมนูจาก LINE OA Manager
```

`check` / `setup` / `remove` ใช้แค่ของในตัว Node ไม่ต้อง `npm install`

### แก้หน้าตาเมนู

แก้ `rich-menu.html` แล้วสร้างรูปใหม่ (ทำครั้งแรกครั้งเดียว: ติดตั้ง Playwright + ดาวน์โหลด Chromium ~115 MB)

```bash
npm install
npm run install-browser   # ดาวน์โหลด Chromium รุ่นที่ตรงกับ Playwright
npm run render            # → menu-gps.jpg, menu-shop.jpg
npm run setup             # อัปโหลดรูปใหม่ขึ้น LINE
```

## พิกัดพื้นที่กด (ภาพ 2500 × 1686)

แถบแท็บสูง 238 px (ซ้าย 0–1250 / ขวา 1250–2500) · ตาราง 3 × 2 แถวละ 724 px · คอลัมน์ 0–835 / 835–1665 / 1665–2500
ถ้าแก้ขนาดใน `rich-menu.html` ต้องแก้ `TAB_H`, `ROW_H`, `COLS` ใน `setup-richmenu.js` ให้ตรง

## บอทตอบปุ่มแท็บ DTC SHOPS

`bot.js` รับ webhook จาก LINE แล้วดึงข้อมูลจาก API ของระบบ (`/api/search`, `/api/products`, `/api/categories`, `/api/shops`) ตอบเป็นการ์ด Flex — `flex.js` สร้างการ์ด

```bash
npm install     # ครั้งแรก — ได้ cloudflared มาด้วย
npm run bot     # เปิดบอท :4100 + tunnel + ตั้ง Webhook URL ให้ LINE อัตโนมัติ (Ctrl+C ปิด)
```

ต้องมี: backend รันอยู่ที่ :4000 · เปิดสวิตช์ **Webhooks** ใน LINE OA Manager › ตั้งค่า › ตั้งค่าการตอบกลับ

| ผู้ใช้ทำ | บอทตอบ |
|---|---|
| ค้นหาสินค้า | ให้พิมพ์คำค้น + ปุ่มตัวอย่าง → ข้อความถัดไป (ภายใน 5 นาที) ค้นด้วย `/api/search` (พิมพ์ผิด/ผิดแป้นก็เจอ) |
| สินค้าแนะนำ | การ์ดสินค้ายอดนิยม 10 อันดับ |
| หมวดหมู่สินค้า | ปุ่มเลือกหมวด → การ์ดสินค้าในหมวด |
| กด "ดูคุณสมบัติ" บนการ์ด | การ์ดสเปค 8 หัวข้อแรก + ปุ่มสั่งซื้อ Shopee/Lazada/TikTok ของสินค้านั้น + ปุ่ม "ดูคุณสมบัติทั้งหมด" เปิดหน้าสินค้าบนเว็บ (ไม่มีปุ่มสั่งซื้อ LINE — คุยอยู่ใน LINE ร้านแล้ว) |
| เปรียบเทียบสินค้า (เมนู) | เปิดหน้า `/compare` บนเว็บโดยตรง (ปุ่มแบบลิงก์) · ถ้าเมนูตั้งตอนไม่มีเว็บ บอทตอบข้อความแทน |
| สาขา DTC Shop | การ์ดสาขา + ปุ่มโทร / เปิดแผนที่ |
| ปุ่มแท็บแรก / ข้อความอื่น | ไม่ตอบ — ปล่อยให้เจ้าหน้าที่ตอบใน Chat |

ค่าเสริมใน `line/.env` (ไม่ใส่ก็ได้): `BOT_PORT` (4100) · `API_ORIGIN` (`http://localhost:4000`) · `WEB_BASE_URL` (หน้าเว็บที่คนนอกเปิดได้ — ใส่แล้วการ์ดมีปุ่ม "ดูบนเว็บ")

- ไม่ได้ตั้ง `WEB_BASE_URL` (ตอนพัฒนา): บอทเปิด**หน้าเว็บ dev (:5173) ผ่าน tunnel เดียวกัน** ปุ่ม "ดูคุณสมบัติทั้งหมด" / "เปรียบเทียบสินค้า" จึงเปิดบนมือถือได้ และ**ตั้งเมนูใหม่ทุกครั้งที่เปิด** (ลิงก์ปุ่มเปรียบเทียบต้องตาม URL ของ tunnel) · หลังบ้าน (`/admin`, `/api/admin`, `/api/auth`) ถูกกัน 403 · เปลี่ยนที่อยู่หน้าเว็บ dev ด้วย `WEB_DEV_ORIGIN`
- tunnel แบบ quick ของ Cloudflare ได้ URL ใหม่ทุกครั้งที่เปิด → บอทตั้ง Webhook URL ใหม่ให้เอง · ปิดบอท = LINE ส่งไม่ถึง (ไม่มีอะไรตอบ)
- บังคับ `--protocol http2` เพราะเครือข่ายที่นี่บล็อก QUIC (UDP 7844)
- รูปในการ์ดโหลดผ่าน tunnel (`/uploads/*` ส่งต่อจาก backend) เพราะ LINE รับเฉพาะรูป HTTPS

## ใช้งานจริง (production)

`npm run bot` ใช้แค่ตอนพัฒนา (quick tunnel ได้ URL ใหม่ทุกครั้ง) · ของจริงให้รันบอทเป็น service `line` ในชุด production แล้ว nginx ของหน้าเว็บส่ง `https://<โดเมน>/line/*` มาให้ — ขั้นตอนเต็มอยู่ใน `docs/deployment.md` หัวข้อ "บอท LINE OA"

```bash
cd database
docker compose -f docker-compose.prod.yml --profile line up -d --build
```

แล้วตั้ง Webhook URL ใน LINE Developers เป็น `https://<โดเมน>/line/webhook` ครั้งเดียว · ใน `line/.env` บนเซิร์ฟเวอร์ใส่ `PUBLIC_BASE_URL` (และ `WEB_BASE_URL`) เป็นโดเมนนั้น

## บอทบน Vercel (เว็บทดสอบ — ไม่ต้องรันบอทเอง)

บอทรันเป็น function ของโปรเจกต์ Vercel `dtc-shops` ที่ `https://dtc-shops.vercel.app/api/line/webhook` (`frontend/api/line/webhook.js` → `handler.js`) · push ขึ้น `main` แล้วบอทอัปเดตพร้อมเว็บ

ตั้งครั้งเดียว:

1. Supabase › SQL Editor — ตารางเก็บสถานะ "รอคำค้น" (function แต่ละครั้งอาจได้เครื่องใหม่ จำในหน่วยความจำไม่ได้):
   ```sql
   create table if not exists line_search_state (user_id text primary key, until timestamptz not null);
   alter table line_search_state enable row level security; -- ไม่มี policy = เข้าถึงได้แค่ service_role
   ```
2. Vercel › `dtc-shops` › Settings › Environment Variables (Production) — เพิ่ม `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` (ค่าเดียวกับ `line/.env`), `API_ORIGIN` และ `WEB_BASE_URL` = `https://dtc-shops.vercel.app` (`SUPABASE_URL`/`SUPABASE_SERVICE_KEY` มีอยู่แล้ว) → Redeploy
3. LINE Developers › Messaging API › Webhook URL = `https://dtc-shops.vercel.app/api/line/webhook` → Verify · เปิด Use webhook
4. ในเครื่อง: `line/.env` ตั้ง `WEB_BASE_URL=https://dtc-shops.vercel.app` แล้ว `npm run setup` (ปุ่มเปรียบเทียบในเมนูชี้เว็บนี้ถาวร)

ห้ามรัน `npm run bot` ค้างไว้พร้อมกัน — ตอนเปิด มันตั้ง Webhook URL เป็น tunnel ของเครื่องทับ (กลับมาใช้ Vercel = ตั้ง URL ในข้อ 3 ใหม่)

## ข้อจำกัดตอนนี้

- ยังไม่ได้ขึ้นเซิร์ฟเวอร์จริง — ทดสอบชุด production บนเครื่องแล้ว (7 ต.ค. 2026)
- ลิงก์ร้านค้าที่เสียใน DB (เช่น Shopee ของ `itm-0000021` ถูกตัดกลาง `%`) ถูกข้าม ไม่แสดงปุ่ม
- ปุ่ม "ติดตามรถยนต์" ชี้ `https://www.dtc.co.th` ชั่วคราว — ยังไม่รู้ลิงก์จริง
- รูปปุ่มแท็บแรกวาดใหม่ ไม่ใช่รูปจากเมนูจริงของ DTC GPS & IoT
