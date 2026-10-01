# ระบบค้นหาและเปรียบเทียบสินค้า (Product Search & Comparison System)

โครงงานสหกิจศึกษา — บริษัท ดี.ที.ซี. เอ็นเตอร์ไพรส์ จำกัด (มหาชน)

ช่วยทีม Sale และลูกค้าหาสินค้าได้แม้พิมพ์ชื่อผิดหรือลืมสลับแป้นพิมพ์ แล้วเทียบสเปคได้สูงสุด 4 รายการในตารางเดียว พร้อมหลังบ้านให้แอดมินดูแลข้อมูลสินค้า สเปค และโมเดล

**สถานะ (1 ต.ค. 2026):** ทำครบตามขอบเขตแล้ว · UAT ผ่านทุกกรณี (33 กรณี) · ขั้นต่อไปคือรวมเข้ากับเว็บ dtcshops.com → [docs/merge-guide.md](docs/merge-guide.md)

---

## ทำอะไรได้บ้าง

**หน้าร้าน (ไทย / อังกฤษ / ญี่ปุ่น)**
- ค้นหาจากชื่อ หมวดหมู่ แท็ก และค่าสเปค — ทนคำพิมพ์ผิด (`hikvison` → Hikvision), ลืมสลับแป้น (`เยห` → `gps`), ติด Caps Lock บนแป้นไทย, แนะนำ "คุณหมายถึง…?" เมื่อค้นไม่เจอ
- Autocomplete ตั้งแต่พิมพ์ 2 ตัวอักษร
- รายการสินค้าพร้อมตัวกรองหมวดหมู่/แท็ก เรียงลำดับ แบ่งหน้า
- หน้ารายละเอียดสินค้า: แกลเลอรี เลือกโมเดล (ราคาและสเปคเปลี่ยนตามโมเดล) ตัวเลือกเสริม ปุ่มสั่งซื้อ Shopee / Lazada / TikTok / LINE
- ตารางเปรียบเทียบ 2–4 ช่อง เทียบสินค้าเดียวกันคนละโมเดลได้ คัดกรองตามฟีเจอร์ที่ต้องการแล้วจัดอันดับให้ แชร์ลิงก์ได้

**หลังบ้าน**
- แดชบอร์ดยอดเข้าชม · จัดการสินค้า (ลบ/กู้คืนได้) · หมวดหมู่ · คุณสมบัติ (สเปค) · โมเดล · ตัวเลือกสินค้า · แบนเนอร์ · สาขา · Footer
- นำเข้าสินค้า + สเปคจาก Excel พร้อมพรีวิวก่อนบันทึก

**แอป Android** (Flutter) — หน้าแรก / สินค้าทั้งหมด / ค้นหา / รายละเอียด / เปรียบเทียบ ใช้ API ชุดเดียวกับเว็บ → [mobile/README.md](mobile/README.md)

---

## เทคโนโลยี

| ส่วน | ใช้ |
|---|---|
| Frontend | Vue 3 + TypeScript + Vite, Pinia, Vue Router, Tailwind CSS |
| Backend | Node.js 20 + Express 4 + Prisma 5, ค้นหาด้วย fuse.js + กฎของระบบเอง |
| Database | PostgreSQL 16 — ใช้โครงสร้างตารางเดียวกับ dtcshops.com (`tbl_item`, `tbl_item_type`, `tbl_item_model` ฯลฯ) เพิ่มเฉพาะ `tbl_attribute` / `tbl_attribute_value` สำหรับสเปค |
| Mobile | Flutter (Android) |
| Security | JWT + bcrypt, helmet, rate limit, sanitize input |
| รันระบบ | Docker Compose |

---

## โครงสร้างโฟลเดอร์

```
backend/     Express API (routes/, middleware/, utils/)
frontend/    เว็บ Vue 3 ทั้งหน้าร้านและหลังบ้าน
mobile/      แอป Flutter
database/    schema.sql + schema.prisma + docker-compose + สคริปต์รวมระบบ (merge/)
docs/        เอกสารระบบทั้งหมด
CHANGELOG.md ประวัติการเปลี่ยนแปลง
```

---

## รันในเครื่อง

ต้องมี Docker Desktop

```bash
cp backend/.env.example backend/.env      # แก้ JWT_SECRET
cp frontend/.env.example frontend/.env
cd database
docker compose up -d
```

- หน้าร้าน: http://localhost:5173
- หลังบ้าน: http://localhost:5173/admin/login
- API: http://localhost:4000/api

> **ข้อมูลสินค้าไม่ได้อยู่ใน repo** — ข้อมูลเป็นของจริงของบริษัท จึงไม่ได้ขึ้น Git · clone แล้วรันจะได้ตารางเปล่า ขอ 2 อย่างจากผู้พัฒนา:
> - `database/product_compare.dump` — สำเนาฐานข้อมูลทั้งหมด (สินค้า สเปค โมเดล บัญชีแอดมิน)
> - `database/uploads/` — รูปสินค้า แบนเนอร์ หมวดหมู่ (คัดลอกทั้งโฟลเดอร์มาวางที่เดิม)
>
> วางไฟล์แล้ว restore (รันหลัง `docker compose up -d`):
> ```bash
> docker exec -i product_compare_db pg_restore -U postgres -d product_compare --clean --if-exists --no-owner < database/product_compare.dump
> docker restart product_compare_api
> ```

รายละเอียดการติดตั้ง ตัวแปร environment และการรันแบบไม่ใช้ Docker → [docs/setup.md](docs/setup.md)

---

## เอกสาร

| ไฟล์ | เนื้อหา |
|---|---|
| [docs/overview.md](docs/overview.md) | ภาพรวมทั้งระบบ |
| [docs/merge-guide.md](docs/merge-guide.md) | **คู่มือรวมเข้ากับเว็บจริง** — ความต่างของ DB, สคริปต์ที่ต้องรัน, คำถามที่ต้องตอบก่อนย้าย |
| [docs/deployment.md](docs/deployment.md) | deploy ด้วย compose ชุด production |
| [docs/backend.md](docs/backend.md) | API ทุก endpoint และกลไกค้นหา |
| [docs/frontend.md](docs/frontend.md) | หน้าเว็บและ component |
| [docs/database.md](docs/database.md) | ตารางและความสัมพันธ์ |
