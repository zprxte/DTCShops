# DTC SHOPS — ระบบค้นหาและเปรียบเทียบสินค้า

โครงงานสหกิจศึกษา บริษัท ดี.ที.ซี. เอ็นเตอร์ไพรส์ จำกัด (มหาชน)

## ระบบนี้คืออะไร

เว็บสำหรับค้นหาและเปรียบเทียบสินค้าของ DTC (กล้องติดรถยนต์ GPS ติดตามรถ อุปกรณ์ IoT ซอฟต์แวร์ ฯลฯ) ทำมาเพื่อแก้ปัญหาที่พนักงานขายจำสเปคสินค้าทุกตัวไม่ได้ และลูกค้ามักเรียกสินค้าด้วยชื่อย่อหรือพิมพ์ชื่อผิด

| ส่วน | ผู้ใช้ | ทำอะไรได้ |
|---|---|---|
| หน้าร้าน (ไทย / อังกฤษ / ญี่ปุ่น) | ทีมขาย, ลูกค้า | ค้นหาสินค้าได้แม้พิมพ์ผิดหรือลืมสลับแป้นพิมพ์ · ดูรายละเอียด เลือกโมเดล ตัวเลือกเสริม · เปรียบเทียบสเปคได้ 2–4 ชิ้นในตารางเดียว · กดสั่งซื้อผ่าน Shopee / Lazada / TikTok / LINE |
| หลังบ้าน | แอดมิน | แดชบอร์ดยอดเข้าชม · จัดการสินค้า หมวดหมู่ คุณสมบัติ (สเปค) โมเดล ตัวเลือกสินค้า แบนเนอร์ สาขา Footer · นำเข้าสินค้าจาก Excel |
| แอป Android | ทีมขาย, ลูกค้า | ค้นหาและเปรียบเทียบสินค้าบนมือถือ → [mobile/README.md](mobile/README.md) |
| บอท LINE OA | ลูกค้า | ค้นหาสินค้า ดูการ์ดสเปค และหาสาขาในแชต LINE → [line/README.md](line/README.md) |

เว็บทดสอบบนคลาวด์: https://dtc-shops.vercel.app

### เทคโนโลยี

| ส่วน | ใช้ |
|---|---|
| Frontend | Vue 3 + TypeScript + Vite, Pinia, Vue Router, Tailwind CSS |
| Backend | Node.js 20 + Express 4 + Prisma 5, ค้นหาด้วย fuse.js |
| Database | PostgreSQL 16 (โครงสร้างตารางเดียวกับเว็บ dtcshops.com) |
| รันระบบ | Docker Compose |

### โครงสร้างโฟลเดอร์

```
backend/    API (Express)
frontend/   เว็บ Vue 3 ทั้งหน้าร้านและหลังบ้าน
database/   schema + docker-compose + สคริปต์รวมระบบ (merge/)
mobile/     แอป Flutter (Android)
line/       Rich Menu + บอท LINE OA
```

---

## วิธีติดตั้ง

### สิ่งที่ต้องมี

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Git
- ไฟล์ข้อมูล 2 อย่างจากผู้พัฒนา (ข้อมูลเป็นของจริงของบริษัท จึงไม่ได้อยู่ใน repo):
  - `product_compare.dump` — ฐานข้อมูลทั้งหมด (สินค้า สเปค โมเดล บัญชีแอดมิน)
  - โฟลเดอร์ `uploads/` — รูปสินค้า แบนเนอร์ หมวดหมู่

### 1. ดาวน์โหลดโค้ด

```bash
git clone https://github.com/zprxte/DTCShops.git
cd DTCShops
```

### 2. สร้างไฟล์ตั้งค่า

```bash
cp database/.env.example database/.env
cp backend/.env.example  backend/.env
cp frontend/.env.example frontend/.env
```

แก้ `database/.env` เป็นค่านี้ (ต้องตรงกับที่ `docker-compose.yml` ใช้):

```
POSTGRES_DB=product_compare
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres123
```

แก้ `JWT_SECRET` ใน `backend/.env` เป็นค่าสุ่ม สร้างได้ด้วย:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`frontend/.env` ใช้ค่าตามตัวอย่างได้เลย

### 3. วางไฟล์ข้อมูล

- `product_compare.dump` → `database/product_compare.dump`
- โฟลเดอร์รูป → `database/uploads/`

### 4. เปิดระบบ

```bash
cd database
docker compose up -d --build
```

ครั้งแรกใช้เวลาสักครู่ (ดาวน์โหลด image และติดตั้ง package) — ได้ 3 คอนเทนเนอร์: `product_compare_db` (:5432), `product_compare_api` (:4000), `product_compare_web` (:5173)

### 5. นำข้อมูลเข้าฐานข้อมูล

รันในโฟลเดอร์ `database/` หลังขั้นที่ 4:

```bash
docker exec -i product_compare_db pg_restore -U postgres -d product_compare --clean --if-exists --no-owner < product_compare.dump
docker restart product_compare_api
```

ข้ามขั้นนี้ = ระบบเปิดได้แต่ไม่มีสินค้า และล็อกอินหลังบ้านไม่ได้

### 6. เปิดใช้งาน

| | ที่อยู่ |
|---|---|
| หน้าร้าน | http://localhost:5173 |
| หลังบ้าน | http://localhost:5173/admin/login (บัญชีมากับไฟล์ dump) |
| API | http://localhost:4000/api |

เปิดจากมือถือในวง Wi-Fi เดียวกับคอม: `http://<IP ของคอม>:5173` (ดู IP ด้วย `ipconfig`)

### คำสั่งที่ใช้บ่อย

รันในโฟลเดอร์ `database/`

```bash
docker compose ps                        # ดูสถานะ
docker compose logs -f backend           # ดู log ของ API
docker compose down                      # ปิดระบบ (ข้อมูลยังอยู่)
docker compose up -d --build -V backend  # หลังแก้ schema.prisma หรือเพิ่ม package ของ backend
```

### ติดตั้งบนเซิร์ฟเวอร์จริง

ใช้ชุด production ที่เสิร์ฟหน้าเว็บด้วย nginx และส่ง `/api` ต่อให้ backend:

```bash
cd database
docker compose -f docker-compose.prod.yml up -d --build
```

ต้องตั้ง `NODE_ENV=production` และ `TRUST_PROXY=1` ใน `backend/.env` ด้วย · ถ้าจะรันบอท LINE ไปพร้อมกันเพิ่ม `--profile line` (ดู [line/README.md](line/README.md))
