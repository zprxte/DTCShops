# Backend (`backend/src/`)

> อยากได้ภาพรวมทั้งระบบก่อน อ่าน [overview.md](./overview.md)

Express app, entrypoint คือ [`src/index.js`](../backend/src/index.js)

## Middleware stack (เรียงตามลำดับจริงใน `index.js`)

1. `helmet()` — security headers
2. `cors({ origin: FRONTEND_URL, credentials: true })`
3. `express.json()` / `express.urlencoded()`
4. `morgan('dev')` — log request ทุกตัวลง console
5. `/uploads` — `express.static` เสิร์ฟไฟล์ต้นฉบับ (ไม่ย่อขนาด) พร้อม override header `Cross-Origin-Resource-Policy: cross-origin` เฉพาะ route นี้
6. Rate limit: `/api/*` จำกัด 300 req / 15 นาที, `/api/auth/*` จำกัดเข้มกว่าที่ 10 req / 15 นาที (กัน brute-force login)
7. Route mounting (ดูตารางด้านล่าง)
8. 404 handler
9. Global error handler (log `err.stack`, ตอบ JSON `{ message }`)

## Route mounting

| Prefix | ไฟล์ | ต้อง Auth? |
|---|---|---|
| `/api/auth` | `routes/auth.js` | ❌ (ยกเว้น `/me` ที่ verify token เอง) |
| `/api/search` | `routes/search.js` | ❌ |
| `/api/products` | `routes/products.js` | ❌ |
| `/api/categories` | `routes/categories.js` | ❌ |
| `/api/compare` | `routes/compare.js` | ❌ |
| `/api/footer` | `routes/footer.js` | ❌ |
| `/api/banners` | `routes/banners.js` | ❌ (เพิ่ม 3 ก.ย. 2026) |
| `/api/shops` | `routes/shops.js` | ❌ (เพิ่ม 4 ก.ย. 2026) |
| `/api/admin` | `routes/admin.js` | ✅ ทุก endpoint (`router.use(authMiddleware)` บรรทัดแรกของไฟล์) |

> **⚠️ 2026-09-01/02**: ทุก route ไฟล์ข้างต้นถูกเขียนใหม่ทั้งหมดให้ query ตารางจริงของ dtcshops.com (`tbl_item`/`tbl_item_type`/`tbl_item_model`/`tbl_attribute`/`tbl_attribute_value`) แทนตาราง `Product`/`Category`/... เดิม — ดู `docs/database.md`. Endpoint Dashboard/Excel Import/Search-View-Compare Logs/Synonyms/Brand-Model CRUD ถูก**ลบออกทั้งหมด**ไปพร้อมกัน (ไม่มีตารางรองรับในโครงสร้างจริง) — `routes/admin.js` ตอนนี้เหลือแค่ upload รูป, Products CRUD, Categories CRUD, Attributes CRUD เท่านั้น

## Middleware: `middleware/auth.js`

อ่าน header `Authorization: Bearer <token>` → `jwt.verify()` ด้วย `JWT_SECRET` → ถ้าผ่าน แนบ payload (`{ admin_id, username }`) ไว้ที่ `req.admin` แล้ว `next()` — ถ้าไม่มี header หรือ token ผิด/หมดอายุ ตอบ `401` ทันที ไม่ไปต่อ

## `utils/asyncHandler.js`

wrapper เล็กๆ ห่อ async route handler เพื่อ forward promise rejection เข้า Express error handler แทนที่จะปล่อยให้ process crash — endpoint ส่วนใหญ่ใน `routes/admin.js` ห่อด้วยตัวนี้ ส่วน route ไฟล์อื่นใช้ `try/catch` ตรงๆ ในแต่ละ handler แทน

## path รูปภาพ

DB เก็บ path รูปเป็น **relative `/uploads/products/<YYYY-MM>/<ไฟล์>`** เสมอ (`tbl_item.itm_image_master`/`itm_image_sub1..9`, `tbl_item_type.thumbnail`, `tbl_footer.image`, `tbl_shop.thumbnail`, `tbl_bnn_slide.bnn_image_master`) — route ต่างๆ จึงส่งค่าจาก DB ออกไปตรงๆ ไม่ต้องแปลงอะไร ไฟล์จริงอยู่ที่ `database/uploads/products/` เสิร์ฟผ่าน `express.static` ที่ `/uploads`

> **8 ก.ย. 2026 — เลิกพึ่งเซิร์ฟเวอร์รูปของเว็บต้นแบบแล้ว** เดิมข้อมูลจริงเก็บ path เป็นของ dtcshops.com (ทั้ง URL เต็มและ path สั้น `"2024-12/xxx.png"`) แล้วมี `utils/dtcImage.js` คอยแปลงเป็น URL ของเขาตอน response — แปลว่าเบราว์เซอร์ผู้ใช้ไปดึงรูปจากเซิร์ฟเวอร์เขาโดยตรง (hotlink) เน็ตหลุดหรือเขาลบไฟล์เมื่อไหร่รูปก็หาย ตอนนี้รูปทั้งหมด (77 ไฟล์ ~22 MB) ถูกโหลดมาเก็บเองและเขียน path ใน DB ใหม่แล้ว **`utils/dtcImage.js` จึงถูกลบทิ้ง**
>
> รักษา invariant นี้ด้วย [`database/localize-images.js`](../database/localize-images.js) — สแกนทุกคอลัมน์รูป หาค่าที่ไม่ได้ขึ้นต้นด้วย `/uploads/` แล้วดาวน์โหลด + เขียน path ใหม่ให้ รันซ้ำได้เสมอ **ต้องรันทุกครั้งหลัง `restore-full-dump.sh` หรือหลังสร้าง volume ของ DB ใหม่** (`restore-full-dump.sh` เรียกให้อัตโนมัติแล้ว)

> ⚠️ path ที่ขึ้นต้นด้วย `/uploads/` เป็น **relative** — ฝั่ง frontend ต้องส่งผ่าน `resolveImageUrl()` (`services/api.ts`) เพื่อต่อ origin ของ backend เสมอ ใส่ลงใน `<img src>` ตรงๆ ไม่ได้ เพราะ dev server ของ Vite (พอร์ต 5173) ไม่ได้ proxy `/uploads` ไปที่ backend — มันจะ fallback คืน `index.html` เป็น 200 ทำให้รูปพังเงียบๆ โดยไม่มี error ใน console (เจอจริงมาแล้วกับรูปใน footer)

> **ไม่มีการย่อรูปฝั่ง server** — `/uploads` ส่งไฟล์ต้นฉบับเสมอ และ `resolveImageUrl(image)` ฝั่ง frontend ไม่ต่อ `?w=` ท้าย URL แล้ว (เอาพารามิเตอร์ `width` ที่ไม่มีผลออกจากทุกจุดที่เรียกแล้ว 11 ก.ย. 2026) — ไฟล์ที่ใหญ่สุดใน `database/uploads/products/` ประมาณ 1.1–2.4 MB
>
> ⚠️ ห้ามกลับไปต่อ `?w=` ท้าย URL รูป: ช่วงที่ยังมีระบบย่อรูป เบราว์เซอร์จำ URL `?w=1200` ไว้เป็นรูปย่อ 1200px หลังถอดระบบย่อรูปออก URL เดิมยังได้รูปย่อจากแคช แบนเนอร์เต็มจอเลยเบลอ (Ctrl+Shift+R ไม่ช่วย เพราะแบนเนอร์โหลดทีหลังผ่าน JS) — เปลี่ยน URL คือวิธีเดียวที่ทำให้ทุกเครื่องโหลดไฟล์ใหม่

## `utils/sanitize.js` — ทำความสะอาดข้อมูลขาเข้า (เพิ่ม 10 ก.ย. 2026)

`cleanText` / `requiredText` / `safeUrl` / `sanitizeRichText` / `toPage` / `toLimit`

ใช้ผ่าน middleware ตัวเดียวใน `routes/admin.js` ที่ไล่ทำความสะอาด `req.body` ทั้งก้อนก่อนถึง handler (คุมทุก endpoint ที่เขียนข้อมูลพร้อมกัน แทนที่จะไล่ใส่ทีละตัวแล้วมีวันหลุด):

| ชนิดฟิลด์ | ตัดสินจาก | ทำอะไร |
|---|---|---|
| ลิงก์/รูป | ชื่อคีย์ลงท้ายด้วย `url`/`link`/`thumbnail`/`icon`/`end_point`, มีคำว่า `image`, หรือคีย์ `gallery` | รับเฉพาะ `http`/`https`/`mailto`/`tel` หรือ path ภายในระบบที่ขึ้นต้นด้วย `/` — อย่างอื่น (`javascript:`, `data:`, `//host`) กลายเป็น `null` |
| รายละเอียดที่มี HTML ได้ | คีย์ลงท้ายด้วย `description`/`information`/`content`/`detail` | ตัด `<script>`/`<style>` ทั้งบล็อก, แท็กที่รันโค้ดได้, attribute `on*`, `href="javascript:"` — เก็บ `<p>`/`<br>` ไว้เพราะ `stripHtml()` ฝั่งอ่านต้องใช้ |
| ข้อความอื่นทั้งหมด | ค่าที่เหลือ | ตัดอักขระควบคุม + ช่องว่างหัวท้าย, จำกัด 2000 ตัวอักษร, ค่าว่าง = `null` |

> **ทำไมต้องกรอง URL ทั้งที่ Vue escape ให้อยู่แล้ว**: Vue escape เฉพาะ *ข้อความ* — ค่าที่ถูกเอาไปใส่ `:href`/`<iframe src>` (ลิงก์ร้านค้า/วิดีโอสินค้า) ไม่ได้ถูกกัน ถ้ามีค่า `javascript:…` ถูกบันทึกไว้ มันจะรันจริงตอนลูกค้ากดปุ่ม
>
> `toPage`/`toLimit` ใช้ที่ `GET /api/products`, `GET /api/search`, `GET /api/admin/products` — บังคับช่วงที่รับได้ (limit สูงสุด 100 ฝั่ง public / 500 ฝั่งแอดมิน) กัน `?limit=999999` ที่ดึงทั้งตารางมาทีเดียว และกัน `?page=abc` ที่ทำให้ Prisma พังเป็น 500

## `utils/cache.js` — แคช response (เพิ่ม 10 ก.ย. 2026)

`cached(key, loader, ttlMs = 5 นาที)` เก็บ **Promise** ไว้ในหน่วยความจำ (ไม่ใช่ค่าที่ resolve แล้ว — หลาย request ที่เข้ามาพร้อมกันตอนแคชว่างจะรอก้อนเดียวกัน ไม่ยิง query ซ้ำ), โหลดพลาดจะถูกลบออกจากแคชทันทีไม่ให้เสิร์ฟ error ซ้ำ

ใช้กับ 4 endpoint ที่อ่านอย่างเดียวและข้อมูลแทบไม่เปลี่ยน: `GET /api/categories`, `/api/footer`, `/api/banners`, `/api/shops` — วัดผลจริง: หมวดหมู่ 273 ms → 19 ms

การเขียนข้อมูลผ่าน `/api/admin/*` (method ที่ไม่ใช่ GET และตอบสำเร็จ) จะ **ล้างแคชทั้งหมด** อัตโนมัติผ่าน middleware ตัวเดียวใน `routes/admin.js` — แก้หมวดหมู่/แบนเนอร์แล้วเห็นผลทันทีโดยไม่ต้องรอ TTL

## `utils/stripHtml.js`

`stripHtml(html)` — แปลง `tbl_item.itm_information` (HTML ดิบ) เป็นข้อความล้วนพร้อมรักษาการขึ้นบรรทัดใหม่ (แปลง `<br>`/ปิดแท็ก block เป็น `\n`) — มี guard `looksLikeHtml` กันไม่ให้รันซ้ำกับข้อความที่ไม่ใช่ HTML (เช่นข้อความที่ผ่าน `stripHtml` มาแล้วรอบหนึ่ง) ทำลายบรรทัดใหม่จริงที่มีอยู่แล้ว

## `utils/productShape.js`

รูปแบบ "การ์ดสินค้า" ที่ `GET /api/products` และ `GET /api/search` ใช้ร่วมกัน — `loadModelIndex(items, prisma)` ดึงโมเดลของสินค้าทั้งชุดในคำสั่งเดียวแล้วทำดัชนี, `cardShape(item, index)` แปลงหนึ่งแถวเป็นการ์ด, `buildCards(items, prisma)` = สองอย่างรวมกัน

คืนฟิลด์: `product_id`, `sku`, `product_name`, `product_price` / `product_price_max` (ช่วงราคาของโมเดล ถ้าสินค้ามีโมเดล), `has_models`, `has_priced_models`, `product_image`, `category_name`, `slug`, `model_ids`

การ์ดสินค้าต้องการแค่รหัสโมเดลกับราคา ไม่ต้องใช้สเปคเฉพาะโมเดล ฟังก์ชันนี้จึงไม่แตะ `tbl_attribute_value` เลย (สเปคเฉพาะโมเดลยังดึงตามเดิมผ่าน `resolveModels()` ในเส้นทางหน้ารายละเอียด/เปรียบเทียบ)

---

## Endpoint Reference

### `routes/auth.js`

| Method | Path | รายละเอียด |
|---|---|---|
| POST | `/api/auth/login` | รับ `{ username, password }` → เทียบ bcrypt hash → คืน `{ token, admin }` ถ้าถูก, error code ถ้าไม่ถูก |
| GET | `/api/auth/me` | verify token จาก header → คืนข้อมูล admin ปัจจุบัน |

| POST | `/api/auth/logout` | ต้องแนบ token → ยกเลิก token ใบนั้นทันที (เพิ่ม 14 ก.ย. 2026) |

**การยกเลิก token ตอนออกจากระบบ (14 ก.ย. 2026)**

JWT เป็นระบบ stateless เซิร์ฟเวอร์ไม่เก็บสถานะล็อกอิน เดิมการกด "ออกจากระบบ" จึงลบ token ทิ้งเฉพาะฝั่งหน้าเว็บ — **token ใบเดิมยังเรียก API ของแอดมินได้ต่อจนหมดอายุเอง** ใครที่คัดลอก token ไปแล้วไม่ได้รับผลกระทบจากการออกจากระบบเลย

วิธีแก้ใช้บัญชีดำใน `utils/tokenBlacklist.js`:
1. ตอน login ใส่ `jti` (รหัสประจำ token, `crypto.randomUUID()`) ลงใน payload — ไม่มีมันจะแยกไม่ออกว่า token ใบไหนถูกยกเลิก
2. `POST /api/auth/logout` ผ่าน `authMiddleware` ก่อน (กันคนยิง jti มั่วมาถมหน่วยความจำ) แล้วบันทึก `jti` คู่กับเวลาหมดอายุจริงของมัน
3. `middleware/auth.js` และ `GET /auth/me` เช็คบัญชีดำหลัง `jwt.verify()` ผ่าน — **`/auth/me` ต้องเช็คเองเพราะไม่ได้ผ่าน middleware** ไม่งั้นหน้าเว็บจะเข้าใจว่ายังล็อกอินอยู่
4. เก็บแค่จนกว่า token จะหมดอายุ แล้วกวาดทิ้งทุกครั้งที่มีการเพิ่ม — หลังหมดอายุ `jwt.verify()` ปฏิเสธเองอยู่แล้ว ไม่ต้องจำต่อ Map จึงไม่โตไม่มีที่สิ้นสุด

⚠️ **ข้อจำกัดที่ต้องรู้**: บัญชีดำอยู่ในหน่วยความจำของ process — รีสตาร์ท backend แล้วหาย token ที่เคยกดออกจากระบบจะกลับมาใช้ได้จนกว่าจะหมดอายุเอง (สูงสุด 2 ชม.) · ถ้าวันหนึ่งรันหลาย instance ต้องย้ายไป Redis หรือตารางในฐานข้อมูล

⚠️ **กับดักที่เจอจริงตอนทำ**: ฝั่งหน้าเว็บเรียก `api.post('/auth/logout', null)` แล้วได้ **400** เพราะ axios แปลง `null` เป็นข้อความ `"null"` ซึ่ง `express.json()` โหมด strict ปฏิเสธ — ผลคือ token ไม่ถูกยกเลิกโดยไม่มีใครรู้ (หน้าเว็บล้าง localStorage สำเร็จอยู่ดี) ต้องส่ง `{}` แทน

ไม่มี endpoint สำหรับ refresh token — token อายุ **2 ชั่วโมง** (ค่าจาก `JWT_EXPIRES` ใน `backend/.env`) หมดแล้วต้อง login ใหม่เท่านั้น · ⚠️ `routes/auth.js` อ่านค่านี้ตรงๆ ไม่มีค่าเริ่มต้นสำรอง ถ้าลืมตั้งใน `.env` จะได้ `expiresIn: undefined` ซึ่ง jsonwebtoken ตีความว่า **token ไม่มีวันหมดอายุ**

> **2026-09-04**: query จาก `prisma.tbl_users` (`user_id`/`username`/`password`/`flag`) ไม่ใช่ตาราง `Admin` แบบสร้างเองเดิม (ถูกลบทิ้งแล้ว — ไม่ได้มาจาก dtcshops.com จริง) — ดู `docs/database.md`

### `routes/search.js` — Public search

| Method | Path | รายละเอียด |
|---|---|---|
| GET | `/api/search?searchword=&category_id=&min_price=&max_price=&sort=&page=&limit=` | ค้นหาสินค้า (query param ชื่อ `searchword` ไม่ใช่ `q` — เปลี่ยนชื่อ 7 ก.ย. 2026 พร้อมกันทั้ง frontend/backend/URL) — comparator ปิดท้ายด้วย `product_id` เสมอ กันปัญหาแบ่งหน้าแล้วสินค้าซ้ำ/หาย แบบเดียวกับ `/api/products` |
| GET | `/api/search/autocomplete?searchword=` | คืนสินค้าสูงสุด 8 รายการที่ชื่อมีคำค้นเป็นสตริงย่อย (ต้องพิมพ์อย่างน้อย 2 ตัวอักษร) — **7 ก.ย. 2026: คืนเป็น object `{ product_id, product_name, slug }` ไม่ใช่ string เปล่าแล้ว** เพราะฝั่ง frontend กดคำแนะนำแล้วเข้าหน้าสินค้านั้นตรงๆ จึงต้องมี slug/รหัสไปด้วย |

สินค้าที่คืนออกไปใช้ `cardShape()` จาก `utils/productShape.js` ตัวเดียวกับ `GET /api/products` (ดึงดัชนีโมเดลครั้งเดียวต่อ request แล้วใช้ซ้ำ เพราะการค้นหาอาจวนจับคู่คำหลายรอบตอนกู้คำที่พิมพ์ผิดแป้น) แล้วผสมกับฟิลด์คะแนนของการค้นหา (`relevance_score`, `exact_term`, …) — **ผลค้นหาจึงมี `model_ids` และราคาช่วงของโมเดลเหมือนการ์ดในหน้ารายการสินค้า** (เดิมมีฟังก์ชัน `toCard()` ของตัวเองที่ไม่ส่ง `model_ids` และตั้ง `has_priced_models: false` ตายตัว)

ค้นหาโดยดึงสินค้าทุกชิ้นที่ผ่านตัวกรอง (หมวดหมู่/แท็ก/ราคา) มาจับคู่คำในชั้น Node ทุกครั้ง — ไม่มี two-stage flow (full-text ก่อนแล้ว fallback) และไม่มี `tsvector`/`pg_trgm` ในฐานข้อมูล เหตุผลคือภาษาไทยไม่มีช่องว่างระหว่างคำ Postgres จึงไม่มี parser ที่ตัดคำไทยได้ในตัว ส่วนข้อมูลจริงมีแค่ 43 แถวจึงยังไม่ต้องพึ่ง index ฝั่ง DB · เรียง/แบ่งหน้าทำใน JS ทั้งหมด

**โครงสร้าง 4 ชั้น** (`searchProducts()` ใช้ร่วมกันทั้งหน้าผลค้นหาและ autocomplete)

**ชั้น 1 — เตรียมข้อความ**

| ฟังก์ชัน | ทำอะไร |
|---|---|
| `normalize()` | NFKC + ตัวพิมพ์เล็ก + ยุบตัวคั่น (`Wi-Fi`/`wi fi` → `wifi`, `dash cam` → `dashcam`) — จำเป็นเพราะข้อมูลจริงเขียนคำเดียวกันคนละแบบ (สเปค Hikvision เขียน `Wi-Fi` ส่วนชื่อ DTC D10 เขียน `WiFi`) |
| `words()` | แยกสคริปต์ด้วย regex ก่อน (`มีGPSกับAI` ต้องไม่ติดกันเป็นคำเดียว) แล้วตัดคำไทยด้วย `Intl.Segmenter('th')` ของ Node เอง — ไม่ต้องลง dependency ตัดคำไทยเพิ่ม |
| `queryWords()` | ตัดคำเชื่อมที่ไม่ระบุตัวสินค้าออก (`fillers` 20 คำ: `ที่ มี กับ อยาก ต้องการ ช่วย หา สินค้า ระบบ and with` ฯลฯ) แล้ว dedupe |
| `indexedWords()` | ขยายคำพ้องตอน index (`synonymGroups`: `dashcam` ↔ `กล้องติดรถยนต์` ↔ `กล้องติดหน้ารถ`) — **ต้องเจอทั้งวลีเรียงติดกันในฟิลด์เดียว** ถึงจะขยาย ไม่งั้นสินค้าที่มีแค่คำว่า "กล้อง" กับ "รถ" คนละที่จะกลายเป็น dashcam |

**ชั้น 2 — จับคู่คำ (`scoreTermAgainstVocabulary()`)** — คิดคะแนนของคำค้น 1 คำเทียบกับ "คลังคำ" ของสินค้าทั้งหมดรอบเดียว แล้วเอาตารางคะแนนไปใช้ซ้ำกับสินค้าทุกตัว 4 ระดับเรียงตามความมั่นใจ

| คะแนน | กฎ | หมายเหตุ |
|---|---|---|
| 1.0 | ตรงกันเป๊ะ | |
| 0.9 | ขึ้นต้นตรงกัน | เปิดเฉพาะ**คำสุดท้าย**ตอน autocomplete (ผู้ใช้ยังพิมพ์ไม่จบ) และต้องยาว ≥4 ตัวอักษร ไม่งั้น `ad` ลากสินค้ามาทั้งเว็บ |
| 1 − 1/len | พิมพ์สลับอักษรคู่ที่ติดกัน (`isAdjacentSwap()`) | `trakcing`→`tracking`, `GSP`→`GPS` · ตัวย่อ 3 ตัวอักษรได้รับการยกเว้นให้เดาได้แม้สั้นกว่าเกณฑ์ปกติ · `CBA`→`ABC` (สลับหัว-ท้าย) ไม่นับ |
| < 1 | ใกล้เคียง (พิมพ์ผิด) — **fuse.js** | ดูรายละเอียดด้านล่าง |

**ชั้น 3 — คิดคะแนนต่อสินค้า** — แต่ละฟิลด์มีน้ำหนัก: ชื่อ/SKU/แท็ก `1.0` · หมวดหมู่ `0.95` · ค่าสเปค `0.8` · คะแนนของคำหนึ่งคำ = `max()` ของทุกฟิลด์×น้ำหนัก (ไม่ใช่บวกกัน — คำเดียวโผล่ 5 ที่ไม่ได้แปลว่าตรงกว่า) · **บังคับ AND**: ถ้าคำใดคำหนึ่งได้ 0 คัดสินค้านั้นทิ้ง ไม่มี fallback เป็น OR แม้จะพิมพ์ผิด

**ชั้น 4 — จัดอันดับ** — `exact_term` (ชื่อสินค้าตรงเป๊ะทั้งชื่อ) → `relevance_score` (**ค่าเฉลี่ยคะแนนรายคำถ่วงน้ำหนักด้วย IDF** ดูหัวข้อถัดไป) → `itm_code` เป็นตัวตัดสินสุดท้ายกันแบ่งหน้าแล้วสินค้าซ้ำ/หาย · `matched_words` = จำนวนคำที่ได้คะแนน ≥0.8 (คืนไปใน response แต่ frontend ยังไม่ได้ใช้)

**IDF weighting — ครึ่งหนึ่งของ TF-IDF / BM25 (14 ก.ย. 2026)**

เดิมทุกคำในคำค้นน้ำหนักเท่ากัน ค้น `GPS DTRACK` แล้ว `GPS` (มีในสินค้าเกือบทุกตัว) ถ่วงคะแนนเท่ากับ `DTRACK` (มีไม่กี่ตัว) สินค้าที่ตรงคำหายากจึงไม่ได้เปรียบอย่างที่ควร · `inverseDocumentFrequency()` ใช้สูตร idf ของ BM25 คือ `ln(1 + (N − df + 0.5) / (df + 0.5))` แล้ว `relevance_score` กลายเป็นค่าเฉลี่ยถ่วงน้ำหนัก `Σ(คะแนนรายคำ × idf) ÷ Σ idf` — **ยังอยู่ในช่วง 0–1 เหมือนเดิม** และคำค้นคำเดียวได้คะแนนเท่าเดิมเป๊ะ (น้ำหนักตัวเดียวหารตัวเอง)

อีกสองชิ้นของ BM25 **จงใจไม่เอามา**: *tf saturation* ไม่จำเป็นเพราะ "tf" ที่นี่ไม่ใช่จำนวนครั้งที่คำโผล่ แต่เป็นคุณภาพการจับคู่ 0–1 (ตรงเป๊ะ/ขึ้นต้น/พิมพ์ผิด) ซึ่งอิ่มตัวโดยธรรมชาติอยู่แล้ว · *document length normalization* จะไปลงโทษสินค้าที่กรอกสเปคละเอียด ทั้งที่สเปคละเอียดแปลว่าข้อมูลครบ ไม่ได้แปลว่าตรงคำค้นน้อยลง

⚠️ **ขอบเขตของผลลัพธ์**: ระบบบังคับ AND อยู่แล้ว สินค้าที่คืนมาทุกตัวจึงตรง**ทุกคำ** IDF จึงไม่ได้ทำหน้าที่คลาสสิก ("เอกสารที่มีคำหายาก = เกี่ยวข้องกว่า") แต่ทำหน้าที่ **ถ่วงว่าคำไหนควรมีสิทธิ์ตัดสินมากกว่าเมื่อคุณภาพการจับคู่ต่างกัน** — วัดกับข้อมูลจริงแล้วเปลี่ยนลำดับ 4 จาก 58 เคสทดสอบ ทุกเคสเป็นการแยกคะแนนที่เดิมเสมอกันแล้วตัดสินด้วย `itm_code` (ลำดับที่ไม่มีความหมาย) เช่น `gps adas` สินค้าที่มี ADAS อยู่ในชื่อได้ 0.945 แทนค่าเฉลี่ยธรรมดา 0.9 เพราะตรงคำที่หายากกว่าในฟิลด์ที่หนักกว่า

**Keyboard Layout Mapping — กู้คำค้นที่พิมพ์ผิดแป้น (14 ก.ย. 2026)**

ลืมสลับแป้นแล้วพิมพ์ `gps` ได้ `เยห` หรือพิมพ์ `กล้อง` ได้ `d]hv'` — เดิมคืน 0 รายการเงียบๆ ทั้งที่รู้ได้ว่าผู้ใช้ตั้งใจพิมพ์อะไร เพราะแป้นเกษมณีกับ QWERTY จับคู่กัน 1:1 ตายตัว

`KEDMANEE_ROWS` เก็บตารางไล่ตามแถวจริงบนคีย์บอร์ด (แถวตัวเลข → บน → กลาง → ล่าง ทั้งกดปกติและ Shift) เพื่อให้ตรวจทานทีละแถวได้ · `swapKeyboardLayout()` เลือกทิศทางจากสคริปต์ที่พบมากกว่าในข้อความ (ไม่มีใครสลับแป้นกลางคำ) และคืนค่าว่างถ้าแปลงไม่ได้สักตัว

**กติกาในเส้นทาง `GET /api/search`**: ลองสลับแป้น**ก็ต่อเมื่อผลลัพธ์เป็น 0 เท่านั้น** (เจอสินค้าอยู่แล้ว = ผู้ใช้พิมพ์ถูกแป้น ไม่ต้องเดาแทน) และ**ยอมรับคำที่แปลงแล้วก็ต่อเมื่อมันหาเจอจริง** ไม่งั้นปล่อยให้ขึ้น "ไม่พบสินค้า" + "คุณหมายถึง…?" ของคำเดิมตามปกติ · เมื่อกู้สำเร็จจะคืนฟิลด์ `searched_as` ไปด้วย ให้ `ProductsPage.vue` ขึ้นแถบ `role="status"` บอกว่า *ไม่พบผลของ "เยห" — กำลังแสดงผลของ "gps" แทน* ไม่งั้นผู้ใช้จะงงว่าสินค้า GPS เต็มหน้ามาจากไหน · **จงใจไม่เปิดใน autocomplete** เพราะยิงทุกครั้งที่กดแป้น การเดาคำระหว่างพิมพ์ยังไม่จบจะเด้งรายการที่ไม่เกี่ยวขึ้นมากวน

**กู้ทีละคำเมื่อแปลงทั้งก้อนไม่พอ (14 ก.ย. 2026)**

`swapKeyboardLayout()` ตัดสินทิศทางจากการนับอักษรทั้งข้อความ จึงได้ทิศเดียวเสมอ — พังทันทีเมื่อผู้ใช้สลับแป้นกลางประโยคแล้วสลับผิดคนละทิศ เช่น `lbo8hkmuj,u ไรดร` ที่ตั้งใจพิมพ์ `สินค้าที่มี wifi` (ท่อนแรกพิมพ์ไทยตอนแป้นเป็นอังกฤษ ท่อนหลังพิมพ์อังกฤษตอนแป้นเป็นไทย) · แปลงทั้งก้อนจะได้ `สินค้าที่มี ไรดร` คือกู้ถูกเฉพาะท่อนที่เป็นคำเชื่อมล้วนซึ่งถูกตัดทิ้งอยู่ดี ส่วนท่อนที่สำคัญจริงยังผิดอยู่

`recoverPerToken()` จึงตัดสินทีละคำว่าจะแปลงหรือไม่ โดยใช้เกณฑ์ `usableToken()` — คำหนึ่ง "ใช้ได้" เมื่อ **(ก)** ค้นแล้วเจอสินค้าจริง หรือ **(ข)** เป็นคำเชื่อมล้วนจน `queryWords()` ตัดหมด (เช่น `สินค้าที่มี`) · เงื่อนไข (ข) จำเป็นมาก ไม่งั้นคำไทยที่ถูกต้องอยู่แล้วจะถูกแปลงเป็นขยะ เพราะมันค้นยังไงก็ได้ 0 รายการอยู่แล้ว

ลำดับการลองคือ **ทั้งก้อนก่อน → รายคำ** (ทั้งก้อนถูกกว่ามาก ค้นเพิ่มครั้งเดียว ส่วนรายคำค้นเพิ่มสูงสุด 2 ครั้งต่อคำ) และจำกัดที่ `MAX_RECOVER_TOKENS = 6` คำ · ราคานี้ยอมรับได้เพราะเส้นทางนี้เดินเฉพาะตอนผู้ใช้กำลังจะเห็น "ไม่พบสินค้า" อยู่แล้ว — วัดจริง 240–630 ms เทียบกับ 70–190 ms ของคำค้นที่เจอปกติ

**Shift-layer Mapping — ติด Caps Lock / Shift บนแป้นไทย (18 ก.ย. 2026)**

ถ้าสองแบบแรกไม่เจอ จะลองคำเดาจาก `toggleThaiShift()` ต่อท้าย: ผู้ใช้อยู่แป้นไทยถูกแล้ว แต่ทุกปุ่มออกมาเป็นตัวชั้นบน เช่น `ฏ,็ฮ.๖ฺโณ๔ญฯ๖์` = `กล้องติดรถยนต์` · Map `SHIFT_TOGGLE` สร้างจากแถวไทยคู่ใน `KEDMANEE_ROWS` (แถวคู่ = ชั้นล่าง, แถวคี่ = ชั้นบนของปุ่มเดียวกัน ไม่มีอักขระซ้ำข้ามชั้น จึงสลับไปกลับได้ใน Map เดียว)

- **ด่านเข้า:** นับตัวไทยชั้นบนเทียบชั้นล่าง (ไม่นับเครื่องหมายกำกวมและเครื่องหมาย ASCII) ต้องมีชั้นบน**มากกว่า**ถึงจะลอง · คำปกติอย่าง `ศึกษา` มีตัวชั้นบนปน (ศ ษ) แต่ไม่ถึงครึ่ง จึงไม่ถูกแตะ
- **เครื่องหมายกำกวม `็ ๊ ๋ ์`:** ปกติก็ต้องกด Shift อยู่แล้ว ตัวเดียวกันจึงอาจเป็น "ตั้งใจพิมพ์" หรือ "ติด Shift มาจาก ้ ี ่ ื" ก็ได้ · สลับทุกตัวได้ `กล้องติดรถยนตื` (ค้นได้ 0) จึงคืนคำเดาหลายแบบ เริ่มจากสลับทุกตัว แล้วคงเครื่องหมายไว้ทีละมากขึ้น (สูงสุด `MAX_AMBIGUOUS_MARKS = 3` ตำแหน่ง = 8 คำเดา) · route รับคำเดาแรกที่ค้นเจอจริง

**Did-You-Mean ผ่อน Boolean AND (14 ก.ย. 2026)**

`suggestions` ไม่ได้เป็นระบบแนะนำแยกต่างหาก — มันรันท่อเดิมซ้ำด้วย `searchProducts()` แต่เดิมยัง**บังคับ AND เต็มรูป**อยู่ ซึ่งขัดแย้งกับหน้าที่ของตัวเอง: รอบนี้ทำงานตอนค้นไม่เจอ แปลว่ามีคำอย่างน้อยหนึ่งคำที่ได้คะแนน 0 — บังคับ AND อีกครั้งก็คัดทุกสินค้าทิ้งเหมือนเดิม ได้ลิสต์ว่างเสมอ

เคสจริงที่เจอ: ค้น `ระบบติดตามรถ รุ่น SWs` (ตั้งใจพิมพ์ `SWI`) → 0 รายการ **และ 0 คำแนะนำ** ทั้งที่สินค้า "ระบบติดตามรถมอเตอร์ไซค์ รุ่น SWI-M" ตรง 3 ใน 4 คำ · สาเหตุที่ `sws` เดาไม่ได้คือมันยาว 3 ตัวอักษร ติดด่าน `fuzzyAllowed()` (ต้อง ≥ 4), ไม่ใช่การสลับอักษรจึงไม่เข้า `isAdjacentSwap()`, และ Prefix Search ก็ต้อง ≥ 4 เช่นกัน — ด่านนี้**จงใจ**มีไว้ให้ `AI` / `4G` / `GPS` ต้องตรงเป๊ะ จึงไม่แก้

`searchProducts()` รับ `requireAll` (ค่าเริ่มต้น `true`) แปลงเป็น `minMatches = requireAll ? terms.length : Math.max(1, Math.ceil(terms.length / 2))` แล้วนับจำนวนคำที่ได้คะแนน > 0 เทียบกับเกณฑ์นี้ — เมื่อ `requireAll: true` ค่าจะเท่ากับ "ห้ามมีคำไหนได้ 0" แบบเดิมเป๊ะ **ผลค้นหาหลักและ autocomplete จึงไม่เปลี่ยนพฤติกรรมเลย** (วัดซ้ำ 9 คำค้นได้จำนวนเท่าเดิมทุกคำ)

**รูปแบบ `suggestions` (14 ก.ย. 2026)** — คืนเป็น `[{ product_id, product_name, slug }]` รูปเดียวกับ `/search/autocomplete` ไม่ใช่อาร์เรย์ของชื่อแบบเดิม เพราะหน้าเว็บต้องใช้ `slug` ทำลิงก์ให้ผู้ใช้กดเข้าหน้าสินค้าได้ทันที — เห็นชื่อที่ใช่แล้วยังต้องพิมพ์ค้นใหม่เองอีกรอบคือให้ผู้ใช้ทำงานซ้ำโดยไม่จำเป็น · `ProductsPage.vue` คงหน้าตาเดิมไว้ (ข้อความคั่นจุลภาค ไม่ใช่ชิป ตามที่ผู้ใช้เลือก) แต่ชื่อสินค้าเป็น `<RouterLink>` ผ่าน `productSlug()` ตัวเดียวกับที่ `ProductCard`/`SearchAutocomplete` ใช้ — จุลภาควางไว้**นอก**ลิงก์ ไม่งั้นจะกลายเป็นส่วนหนึ่งของพื้นที่กดและของข้อความที่ screen reader อ่านออกมา

**โควตาพิมพ์ผิดของรอบแนะนำ (`lenient`)** — ผ่อน AND อย่างเดียวยังไม่พอ เคส `dsshcan` (ตั้งใจพิมพ์ `dashcam`) ห่างกัน **2 ตัว** แต่คำยาว 7 ตัวได้โควตาแค่ 1 ตาม `editBudget()` จึงยังจับคู่ไม่ได้เลยแม้จะมีคำเดียว · `editBudget(term, lenient)` เพิ่มโควตาให้อีก 1 เฉพาะรอบแนะนำ เหตุผลคือรอบนั้น**เสนอ** ไม่ได้**ตัดสิน** — ผู้ใช้เห็นชื่อสินค้าเต็มๆ แล้วเลือกเองว่าใช่หรือไม่ใช่ ต่างจากผลค้นหาจริงที่เดาผิดแล้วสินค้าโผล่มาปนโดยผู้ใช้ไม่รู้ตัว · ห่าง 3 ตัวยังไม่ผ่าน (มีเทสต์คุมไว้)

เกณฑ์ "ครึ่งหนึ่ง" เลือกเพราะถ้าปล่อยให้ตรงคำเดียวก็พอ พิมพ์มั่วจะมีสินค้าโผล่มาแนะนำมั่วๆ ซึ่งแย่กว่าไม่แนะนำอะไรเลย — ทดสอบแล้ว `zzzzqqq` / `กกกกกกก` / `zzzz qqqq wwww` / `อออ ยยย ฟฟฟ` ยังได้ 0 คำแนะนำ · คำค้นคำเดียวได้ `ceil(1/2) = 1` เท่ากับ AND พอดี พฤติกรรมไม่เปลี่ยน

**ทำไม fuse.js ต้องมี guard ล้อมรอบ** (สำคัญ — 14 ก.ย. 2026)

fuse.js ใช้อัลกอริทึม Bitap ซึ่งมองหา pattern แบบ "เป็นส่วนหนึ่งของข้อความ" ไม่ใช่ "ทั้งคำ" และไม่รู้จักบริบทของโดเมนนี้ จึงต้องคุม 4 ชั้น

1. **`fuzzyAllowed()`** — ไม่เดาให้คำสั้นกว่า 4 ตัวอักษร และคำที่มีตัวเลขปน (`4G` ต้องไม่กลายเป็น `5G`, รหัสรุ่น `DC100` ต้องไม่เจอ `DC101`)
2. **ตัดคำที่ยาวต่างกันเกินโควตาก่อนส่งให้ fuse** — กัน Bitap จับคำสั้นกลางคำยาว (`track` ไม่ควรนับว่าใกล้เคียง `tracking`) และลดขนาดงานของ fuse ไปด้วย
3. **`threshold = โควตา ÷ ความยาวคำ`** — โควตาคือจำนวนตัวอักษรที่ยอมให้ผิด (คำ ≥8 ตัวยอม 2 ตัว, สั้นกว่านั้น 1 ตัว)
4. **`location: 0` + `distance = ความยาวคำ`** — บังคับให้แมตช์เริ่มที่ต้นคำ โดยคิดค่าเยื้อง 1 ตัวอักษรเท่ากับพิมพ์ผิด 1 ตัว · **จำเป็นจริง**: ถ้าใช้ `ignoreLocation: true` คำว่า `adas` จะไปตรงกับ `waas` ได้ฟรี เพราะตัด `d` ออกเหลือ `aas` ซึ่งซ่อนอยู่กลางคำ `waas` = ผิดแค่ 1 ตัวในสายตา Bitap ทั้งที่จริงต่างกัน 2 ตัว (เจอตอนเทียบ regression กับพฤติกรรมเดิม)

และเพราะ Bitap **ไม่มีปฏิบัติการ "สลับอักษร"** (นับการสลับ 1 คู่เป็นพิมพ์ผิด 2 ตัว) คำสั้นที่พิมพ์สลับจะหลุดตะแกรงทั้งที่โควตายอมให้ผิดได้ 1 ตัว จึงต้องดักด้วย `isAdjacentSwap()` เองก่อนถึง fuse (ชั้น 2 ตารางด้านบน)

**ประสิทธิภาพ** — วัดกับข้อมูลจริง 43 สินค้า / คลังคำ 1,029 คำ / 725 ฟิลด์: ตัดคำ ~65ms · fuse ~5.5ms ต่อคำค้น · ดึงข้อมูลจาก Prisma ~119ms — คอขวดคือ `Intl.Segmenter` ไม่ใช่ตัวจับคู่ ถ้าต้องเร่งให้ทำ cache ผลตัดคำแล้วล้างตอนแอดมินบันทึก (ยังไม่ได้ทำ) · หมายเหตุ: การส่ง prebuilt index ของ fuse (`Fuse.createIndex`) วัดแล้ว**ช้ากว่า** ส่ง array ของ string ตรงๆ (14ms vs 5.5ms) จึงไม่ใช้

**ทางลัดชื่อตรงเป๊ะ** — `normalize(itm_desc) === normalize(query)` ให้ `relevance_score = 1` และ `exact_term = true` เด้งขึ้นบนสุด — จำเป็นเพราะสินค้าตระกูลเดียวกันตั้งชื่อซ้ำกันเกือบทั้งประโยค (DTRACK-M / DTRACK-O / DTRACK + DLT ต่างกันแค่ท้ายรุ่น) ก๊อปชื่อเต็มมาค้นแล้วต้องได้ตัวนั้นมาก่อน · จงใจใช้ "ตรงเป๊ะ" ไม่ใช่ "ขึ้นต้นด้วย" เพื่อไม่ให้กระทบคำค้นสั้น (`DTRACK` ยังได้ทั้งตระกูล)

**"คุณหมายถึง…?"** — เมื่อผลลัพธ์เป็น 0 จะรันซ้ำด้วยโหมด autocomplete (เปิด prefix match) เอาชื่อสินค้า 5 อันดับแรกมาเป็น `suggestions`

**เทสต์** — ไม่มีแล้ว (`backend/test/` ลบออก 29 ก.ย. 2026 ตามคำขอผู้ใช้) · พฤติกรรมที่เคยล็อกไว้ด้วยเทสต์และต้องระวังตอนแก้ logic ค้นหา: synonym, ตัดคำไทย, AND, ตัวย่อสั้น, พิมพ์ผิดทั้ง 3 แบบ (แทน/ขาด/สลับ), รหัสรุ่นห้ามเดา, การเรียง, ตัวกรอง, คำต้องเทียบทั้งคำ (fuse), การสลับอักษรนับเป็นผิด 1 ตัว, IDF (คำหายากถ่วงมากกว่า), การกู้แป้นพิมพ์

> Search log/analytics **ไม่มีแล้ว** — endpoint นี้ไม่บันทึกอะไรลง DB อีกต่อไป (ตาราง log ถูกตัดออกทั้งหมด, ดู `docs/database.md`)

### `routes/products.js` — Public product data

| Method | Path | รายละเอียด |
|---|---|---|
| GET | `/api/products/compare?ids=itm-0000001,itm-0000002` | คืนสินค้าหลายชิ้นพร้อม category/attribute values + `product_model` เต็มรูปแบบ — ประกาศ**ก่อน** `/:id` กันชนกับ param route; `ids` แต่ละตัวรับได้ทั้ง `itm_code` จริงหรือ `slug` |
| GET | `/api/products?page=&limit=&category_id=&sort=` | List พร้อม pagination, `sort` รับ `newest`(default)/`price_asc`/`price_desc`/`name`/`popular` (`popular` = ยอดเข้าดูหน้าสินค้าทั้งหมดใน `tbl_logs` ผ่าน `productViewCounts()` — join slug ใน `message` แบบไม่สนตัวพิมพ์ แล้วเรียงและตัดหน้าฝั่ง JS เหมือนเรียงราคา; ยอดเท่ากันคงลำดับใหม่สุดก่อน · คอลัมน์ `tbl_item.view` เป็น 0 ทุกแถวจึงไม่ใช้) — **เรียงราคาใช้ "ราคาที่การ์ดแสดง"** (สินค้ามีโมเดล = ราคาต่ำสุดของโมเดล) ไม่ใช่ `itm_price` และสินค้าไม่มีราคาอยู่ท้ายเสมอ (แก้ 28 ก.ย. 2026: สินค้าราคาฐาน 0 ที่โมเดลมีราคาเคยตกไปกองท้าย) — **ทุกแบบการเรียงต่อท้ายด้วย `itm_code` เสมอ** เป็นตัวตัดสินลำดับสำรอง (แก้ 9 ก.ย. 2026: คอลัมน์ที่ใช้เรียงมีค่าซ้ำกันเยอะมาก — สินค้า 31/44 ตัวมี `ist_dt` เท่ากันเป๊ะ, 34 ตัวราคา 0 — พอค่าเท่ากัน Postgres ไม่รับประกันลำดับ ทำให้แต่ละหน้าได้ลำดับไม่ตรงกัน สินค้าโผล่ซ้ำ 2 หน้าและหายไป 8 ตัว) |
| GET | `/api/products/filters` | ตัวเลือกของแผงตัวกรองหน้า `/products` → `{ categories: [{ category_id, category_name, count }], tags: [{ tag, label, count }] }` — นับเฉพาะสินค้าที่ใช้งานอยู่ (`itm_flag='1'`); แท็กจับกลุ่มแบบไม่สนตัวพิมพ์เล็ก/ใหญ่ (`GPS`/`gps` = ชิปเดียว) แสดง `label` ด้วยรูปแบบที่พบบ่อยที่สุด, ตัดแท็กที่มีสินค้าน้อยกว่า `MIN_FACET_PRODUCTS` หรือมีทุกตัว (กรองแล้วไม่ช่วยอะไร) ออก, เรียงจำนวนมาก→น้อย — ประกาศก่อน `/:id` |
| GET | `/api/products/:id` | `:id` รับได้ทั้ง `itm_code` หรือ `slug` — คืนรายละเอียดสินค้า + attribute values (เฉพาะที่ใช้ร่วมกัน, `model_code IS NULL`) + gallery + `video_url` + `related_products` (**ทุกตัวในหมวดหมู่เดียวกัน ยกเว้นตัวเอง — ไม่จำกัดจำนวนแล้ว** ตั้งแต่ 9 ก.ย. 2026, เดิม `take: 4` ทำให้ปุ่มลูกศรของแคโรเซลกดแล้วไม่เลื่อน) + `product_model` (พร้อม attribute override ของแต่ละโมเดล) + metadata แสดงผลอย่างเดียว (เพิ่ม 2 ก.ย. 2026 — `sold_count`/`warranty_text`/`shipping_text`/`shopee_link`/`lazada_link`/`tiktok_link`/`line_link` จาก `itm_sold`/`itm_guarantee`/`itm_shipping`/`itm_*_end_point`) — **ไม่บันทึก view log แล้ว** (ตารางถูกตัดออก) |

`product_id` ในทุก response ตอนนี้คือ string จริง (`itm_code` เช่น `"itm-0000003"`) ไม่ใช่ integer auto-increment เดิม — `model_id` ก็เช่นกัน (คือ `itm_model_code`)

### `routes/categories.js`

| Method | Path | รายละเอียด |
|---|---|---|
| GET | `/api/categories` | รายชื่อหมวดหมู่ (`tbl_item_type`) ทั้งหมด |

### `routes/compare.js`

| Method | Path | รายละเอียด |
|---|---|---|
| POST | `/api/compare` | Body `{ product_ids: string[] }` (ต้อง ≥2 ชิ้น) → คืนรายละเอียดสินค้าทั้งหมด — **ไม่บันทึก compare log แล้ว** (ตารางถูกตัดออก) |

### `routes/banners.js` — เพิ่ม 3 ก.ย. 2026

| Method | Path | รายละเอียด |
|---|---|---|
| GET | `/api/banners` | Hero banner slides สำหรับ `HomePage.vue` — อ่าน `tbl_bnn_slide` (`bnn_slide_flag='1'` และมีรูป), เรียงตาม `bnn_slide_index` แล้ว tiebreak ด้วย `bnn_slide_code` (กันลำดับสลับไปมาไม่คงที่ระหว่าง request เมื่อ index ซ้ำกัน — ข้อมูลจริงหลายแถวมี index เท่ากัน), คืน `{ banner_id, image, title, link }` (`image` มาจาก `bnn_image_master` ตรงๆ — `link` เป็น `null` ถ้า `bnn_slide_end_point` ไม่ใช่ URL จริง เพราะข้อมูลจริงบางแถวเป็นข้อความ placeholder ไม่ใช่ลิงก์) เป็นตัวอ่านอย่างเดียวฝั่ง public คู่กับ Admin CRUD ที่มีอยู่แล้วที่ `/api/admin/banners` |

### `routes/admin.js` — ทุก endpoint ต้อง JWT

**Upload**
| Method | Path | รายละเอียด |
|---|---|---|
| POST | `/api/admin/upload/image` | multer diskStorage → `backend/uploads/products/<timestamp>-<random>.<ext>`, จำกัด 5MB, รับเฉพาะ jpeg/png/webp/gif → คืน `{ url: "/uploads/products/..." }` |

**Products CRUD** (แก้ไขจริงลง `tbl_item`/`tbl_item_model`/`tbl_attribute_value`)
| Method | Path | รายละเอียด |
|---|---|---|
| GET | `/api/admin/products?q=&deleted=&limit=` | List — `q` = fuzzy search บน `itm_desc` (fuse.js), `deleted=1` = เฉพาะสินค้าที่ลบแล้ว (หน้าถังขยะ), `limit` ค่าเริ่มต้น 50 สูงสุด 500 → `{ products, total }` · เรียงใหม่สุด → เก่าสุด `orderBy: [{ ist_dt: 'desc' }, { itm_code: 'desc' }]` — ต้องมี `itm_code` ต่อท้ายเพราะสินค้าที่นำเข้าชุดเดียวกันมี `ist_dt` เท่ากันเป๊ะ (29 ตัว) ลำดับจะสลับทุกครั้งที่โหลด · เมื่อมี `q` ผลลัพธ์เรียงตามคะแนนความตรงของ fuse.js แทน |
| GET | `/api/admin/products/:id` | ดึงสินค้าเดี่ยวสำหรับฟอร์มแก้ไข |
| POST | `/api/admin/products` | สร้างสินค้าใหม่ — บังคับแค่ `product_name` (ไม่บังคับ SKU เพราะสินค้าจริงส่วนใหญ่ไม่มีค่านี้), auto-generate `itm_code`/`slug` ถ้าไม่ได้ระบุ, whitelist field ผ่าน `baseFieldsFromBody()`, สร้าง attribute values + gallery ใน `$transaction`, ผูกโมเดลผ่าน `model_ids: string[]` (`reassignProductModels()`, ดูหมายเหตุด้านล่าง) |
| PUT | `/api/admin/products/:id` | แก้ไข — whitelist เดียวกัน, ลบไฟล์รูปเก่าที่เคยอัปโหลดเองออกจากดิสก์แบบ best-effort ถ้าถูกแทนที่/ลบออกจาก gallery; `model_ids` เหมือนกัน; slug ไม่ถูกเขียนทับถ้าผู้ใช้ไม่ได้แก้ (`resolveSlug()`) |
| DELETE | `/api/admin/products/:id` | ตั้ง `itm_flag = '0'` (ซ่อนจากฝั่ง public — ไม่ใช่ลบแถวจริง) — `GET /api/admin/products` เองก็กรอง `itm_flag: { not: '0' }` ออกด้วย (แก้ 3 ก.ย. 2026 — เดิมไม่กรอง ทำให้ลบแล้วแถวยังค้างอยู่ในตารางแอดมิน) |
| PUT | `/api/admin/products/:id/restore` | กู้คืนสินค้าที่ลบแบบ soft (`itm_flag='1'`, ล้าง `rm_dt`) — `400` ถ้าสินค้าไม่ได้ถูกลบอยู่ ใช้ที่แท็บ "สินค้าที่ถูกลบ" |
| PATCH | `/api/admin/products/:id/sale-dates` | **แก้เฉพาะวันที่วางจำหน่าย** (เพิ่ม 11 ก.ย. 2026) — body `{ sale_start_date, sale_end_date }` (YYYY-MM-DD หรือ `null` = ล้าง) → เขียน `pb_dt`/`exp_dt` อย่างเดียว ไม่แตะฟิลด์อื่น · `400` ถ้ารูปแบบวันที่ผิดหรือวันเริ่ม > วันสิ้นสุด · ใช้ที่หน้า "สินค้าใหม่" แทน `PUT /:id` ซึ่งบังคับ `product_name` และ full-replace ทั้งก้อน (เดิมหน้านั้นเรียก PUT ด้วยวันที่อย่างเดียวจึงได้ 400 ทุกครั้ง) |

**Master data CRUD** (`/api/admin/categories`, `/attributes` — ทุกตัวมี GET (list)/GET `:id` (เดี่ยว)/POST/PUT/DELETE)
- `/categories` ผูกกับ `tbl_item_type`, `/attributes` ผูกกับ `tbl_attribute`
- ลบ `tbl_attribute` ที่มีสินค้าผูกค่าอยู่จะโดน DB ปฏิเสธ (FK, จับ error code `P2003` คืน error message ที่อ่านง่าย) เหมือน category
- `GET /categories/:id` คืน `thumbnail` (รูปหมวดหมู่) และ `product_ids: string[]` เพิ่ม (สินค้าที่อยู่ในหมวดนี้ปัจจุบัน) — `POST`/`PUT` รับ `product_ids` (optional) กลับมาแทนที่สมาชิกของหมวดหมู่ทั้งชุด (`reassignCategoryMembers()`, เลือกสินค้าไว้ = ย้ายมาอยู่หมวดนี้แทนหมวดเดิม, ไม่เลือก = เอาออกจากหมวดนี้)
- `POST`/`PUT /categories` รับ `thumbnail` (path `/uploads/...` จาก `/admin/upload/image`) — `PUT` แก้รูปเฉพาะเมื่อส่งฟิลด์มา (ไม่ส่ง = คงรูปเดิม, `null` = ลบรูป) · `GET /api/categories` ฝั่ง Public ส่งค่านี้ออกเป็น `sample_image`
- `GET /attributes/:id` คืน `product_values: [{product_id, product_name, value}]` เพิ่ม (ค่าที่สินค้าแต่ละตัวตั้งไว้สำหรับคุณสมบัตินี้ ระดับสินค้า ไม่ใช่ระดับโมเดล) — `POST`/`PUT` รับ `product_values` (optional, `[{product_id, value}]`) แทนที่ค่าทั้งชุด (`applyAttributeProductValues()`) ให้ตั้งค่าคุณสมบัติของสินค้าได้ตรงจากฟอร์มคุณสมบัติเลย ไม่ต้องเปิดฟอร์มสินค้าทีละตัว
- ทั้งฟอร์ม "เพิ่ม/แก้ไข" ของทั้ง 2 endpoint นี้ (และ Models ด้านล่าง) ฝั่ง frontend เป็นหน้าฟอร์มเต็มหน้า (`/admin/categories/new`, `/admin/attributes/:id/edit`, ฯลฯ) ไม่ใช่ popup แล้ว (เปลี่ยน 4 ก.ย. 2026)

**Models CRUD** (`/api/admin/models` — ผูกกับ `tbl_item_model`, เพิ่มเข้ามาใหม่ 2026-09-03 พร้อมเปลี่ยนโมเดลให้เป็น shared catalog ทั้งระบบ)
| Method | Path | รายละเอียด |
|---|---|---|
| GET | `/api/admin/models?q=` | รวมโมเดลของสินค้าทุกชิ้น (ไม่ผูกกับสินค้าเดียวใน FK จริง — reverse lookup จาก `tbl_item.itm_model_code` เอง) พร้อม `product` (เจ้าของปัจจุบัน, มี `category_id`/`category_name` ของสินค้านั้นด้วย — เพิ่ม 4 ก.ย. 2026 ให้หน้ารายการจัดกลุ่มตามหมวดหมู่ได้) และ `product_attribute_value` (สเปคเฉพาะโมเดล) |
| GET | `/api/admin/models/:id` | ดึงโมเดลเดี่ยวสำหรับฟอร์มแก้ไขเต็มหน้า (เพิ่ม 4 ก.ย. 2026) — รูปแบบผลลัพธ์เดียวกับแถวใน list ด้านบน |
| POST | `/api/admin/models` | สร้างโมเดลใหม่ผูกกับสินค้าที่ระบุ (`product_id`) — ส่วนเพิ่มราคาส่งในฟิลด์ **`product_price`** (บันทึกลง `itm_model_addon_price`) ไม่ใช่ `addon_price` — รับ `attributes` (สเปคเฉพาะโมเดล) ได้ตั้งแต่ตอนสร้างเลยด้วย (เพิ่ม 4 ก.ย. 2026, เดิมต้องไปเปิดแก้ไขทีหลังถึงจะใส่ได้) |
| PUT | `/api/admin/models/:id` | แก้ชื่อโมเดล (`model_name`)/ราคา/สต็อก + `attributes` (สเปคเฉพาะโมเดล, full-replace) — รับ `product_id` (optional) ให้ย้ายความเป็นเจ้าของไปสินค้าอื่นได้ด้วย (`reassignModelOwner()`, เพิ่ม 4 ก.ย. 2026) |
| DELETE | `/api/admin/models/:id` | ลบจริง (hard delete, ไม่ใช่ soft) — สเปคเฉพาะโมเดลถูกลบตามผ่าน `onDelete: Cascade` |

**Options CRUD** (`/api/admin/options` — ผูกกับ `tbl_item_option` "ตัวเลือกสินค้า"/อุปกรณ์เสริม เช่น SD Card, เซ็นเซอร์วัดน้ำมัน) — ผูกกับสินค้าผ่าน `tbl_item.itm_option_code` (คอมม่าคั่น) เหมือนโมเดล แต่**ใช้ร่วมกันได้หลายสินค้า** (ไม่ย้ายเจ้าของ) และไม่ถูกดึงเข้าตารางเปรียบเทียบ; ทุก response เป็นรูป `{ option_id, option_name, addon_price, stock_quantity, updated_at, products: [{ product_id, product_name }] }` (`products` คำนวณจาก `buildOptionUsage()` นับเฉพาะสินค้าที่ไม่ถูกลบ)
| Method | Path | รายละเอียด |
|---|---|---|
| GET | `/api/admin/options?q=` | รายการตัวเลือกที่ยังไม่ถูกลบ (`q` กรองตามชื่อ) |
| GET | `/api/admin/options/:id` | ตัวเลือกเดี่ยว |
| POST | `/api/admin/options` | สร้าง — `option_name` (required), `addon_price`, `stock_quantity`, `product_ids[]` (ต่อท้าย `itm_option_code` ของสินค้าที่เลือก ไม่ทับของเดิม) · รหัสรันอัตโนมัติ `OP-0000001` (`nextOptionCode()`) |
| PUT | `/api/admin/options/:id` | แก้เฉพาะฟิลด์ที่ส่งมา — ถ้าส่ง `product_ids` = **กำหนดชุดสินค้าที่ใช้ตัวเลือกนี้ใหม่ทั้งชุด** (สินค้าที่ไม่อยู่ในชุดจะถูกปลดออก) ต้องรวมสินค้าที่ผูกอยู่เดิมมาด้วยถ้าจะแค่เพิ่ม |
| DELETE | `/api/admin/options/:id` | ลบแบบ soft (`itm_option_flag='0'` + `rm_dt`) และปลดออกจาก `itm_option_code` ของทุกสินค้า ไม่ให้หน้าสินค้าโชว์ตัวเลือกที่ลบไปแล้ว |

**Banners CRUD** (`/api/admin/banners` — ผูกกับ `tbl_bnn_slide`, มี GET/POST/PUT/DELETE) — field: `bnn_slide_desc`(ชื่อ, required)/`bnn_slide_index`(ลำดับ 1-5)/`bnn_slide_seo`/`bnn_slide_end_point`(ลิงก์)/`bnn_slide_information`(รายละเอียด)/`bnn_image_master`(รูป, path เดียวกับที่ `POST /api/admin/upload/image` คืนมา) — public read-only ที่ `GET /api/banners` (`routes/banners.js`, เพิ่ม 3 ก.ย. 2026) ดูหัวข้อ Public routes ด้านบน

**Shops CRUD** (`/api/admin/shops` — ผูกกับ `tbl_shop`, มี GET/POST/PUT/DELETE, เพิ่มเข้ามา 3 ก.ย. 2026) — field: `shop_name`(required)/`address`/`road`/`province`/`district`/`sub_district`/`postcode`/`lat`/`lon`(string ทั้งคู่)/`tel`/`thumbnail` — public read-only ที่ `GET /api/shops` (`routes/shops.js`, เพิ่ม 4 ก.ย. 2026) สำหรับส่วน "DTC Shop & Services" บนหน้าแรก (แผนที่ Leaflet + carousel การ์ดสาขา) คืน field ที่ประกอบมาจากหลายคอลัมน์แล้ว: `address` (รวม address/road/sub_district/district/province/postcode เป็นสตริงเดียว), `lat`/`lon` (parse เป็น number, กรองแถวที่พิกัดใช้ไม่ได้ทิ้ง), เรียงตามเลขต่อท้าย `tel` (เช่น "1176 ต่อ 62" → 62) น้อยไปมาก ไม่ใช่ตาม `id`

**ลบออกแล้ว 10 ก.ย. 2026** — `/api/admin/articles` (บทความ, `tbl_articles`), `/api/admin/ads` (โฆษณา, `tbl_promotion`) และ `/api/admin/seo-pages` (ข้อมูล SEO, `tbl_page`) ทั้ง 3 ชุด (CRUD ครบชุดละ 5 endpoint) ถูกลบทิ้งตามคำขอผู้ใช้ — เป็นฟีเจอร์ของเว็บร้านค้าต้นแบบ ไม่ได้อยู่ในขอบเขตระบบค้นหา/เปรียบเทียบนี้ และหน้าแอดมิน ทั้งสามถูกปิดเป็น placeholder ไปก่อนหน้านี้แล้ว จึงไม่มีอะไรเรียกใช้อยู่ ตัวช่วย `nextArticleCode()`/`nextPromotionCode()`/`nextPageCode()` และ `adminAPI.{list,get,create,update,delete}{Article,Ad,SeoPage}` ฝั่ง frontend ถูกลบตามไปด้วย — **ตารางในฐานข้อมูลยังอยู่ครบ ไม่ได้ DROP ทิ้ง** ถ้าจะทำใหม่ต้องเขียน route ใหม่

โมเดลเป็น **shared catalog** — ไม่ได้ผูกกับสินค้าเดียวตายตัวอีกต่อไป, `reassignProductModels()` ใน `routes/admin.js` คือจุดเดียวที่ย้ายความเป็นเจ้าของ (ติ๊กเลือกโมเดลที่เป็นของสินค้าอื่นอยู่ในฟอร์มแก้ไขสินค้า = ย้ายมาเป็นของสินค้านี้แทน)

### `routes/adminImport.js` — นำเข้าจาก Excel (25 ก.ย. 2026)

mount ใน `routes/admin.js` ด้วย `router.use('/import', …)` **หลัง** middleware JWT / sanitize / ล้างแคช จึงได้ของทั้งสามอย่างเหมือน endpoint แอดมินอื่น

| Method | Path | รายละเอียด |
|---|---|---|
| GET | `/api/admin/import/template` | สร้าง `.xlsx` ด้วย `exceljs` จาก DB ทุกครั้ง: ชีต "วิธีใช้", "สินค้า" (สินค้าที่ `itm_flag != '0'`), "สเปค" (ค่า `model_code IS NULL` ของสินค้าเหล่านั้น), ชีตซ่อน `_lists` · หมวดหมู่เป็น dropdown แบบห้ามพิมพ์นอกรายการ · หัวข้อสเปคเป็น dropdown แบบ `errorStyle: 'warning'` (พิมพ์ชื่อใหม่ได้ ไปตัดสินใจในพรีวิว) |
| POST | `/api/admin/import/parse` | multer `memoryStorage` (ไม่ลงดิสก์) → `readSheet()` จับคอลัมน์จากชื่อหัว (`normName`) และแปลงค่าเซลล์ทุกรูปของ exceljs (rich text / hyperlink / สูตร / Date) ด้วย `cellText()` → `buildPlan()` |
| POST | `/api/admin/import/plan` | `rowsFromBody()` รับเฉพาะคีย์ที่รู้จัก → `buildPlan(rows, snapshot, attribute_map)` |
| POST | `/api/admin/import/commit` | ดาวน์โหลดรูป `product_image` ที่เป็นลิงก์ภายนอกก่อน (`utils/remoteImage.js` `fetchImage()` → `saveImage()` ลง `database/uploads/products/<YYYY-MM>/`) ไม่ถือ transaction ค้างระหว่างรอเน็ต · บันทึกไม่สำเร็จด้วยเหตุใดก็ตาม = ลบไฟล์ที่โหลดมาทิ้ง · จากนั้น `prisma.$transaction` (timeout 60 วินาที): `loadSnapshot(tx)` → `buildPlan` ซ้ำ → ไม่ `ready` = 400 พร้อมแผนใหม่ · ไม่งั้นสร้างหัวข้อใหม่ (ชื่อละครั้ง) → สร้าง/แก้ `tbl_item` เฉพาะคอลัมน์ที่เปลี่ยน (สินค้าใหม่: รหัส `itm-NNNNNNN` ต่อจากตัวมากสุด, slug ไม่ชนทั้งกับ DB และกันเองในรอบ) · แก้ราคาแล้วคำนวณ `itm_lowest_price`/`itm_highest_price` จากโมเดลใหม่ · สเปค: update แถวเดิมหรือ create |

**เทมเพลต (25 ก.ย. 2026: หัวอังกฤษตามแบบที่ผู้ใช้ส่งมา → แยกชีตตามหมวดพร้อมคอลัมน์คุณสมบัติ)** — `addCategorySheet()` 1 ชีตต่อหมวด (ชื่อผ่าน `sheetNameFor()`: ≤31 ตัว ตัด `: \ / ? * [ ]`, ชื่อซ้ำเติม `(2)`) + ชีต "ไม่มีหมวดหมู่" ถ้ามีสินค้าไม่มีหมวด · คอลัมน์ `PRODUCT_COLUMNS` หัวน้ำเงิน `#4472C4` + หัวข้อคุณสมบัติที่สินค้าในหมวดมีค่า หัวเขียว `#70AD47` เรียงตามจำนวนสินค้าที่ใช้ · หัวคอลัมน์ว่าง 15 ช่องถัดไปมี dropdown ชื่อหัวข้อ (`errorStyle: 'warning'` พิมพ์ชื่อใหม่ได้) · ตรึง `ySplit: 1, xSplit: 3` · หัว `product_id` สีเทา `#808080` (ระบบใช้ ไม่ต้องกรอก) · ความหมายไทย + ตัวอย่างอยู่ใน `cell.note` · ชีต "วิธีใช้" มีตารางตัวอย่าง · **อ่าน** (`readWorkbook()`): ทุกชีตที่ไม่ซ่อน ยกเว้น วิธีใช้/`_lists` → `readProductSheet()` (หัวที่ตรง `key`/`label` = ฟิลด์สินค้า, หัวอื่น = หัวข้อคุณสมบัติ → แถว spec ที่มี `product_row` ชี้แถวสินค้าเดียวกัน) · สินค้าใหม่ไม่ใส่หมวด = หมวดที่ชื่อชีตตรงกับ `sheetNameFor(ชื่อหมวด)` · ชีต `specs`/`สเปค` ของรุ่นก่อน → `readSpecSheet()` · `index.js` ขยาย `express.json` เฉพาะ `/api/admin/import` เป็น 50MB เพราะ `/plan`/`/commit` ส่งแถวทั้งไฟล์กลับมา (เทมเพลตเปล่าก็เกิน 100KB ค่าเริ่มต้นแล้ว)

**`utils/remoteImage.js`** — `fetchImage(url)` → `{ buffer, ext }`: เฉพาะ http/https · `dns.lookup` แล้วปฏิเสธ IP ภายใน (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 100.64/10, IPv6 ULA/link-local/loopback) **ทุกทอดของ redirect** (`redirect: 'manual'` ไล่เองไม่เกิน 3 ทอด) กัน SSRF · timeout 15 วินาที · content-type ต้องเป็น jpeg/png/webp/gif · อ่าน body ทีละก้อนตัดที่ 5MB · `checkImageUrl()` = ลองโหลดแล้วทิ้ง จำผล 10 นาที (`/plan` ถูกเรียกทุกครั้งที่เลือกหัวข้อ) · route เรียกผ่าน `attachImageChecks()` เฉพาะค่าที่ต่างจากรูปเดิม ทีละ 4 ลิงก์ และตรวจว่า `/uploads/...` มีไฟล์จริงโดยไม่ให้ `../` หลุดออกนอกโฟลเดอร์

**`utils/importPlan.js` — `buildPlan(rows, snapshot, attributeMap)`** ไม่แตะ DB (เทสต์ `test/importPlan.test.js`)
- `snapshot` มาจาก `loadSnapshot()` ในไฟล์ route — รายละเอียดสินค้าเทียบหลัง `stripHtml()` เพราะฟอร์มแอดมินแสดง/บันทึกเป็นข้อความล้วนอยู่แล้ว (ไม่งั้นสินค้าที่ DB เก็บเป็น HTML จะขึ้น "แก้" ทุกครั้ง)
- ช่องว่าง = ไม่แตะ · เก็บเฉพาะฟิลด์ที่ต่างจากเดิม → แถวไม่เปลี่ยน = `unchanged`
- ตรวจ: รหัสไม่พบ/ถูกลบ, รหัสซ้ำในไฟล์, SKU ซ้ำ (กับ DB และในไฟล์ ไม่สนตัวพิมพ์), หมวดไม่พบ (รับชื่อหรือรหัส), ราคา/สต็อกไม่ใช่ตัวเลข (รับ `"฿1,990"`), ลิงก์ผ่าน `safeUrl()` ไม่ได้, แท็กเกิน 255, ชื่อสินค้าใหม่ซ้ำกันในไฟล์
- สเปค: หาสินค้าจากรหัส → ชื่อสินค้าใหม่ในชีตสินค้า → ชื่อสินค้าเดิม (ต้องไม่ซ้ำ) · หัวข้อเทียบชื่อแบบไม่สนตัวพิมพ์/ช่องว่างซ้ำ · ไม่รู้จัก → `pending` จนกว่า `attributeMap` จะบอก · คู่ (สินค้า, หัวข้อ) ซ้ำในไฟล์ = error · ค่าเกิน 255 (varchar) = error · สินค้าที่แถวในชีตสินค้าผิด สเปคผิดตาม
- `suggestAttributes(entry, snapshot, index)` สูงสุด 3 ตัว เกณฑ์คะแนน ≥ 0.5 คืน `reasons` (`value`/`name`/`category`) · **ค่าคล้ายกัน**: `valueTokens()` จัดรูปค่าก่อน (ตัดจุลภาคหลักพัน, "ํ" → °, `L101 x W52` → `101x52`, `150 g` → `150g`) แล้วแยก 3 ชุด — `exact` (ชิ้นที่มีตัวอักษร ตัวเลขเปล่าไม่นับ), `shape` (เลขแต่ละหลักเป็น # เช่น `###g` ไม่ชน `#g` ของ 4G) น้ำหนัก 0.7, `loose` (เลขทุกชุดเป็น # เฉพาะรูปที่มีโครง เช่น `#x#x#mm`) น้ำหนัก 0.6 · เทียบกับค่าของแต่ละหัวข้อ (สูงสุด 60 ค่า, `suggestionIndex()` สร้างครั้งเดียวต่อแผน) · ค่าใน `GENERIC_VALUES` ("มี", "ไม่มี", …) ไม่ใช้ · **ชื่อคล้ายกัน**: ชื่อซ้อนกัน 0.9 หรือ fuse.js · **หมวด**: +0.15 ให้หัวข้อที่สินค้าหมวดเดียวกัน (ของแถวที่ใช้ชื่อนั้น) มีค่าอยู่ ให้เฉพาะตัวที่ผ่านเกณฑ์ข้างบนแล้ว · `unknown_attributes[].samples` = ค่าในไฟล์ไม่เกิน 3 ค่า
- `ready` = ไม่มี error + ไม่มี pending + มีอย่างน้อย 1 อย่างที่ต้องเขียน

### `GET /api/admin/dashboard` — สถิติหน้าแรกของแอดมิน (2026-09-08)

รับ `?start=YYYY-MM-DD&end=YYYY-MM-DD` (ไม่ส่ง = 30 วันล่าสุด) คืน:

```json
{
  "range": { "start": "...", "end": "..." },
  "website_views": 0,        // tbl_logs: type='view' ทั้งหมดในช่วง
  "product_views": 0,        // tbl_logs: type='view' AND page='product-single'
  "total_products": 12,      // tbl_item ที่ itm_flag <> '0'
  "total_shops": 14,         // tbl_shop ที่ flag <> '0'
  "top_products": [ { "product_id": "itm-0000017", "product_name": "...", "product_price": 5990, "views": 312 } ]
}
```

`top_products` ต้องดึง slug ออกจาก **ข้อความ** ของ log (`message = 'การเข้าดูสินค้า : car-camera-n6'`)
ด้วย `split_part(message, ':', 2)` แล้ว join กลับเข้า `tbl_item.slug` — โครงสร้างต้นทางไม่ได้เก็บ
รหัสสินค้าเป็นคอลัมน์แยก เป็นข้อจำกัดของ `tbl_logs` เอง ไม่ใช่การออกแบบของโปรเจกต์นี้

### `POST /api/logs/view` — บันทึกการเข้าชมหน้าเว็บ (public, ไม่ต้อง auth)

รับ `{ "page": "home" | "products" | "compare" }` (ค่านอกลิสต์ตอบ 400) เรียกจาก `PublicLayout.vue`
ทุกครั้งที่เปลี่ยนเส้นทาง — **ยกเว้นหน้ารายละเอียดสินค้า** ที่ `GET /api/products/:id` บันทึกให้เอง
ฝั่ง server เป็น `page='product-single'` (กันนับซ้ำ) ดู `backend/src/utils/activityLog.js`

> **ไม่มีแล้ว** (ลบออกทั้งหมด 2026-09-01 พร้อมกับการสลับไปใช้ตารางจริง — ไม่มีตารางรองรับ): `GET/POST /api/admin/import` + `/import/template`, `GET /api/admin/search-logs` / `/view-logs` / `/compare-logs`, `/api/admin/synonyms`

---

## Rate limiting สรุป

| ขอบเขต | จำกัด |
|---|---|
| `/api/*` ทั้งหมด | 300 request / 15 นาที ต่อ IP |
| `/api/auth/*` | 10 request / 15 นาที ต่อ IP (เข้มกว่า กัน brute-force login) |
