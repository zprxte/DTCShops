# การ deploy (production)

ติดตั้งระบบบนเซิร์ฟเวอร์ด้วย Docker Compose ชุด production — ตรวจแล้วว่ารันขึ้นและใช้งานได้ (28 ก.ย. 2026)
ถ้าจะรวมกับเว็บจริงของ DTC อ่าน [merge-guide.md](./merge-guide.md) ก่อน

## ต่างจากตอนพัฒนา (`docker-compose.yml`) อย่างไร

| | dev (`docker-compose.yml`) | production (`docker-compose.prod.yml`) |
|---|---|---|
| หน้าเว็บ | Vite dev server :5173 (HMR) | build เป็นไฟล์ static เสิร์ฟด้วย nginx :80 (`frontend/Dockerfile.prod`, `frontend/nginx.conf`) |
| `/api`, `/uploads` | Vite proxy ส่งต่อให้ backend | nginx ส่งต่อให้ backend |
| backend | `nodemon` + mount โค้ดจากเครื่อง | `npm start` (node) ใช้โค้ดใน image |
| DB พอร์ต 5432 | เปิดออกนอกเครื่อง | ไม่เปิด |
| รีสตาร์ทเอง | ไม่ | `restart: unless-stopped` |
| `DATABASE_URL` | เขียนตายตัวใน compose | ประกอบจาก `database/.env` (รหัสผ่านอยู่ที่เดียว) |

## ขั้นตอน

### 1. เตรียมไฟล์ค่าลับ (ไม่อยู่ใน repo)

```bash
cp database/.env.example database/.env    # POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD
cp backend/.env.example  backend/.env
```

`backend/.env` ที่ต้องแก้:

| ตัวแปร | ค่า |
|---|---|
| `JWT_SECRET` | สุ่มใหม่: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — ไม่ตั้ง = backend ไม่ยอมเปิด |
| `JWT_EXPIRES` | อายุ token แอดมิน (ไม่ตั้ง = `2h`) |
| `FRONTEND_URL` | origin ของหน้าเว็บ เช่น `https://compare.dtc.co.th` |
| `DATABASE_URL` | ไม่ต้องตั้ง — compose ประกอบให้จาก `database/.env` |

`NODE_ENV=production` และ `TRUST_PROXY=1` ตั้งไว้ใน compose แล้ว

> รหัสผ่าน DB ที่มีอักษร `@ : / #` ต้อง URL-encode ก่อนใส่ `database/.env` เพราะถูกนำไปต่อเป็น URL

### 2. ข้อมูล

- **DB ใหม่เปล่า**: เปิดครั้งแรก Postgres จะรัน `database/schema.sql` ให้เอง (โครงสร้าง + ข้อมูล footer)
- **ย้ายจากเครื่องเดิม**: `pg_dump` จากเครื่องเดิม แล้ว `pg_restore` เข้า container `db` ของชุด production
- **รูปสินค้า**: คัดลอกโฟลเดอร์ `database/uploads/` จากเครื่องเดิมมาวางที่เดียวกัน (ไม่อยู่ใน repo)
- **บัญชีแอดมิน**: อยู่ในตาราง `tbl_users` (รหัสผ่านเป็น bcrypt) — ย้ายมาพร้อม DB

### 3. รัน

```bash
cd database
docker compose -f docker-compose.prod.yml up -d --build
```

ตรวจ:

```bash
curl -s http://<เครื่อง>/api/products?limit=1     # ได้ JSON
curl -s -o /dev/null -w '%{http_code}' http://<เครื่อง>/admin/products   # 200 (nginx ส่ง index.html ให้ Vue Router)
docker compose -f docker-compose.prod.yml logs -f backend
```

ช่วงสิบกว่าวินาทีแรกหลัง `up` อาจได้ 502 จาก nginx เพราะ backend ยังเปิดไม่เสร็จ — รอแล้วลองใหม่

### 4. HTTPS

nginx ใน image ฟังแค่พอร์ต 80 — ให้ reverse proxy หน้าเครื่อง (nginx/Caddy/load balancer ของบริษัท) ทำ HTTPS แล้วส่งต่อมาที่พอร์ต 80
ถ้ามี proxy ซ้อนสองชั้น ให้ตั้ง `TRUST_PROXY=2` ใน compose (จำนวน proxy หน้า backend)

## อัปเดตเวอร์ชัน

```bash
cd database
docker compose -f docker-compose.prod.yml up -d --build
```

แก้โครงสร้างตาราง: ระบบไม่มี migration อัตโนมัติ — เขียน SQL แบบรันซ้ำได้ (ดูตัวอย่าง `database/merge/`) แล้วรันด้วย `psql` ก่อน build

## สำรองข้อมูล

```bash
# DB
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U <POSTGRES_USER> -Fc <POSTGRES_DB> > backup-$(date +%F).dump
# รูป
tar czf uploads-$(date +%F).tgz database/uploads
```

กู้คืน: `docker compose -f docker-compose.prod.yml exec -T db pg_restore -U <user> -d <db> --clean < backup.dump`

> ข้อมูลเป็นสำเนาของระบบจริง — เก็บไฟล์สำรองในที่ที่บริษัทอนุญาตเท่านั้น ห้ามอัปขึ้นที่สาธารณะ

## ข้อควรรู้

- rate limit: `/api` 300 ครั้ง / 15 นาที / IP · `/api/auth` 10 ครั้ง / 15 นาที — ต้องตั้ง `TRUST_PROXY` ให้ถูก ไม่งั้นผู้ใช้ทั้งหมดถูกนับเป็น IP ของ proxy
- บัญชีดำ token ตอนออกจากระบบอยู่ในหน่วยความจำ รีสตาร์ท backend แล้วหาย และรันหลาย instance ไม่ได้
- production ไม่ส่งข้อความ error ภายในไปกับ response 500 (ดู log ของ backend แทน)
