# โครงสร้างระบบ (Architecture)

> อยากได้ภาพรวมทั้งระบบก่อน (ระบบทำอะไร ทำไมออกแบบแบบนี้) อ่าน [overview.md](./overview.md) — ไฟล์นี้เจาะเฉพาะโครงสร้างโค้ดและการไหลของข้อมูล

## Tech Stack

| Layer | เทคโนโลยี |
|---|---|
| Frontend | Vue 3 (`<script setup>` + TypeScript), Vite, Vue Router 4, Pinia, Tailwind CSS, `lucide-vue-next` (ไอคอน), `axios`, `leaflet` + `@types/leaflet` (แผนที่สาขา DTC Shop, ผ่าน OpenStreetMap tiles — เพิ่ม 4 ก.ย. 2026) |
| Backend | Node.js, Express 4, `fuse.js` (fuzzy matching ฝั่ง Node สำหรับทุกขั้นตอนที่ไม่ใช่ full-text — fallback หลัก/tag match/category match/suggestions) |
| ORM | Prisma 5 (`@prisma/client`) |
| Database | PostgreSQL 16 (ไม่ใช้ full-text search / `pg_trgm` ของ Postgres — **การค้นหาทั้งหมดทำด้วย fuse.js ฝั่ง Node**, ถอด `pg_trgm` ออก 27 ส.ค. 2026; **schema สลับเป็นสำเนาตารางจริงของ dtcshops.com ทั้งหมดเมื่อ 1-2 ก.ย. 2026** — `tbl_item`/`tbl_item_type`/`tbl_item_model`/`tbl_attribute`/`tbl_attribute_value`, ดู `docs/database.md`) |
| Auth | JSON Web Token (`jsonwebtoken`) + `bcrypt` สำหรับ hash password |
| Security middleware | `helmet`, `cors`, `express-rate-limit` |
| Container | Docker + Docker Compose (3 service: db / backend / frontend) |

Frontend เดิมเป็น React ก่อนถูกเขียนใหม่ทั้งหมดเป็น Vue 3 เมื่อ 17 ส.ค. 2026 (ดู changelog ใน `CLAUDE.md`) — เอกสารชุดนี้อ้างอิงจากโค้ด Vue เวอร์ชันปัจจุบันเท่านั้น

## โครงสร้างโฟลเดอร์ทั้งโปรเจกต์

```
product-compare-app/
├── frontend/               Vue 3 SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/     ConfirmDialog, FlagIcon, ToastContainer, Breadcrumb
│   │   │   ├── search/     SearchAutocomplete
│   │   │   ├── product/    ProductCard, ProductAvatar
│   │   │   └── layouts/    PublicLayout, AdminLayout
│   │   ├── pages/
│   │   │   ├── public/     HomePage, ProductsPage, ProductDetailPage, ComparePage
│   │   │   └── admin/      19 หน้า — Login, Dashboard, Products(+Edit),
│   │   │                   Categories, Attributes, Models, ItemOptions,
│   │   │                   NewProducts, Banners, Articles, Shops, Ads,
│   │   │                   Seo, Footer (หน้า list + หน้า form แยกบางตัว)
│   │   ├── stores/         Pinia: auth.ts, compare.ts, toast.ts
│   │   ├── router/         index.ts — route table + auth guard
│   │   ├── language/       useLanguage.ts (composable) + translations.ts (TH/EN/JA)
│   │   ├── services/       api.ts — axios instance + endpoint helper functions
│   │   ├── types/          product.ts — shared TS interfaces
│   │   └── utils/          highlight.ts — search-keyword highlighting
│   ├── Dockerfile
│   └── package.json
│
├── backend/                Express API
│   ├── src/
│   │   ├── index.js        entrypoint — middleware, route mounting, error handler
│   │   ├── routes/         auth.js, search.js, products.js, categories.js,
│   │   │                   compare.js, footer.js, banners.js, shops.js,
│   │   │                   logs.js, admin.js, adminImport.js (นำเข้า Excel — mount ใต้ admin.js)
│   │   ├── middleware/     auth.js — JWT verification middleware
│   │   └── utils/          asyncHandler.js, stripHtml.js, activityLog.js, tokenBlacklist.js,
│   │                       sanitize.js, cache.js, productShape.js (รูปการ์ดสินค้าที่ /products กับ /search ใช้ร่วมกัน),
│   │                       importPlan.js (ตรวจไฟล์นำเข้า Excel ไม่แตะ DB), remoteImage.js (ดาวน์โหลดรูปจากลิงก์ กัน SSRF)
│   ├── Dockerfile
│   └── package.json
│
├── database/                ทุกอย่างที่เกี่ยวกับฐานข้อมูลรวมไว้ที่นี่
│   ├── schema.prisma        นิยามตารางทั้งหมด (ดู database.md) — source of truth ปัจจุบัน
│   ├── schema.sql           DDL เต็ม (ใช้ตอน init container ครั้งแรก)
│   ├── docker-compose.yml   orchestrate ทั้ง 3 service (รันคำสั่งจากในโฟลเดอร์นี้)
│   ├── .env                 credentials ของ service db
│   └── uploads/products/    ไฟล์รูปสินค้า (bind-mount, DB เก็บแค่ path)
│
├── docs/                     เอกสารชุดนี้
├── README.md
└── CLAUDE.md                 project memory: scope, sprint plan, changelog
```

## ภาพรวมการไหลของข้อมูล (Request Flow)

```
Browser (Vue SPA, :5173)
   │  axios (services/api.ts) — แนบ "Authorization: Bearer <JWT>" อัตโนมัติถ้ามี token ใน localStorage
   ▼
Express API (:4000/api/*)
   │  helmet + cors + rate-limit → route handler (routes/*.js)
   │  ถ้าเป็น /api/admin/* → ผ่าน authMiddleware (ตรวจ JWT) ก่อนเสมอ
   ▼
Prisma Client → PostgreSQL (:5432)
```

- **Public API** (`/api/search`, `/api/products`, `/api/categories`, `/api/compare`, `/api/footer`, `/api/banners`, `/api/shops`, `/api/logs`) — ไม่ต้อง login
- **Admin API** (`/api/admin/*`) — ทุก endpoint ผ่าน `authMiddleware` (`backend/src/routes/admin.js` บรรทัด `router.use(authMiddleware)`) ยกเว้น `/api/auth/login` ที่อยู่คนละ router
- **รูปภาพสินค้า** ไม่ได้เก็บเป็น binary ในฐานข้อมูล — อัปโหลดผ่าน `POST /api/admin/upload/image` แล้วเก็บไฟล์จริงไว้ที่ `database/uploads/products/` (ย้ายมาจาก `backend/uploads/` เมื่อ 3 ก.ย. 2026, URL prefix `/uploads` เหมือนเดิม), DB เก็บแค่ path สัมพัทธ์ไว้ในคอลัมน์ `tbl_item.itm_image_master` (ภาพหลัก) และ `itm_image_sub1`–`sub9` (ภาพรอง) — ดูรายละเอียดใน [backend.md](./backend.md#static-uploads)

## แนวคิดออกแบบที่สำคัญ

- **ไม่มีระบบสมัครสมาชิกฝั่งผู้ใช้** — มีแค่บัญชี Admin เดียวที่ต้อง insert เข้า DB เอง (ดู [setup.md](./setup.md))
- **State ฝั่งลูกค้าที่ไม่ต้อง login** (ตะกร้าเปรียบเทียบสินค้า, ภาษาที่เลือก) เก็บไว้ใน `localStorage` ผ่าน Pinia store — ไม่มี session ฝั่ง server สำหรับผู้ใช้ทั่วไป
- **i18n เฉพาะฝั่ง public** — หน้า Admin ทั้งหมดเป็นภาษาไทยล้วน hardcode ไว้ในโค้ด ไม่ผ่านระบบแปลภาษา (เจตนา ไม่ใช่งานค้าง — ดู [frontend.md](./frontend.md#i18n))
- **ไม่มี migration history อย่างเป็นทางการ** — ใช้ `prisma db push` (schema-first, ไม่สร้างไฟล์ migration) ระหว่างพัฒนา ทำให้ `database/schema.prisma`, ฐานข้อมูลจริง และ `database/schema.sql` มีโอกาส drift กันได้ถ้าไม่ระวัง — ดู [database.md](./database.md)
