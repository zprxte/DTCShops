# คู่มือติดตั้งและรันระบบ

> อยากได้ภาพรวมทั้งระบบก่อน อ่าน [overview.md](./overview.md)

## สิ่งที่ต้องมีก่อน (Prerequisites)

- Docker Desktop (แนะนำ — วิธีที่ง่ายที่สุดและเป็นวิธีหลักที่โปรเจกต์นี้ถูกพัฒนา/ทดสอบด้วย)
- หรือถ้าจะรันเองโดยไม่ใช้ Docker: Node.js 20+, PostgreSQL 16+, npm

---

## วิธีที่ 1: รันทั้งระบบด้วย Docker Compose (แนะนำ)

> **⚠️ 2 ก.ย. 2026**: `docker-compose.yml` ย้ายจาก root ไปอยู่ใน [`database/`](../database/docker-compose.yml) แล้ว (ตามคำขอผู้ใช้ ให้ไฟล์เกี่ยวกับ database รวมอยู่ที่เดียวกัน) — รันคำสั่งจากใน `database/` แทน (ไม่ใช่ root อีกต่อไป) `name: product-compare-app` ถูก pin ไว้ในไฟล์แล้วเพื่อให้ container/network ชื่อเดิมเป๊ะไม่ว่าจะรันจากที่ไหน

```bash
cd database
docker-compose up
```

คำสั่งนี้จะสตาร์ท 3 container ตามที่กำหนดใน [`database/docker-compose.yml`](../database/docker-compose.yml):

| Service | Image/Build | Port (host) | หมายเหตุ |
|---|---|---|---|
| `db` | `postgres:16-alpine` | `5432` | รอจน healthcheck (`pg_isready`) ผ่านก่อน backend ถึงจะเริ่ม |
| `backend` | build จาก `./backend/Dockerfile` | `4000` | bind-mount `./backend` → `/app` (แก้โค้ดแล้ว nodemon reload อัตโนมัติ) · `database/` → `/database` (อ่านอย่างเดียว) · `database/uploads` → `/database/uploads` (เขียนได้) — **ห้าม mount อะไรไว้ใต้ `/app/...`** เพราะ Docker จะสร้างโฟลเดอร์ว่างใน `backend/` บนเครื่องจริง (เคยเกิดกับ `backend/database` แก้ 15 ก.ย. 2026) |
| `frontend` | build จาก `./frontend/Dockerfile` | `5173` | bind-mount `./frontend` เข้า container — Vite dev server hot-reload |

เข้าใช้งานได้ที่:
- เว็บฝั่งผู้ใช้: **http://localhost:5173**
- Admin panel: **http://localhost:5173/admin/login**
- Backend API: **http://localhost:4000/api**
- Health check: **http://localhost:4000/health**

> แก้ `backend/.env` หรือ `environment` ใน compose แล้วต้องใช้ `docker compose up -d <service>` — `docker compose restart` **ไม่อ่านค่าใหม่**

### เปิดจากมือถือ / เครื่องอื่นในวง Wi-Fi เดียวกัน

**ไม่ต้องแก้ไฟล์ config แล้ว** (16 ก.ย. 2026) — Vite dev server proxy `/api` และ `/uploads` ไปที่ backend ให้ (ดู `frontend/vite.config.ts`) หน้าเว็บจึงเรียก API ที่ origin เดียวกับที่เปิดเสมอ ไม่ว่าจะเป็น `localhost` หรือ IP ไหน และไม่มี CORS เข้ามาเกี่ยว

1. หา IP ของคอม (PowerShell): `Get-NetIPAddress -AddressFamily IPv4` → ใช้แถวของ `Wi-Fi` เช่น `192.168.24.48`
2. **ไม่ต้องเปิด Windows Firewall เอง** — Docker Desktop สร้าง rule inbound allow **TCP ทุกพอร์ต** ให้ `com.docker.backend.exe` ไว้แล้วทั้งโปรไฟล์ Public และ Private ซึ่งเป็น process ที่ฟังพอร์ต 5173/4000 จริง ตรวจได้ด้วย:
   ```powershell
   Get-NetFirewallRule -Direction Inbound -Enabled True | Where-Object DisplayName -match 'docker' |
     ForEach-Object { $_ | Get-NetFirewallPortFilter } | Select-Object Protocol,LocalPort
   ```
3. มือถือเปิด `http://<IP>:5173`

ข้อควรรู้: มือถือต้องอยู่วง Wi-Fi เดียวกับคอม (เน็ตมือถือ 4G/5G เข้าไม่ได้) · IP ของคอมมาจาก DHCP จึงเปลี่ยนเองได้แม้ไม่ได้ย้ายวง (Wi-Fi บริษัทจ่ายสัญญาครั้งละ 8 ชม.) — ฝั่งเว็บไม่ต้องแก้อะไร แค่เปิด IP ใหม่ · ถ้าเปิดไม่ขึ้นทั้งที่ยิงจากคอมเองได้ ให้สงสัย **client isolation ของ Wi-Fi** (เราเตอร์กันไม่ให้เครื่องในวงคุยกัน) ซึ่งแก้ที่คอมไม่ได้ ต้องเปิดฮอตสปอตจากมือถือแล้วให้คอมต่อเข้าไปแทน · แผนที่สาขา (Leaflet) ต้องต่ออินเทอร์เน็ต · proxy นี้เป็นของ dev server เท่านั้น ตอน deploy จริงต้องให้ reverse proxy (nginx/Caddy) ทำ `/api` + `/uploads` แทน

### การสร้างตารางในฐานข้อมูลตอน volume ใหม่

`database/docker-compose.yml` ตั้งให้ container `db` รันไฟล์ [`./schema.sql`](../database/schema.sql) (สัมพัทธ์กับตำแหน่งไฟล์ compose เอง ตอนนี้อยู่ใน `database/` แล้ว) เป็น init script ตอนสร้าง Postgres volume ครั้งแรก — ไฟล์นี้สร้างตาราง/index/trigger ให้ครบอัตโนมัติ **เฉพาะตอนสร้าง volume ใหม่เอี่ยมเท่านั้น** (ครั้งแรก หรือหลัง `docker-compose down -v`) Postgres จะไม่รันไฟล์นี้ซ้ำถ้า volume มีข้อมูลอยู่แล้ว — ครอบคลุมแค่ 7 ตารางที่แอปใช้งานจริง (`Admin`/`tbl_item`/`tbl_item_type`/`tbl_item_model`/`tbl_attribute`/`tbl_attribute_value`/`tbl_footer`) ไม่ใช่ทั้ง 20 ตารางที่มีอยู่ใน DB ตอนนี้ — อีก 13 ตารางที่เหลือ (พร้อมข้อมูลจริงจาก dtcshops.com รวมถึง `tbl_users`/`tbl_order`/`tbl_refunds`) ต้อง restore เพิ่มด้วยมือผ่าน [`restore-full-dump.sh`](../database/restore-full-dump.sh) — ดู [database.md](./database.md) สำหรับรายละเอียด/คำเตือนเรื่องข้อมูลอ่อนไหว

> **แก้ไขแล้ว (17 ส.ค. 2026)**: ไฟล์นี้เคยหายไปจากโปรเจกต์ (โฟลเดอร์ `database/` ว่างเปล่า) ทำให้วิธีนี้ใช้ไม่ได้มาก่อนหน้านี้ — ตอนนี้ export กลับมาจากฐานข้อมูล live แล้วและ verify แล้วว่าตรงกับ schema จริง 100% (ดู [database.md](./database.md))

ถ้าแก้ `database/schema.prisma` (ย้ายมาจาก `backend/prisma/schema.prisma` เมื่อ 2 ก.ย. 2026 — ดู [database.md](./database.md)) แล้วอยากอัปเดตฐานข้อมูลที่มีอยู่แล้วให้ตรงตาม (ไม่ใช่สร้างใหม่) ให้ใช้ Prisma แทน — และอย่าลืมสะท้อนการเปลี่ยนแปลงกลับไปที่ `database/schema.sql` ด้วยมือ เพราะสองไฟล์นี้ไม่ได้ sync กันอัตโนมัติ (ดูหมายเหตุใน [database.md](./database.md)):

```bash
cd database
docker-compose exec backend npx prisma db push
```

หรือถ้ารันแบบไม่ใช้ Docker ก็รันคำสั่งเดียวกันในโฟลเดอร์ `backend/` (ดูวิธีที่ 2 ด้านล่าง)

จากนั้นต้องสร้างบัญชี admin เองด้วย (ตาราง `Admin` ว่างเปล่าตอนสร้างใหม่ ไม่มี seed data) — ดูหัวข้อ "สร้างบัญชี Admin" ด้านล่าง

---

## วิธีที่ 2: รันเองในเครื่องโดยไม่ใช้ Docker

### 1) เตรียมฐานข้อมูล

ต้องมี PostgreSQL รันอยู่ก่อน แล้วสร้างตาราง/index/trigger ทั้งหมดจาก [`database/schema.sql`](../database/schema.sql) โดยตรง (fuzzy search ทำฝั่ง Node ด้วย `fuse.js` ทั้งหมด — ไม่ต้องมี Postgres extension เพิ่มเติมแล้ว, ดู [backend.md](./backend.md#fuzzy-search)):

```bash
createdb product_compare
psql -d product_compare -f database/schema.sql
```

### 2) Backend

```bash
cd backend
cp .env.example .env      # แก้ DATABASE_URL ให้ตรงกับฐานข้อมูลจริงถ้าจำเป็น
npm install
npx prisma generate       # ⚠️ ตอนนี้พัง (project root อนุมานเป็นโฟลเดอร์แม่ของ backend/ ที่ไม่มี package.json) — ดู CLAUDE.md หัวข้อ 3.4
npm run dev                # รัน backend ที่ http://localhost:4000 ด้วย nodemon
```

> ไม่ต้องรัน `npx prisma db push` ถ้าใช้ `database/schema.sql` สร้างตารางไปแล้วในขั้นตอนที่ 1 — `db push` มีไว้สำหรับตอนแก้ `schema.prisma` แล้วอยากอัปเดตฐานข้อมูล**ที่มีอยู่แล้ว** ให้ตรงตาม ไม่ใช่ขั้นตอนสร้างฐานข้อมูลใหม่ (และสร้าง trigger ของ `search_vector` ให้ไม่ได้ ต้องมาจาก `schema.sql` เท่านั้น — ดู [database.md](./database.md))

### 3) Frontend

```bash
cd frontend
cp .env.example .env      # VITE_PROXY_TARGET — แก้เฉพาะเมื่อ backend ไม่ได้อยู่ที่ localhost:4000
npm install
npm run dev                # รัน frontend ที่ http://localhost:5173 ด้วย Vite
```

---

## ตัวแปร Environment

### `backend/.env`

| ตัวแปร | ค่าเริ่มต้น (`.env.example`) | ใช้ที่ไหน |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres123@localhost:5432/product_compare` | Prisma connection string |
| `JWT_SECRET` | `your_super_secret_jwt_key_change_this_in_production` | เซ็น/ตรวจ JWT token ของ admin — **ต้องเปลี่ยนก่อนขึ้น production จริง** |
| `JWT_EXPIRES` | `2h` | อายุ token (ไม่มีระบบ refresh token — หมดอายุแล้วต้องล็อกอินใหม่) · ไม่ตั้ง = `2h` (มีค่าสำรองในโค้ดตั้งแต่ 28 ก.ย. 2026) · `JWT_SECRET` / `DATABASE_URL` ขาดแล้ว backend ไม่ยอมเปิด |
| `PORT` | `4000` | พอร์ตที่ Express ฟัง |
| `FRONTEND_URL` | `http://localhost:5173` | ใช้ตั้งค่า CORS origin ที่อนุญาต |

### `frontend/.env`

| ตัวแปร | ค่าเริ่มต้น | ใช้ที่ไหน |
|---|---|---|
| `VITE_PROXY_TARGET` | `http://localhost:4000` | ปลายทางที่ Vite dev server ส่ง `/api` และ `/uploads` ต่อไป · `vite.config.ts` อ่านผ่าน `loadEnv()` (ไม่ใช่ `process.env` ตรงๆ ซึ่งไม่อ่านไฟล์ `.env` ให้) · **ต้องมีไฟล์นี้เมื่อรัน Vite นอก Docker** โค้ดไม่มีค่าสำรอง · รันใน Docker compose ตั้ง `http://backend:4000` ทับให้ · ไม่มี `VITE_API_URL` แล้ว — `services/api.ts` ใช้ `baseURL: '/api'` แบบ relative |

### `database/.env`

| ตัวแปร | ค่าเริ่มต้น (`.env.example`) | ใช้ที่ไหน |
|---|---|---|
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | `product_compare` / `postgres` / — | image `postgres:16-alpine` อ่านผ่าน `env_file` ของ service `db` · **อ่านเฉพาะตอนสร้าง volume ครั้งแรก** · เปลี่ยนแล้วต้องแก้ `DATABASE_URL` ใน `docker-compose.yml` และ `backend/.env` ให้ตรงกันเอง |

---

## สร้างบัญชี Admin

ไม่มีหน้า "สมัครสมาชิก" ในระบบ (ตามที่ตั้งใจไว้ — ดู [architecture.md](./architecture.md)) ต้อง insert แถวลงตาราง `Admin` เอง โดย `password_hash` ต้องเป็นค่า bcrypt hash ไม่ใช่ plain text

1. สร้าง hash จาก password ที่ต้องการ:

   ```bash
   cd backend
   node -e "const bcrypt = require('bcrypt'); bcrypt.hash('your_password', 10).then(console.log)"
   ```

2. Insert เข้าฐานข้อมูล (ผ่าน `psql`, Prisma Studio, หรือ GUI ใดก็ได้):

   ```sql
   INSERT INTO "Admin" (username, password_hash) VALUES ('admin', '<hash ที่ได้จากขั้นตอนที่ 1>');
   ```

   หรือเปิด Prisma Studio แล้วเพิ่มแถวผ่าน UI:

   ```bash
   cd backend
   npx prisma studio
   ```

3. ล็อกอินที่ **http://localhost:5173/admin/login** ด้วย username/password ที่ตั้งไว้

> `README.md` เดิมของโปรเจกต์อ้างถึง credential ตัวอย่าง `admin` / `admin1234` — ใช้ได้เฉพาะถ้ามีการ seed ค่านี้ไว้ในฐานข้อมูลจริงเท่านั้น (ไม่มี seed script อัตโนมัติในโปรเจกต์ ณ ตอนนี้ ต้องสร้างเองตามขั้นตอนข้างต้น)

---

## คำสั่งที่ใช้บ่อย

```bash
# ดูโครงสร้างตารางปัจจุบันผ่าน UI
cd backend && npx prisma studio

# แก้ schema.prisma แล้วอยากอัปเดตฐานข้อมูลตาม (dev เท่านั้น ไม่มี migration history)
cd backend && npx prisma db push && npx prisma generate

# Build frontend สำหรับ production (รวม type-check ด้วย vue-tsc)
cd frontend && npm run build

# Type-check frontend อย่างเดียว ไม่ build
cd frontend && npx vue-tsc --noEmit
```

## เทสต์

โปรเจกต์ไม่มีไฟล์เทสต์อัตโนมัติแล้ว (ลบ `backend/test/`, `mobile/test/`, `e2e/` ออก 29 ก.ย. 2026 ตามคำขอผู้ใช้) — ตรวจหลังแก้โค้ดด้วย `npx vue-tsc --noEmit` / `node --check` และทดสอบการใช้งานจริงตาม test case UAT ใน `CLAUDE.md` หัวข้อ 6

Deploy ขึ้นเซิร์ฟเวอร์ → [deployment.md](./deployment.md) · รวมกับเว็บจริง → [merge-guide.md](./merge-guide.md)

## ปัญหาที่เจอบ่อย

- **Prisma/bcrypt error บน Alpine Linux**: โปรเจกต์นี้ใช้ `node:20-bookworm-slim` (Debian) สำหรับ backend Dockerfile แล้ว ไม่ใช่ Alpine เพราะ Prisma query engine กับ bcrypt ต้องพึ่ง native binary ที่ Alpine's musl libc มีปัญหา
- **แก้โค้ด backend แล้วไม่ auto-reload บน Docker Desktop + Windows**: `backend/nodemon.json` ตั้ง `legacyWatch: true` (polling) ไว้แล้วเพื่อแก้ปัญหานี้ ถ้ายังไม่ reload ให้เช็คว่า bind mount ทำงานถูกต้อง
- **หน้าเว็บไม่มีสไตล์เลย (Tailwind ไม่ทำงาน)**: เช็ค `frontend/tailwind.config.js` ว่า `content` glob ครอบคลุมไฟล์ `.vue` (`./src/**/*.{js,ts,vue}`)
- **รูปสินค้าที่อัปโหลดไม่ขึ้น**: รูปที่อัปโหลดผ่าน admin เก็บเป็นไฟล์จริงที่ `database/uploads/products/<YYYY-MM>/` ของโปรเจกต์ (ในคอนเทนเนอร์คือ `/database/uploads` bind-mount ไว้ ไม่หายตอน restart) — โค้ดชี้ path เดียวกันทั้งรันใน Docker และรันเอง ถ้ารันแบบไม่ใช้ Docker ต้องแน่ใจว่าโฟลเดอร์นี้เขียนได้ (ดู [backend.md](./backend.md#static-uploads))
- **มือถือเปิดหน้าเว็บได้แต่ไม่มีสินค้า**: ตั้งแต่ 16 ก.ย. 2026 ไม่ควรเกิดแล้ว (เรียก API ผ่าน proxy ที่ origin เดียวกัน) ถ้ายังเจอ ให้ดูว่า container `backend` รันอยู่จริงและ `VITE_PROXY_TARGET` ชี้ถูก — ดูหัวข้อ "เปิดจากมือถือ" ด้านบน
