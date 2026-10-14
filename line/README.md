# LINE OA — แท็บ DTC SHOPS

## ระบบนี้คืออะไร

ส่วนเสริมของระบบค้นหาและเปรียบเทียบสินค้าบน LINE Official Account ประกอบด้วย 2 ส่วน

1. **Rich Menu 2 แท็บ** — แท็บ "DTC GPS & IoT" (ปุ่มเดิมของ OA ให้เจ้าหน้าที่ตอบในแชต) และแท็บ "DTC SHOPS" (ค้นหา / เปรียบเทียบ / สินค้าแนะนำ / หมวดหมู่ / สาขา / สั่งซื้อ)
2. **บอท** — ตอบปุ่มในแท็บ DTC SHOPS ด้วยข้อมูลจริงจาก API ของระบบ (`/api/search`, `/api/products`, `/api/categories`, `/api/shops`) เป็นการ์ด Flex

| ผู้ใช้ทำ | บอทตอบ |
|---|---|
| ค้นหาสินค้า | เปิดแป้นพิมพ์พร้อมเติม `ค้นหา: ` — พิมพ์คำค้นต่อแล้วได้การ์ดสินค้า (พิมพ์ผิด/ผิดแป้นก็เจอ) |
| สินค้าแนะนำ | การ์ดสินค้ายอดนิยม 10 อันดับ |
| หมวดหมู่สินค้า | ปุ่มเลือกหมวด → การ์ดสินค้าในหมวด |
| ดูคุณสมบัติ (บนการ์ด) | การ์ดสเปค + ปุ่มสั่งซื้อ + ปุ่มเปิดหน้าสินค้าบนเว็บ (สินค้าหลายโมเดลได้การ์ดละโมเดล) |
| เปรียบเทียบสินค้า | เปิดหน้า `/compare` บนเว็บ |
| สาขา DTC Shop | การ์ดสาขา + ปุ่มโทร / เปิดแผนที่ |
| ข้อความอื่น | ไม่ตอบ — ปล่อยให้เจ้าหน้าที่ตอบในแชต |

ตอนนี้ใช้กับ **OA ทดสอบเท่านั้น** ยังไม่แตะ OA จริงของบริษัท

### ไฟล์หลัก

| ไฟล์ | หน้าที่ |
|---|---|
| `handler.js` | ตอบข้อความ + ตรวจลายเซ็น (ใช้ร่วมกันทั้ง `bot.js` และ Vercel) |
| `flex.js` | สร้างการ์ด Flex |
| `bot.js` | เซิร์ฟเวอร์บอทสำหรับรันเอง (:4100) + tunnel สำหรับพัฒนา |
| `setup-richmenu.js` | สร้าง/ลบ Rich Menu บน LINE |
| `rich-menu.html` · `render-menu.js` | ต้นแบบหน้าตาเมนู · ถ่ายเป็นรูป `menu-gps.jpg`, `menu-shop.jpg` |
| `check.js` | ตรวจว่ารหัสใช้ได้ |

---

## วิธีติดตั้ง

### สิ่งที่ต้องมี

- Node.js 18 ขึ้นไป
- LINE Official Account + Channel ใน [LINE Developers](https://developers.line.biz/) ที่เปิด Messaging API แล้ว
- backend ของระบบรันอยู่ (ดู [README หลัก](../README.md)) — หรือใช้ API บน https://dtc-shops.vercel.app

### 1. ใส่รหัสของ Channel

```bash
cd line
cp .env.example .env
```

ใส่ค่าใน `line/.env`:

```
LINE_CHANNEL_SECRET=          # LINE Developers › Basic settings › Channel secret
LINE_CHANNEL_ACCESS_TOKEN=    # LINE Developers › Messaging API › Channel access token (long-lived)
```

ตรวจว่ารหัสใช้ได้:

```bash
npm run check
```

### 2. ตั้ง Rich Menu

```bash
npm run setup     # สร้างเมนูจากรูปใน repo (รันซ้ำได้)
npm run remove    # ลบเมนู → กลับไปใช้เมนูจาก LINE OA Manager
```

ถ้าบอทจะเปิดเว็บที่โดเมนถาวร ให้ตั้ง `WEB_BASE_URL` ใน `line/.env` ก่อน `npm run setup` (ปุ่ม "เปรียบเทียบสินค้า" ชี้ไป `<WEB_BASE_URL>/compare`)

### 3. เปิดบอท — เลือก 1 แบบ

ทุกแบบต้องเปิดสวิตช์ **Webhooks** ใน LINE OA Manager › ตั้งค่า › ตั้งค่าการตอบกลับ

**ก. รันบนเครื่อง (ตอนพัฒนา)**

```bash
npm install     # ครั้งแรก
npm run bot     # บอท :4100 + Cloudflare tunnel + ตั้ง Webhook URL ให้อัตโนมัติ (Ctrl+C ปิด)
```

tunnel ได้ URL ใหม่ทุกครั้งที่เปิด บอทตั้ง Webhook URL และเมนูใหม่ให้เอง · ปิดบอท = แชตไม่มีอะไรตอบ

**ข. Vercel (เว็บทดสอบ — ทำงาน 24 ชม. ไม่ต้องเปิดคอม)**

บอทรันเป็น function ของโปรเจกต์ Vercel `dtc-shops` อยู่แล้ว (`frontend/api/line/webhook.js`) push ขึ้น `main` แล้วอัปเดตพร้อมเว็บ ตั้งครั้งเดียว:

1. Vercel › `dtc-shops` › Settings › Environment Variables — เพิ่ม `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `API_ORIGIN` และ `WEB_BASE_URL` = `https://dtc-shops.vercel.app` → Redeploy
2. LINE Developers › Messaging API › Webhook URL = `https://dtc-shops.vercel.app/api/line/webhook` → Verify · เปิด Use webhook
3. ในเครื่อง ตั้ง `WEB_BASE_URL=https://dtc-shops.vercel.app` ใน `line/.env` แล้ว `npm run setup`

⚠️ อย่ารัน `npm run bot` พร้อมกัน — มันตั้ง Webhook URL ทับเป็น tunnel ของเครื่อง

**ค. เซิร์ฟเวอร์จริง (Docker)**

ใน `line/.env` บนเซิร์ฟเวอร์ใส่ `PUBLIC_BASE_URL` และ `WEB_BASE_URL` เป็นโดเมน HTTPS ของเว็บ แล้ว:

```bash
cd database
docker compose -f docker-compose.prod.yml --profile line up -d --build
```

ตั้ง Webhook URL ใน LINE Developers เป็น `https://<โดเมน>/line/webhook`

### แก้หน้าตาเมนู

แก้ `rich-menu.html` แล้วสร้างรูปใหม่:

```bash
npm install
npm run install-browser   # ครั้งแรก — ดาวน์โหลด Chromium (~115 MB)
npm run render            # → menu-gps.jpg, menu-shop.jpg (2500 × 1686)
npm run setup             # อัปโหลดรูปใหม่ขึ้น LINE
```

ถ้าเปลี่ยนขนาดช่องใน `rich-menu.html` ต้องแก้ `TAB_H`, `ROW_H`, `COLS` ใน `setup-richmenu.js` ให้ตรง

### ตัวแปรเสริมใน `line/.env`

| ตัวแปร | ค่าเริ่มต้น | ใช้ทำอะไร |
|---|---|---|
| `API_ORIGIN` | `http://localhost:4000` | ที่อยู่ backend |
| `WEB_BASE_URL` | — | หน้าเว็บที่ปุ่มในการ์ดและเมนูเปิด · ไม่ตั้ง = `npm run bot` เปิดหน้าเว็บ dev ผ่าน tunnel ให้ |
| `PUBLIC_BASE_URL` | — | โดเมน HTTPS สำหรับลิงก์รูปในการ์ด (production) |
| `BOT_PORT` | `4100` | พอร์ตของบอท |
| `WEB_DEV_ORIGIN` | `http://localhost:5173` | หน้าเว็บ dev ที่ `npm run bot` เปิดผ่าน tunnel |
