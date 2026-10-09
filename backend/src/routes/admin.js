const express = require('express')
const router = express.Router()
const multer = require('multer')
const Fuse = require('fuse.js')
const { PrismaClient } = require('@prisma/client')
const authMiddleware = require('../middleware/auth')
const asyncHandler = require('../utils/asyncHandler')
const { saveImage } = require('../utils/imageStore')
const { resolveModels, buildGallery } = require('./products')
const { cleanText, safeUrl, sanitizeRichText, toPage, toLimit } = require('../utils/sanitize')
const { clearAll: clearPublicCache } = require('../utils/cache')
const { stripHtml } = require('../utils/stripHtml')
const prisma = new PrismaClient()
//ใช้ authMiddleware กับทุก router
router.use(authMiddleware)

// ===== ทำความสะอาดข้อมูลขาเข้าก่อนถึง handler (Week 15 — input sanitization) =====
// จุดเดียวคุมทุก endpoint ที่เขียนข้อมูล (มี 30 กว่าตัว) แทนที่จะไล่ใส่ทีละ handler
// แล้วมีวันหลุดจุดใดจุดหนึ่ง:
//   • ทุกข้อความ — ตัดอักขระควบคุม/ช่องว่างหัวท้าย + จำกัดความยาว
//   • ฟิลด์ที่เป็นลิงก์/รูป — ต้องเป็น http(s)/mailto/tel หรือ path ภายในระบบ
//     (/uploads/...) เท่านั้น ค่าอย่าง `javascript:alert(1)` กลายเป็น null เพราะ
//     ฟิลด์พวกนี้ถูกเอาไปใส่ :href / <iframe src> ตรงๆ บนหน้าสินค้าฝั่งลูกค้า
//     ซึ่ง Vue ไม่ได้กันให้ (Vue กันแค่ข้อความ ไม่กัน URL scheme)
//   • ฟิลด์รายละเอียดที่ยอมให้มี HTML — ตัดเฉพาะแท็ก/attribute ที่รันโค้ดได้
const URL_KEYS = /(url|link|thumbnail|icon|end_point)$/i
const RICH_TEXT_KEYS = /(description|information|content|detail)$/i
const MAX_TEXT_LENGTH = 2000

function sanitizeValue(key, value) {
  if (typeof value === 'string') {
    if (key === 'gallery' || URL_KEYS.test(key) || /image/i.test(key)) return safeUrl(value)
    if (RICH_TEXT_KEYS.test(key)) return sanitizeRichText(value)
    return cleanText(value, MAX_TEXT_LENGTH)
  }
  // อาร์เรย์ส่งชื่อ key เดิมลงไปด้วย เพื่อให้ gallery: [path, path] ถูกมองเป็นลิงก์
  // เหมือนกับตอนเป็นค่าเดี่ยว
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(key, item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitizeValue(k, v)]))
  }
  return value
}

router.use((req, _res, next) => {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    req.body = sanitizeValue('', req.body)
  }
  next()
})

// การเขียนข้อมูลทุกครั้งล้างแคช response ฝั่ง public ทิ้ง (utils/cache.js) — ไม่งั้น
// แก้หมวดหมู่/แบนเนอร์/สาขา/footer แล้วต้องรอแคชหมดอายุถึงจะเห็นของใหม่ ล้างทั้งก้อน
// ไปเลยเพราะของที่แคชไว้มีไม่กี่ชิ้นและโหลดใหม่ถูกมาก ไม่ต้องมานั่งไล่ว่า endpoint
// ไหนกระทบแคชตัวไหนบ้าง (แคชผิดชุดแล้วดีบักยากกว่าโหลดใหม่เยอะ)
router.use((req, res, next) => {
  if (req.method === 'GET') return next()
  res.on('finish', () => {
    if (res.statusCode < 400) clearPublicCache()
  })
  next()
})

// นำเข้าสินค้า/สเปคจาก Excel — แยกไฟล์เพราะยาว แต่ mount ตรงนี้ให้ผ่าน JWT/sanitize/ล้างแคชด้านบน
router.use('/import', require('./adminImport'))

// Fuzzy Search (fuse.js) — ระบบค้นหาฝั่งแอดมิน แยกคนละตัวกับฝั่ง public
// (ฝั่ง public อยู่ที่ routes/search.js ซึ่งมีชั้นตัดคำไทย/คำพ้อง/AND/จัดอันดับครบ
//  ส่วนตรงนี้จงใจให้เรียบง่าย เพราะแอดมินรู้ชื่อสินค้าที่ตัวเองหาอยู่แล้ว)
//
// ค้นด้วย fuse.js (ทนคำพิมพ์ผิด/ใกล้เคียง) เทียบชื่อสินค้าเพียงฟิลด์เดียว —
// ใช้แค่ที่นี่ (ช่องค้นหาในหน้า "สินค้าของฉัน") จึงย้ายมาอยู่ในไฟล์นี้ตรงๆ
// แทนที่จะ import จาก search.js (ตัวค้นหาหลักฝั่ง public มี fuse config ของ
// ตัวเองแยกต่างหาก ไม่ได้เรียกใช้ฟังก์ชันนี้อยู่แล้ว)
function fuzzyFilterProducts(items, q) {
  const term = String(q).trim()
  if (!term) return items
  return new Fuse(
    items.map((item) => ({ item, product_name: item.itm_desc })),
    { keys: ['product_name'], threshold: 0.3, ignoreLocation: true }
  )
    .search(term)
    .map((r) => r.item.item)
}
//ฟังก์ชันสำหรับแปลงค่าวันที่
function parseDateOrNull(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}
//ฟังก์ชันสำหรับแปลงค่าตัวเลข
function parseNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}
//ฟังก์ชันสำหรับสร้างรหัสสินค้าอัตโนมัติ
async function nextCode(model, field, prefix, pad) {
  const rows = await prisma[model].findMany({ select: { [field]: true } })
  const re = new RegExp(`^${prefix}-?0*(\\d+)$`)
  let max = 0
  for (const row of rows) {
    const m = String(row[field] ?? '').match(re)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}-${String(max + 1).padStart(pad, '0')}`
}
const nextItemCode = () => nextCode('tbl_item', 'itm_code', 'itm', 7)
const nextItemTypeCode = () => nextCode('tbl_item_type', 'itm_type_code', 'PT', 5)
const nextModelCode = () => nextCode('tbl_item_model', 'itm_model_code', 'MD', 7)
const nextOptionCode = () => nextCode('tbl_item_option', 'itm_option_code', 'OP', 7)

// 2026-09-02 — the product-detail page now routes on tbl_item.slug instead
// of the bare itm_code (production already had a real, unique, readable
// slug filled in for every active item — see utils/slug.ts's productSlug()
// on the frontend). An admin who leaves the "Slug url" field blank gets one
// generated from the product name here, the same way the old (pre-schema-
// swap) admin form used to auto-fill it — except now it MUST be unique
// (it's a routable URL, not just an SEO nicety any more), so a collision
// gets "-2", "-3", ... appended until it's free.
function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function resolveSlug(desiredSlug, productName, excludeItmCode) {
  const base = slugify(desiredSlug) || slugify(productName) || 'product'
  let candidate = base
  let suffix = 2
  for (; ;) {
    const existing = await prisma.tbl_item.findFirst({ where: { slug: candidate } })
    if (!existing || existing.itm_code === excludeItmCode) return candidate
    candidate = `${base}-${suffix}`
    suffix++
  }
}

// รูปเก็บที่ไหนตัดสินใน utils/imageStore.js — database/uploads/products/<ปี-เดือน>/ (Docker)
// หรือ Supabase Storage (Vercel ดิสก์อ่านอย่างเดียว) · DB ได้ path /uploads/products/... แบบเดียวกันทั้งสองแบบ
// multer ถือไฟล์ไว้ในหน่วยความจำ (≤5MB) แล้วส่งต่อให้ imageStore เขียนจริง
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const IMAGE_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED_IMAGE_TYPES.includes(file.mimetype)),
})
//อัพโหลดรูปสินค้า
router.post('/upload/image', (req, res, next) => {
  upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ message: 'อัปโหลดรูปไม่สำเร็จ' })
    if (!req.file) return res.status(400).json({ message: 'ไฟล์ไม่ถูกต้อง (รองรับ jpeg/png/webp/gif ขนาดไม่เกิน 5MB)' })
    try {
      // นามสกุลตามชนิดไฟล์ที่ผ่าน fileFilter ไม่ใช่ชื่อไฟล์ที่ผู้ใช้ส่งมา — กัน evil.php ที่อ้างตัวเป็น image/png
      const { url } = await saveImage({ buffer: req.file.buffer, ext: IMAGE_EXT[req.file.mimetype] })
      res.json({ url })
    } catch (e) {
      next(e)
    }
  })
})
//แปลงข้อมูลสินค้าให้อยู่ในรูปแบบที่ต้องการ
function toAdminProductShape(item) {
  return {
    product_id: item.itm_code,
    sku: item.itm_sku,
    product_name: item.itm_desc,
    product_price: item.itm_price,
    is_active: item.itm_flag === '1',
    product_image: item.itm_image_master || null,
    category: item.item_type
      ? { category_id: item.item_type.itm_type_code, category_name: item.item_type.itm_type_desc }
      : null,
    _count: { product_model: (item.itm_model_code || '').split(',').filter((s) => s.trim()).length },
    // Additive — "สินค้าใหม่" (AdminNewProductsPage.vue, 2026-09-03) filters
    // the same product list client-side by these instead of a new endpoint.
    sale_start_date: item.pb_dt,
    sale_end_date: item.exp_dt,
    // Additive — หน้า "สินค้าที่ถูกลบ" (?deleted=1) โชว์วันที่ลบกำกับแต่ละแถว
    removed_at: item.rm_dt,
  }
}
// ===== DASHBOARD (tbl_logs) — "หน้าแรก" =====
// สถิติทั้งหมดอ่านจาก tbl_logs ซึ่งเป็นตารางบันทึกกิจกรรมจริงของ
// dtcshops.com ที่ restore มาพร้อมดัมป์ (39,395 แถวถึง 3 ส.ค. 2026) และ
// ฝั่ง public ของโปรเจกต์นี้เขียนต่อเข้าไปด้วยตั้งแต่ 8 ก.ย. 2026
// (ดู utils/activityLog.js) — ไม่ได้สร้างตารางสถิติใหม่ของตัวเอง
//
// สินค้าที่ถูกเข้าชมถูกเก็บเป็น "slug ฝังอยู่ในข้อความ" ไม่ใช่คอลัมน์แยก
// (message = 'การเข้าดูสินค้า : car-camera-n6') จึงต้องตัดเอา slug ออกมา
// ด้วย split_part แล้วค่อย join กลับเข้า tbl_item.slug — เป็นข้อจำกัดของ
// โครงสร้างต้นทาง ไม่ใช่การออกแบบของโปรเจกต์นี้
router.get('/dashboard', asyncHandler(async (req, res) => {
  const now = new Date()
  const end = parseDateOrNull(req.query.end) || now
  const start = parseDateOrNull(req.query.start) || new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)
  // ครอบคลุมทั้งวันของ end (ผู้ใช้เลือกเป็นวัน ไม่ใช่เวลา)
  const endOfDay = new Date(end)
  endOfDay.setHours(23, 59, 59, 999)
  const startOfDay = new Date(start)
  startOfDay.setHours(0, 0, 0, 0)

  const viewWindow = {
    type: 'view',
    created_at: { gte: startOfDay, lte: endOfDay },
  }

  const [websiteViews, productViews, totalProducts, totalShops, topRows] = await Promise.all([
    prisma.tbl_logs.count({ where: viewWindow }),
    prisma.tbl_logs.count({ where: { ...viewWindow, page: 'product-single' } }),
    prisma.tbl_item.count({ where: { itm_flag: { not: '0' } } }),
    prisma.tbl_shop.count({ where: { flag: { not: '0' } } }),
    prisma.$queryRaw`
      SELECT i.itm_code    AS product_id,
             i.itm_desc    AS product_name,
             i.itm_price   AS product_price,
             COUNT(*)::int AS views
        FROM tbl_logs l
        JOIN tbl_item i ON i.slug = btrim(split_part(l.message, ':', 2))
       WHERE l.type = 'view'
         AND l.page = 'product-single'
         AND l.created_at BETWEEN ${startOfDay} AND ${endOfDay}
       GROUP BY i.itm_code, i.itm_desc, i.itm_price
       ORDER BY views DESC, i.itm_code ASC
       LIMIT 10
    `,
  ])

  res.json({
    range: { start: startOfDay, end: endOfDay },
    website_views: websiteViews,
    product_views: productViews,
    total_products: totalProducts,
    total_shops: totalShops,
    top_products: topRows.map((row) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      product_price: row.product_price === null ? null : Number(row.product_price),
      views: row.views,
    })),
  })
}))

//แสดงสินค้า
router.get('/products', asyncHandler(async (req, res) => {
  const { q = '', deleted = '' } = req.query
  const limit = toLimit(req.query.limit, 50, 500)
  // ตัดสินค้าที่ลบไปแล้ว (soft delete, itm_flag='0' — ดู DELETE /products/:id
  // ด้านล่าง) ออกจากลิสต์เสมอ — เดิมไม่มีเงื่อนไขนี้เลย ทำให้กด "ลบ" แล้วแถวยัง
  // ค้างอยู่ในตาราง (ลบสำเร็จจริงฝั่ง DB แต่ตารางไม่ยอมหายไปให้เห็น)
  // ?deleted=1 กลับด้านเงื่อนไข — ใช้กับหน้า "สินค้าที่ถูกลบ" (ถังขยะ) เพื่อ
  // แสดงเฉพาะแถวที่ itm_flag='0' ให้กู้คืนได้ (ดู PUT /products/:id/restore)
  const where = { itm_flag: deleted ? '0' : { not: '0' } }
  // ค้นด้วย fuse.js ต้องดึงทุกแถวมาก่อนแล้วกรอง/เรียงในโค้ด (fuzzy match ทำใน
  // SQL ตรงๆ ไม่ได้) — แคตตาล็อกมีแค่หลักสิบแถว ไม่กระทบ perf
  let items = await prisma.tbl_item.findMany({
    where,
    include: { item_type: true },
    // ใหม่สุดอยู่บน เก่าสุดอยู่ล่าง — สินค้าที่นำเข้าชุดเดียวกันมี ist_dt เท่ากันเป๊ะ
    // (29 ตัว) ลำดับในกลุ่มนั้นจะสุ่มสลับ จึงใช้ itm_code (รันเลขตามลำดับที่สร้าง) ตัดสินต่อ
    orderBy: [{ ist_dt: 'desc' }, { itm_code: 'desc' }],
  })
  if (q) items = fuzzyFilterProducts(items, q)
  const total = items.length
  res.json({ products: items.slice(0, limit).map(toAdminProductShape), total })
}))

router.get('/products/:id', asyncHandler(async (req, res) => {
  const item = await prisma.tbl_item.findFirst({
    where: { itm_code: String(req.params.id) },
    include: { item_type: true, attribute_values: { include: { attribute: true } } },
  })
  if (!item) return res.status(404).json({ message: 'ไม่พบสินค้า' })
  const models = await resolveModels(item)
  res.json({
    ...toAdminProductShape(item),
    category_id: item.itm_type_code,
    description: stripHtml(item.itm_information),
    shopee_link: item.itm_shopee_end_point,
    lazada_link: item.itm_lazada_end_point,
    tiktok_link: item.itm_tiktok_end_point,
    line_link: item.itm_line_end_point,
    warranty_text: item.itm_guarantee,
    shipping_text: item.itm_shipping,
    stock_quantity: item.itm_qty,
    sold_count: item.itm_sold,
    sale_start_date: item.pb_dt,
    sale_end_date: item.exp_dt,
    slug: item.slug,
    canonical_url: item.canonical_url,
    seo_title: item.seo_title,
    seo_description: item.seo_desc,
    video_url: item.itm_video_master,
    tags: (item.itm_tags || '').split(',').map((t) => t.trim()).filter(Boolean),
    product_attribute_value: item.attribute_values
      .filter((v) => v.model_code == null)
      .map((v) => ({
        value: v.value,
        attribute: { attribute_id: v.attribute_code, attribute_name: v.attribute.attribute_name },
      })),
    product_gallery: buildGallery(item),
    product_model: models,
    option_ids: (item.itm_option_code || '').split(',').map((c) => c.trim()).filter(Boolean),
  })
}))
//บันทึกคุณสมบัติของสินค้า
async function applyProductAttributes(itm_code, attributes, model_code = null) {
  await prisma.tbl_attribute_value.deleteMany({ where: { itm_code, model_code } })
  for (const attr of attributes || []) {
    const value = String(attr.value ?? '').trim()
    if (!value) continue
    let attributeCode = attr.attribute_id ?? null
    if (!attributeCode && attr.attribute_name) {
      const name = String(attr.attribute_name).trim()
      if (!name) continue
      const existing = await prisma.tbl_attribute.findFirst({ where: { attribute_name: name } })
      attributeCode = existing
        ? existing.attribute_code
        : (await prisma.tbl_attribute.create({ data: { attribute_name: name, flag: '1', ist_dt: new Date() } })).attribute_code
    }
    if (!attributeCode) continue
    await prisma.tbl_attribute_value.create({
      data: { itm_code, attribute_code: attributeCode, value, model_code, flag: '1', ist_dt: new Date() },
    })
  }
}

// โมเดลสินค้า (tbl_item_model) เป็น shared catalog ตั้งแต่ 2026-09-03 —
// ไม่ได้ "เป็นของ" สินค้าตัวเดียวตายตัวอีกต่อไป แก้ไขชื่อ/ราคา/สต็อก/สเปคย่อย
// ทำที่หน้า "โมเดลสินค้า" รวม (AdminModelsPage.vue) เท่านั้น — ฟอร์มแก้ไขสินค้า
// แต่ละชิ้นแค่ "ติ๊กเลือก" ว่าจะใช้โมเดลไหนบ้าง (checkbox) แล้วส่ง modelIds
// (รายการ itm_model_code ทั้งหมดที่ติ๊กไว้) มาที่นี่ — ติ๊กโมเดลที่ตอนนี้เป็นของ
// สินค้าอื่นอยู่ = "แย่ง" มาเป็นของสินค้านี้แทน (ถอดออกจากลิสต์ของเจ้าของเดิม)
// ถอนติ๊ก = แค่ปลดออกจากสินค้านี้ ไม่ลบแถว tbl_item_model ทิ้ง (โมเดลยังอยู่ใน
// คลังกลาง รอสินค้าไหนติ๊กเลือกใหม่ก็ได้)
async function reassignProductModels(itm_code, modelIds) {
  const wanted = Array.from(new Set((modelIds || []).map((id) => String(id).trim()).filter(Boolean)))
  if (wanted.length > 0) {
    const otherOwners = await prisma.tbl_item.findMany({
      where: { itm_model_code: { not: null }, itm_code: { not: itm_code } },
      select: { itm_code: true, itm_model_code: true },
    })
    for (const owner of otherOwners) {
      const codes = (owner.itm_model_code || '').split(',').map((c) => c.trim()).filter(Boolean)
      const stillOwned = codes.filter((c) => !wanted.includes(c))
      if (stillOwned.length !== codes.length) {
        await prisma.tbl_item.update({ where: { itm_code: owner.itm_code }, data: { itm_model_code: stillOwned.join(',') || null } })
      }
    }
  }
  return wanted.join(',')
}

// ตัวเลือกสินค้า / อุปกรณ์เสริม (tbl_item_option) — shared catalog เหมือนโมเดล
// แต่ "ใช้ร่วมกันได้" ไม่ต้องแย่งเจ้าของ: สินค้าหลายตัวติ๊กตัวเลือกเดียวกันพร้อมกันได้
// (เช่น SD Card 64GB ใช้ได้กับกล้องหลายรุ่น) จึงแค่เขียนทับรายการของสินค้านี้ตัวเดียว
// ไม่ไปยุ่งกับ itm_option_code ของสินค้าอื่นเลย — ต่างจาก reassignProductModels()
function normalizeOptionIds(optionIds) {
  return Array.from(new Set((optionIds || []).map((id) => String(id).trim()).filter(Boolean))).join(',')
}

function computePriceRange(basePrice, modelRows) {
  const priced = modelRows.map((r) => basePrice + (r.itm_model_addon_price ?? 0))
  if (priced.length === 0) return { lowest: basePrice, highest: basePrice }
  return { lowest: Math.min(...priced), highest: Math.max(...priced) }
}

function galleryToImageColumns(gallery) {
  const paths = (gallery || []).filter((p) => typeof p === 'string' && p.trim()).slice(0, 10)
  const data = { itm_image_master: paths[0] ?? null }
  for (let i = 1; i <= 9; i++) data[`itm_image_sub${i}`] = paths[i] ?? null
  return data
}

function baseFieldsFromBody(body) {
  return {
    itm_sku: body.sku ? String(body.sku).trim() : null,
    itm_desc: String(body.product_name ?? '').trim(),
    itm_type_code: body.category_id ? String(body.category_id) : null,
    itm_information: body.description ?? null,
    itm_qty: parseNumberOrNull(body.stock_quantity),
    itm_sold: parseNumberOrNull(body.sold_count),
    pb_dt: parseDateOrNull(body.sale_start_date),
    exp_dt: parseDateOrNull(body.sale_end_date),
    itm_shopee_end_point: body.shopee_link || null,
    itm_lazada_end_point: body.lazada_link || null,
    itm_tiktok_end_point: body.tiktok_link || null,
    itm_line_end_point: body.line_link || null,
    itm_guarantee: body.warranty_text || null,
    itm_shipping: body.shipping_text || null,
    canonical_url: body.canonical_url || null,
    seo_title: body.seo_title || null,
    seo_desc: body.seo_description || null,
    itm_video_master: body.video_url || null,
    itm_tags: Array.isArray(body.tags) && body.tags.length > 0 ? body.tags.join(', ').slice(0, 255) : null,
    ...galleryToImageColumns(body.gallery),
  }
}
//เพิ่มสินค้า
router.post('/products', asyncHandler(async (req, res) => {
  const sku = req.body.sku ? String(req.body.sku).trim() : ''
  const productName = String(req.body.product_name ?? '').trim()
  if (!productName) {
    return res.status(400).json({ message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบ', code: 'missingRequiredFields' })
  }
  if (sku) {
    const dup = await prisma.tbl_item.findFirst({ where: { itm_sku: sku } })
    if (dup) return res.status(409).json({ message: 'มีสินค้าที่ใช้ SKU นี้อยู่แล้ว', code: 'duplicateSku' })
  }

  const basePrice = parseNumberOrNull(req.body.product_price) ?? 0
  const itm_code = await nextItemCode()
  const slug = await resolveSlug(req.body.slug, productName, itm_code)

  await prisma.tbl_item.create({
    data: {
      itm_code,
      itm_flag: '1',
      itm_price: basePrice,
      itm_lowest_price: basePrice,
      itm_highest_price: basePrice,
      ist_dt: new Date(),
      slug,
      ...baseFieldsFromBody(req.body),
    },
  })

  const itm_model_code = await reassignProductModels(itm_code, req.body.model_ids)
  const itm_option_code = normalizeOptionIds(req.body.option_ids)
  await applyProductAttributes(itm_code, req.body.attributes)

  const modelRows = itm_model_code
    ? await prisma.tbl_item_model.findMany({ where: { itm_model_code: { in: itm_model_code.split(',') } } })
    : []
  const { lowest, highest } = computePriceRange(basePrice, modelRows)
  await prisma.tbl_item.update({
    where: { itm_code },
    data: {
      itm_model_code: itm_model_code || null,
      itm_option_code: itm_option_code || null,
      itm_lowest_price: lowest,
      itm_highest_price: highest,
    },
  })

  res.status(201).json({ message: 'เพิ่มสินค้าแล้ว', product_id: itm_code })
}))
//แก้ไข
router.put('/products/:id', asyncHandler(async (req, res) => {
  const itm_code = String(req.params.id)
  const existing = await prisma.tbl_item.findFirst({ where: { itm_code } })
  if (!existing) return res.status(404).json({ message: 'ไม่พบสินค้า' })

  const sku = req.body.sku ? String(req.body.sku).trim() : ''
  const productName = String(req.body.product_name ?? '').trim()
  if (!productName) {
    return res.status(400).json({ message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบ', code: 'missingRequiredFields' })
  }
  if (sku) {
    const dup = await prisma.tbl_item.findFirst({ where: { itm_sku: sku, itm_code: { not: itm_code } } })
    if (dup) return res.status(409).json({ message: 'มีสินค้าที่ใช้ SKU นี้อยู่แล้ว', code: 'duplicateSku' })
  }

  const basePrice = parseNumberOrNull(req.body.product_price) ?? 0
  // Blank input keeps the existing slug (editing the name shouldn't quietly
  // change a URL someone may already have bookmarked/shared) — only falls
  // back to deriving one from the name if this product never had one.
  const slug = await resolveSlug(req.body.slug || existing.slug, productName, itm_code)

  await prisma.tbl_item.update({
    where: { itm_code },
    data: { itm_price: basePrice, mdf_dt: new Date(), slug, ...baseFieldsFromBody(req.body) },
  })

  // โมเดล = shared catalog แล้ว (ดูคอมเมนต์บน reassignProductModels()) —
  // ถอนติ๊กแค่ปลดออกจากสินค้านี้ ไม่ลบแถว tbl_item_model ทิ้งอีกต่อไป
  const itm_model_code = await reassignProductModels(itm_code, req.body.model_ids)
  // ไม่ส่ง option_ids มา (undefined) = ไม่แตะตัวเลือกเดิม เผื่อมีจุดอื่นเรียก PUT นี้
  // แบบไม่ได้ส่งฟิลด์นี้มาด้วย จะได้ไม่ล้างตัวเลือกทิ้งโดยไม่ตั้งใจ
  const itm_option_code = req.body.option_ids === undefined ? undefined : normalizeOptionIds(req.body.option_ids)
  await applyProductAttributes(itm_code, req.body.attributes)

  const modelRows = itm_model_code
    ? await prisma.tbl_item_model.findMany({ where: { itm_model_code: { in: itm_model_code.split(',') } } })
    : []
  const { lowest, highest } = computePriceRange(basePrice, modelRows)
  await prisma.tbl_item.update({
    where: { itm_code },
    data: {
      itm_model_code: itm_model_code || null,
      ...(itm_option_code === undefined ? {} : { itm_option_code: itm_option_code || null }),
      itm_lowest_price: lowest,
      itm_highest_price: highest,
    },
  })

  res.json({ message: 'บันทึกข้อมูลสินค้าแล้ว' })
}))
//ลบสินค้า
router.delete('/products/:id', asyncHandler(async (req, res) => {
  const itm_code = String(req.params.id)
  const existing = await prisma.tbl_item.findFirst({ where: { itm_code } })
  if (!existing) return res.status(404).json({ message: 'ไม่พบสินค้า' })
  await prisma.tbl_item.update({ where: { itm_code }, data: { itm_flag: '0', rm_dt: new Date() } })
  res.json({ message: 'ลบสินค้าแล้ว' })
}))
//กู้คืนสินค้าที่ถูกลบ (ย้อนกลับ soft delete ด้านบน) — ใช้ที่หน้า "สินค้าที่ถูกลบ"
router.put('/products/:id/restore', asyncHandler(async (req, res) => {
  const itm_code = String(req.params.id)
  const existing = await prisma.tbl_item.findFirst({ where: { itm_code } })
  if (!existing) return res.status(404).json({ message: 'ไม่พบสินค้า' })
  if (existing.itm_flag !== '0') return res.status(400).json({ message: 'สินค้านี้ไม่ได้ถูกลบอยู่' })
  await prisma.tbl_item.update({ where: { itm_code }, data: { itm_flag: '1', rm_dt: null, mdf_dt: new Date() } })
  res.json({ message: 'กู้คืนสินค้าแล้ว' })
}))
//แก้เฉพาะวันที่วางจำหน่าย (หน้า "สินค้าใหม่") — แยกจาก PUT /products/:id ที่เป็น full-replace
//ซึ่งบังคับ product_name และจะล้างรายละเอียด/รูป/สเปค/โมเดลทิ้งถ้าส่งมาไม่ครบก้อน
router.patch('/products/:id/sale-dates', asyncHandler(async (req, res) => {
  const itm_code = String(req.params.id)
  const existing = await prisma.tbl_item.findFirst({ where: { itm_code } })
  if (!existing) return res.status(404).json({ message: 'ไม่พบสินค้า' })

  const { sale_start_date, sale_end_date } = req.body
  const pb_dt = parseDateOrNull(sale_start_date)
  const exp_dt = parseDateOrNull(sale_end_date)
  // ส่งค่ามาแต่ parse ไม่ได้ = รูปแบบผิด (ต่างจากส่ง null/ว่าง ที่แปลว่าล้างวันที่)
  if ((sale_start_date && !pb_dt) || (sale_end_date && !exp_dt)) {
    return res.status(400).json({ message: 'รูปแบบวันที่ไม่ถูกต้อง' })
  }
  if (pb_dt && exp_dt && pb_dt > exp_dt) {
    return res.status(400).json({ message: 'วันที่จำหน่ายต้องไม่เกินวันที่สิ้นสุด' })
  }

  await prisma.tbl_item.update({ where: { itm_code }, data: { pb_dt, exp_dt, mdf_dt: new Date() } })
  res.json({ message: 'บันทึกวันที่จำหน่ายแล้ว', sale_start_date: pb_dt, sale_end_date: exp_dt })
}))

// ===== CATEGORIES (tbl_item_type) =====
//แสดงหมวดหมู่
router.get('/categories', asyncHandler(async (_req, res) => {
  const rows = await prisma.tbl_item_type.findMany({ orderBy: { itm_type_desc: 'asc' } })
  res.json(rows.map((r) => ({ category_id: r.itm_type_code, category_name: r.itm_type_desc })))
}))
//แสดงหมวดหมู่เดี่ยว — เพิ่ม 4 ก.ย. 2026 สำหรับหน้าฟอร์มแก้ไขเต็มหน้า
//(แทนที่ popup เดิม) คืนรายชื่อสินค้าที่อยู่ในหมวดนี้ด้วย (product_ids) ให้
//ฟอร์ม pre-check ตัวเลือกสินค้าได้ถูกต้อง
router.get('/categories/:id', asyncHandler(async (req, res) => {
  const itm_type_code = String(req.params.id)
  const row = await prisma.tbl_item_type.findUnique({ where: { itm_type_code } })
  if (!row) return res.status(404).json({ message: 'ไม่พบหมวดหมู่' })
  const members = await prisma.tbl_item.findMany({ where: { itm_type_code, itm_flag: { not: '0' } }, select: { itm_code: true } })
  res.json({ category_id: row.itm_type_code, category_name: row.itm_type_desc, thumbnail: row.thumbnail, product_ids: members.map((m) => m.itm_code) })
}))

// ย้ายสินค้าที่ "ติ๊ก" ไว้ (productIds) ให้มาอยู่หมวดหมู่นี้แทน (แย่งจากหมวด
// เดิมของสินค้านั้น — เหมือน reassignProductModels() ด้านล่าง) แล้วปลดสินค้า
// ที่เดิมอยู่หมวดนี้แต่ตอนนี้ไม่ได้ติ๊กแล้วออก (set เป็น NULL ไม่มีหมวดหมู่)
// — ใช้ทั้งตอนสร้างใหม่ (currentMembers ว่างเสมอ) และตอนแก้ไข
async function reassignCategoryMembers(itm_type_code, productIds) {
  const wanted = Array.from(new Set((productIds || []).map((id) => String(id).trim()).filter(Boolean)))
  const currentMembers = await prisma.tbl_item.findMany({ where: { itm_type_code }, select: { itm_code: true } })
  const toRemove = currentMembers.map((m) => m.itm_code).filter((id) => !wanted.includes(id))
  if (toRemove.length > 0) {
    await prisma.tbl_item.updateMany({ where: { itm_code: { in: toRemove } }, data: { itm_type_code: null, mdf_dt: new Date() } })
  }
  if (wanted.length > 0) {
    await prisma.tbl_item.updateMany({ where: { itm_code: { in: wanted } }, data: { itm_type_code, mdf_dt: new Date() } })
  }
}

//เพิ่มหมวดหมู่ — เพิ่ม 4 ก.ย. 2026: รับ product_ids (optional) มาผูกสินค้าที่
//เลือกไว้เข้าหมวดหมู่ใหม่นี้ทันทีตอนสร้าง (ย้ายจากหมวดหมู่เดิมของสินค้านั้น
//มาเป็นหมวดหมู่นี้แทน — tbl_item มีได้แค่ 1 หมวดหมู่ต่อสินค้า ไม่ใช่ many-to-many
//แบบโมเดล เลยแค่ update itm_type_code ตรงๆ ไม่ต้องมี join table)
router.post('/categories', asyncHandler(async (req, res) => {
  const name = String(req.body.category_name ?? '').trim()
  if (!name) return res.status(400).json({ message: 'กรุณากรอกชื่อหมวดหมู่', code: 'missingRequiredFields' })
  const itm_type_code = await nextItemTypeCode()
  const row = await prisma.tbl_item_type.create({
    data: { itm_type_code, itm_type_desc: name, thumbnail: req.body.thumbnail || null, itm_type_flag: '1', ist_dt: new Date() },
  })
  await reassignCategoryMembers(itm_type_code, req.body.product_ids)
  res.status(201).json({ category_id: row.itm_type_code, category_name: row.itm_type_desc })
}))
//แก้ไขหมวดหมู่ — product_ids (ถ้าส่งมา) แทนที่รายชื่อสินค้าในหมวดนี้ทั้งชุด
router.put('/categories/:id', asyncHandler(async (req, res) => {
  const name = String(req.body.category_name ?? '').trim()
  if (!name) return res.status(400).json({ message: 'กรุณากรอกชื่อหมวดหมู่', code: 'missingRequiredFields' })
  const itm_type_code = String(req.params.id)
  const row = await prisma.tbl_item_type.update({
    where: { itm_type_code },
    // thumbnail แก้เฉพาะตอนส่งมา — ไม่ส่ง = คงรูปเดิม (ไม่ล้างรูปทิ้งเงียบๆ)
    data: {
      itm_type_desc: name,
      ...(req.body.thumbnail !== undefined && { thumbnail: req.body.thumbnail || null }),
      mdf_dt: new Date(),
    },
  })
  if (req.body.product_ids !== undefined) {
    await reassignCategoryMembers(itm_type_code, req.body.product_ids)
  }
  res.json({ category_id: row.itm_type_code, category_name: row.itm_type_desc })
}))
//ลบหมวดหมู่
router.delete('/categories/:id', asyncHandler(async (req, res) => {
  const code = String(req.params.id)
  const inUse = await prisma.tbl_item.count({ where: { itm_type_code: code, itm_flag: '1' } })
  if (inUse > 0) {
    return res.status(400).json({ message: 'ลบไม่ได้ เนื่องจากมีสินค้าที่ใช้หมวดหมู่นี้อยู่', code: 'categoryInUse' })
  }
  await prisma.tbl_item_type.delete({ where: { itm_type_code: code } })
  res.json({ message: 'ลบหมวดหมู่แล้ว' })
}))

// ===== ATTRIBUTES (tbl_attribute) =====

// เพิ่ม 4 ก.ย. 2026 — ตั้งค่า "ค่าคุณสมบัตินี้" ของสินค้าที่เลือกไว้โดยตรงจาก
// ฟอร์มคุณสมบัติเอง (แทนที่จะต้องไปเปิดฟอร์มสินค้าทีละตัว) — full-replace
// pattern เดียวกับ applyProductAttributes()/reassignCategoryMembers(): ลบค่า
// ของสินค้าที่ไม่ได้อยู่ในรายการที่ส่งมาออก แล้ว upsert ค่าที่เหลือ — ทำงานกับ
// แถวระดับสินค้าเท่านั้น (model_code เป็น NULL) ไม่แตะค่าเฉพาะโมเดล
async function applyAttributeProductValues(attribute_code, values) {
  const wanted = (Array.isArray(values) ? values : [])
    .map((v) => ({ itm_code: String(v.product_id ?? '').trim(), value: String(v.value ?? '').trim() }))
    .filter((v) => v.itm_code && v.value)
  const wantedIds = wanted.map((v) => v.itm_code)
  if (wantedIds.length > 0) {
    await prisma.tbl_attribute_value.deleteMany({ where: { attribute_code, model_code: null, itm_code: { notIn: wantedIds } } })
  } else {
    await prisma.tbl_attribute_value.deleteMany({ where: { attribute_code, model_code: null } })
  }
  for (const v of wanted) {
    const existing = await prisma.tbl_attribute_value.findFirst({ where: { itm_code: v.itm_code, attribute_code, model_code: null } })
    if (existing) {
      await prisma.tbl_attribute_value.update({ where: { id: existing.id }, data: { value: v.value, mdf_dt: new Date() } })
    } else {
      await prisma.tbl_attribute_value.create({ data: { itm_code: v.itm_code, attribute_code, value: v.value, model_code: null, flag: '1', ist_dt: new Date() } })
    }
  }
}

//แสดงคุณสมบัติ
router.get('/attributes', asyncHandler(async (_req, res) => {
  const rows = await prisma.tbl_attribute.findMany({ orderBy: { attribute_name: 'asc' } })
  res.json(rows.map((r) => ({ attribute_id: r.attribute_code, attribute_name: r.attribute_name })))
}))
//แสดงคุณสมบัติเดี่ยว — เพิ่ม 4 ก.ย. 2026 สำหรับหน้าฟอร์มแก้ไขเต็มหน้า (แทนที่
//popup เดิม) — tbl_attribute ไม่มีความสัมพันธ์กับหมวดหมู่สินค้าเลย (ตาราง
//Category_attribute เดิมถูกลบไปตั้งแต่ 14 ส.ค. 2026) แต่คืนค่าที่สินค้าแต่ละ
//ตัวตั้งไว้แล้วสำหรับคุณสมบัตินี้ (product_values) ให้ฟอร์ม pre-fill ได้
router.get('/attributes/:id', asyncHandler(async (req, res) => {
  const attribute_code = Number(req.params.id)
  const row = await prisma.tbl_attribute.findUnique({ where: { attribute_code } })
  if (!row) return res.status(404).json({ message: 'ไม่พบคุณสมบัติ' })
  const values = await prisma.tbl_attribute_value.findMany({
    where: { attribute_code, model_code: null },
    include: { item: { select: { itm_code: true, itm_desc: true } } },
  })
  res.json({
    attribute_id: row.attribute_code,
    attribute_name: row.attribute_name,
    product_values: values.map((v) => ({ product_id: v.item.itm_code, product_name: v.item.itm_desc, value: v.value })),
  })
}))
// เพิ่มคุณสมบัติ — product_values (optional) ตั้งค่าให้สินค้าที่เลือกทันที
router.post('/attributes', asyncHandler(async (req, res) => {
  const name = String(req.body.attribute_name ?? '').trim()
  if (!name) return res.status(400).json({ message: 'กรุณากรอกชื่อคุณสมบัติ', code: 'missingRequiredFields' })
  const row = await prisma.tbl_attribute.create({ data: { attribute_name: name, flag: '1', ist_dt: new Date() } })
  if (req.body.product_values !== undefined) {
    await applyAttributeProductValues(row.attribute_code, req.body.product_values)
  }
  res.status(201).json({ attribute_id: row.attribute_code, attribute_name: row.attribute_name })
}))
//แก้ไขคุณสมบัติ — product_values (ถ้าส่งมา) แทนที่ค่าคุณสมบัตินี้ของสินค้าทั้งชุด
router.put('/attributes/:id', asyncHandler(async (req, res) => {
  const name = String(req.body.attribute_name ?? '').trim()
  if (!name) return res.status(400).json({ message: 'กรุณากรอกชื่อคุณสมบัติ', code: 'missingRequiredFields' })
  const attribute_code = Number(req.params.id)
  const row = await prisma.tbl_attribute.update({
    where: { attribute_code },
    data: { attribute_name: name, mdf_dt: new Date() },
  })
  if (req.body.product_values !== undefined) {
    await applyAttributeProductValues(attribute_code, req.body.product_values)
  }
  res.json({ attribute_id: row.attribute_code, attribute_name: row.attribute_name })
}))
//ลบคุณสมบัติ
router.delete('/attributes/:id', asyncHandler(async (req, res) => {
  try {
    await prisma.tbl_attribute.delete({ where: { attribute_code: Number(req.params.id) } })
    res.json({ message: 'ลบคุณสมบัติแล้ว' })
  } catch (err) {
    if (err.code === 'P2003') {
      return res.status(400).json({ message: 'ลบไม่ได้ เนื่องจากมีสินค้าที่ใช้คุณสมบัตินี้อยู่', code: 'attributeInUse' })
    }
    throw err
  }
}))

// Added 2026-09-03 — the sections below (ร้านค้า/แบนเนอร์/ข้อมูล Footer/
// โมเดลสินค้า) mirror the reference back-office's own sidebar — see
// database/schema.prisma's matching comment on why these tables needed a
// primary key added before any of this could work reliably. Same shape as
// CATEGORIES/ATTRIBUTES above: plain CRUD, no soft-delete despite the real
// `flag` column (this project's own admin never used flag='0' as a soft-
// delete convention for categories/attributes either — kept consistent
// rather than inventing a new pattern here).
//
// ลบออกแล้ว 10 ก.ย. 2026 — บทความ (tbl_articles) / โฆษณาร้านค้า
// (tbl_promotion) / ข้อมูล SEO (tbl_page): endpoint ทั้ง 3 ชุดถูกลบทิ้งตาม
// คำขอผู้ใช้ เพราะเป็นฟีเจอร์ของเว็บร้านค้าต้นแบบ ไม่ได้อยู่ในขอบเขตระบบ
// ค้นหา/เปรียบเทียบสินค้านี้ และหน้าแอดมินของทั้งสามถูกปิดเป็น placeholder
// ไปก่อนหน้านี้แล้ว (ไม่มีอะไรเรียกใช้เหลืออยู่) — ตารางในฐานข้อมูลยังอยู่
// ครบ ไม่ได้ DROP ทิ้ง
const nextShopId = () => nextCode('tbl_shop', 'shop_id', 'shop', 7)
const nextBannerCode = () => nextCode('tbl_bnn_slide', 'bnn_slide_code', 'bnn', 7)

// ===== SHOP BRANCHES (tbl_shop) — "ร้านค้า" > "ข้อมูลร้านค้า" =====
router.get('/shops', asyncHandler(async (req, res) => {
  const { q = '' } = req.query
  const rows = await prisma.tbl_shop.findMany({
    where: q ? { shop_name: { contains: String(q), mode: 'insensitive' } } : {},
    orderBy: { id: 'asc' },
  })
  res.json(rows)
}))
router.get('/shops/:id', asyncHandler(async (req, res) => {
  const row = await prisma.tbl_shop.findUnique({ where: { shop_id: String(req.params.id) } })
  if (!row) return res.status(404).json({ message: 'ไม่พบร้านค้า' })
  res.json(row)
}))
router.post('/shops', asyncHandler(async (req, res) => {
  const shop_name = String(req.body.shop_name ?? '').trim()
  if (!shop_name) return res.status(400).json({ message: 'กรุณากรอกชื่อร้านค้า', code: 'missingRequiredFields' })
  const shop_id = await nextShopId()
  const row = await prisma.tbl_shop.create({
    data: {
      shop_id, shop_name,
      address: req.body.address || null,
      road: req.body.road || null,
      province: req.body.province || null,
      district: req.body.district || null,
      sub_district: req.body.sub_district || null,
      postcode: req.body.postcode || null,
      lat: req.body.lat || null,
      lon: req.body.lon || null,
      tel: req.body.tel || null,
      thumbnail: req.body.thumbnail || null,
      flag: '1',
      ist_dt: new Date(),
    },
  })
  res.status(201).json(row)
}))
router.put('/shops/:id', asyncHandler(async (req, res) => {
  const shop_name = String(req.body.shop_name ?? '').trim()
  if (!shop_name) return res.status(400).json({ message: 'กรุณากรอกชื่อร้านค้า', code: 'missingRequiredFields' })
  const row = await prisma.tbl_shop.update({
    where: { shop_id: String(req.params.id) },
    data: {
      shop_name,
      address: req.body.address || null,
      road: req.body.road || null,
      province: req.body.province || null,
      district: req.body.district || null,
      sub_district: req.body.sub_district || null,
      postcode: req.body.postcode || null,
      lat: req.body.lat || null,
      lon: req.body.lon || null,
      tel: req.body.tel || null,
      thumbnail: req.body.thumbnail || null,
      mdf_dt: new Date(),
    },
  })
  res.json(row)
}))
router.delete('/shops/:id', asyncHandler(async (req, res) => {
  await prisma.tbl_shop.delete({ where: { shop_id: String(req.params.id) } })
  res.json({ message: 'ลบร้านค้าแล้ว' })
}))

// ===== BANNERS (tbl_bnn_slide) — "แบนเนอร์" > "ข้อมูลแบนเนอร์" =====
router.get('/banners', asyncHandler(async (req, res) => {
  const { q = '' } = req.query
  const rows = await prisma.tbl_bnn_slide.findMany({
    where: q ? { bnn_slide_desc: { contains: String(q), mode: 'insensitive' } } : {},
    orderBy: { bnn_slide_index: 'asc' },
  })
  res.json(rows)
}))
router.get('/banners/:id', asyncHandler(async (req, res) => {
  const row = await prisma.tbl_bnn_slide.findUnique({ where: { bnn_slide_code: String(req.params.id) } })
  if (!row) return res.status(404).json({ message: 'ไม่พบแบนเนอร์' })
  res.json(row)
}))
router.post('/banners', asyncHandler(async (req, res) => {
  const bnn_slide_desc = String(req.body.bnn_slide_desc ?? '').trim()
  if (!bnn_slide_desc) return res.status(400).json({ message: 'กรุณากรอกชื่อแบนเนอร์', code: 'missingRequiredFields' })
  const bnn_slide_code = await nextBannerCode()
  const row = await prisma.tbl_bnn_slide.create({
    data: {
      bnn_slide_code, bnn_slide_desc,
      bnn_slide_index: parseNumberOrNull(req.body.bnn_slide_index) ?? 1,
      bnn_slide_information: req.body.bnn_slide_information || null,
      bnn_slide_end_point: req.body.bnn_slide_end_point || null,
      bnn_slide_tooltip: req.body.bnn_slide_tooltip || null,
      bnn_slide_seo: req.body.bnn_slide_seo || null,
      bnn_image_master: req.body.bnn_image_master || null,
      bnn_slide_flag: '1',
      pb_dt: parseDateOrNull(req.body.pb_dt),
      exp_dt: parseDateOrNull(req.body.exp_dt),
      ist_dt: new Date(),
    },
  })
  res.status(201).json(row)
}))
router.put('/banners/:id', asyncHandler(async (req, res) => {
  const bnn_slide_desc = String(req.body.bnn_slide_desc ?? '').trim()
  if (!bnn_slide_desc) return res.status(400).json({ message: 'กรุณากรอกชื่อแบนเนอร์', code: 'missingRequiredFields' })
  const row = await prisma.tbl_bnn_slide.update({
    where: { bnn_slide_code: String(req.params.id) },
    data: {
      bnn_slide_desc,
      bnn_slide_index: parseNumberOrNull(req.body.bnn_slide_index) ?? 1,
      bnn_slide_information: req.body.bnn_slide_information || null,
      bnn_slide_end_point: req.body.bnn_slide_end_point || null,
      bnn_slide_tooltip: req.body.bnn_slide_tooltip || null,
      bnn_slide_seo: req.body.bnn_slide_seo || null,
      bnn_image_master: req.body.bnn_image_master || null,
      pb_dt: parseDateOrNull(req.body.pb_dt),
      exp_dt: parseDateOrNull(req.body.exp_dt),
      mdf_dt: new Date(),
    },
  })
  res.json(row)
}))
router.delete('/banners/:id', asyncHandler(async (req, res) => {
  await prisma.tbl_bnn_slide.delete({ where: { bnn_slide_code: String(req.params.id) } })
  res.json({ message: 'ลบแบนเนอร์แล้ว' })
}))

// ===== FOOTER (tbl_footer) — "ข้อมูล Footer" (public GET already exists
// at routes/footer.js; this adds the admin-side write side) =====
router.get('/footer', asyncHandler(async (req, res) => {
  const { q = '' } = req.query
  const rows = await prisma.tbl_footer.findMany({
    where: q ? { name: { contains: String(q), mode: 'insensitive' } } : {},
    orderBy: [{ type: 'asc' }, { sequence: 'asc' }],
  })
  res.json(rows)
}))
router.post('/footer', asyncHandler(async (req, res) => {
  const name = String(req.body.name ?? '').trim()
  if (!name) return res.status(400).json({ message: 'กรุณากรอกชื่อ', code: 'missingRequiredFields' })
  const row = await prisma.tbl_footer.create({
    data: {
      name,
      title: req.body.title || null,
      type: req.body.type || 'text',
      url: req.body.url || null,
      image: req.body.image || null,
      head_title: req.body.head_title || null,
      sequence: parseNumberOrNull(req.body.sequence),
      flag: '1',
      created_at: new Date(),
    },
  })
  res.status(201).json(row)
}))
router.put('/footer/:id', asyncHandler(async (req, res) => {
  const name = String(req.body.name ?? '').trim()
  if (!name) return res.status(400).json({ message: 'กรุณากรอกชื่อ', code: 'missingRequiredFields' })
  const row = await prisma.tbl_footer.update({
    where: { id: Number(req.params.id) },
    data: {
      name,
      title: req.body.title || null,
      type: req.body.type || 'text',
      url: req.body.url || null,
      image: req.body.image || null,
      head_title: req.body.head_title || null,
      sequence: parseNumberOrNull(req.body.sequence),
      updated_at: new Date(),
    },
  })
  res.json(row)
}))
router.delete('/footer/:id', asyncHandler(async (req, res) => {
  await prisma.tbl_footer.delete({ where: { id: Number(req.params.id) } })
  res.json({ message: 'ลบข้อมูลแล้ว' })
}))

// ===== MODELS — aggregate list across every product (tbl_item_model),
// "สินค้า" > "โมเดลสินค้า" — a dedicated browse page in addition to the
// per-product tab already in the product-edit form. Models aren't linked
// to their parent product via a foreign key in production (see schema.prisma's
// comment on tbl_item) — the relation is tbl_item.itm_model_code holding a
// comma-separated list of codes, so this builds the reverse lookup itself. =====

// สแกนสินค้าทุกตัวที่มีโมเดลอยู่หา itm_code ของสินค้าแม่ที่ผูกกับ model_code นี้
// (ทำแบบ split-per-item เหมือน GET /models ด้านล่าง ไม่ใช้ `contains` ตรงๆ
// เพราะรหัสโมเดลตัวหนึ่งอาจเป็น substring ของอีกตัว เช่น "MD000001" กับ
// "MD0000010" — ถ้าใช้ contains จะจับคู่ผิดได้)
async function findParentByModelCode(model_code) {
  const items = await prisma.tbl_item.findMany({
    where: { itm_model_code: { not: null } },
    select: { itm_code: true, itm_model_code: true },
  })
  for (const item of items) {
    const codes = (item.itm_model_code || '').split(',').map((c) => c.trim()).filter(Boolean)
    if (codes.includes(model_code)) return item.itm_code
  }
  return null
}

router.get('/models', asyncHandler(async (req, res) => {
  const { q = '' } = req.query
  const [models, items] = await Promise.all([
    prisma.tbl_item_model.findMany({ orderBy: { itm_model_desc: 'asc' } }),
    // include item_type — needed so the list page (AdminModelsPage.vue) can
    // group models under the category of whichever product currently owns
    // them (added 4 ก.ย. 2026)
    prisma.tbl_item.findMany({
      where: { itm_model_code: { not: null } },
      select: { itm_code: true, itm_desc: true, itm_model_code: true, item_type: { select: { itm_type_code: true, itm_type_desc: true } } },
    }),
  ])
  const parentByModelCode = {}
  for (const item of items) {
    for (const code of (item.itm_model_code || '').split(',').map((c) => c.trim()).filter(Boolean)) {
      parentByModelCode[code] = {
        product_id: item.itm_code,
        product_name: item.itm_desc,
        category_id: item.item_type?.itm_type_code ?? null,
        category_name: item.item_type?.itm_type_desc ?? null,
      }
    }
  }
  // สเปคเฉพาะโมเดล ("คุณสมบัติย่อย") — ให้หน้านี้แก้ไขได้เองโดยไม่ต้องไปเปิด
  // ฟอร์มสินค้าแม่ (2026-09-03)
  const overrides = await prisma.tbl_attribute_value.findMany({
    where: { model_code: { in: models.map((m) => m.itm_model_code) } },
    include: { attribute: true },
  })
  const overridesByModel = new Map()
  for (const v of overrides) {
    if (!overridesByModel.has(v.model_code)) overridesByModel.set(v.model_code, [])
    overridesByModel.get(v.model_code).push({ value: v.value, attribute: { attribute_id: v.attribute_code, attribute_name: v.attribute.attribute_name } })
  }
  const term = String(q).trim().toLowerCase()
  const rows = models
    .map((m) => ({
      model_id: m.itm_model_code,
      model_name: m.itm_model_desc,
      product_price: m.itm_model_addon_price,
      stock_quantity: m.qty,
      updated_at: m.mdf_dt ?? m.ist_dt ?? null,
      product: parentByModelCode[m.itm_model_code] || null,
      product_attribute_value: overridesByModel.get(m.itm_model_code) || [],
    }))
    .filter((r) => !term || r.model_name?.toLowerCase().includes(term) || r.product?.product_name?.toLowerCase().includes(term))
  res.json(rows)
}))
//แสดงโมเดลเดี่ยว — เพิ่ม 4 ก.ย. 2026 สำหรับหน้าฟอร์มแก้ไขเต็มหน้า (แทนที่
//popup เดิม) — รูปแบบผลลัพธ์เดียวกับแถวใน GET /models ด้านบน
router.get('/models/:id', asyncHandler(async (req, res) => {
  const model_code = String(req.params.id)
  const model = await prisma.tbl_item_model.findUnique({ where: { itm_model_code: model_code } })
  if (!model) return res.status(404).json({ message: 'ไม่พบโมเดล' })
  const parent_itm_code = await findParentByModelCode(model_code)
  let product = null
  if (parent_itm_code) {
    const item = await prisma.tbl_item.findUnique({
      where: { itm_code: parent_itm_code },
      select: { itm_code: true, itm_desc: true, item_type: { select: { itm_type_code: true, itm_type_desc: true } } },
    })
    if (item) {
      product = {
        product_id: item.itm_code,
        product_name: item.itm_desc,
        category_id: item.item_type?.itm_type_code ?? null,
        category_name: item.item_type?.itm_type_desc ?? null,
      }
    }
  }
  const overrides = await prisma.tbl_attribute_value.findMany({ where: { model_code }, include: { attribute: true } })
  res.json({
    model_id: model.itm_model_code,
    model_name: model.itm_model_desc,
    product_price: model.itm_model_addon_price,
    stock_quantity: model.qty,
    product,
    product_attribute_value: overrides.map((v) => ({ value: v.value, attribute: { attribute_id: v.attribute_code, attribute_name: v.attribute.attribute_name } })),
  })
}))
// เพิ่มโมเดลใหม่จากหน้ารวม — ต้องระบุว่าผูกกับสินค้าตัวไหน (ต่างจากแก้ไข/ลบที่ไม่ต้องรู้
// เพราะกระทำกับ tbl_item_model โดยตรง) แล้วต่อโค้ดโมเดลใหม่เข้า itm_model_code
// (คอมม่าคั่น) ของสินค้านั้น — รูปแบบเดียวกับ applyProductModels() ที่ฟอร์มแก้ไขสินค้าใช้
router.post('/models', asyncHandler(async (req, res) => {
  const product_id = String(req.body.product_id ?? '').trim()
  const model_name = String(req.body.model_name ?? '').trim()
  if (!product_id) return res.status(400).json({ message: 'กรุณาเลือกสินค้า', code: 'missingRequiredFields' })
  if (!model_name) return res.status(400).json({ message: 'กรุณากรอกชื่อโมเดล', code: 'missingRequiredFields' })

  const item = await prisma.tbl_item.findUnique({ where: { itm_code: product_id } })
  if (!item) return res.status(404).json({ message: 'ไม่พบสินค้า' })

  const model_id = await nextModelCode()
  const addon = parseNumberOrNull(req.body.product_price) ?? 0
  const qty = parseNumberOrNull(req.body.stock_quantity) ?? 0
  await prisma.tbl_item_model.create({
    data: {
      itm_model_code: model_id,
      itm_model_desc: model_name,
      itm_model_flag: '1',
      itm_model_addon_price: addon,
      qty,
      ist_dt: new Date(),
    },
  })

  const existingCodes = (item.itm_model_code || '').split(',').map((c) => c.trim()).filter(Boolean)
  existingCodes.push(model_id)
  await prisma.tbl_item.update({ where: { itm_code: product_id }, data: { itm_model_code: existingCodes.join(',') } })

  // สเปคเฉพาะโมเดล — เพิ่ม 4 ก.ย. 2026 ให้กรอกได้ตั้งแต่ตอนสร้างเลย (ของเดิม
  // popup ตอนเพิ่มไม่มีช่องนี้ ต้องไปเปิดแก้ไขทีหลังถึงจะใส่ได้)
  let overrides = []
  if (Array.isArray(req.body.attributes) && req.body.attributes.length > 0) {
    await applyProductAttributes(product_id, req.body.attributes, model_id)
    const rows = await prisma.tbl_attribute_value.findMany({ where: { model_code: model_id }, include: { attribute: true } })
    overrides = rows.map((v) => ({ value: v.value, attribute: { attribute_id: v.attribute_code, attribute_name: v.attribute.attribute_name } }))
  }

  res.status(201).json({
    model_id,
    model_name,
    product_price: addon,
    stock_quantity: qty,
    product: { product_id: item.itm_code, product_name: item.itm_desc },
    product_attribute_value: overrides,
  })
}))
// เพิ่ม 4 ก.ย. 2026 — ย้ายความเป็นเจ้าของโมเดล model_code ไปให้สินค้า
// new_itm_code แทน (ถอดออกจากเจ้าของเดิมก่อนถ้ามี) ใช้ตอนแก้ไขโมเดลจากฟอร์ม
// เต็มหน้าใหม่ที่ให้สลับสินค้าที่ผูกได้ด้วย (เดิม popup ไม่มีให้แก้จุดนี้)
async function reassignModelOwner(model_code, new_itm_code) {
  const current_itm_code = await findParentByModelCode(model_code)
  if (current_itm_code === new_itm_code) return
  if (current_itm_code) {
    const owner = await prisma.tbl_item.findUnique({ where: { itm_code: current_itm_code } })
    const codes = (owner?.itm_model_code || '').split(',').map((c) => c.trim()).filter((c) => c && c !== model_code)
    await prisma.tbl_item.update({ where: { itm_code: current_itm_code }, data: { itm_model_code: codes.join(',') || null } })
  }
  if (new_itm_code) {
    const newOwner = await prisma.tbl_item.findUnique({ where: { itm_code: new_itm_code } })
    if (!newOwner) return
    const codes = (newOwner.itm_model_code || '').split(',').map((c) => c.trim()).filter(Boolean)
    if (!codes.includes(model_code)) codes.push(model_code)
    await prisma.tbl_item.update({ where: { itm_code: new_itm_code }, data: { itm_model_code: codes.join(',') } })
  }
}

router.put('/models/:id', asyncHandler(async (req, res) => {
  const model_code = String(req.params.id)
  const row = await prisma.tbl_item_model.update({
    where: { itm_model_code: model_code },
    data: {
      ...(req.body.model_name !== undefined ? { itm_model_desc: String(req.body.model_name).trim() } : {}),
      itm_model_addon_price: parseNumberOrNull(req.body.product_price),
      qty: parseNumberOrNull(req.body.stock_quantity) ?? 0,
      mdf_dt: new Date(),
    },
  })
  if (req.body.product_id !== undefined) {
    await reassignModelOwner(model_code, String(req.body.product_id).trim() || null)
  }
  // สเปคเฉพาะโมเดล ("คุณสมบัติย่อย") — ส่งมาก็แทนที่ทั้งชุด (full-replace
  // pattern เดียวกับ applyProductAttributes() ที่ฟอร์มสินค้าใช้), ไม่ส่งมา
  // (undefined) ก็ไม่แตะของเดิมเลย เผื่อมีจุดอื่นเรียก PUT นี้แค่แก้ราคา/สต็อก
  let overrides = []
  if (req.body.attributes !== undefined) {
    const itm_code = await findParentByModelCode(model_code)
    if (itm_code) {
      await applyProductAttributes(itm_code, req.body.attributes, model_code)
      const rows = await prisma.tbl_attribute_value.findMany({ where: { model_code }, include: { attribute: true } })
      overrides = rows.map((v) => ({ value: v.value, attribute: { attribute_id: v.attribute_code, attribute_name: v.attribute.attribute_name } }))
    }
  }
  res.json({
    model_id: row.itm_model_code,
    model_name: row.itm_model_desc,
    product_price: row.itm_model_addon_price,
    stock_quantity: row.qty,
    product_attribute_value: overrides,
  })
}))

// ลบโมเดลทิ้งจริง (ไม่ใช่ soft delete — ตรงกับที่ removedCodes ใน PUT /products/:id
// ทำอยู่แล้วเวลาเอาโมเดลออกจากฟอร์มสินค้า) สเปคเฉพาะโมเดล (tbl_attribute_value)
// ถูกลบตามอัตโนมัติผ่าน onDelete: Cascade บน model_code FK ไม่ต้องลบมือ
router.delete('/models/:id', asyncHandler(async (req, res) => {
  const model_code = String(req.params.id)
  const existing = await prisma.tbl_item_model.findUnique({ where: { itm_model_code: model_code } })
  if (!existing) return res.status(404).json({ message: 'ไม่พบโมเดล' })

  const itm_code = await findParentByModelCode(model_code)
  await prisma.tbl_item_model.delete({ where: { itm_model_code: model_code } })

  if (itm_code) {
    const item = await prisma.tbl_item.findUnique({ where: { itm_code } })
    const codes = (item?.itm_model_code || '').split(',').map((c) => c.trim()).filter((c) => c && c !== model_code)
    await prisma.tbl_item.update({ where: { itm_code }, data: { itm_model_code: codes.join(',') || null } })
  }

  res.json({ message: 'ลบโมเดลแล้ว' })
}))

// ===== OPTIONS (tbl_item_option) — "ตัวเลือกสินค้า" / อุปกรณ์เสริมที่ซื้อเพิ่มได้
// (SD Card, เซ็นเซอร์วัดน้ำมัน, เครื่องอ่านบัตร DLT ฯลฯ) คนละอย่างกับ "โมเดลสินค้า"
// ซึ่งเป็นรุ่นย่อยของตัวสินค้าเอง — ผูกกับสินค้าผ่าน tbl_item.itm_option_code
// (คอมม่าคั่น) และ *ไม่* ถูกดึงเข้าตารางเปรียบเทียบตามคำขอผู้ใช้ (2026-09-09) =====

//หาสินค้าทุกตัวที่ติ๊กใช้ตัวเลือกแต่ละตัวอยู่ (split-per-item กัน false positive
//จากรหัสที่เป็น substring ของกันเอง เช่น PTCARD038 กับ PTCARD038-1)
async function buildOptionUsage() {
  const items = await prisma.tbl_item.findMany({
    where: { itm_option_code: { not: null }, itm_flag: { not: '0' } },
    select: { itm_code: true, itm_desc: true, itm_option_code: true },
  })
  const usage = new Map()
  for (const item of items) {
    for (const code of (item.itm_option_code || '').split(',').map((c) => c.trim()).filter(Boolean)) {
      if (!usage.has(code)) usage.set(code, [])
      usage.get(code).push({ product_id: item.itm_code, product_name: item.itm_desc })
    }
  }
  return usage
}

function optionShape(row, products) {
  return {
    option_id: row.itm_option_code,
    option_name: row.itm_option_desc,
    addon_price: row.itm_option_addon_price ?? 0,
    stock_quantity: row.qty ?? 0,
    updated_at: row.mdf_dt ?? row.ist_dt ?? null,
    products: products || [],
  }
}

router.get('/options', asyncHandler(async (req, res) => {
  const { q = '' } = req.query
  const [rows, usage] = await Promise.all([
    prisma.tbl_item_option.findMany({
      where: { itm_option_flag: { not: '0' } },
      orderBy: { itm_option_desc: 'asc' },
    }),
    buildOptionUsage(),
  ])
  const term = String(q).trim().toLowerCase()
  res.json(
    rows
      .map((row) => optionShape(row, usage.get(row.itm_option_code)))
      .filter((r) => !term || r.option_name?.toLowerCase().includes(term))
  )
}))

router.get('/options/:id', asyncHandler(async (req, res) => {
  const option_code = String(req.params.id)
  const row = await prisma.tbl_item_option.findUnique({ where: { itm_option_code: option_code } })
  if (!row) return res.status(404).json({ message: 'ไม่พบตัวเลือกสินค้า' })
  const usage = await buildOptionUsage()
  res.json(optionShape(row, usage.get(option_code)))
}))

router.post('/options', asyncHandler(async (req, res) => {
  const option_name = String(req.body.option_name ?? '').trim()
  if (!option_name) return res.status(400).json({ message: 'กรุณากรอกชื่อตัวเลือกสินค้า', code: 'missingRequiredFields' })
  const option_id = await nextOptionCode()
  const row = await prisma.tbl_item_option.create({
    data: {
      itm_option_code: option_id,
      itm_option_desc: option_name,
      itm_option_flag: '1',
      itm_option_addon_price: parseNumberOrNull(req.body.addon_price) ?? 0,
      qty: parseNumberOrNull(req.body.stock_quantity) ?? 0,
      ist_dt: new Date(),
    },
  })
  // ผูกกับสินค้าที่เลือกไว้ตั้งแต่ตอนสร้าง (ต่อท้าย itm_option_code ของสินค้านั้น
  // ไม่ทับของเดิม เพราะสินค้าหนึ่งมีได้หลายตัวเลือกพร้อมกัน)
  const productIds = Array.isArray(req.body.product_ids) ? req.body.product_ids : []
  for (const product_id of productIds.map((id) => String(id).trim()).filter(Boolean)) {
    const item = await prisma.tbl_item.findUnique({ where: { itm_code: product_id } })
    if (!item) continue
    const codes = (item.itm_option_code || '').split(',').map((c) => c.trim()).filter(Boolean)
    if (!codes.includes(option_id)) codes.push(option_id)
    await prisma.tbl_item.update({ where: { itm_code: product_id }, data: { itm_option_code: codes.join(',') } })
  }
  const usage = await buildOptionUsage()
  res.status(201).json(optionShape(row, usage.get(option_id)))
}))

router.put('/options/:id', asyncHandler(async (req, res) => {
  const option_code = String(req.params.id)
  const existing = await prisma.tbl_item_option.findUnique({ where: { itm_option_code: option_code } })
  if (!existing) return res.status(404).json({ message: 'ไม่พบตัวเลือกสินค้า' })
  const row = await prisma.tbl_item_option.update({
    where: { itm_option_code: option_code },
    data: {
      ...(req.body.option_name !== undefined ? { itm_option_desc: String(req.body.option_name).trim() } : {}),
      ...(req.body.addon_price !== undefined ? { itm_option_addon_price: parseNumberOrNull(req.body.addon_price) ?? 0 } : {}),
      ...(req.body.stock_quantity !== undefined ? { qty: parseNumberOrNull(req.body.stock_quantity) ?? 0 } : {}),
      mdf_dt: new Date(),
    },
  })
  // ส่ง product_ids มา = กำหนดใหม่ทั้งชุดว่าตัวเลือกนี้ถูกใช้กับสินค้าไหนบ้าง
  if (req.body.product_ids !== undefined) {
    const wanted = new Set((req.body.product_ids || []).map((id) => String(id).trim()).filter(Boolean))
    const items = await prisma.tbl_item.findMany({
      where: { itm_flag: { not: '0' } },
      select: { itm_code: true, itm_option_code: true },
    })
    for (const item of items) {
      const codes = (item.itm_option_code || '').split(',').map((c) => c.trim()).filter(Boolean)
      const has = codes.includes(option_code)
      const should = wanted.has(item.itm_code)
      if (has === should) continue
      const next = should ? [...codes, option_code] : codes.filter((c) => c !== option_code)
      await prisma.tbl_item.update({ where: { itm_code: item.itm_code }, data: { itm_option_code: next.join(',') || null } })
    }
  }
  const usage = await buildOptionUsage()
  res.json(optionShape(row, usage.get(option_code)))
}))

// ลบแบบ soft delete (itm_option_flag='0' + rm_dt) ตรงกับที่ระบบจริงของ dtcshops ทำ
// — พร้อมปลดตัวเลือกนี้ออกจากสินค้าทุกตัวที่ติ๊กไว้ ไม่งั้นหน้าสินค้าจะยังโชว์ตัวเลือกผี
router.delete('/options/:id', asyncHandler(async (req, res) => {
  const option_code = String(req.params.id)
  const existing = await prisma.tbl_item_option.findUnique({ where: { itm_option_code: option_code } })
  if (!existing) return res.status(404).json({ message: 'ไม่พบตัวเลือกสินค้า' })

  await prisma.tbl_item_option.update({
    where: { itm_option_code: option_code },
    data: { itm_option_flag: '0', rm_dt: new Date() },
  })

  const items = await prisma.tbl_item.findMany({
    where: { itm_option_code: { not: null } },
    select: { itm_code: true, itm_option_code: true },
  })
  for (const item of items) {
    const codes = (item.itm_option_code || '').split(',').map((c) => c.trim()).filter(Boolean)
    if (!codes.includes(option_code)) continue
    const next = codes.filter((c) => c !== option_code)
    await prisma.tbl_item.update({ where: { itm_code: item.itm_code }, data: { itm_option_code: next.join(',') || null } })
  }

  res.json({ message: 'ลบตัวเลือกสินค้าแล้ว' })
}))

module.exports = router