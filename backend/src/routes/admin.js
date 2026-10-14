// API หลังบ้าน (/api/admin/*) — ทุกเส้นต้องมี JWT · ทำความสะอาด body และล้างแคชให้ทุกครั้งที่เขียน
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
router.use(authMiddleware)

// ทำความสะอาด body ทุกคำขอที่จุดเดียว: ข้อความตัดอักขระควบคุม · ลิงก์รับเฉพาะ http(s)/mailto/tel/path · HTML ตัดแท็กอันตราย
const URL_KEYS = /(url|link|thumbnail|icon|end_point)$/i
const RICH_TEXT_KEYS = /(description|information|content|detail)$/i
const MAX_TEXT_LENGTH = 2000

// ทำความสะอาดค่าตามชนิดฟิลด์ (ดูจากชื่อ key) — วนเข้าไปในอาร์เรย์/อ็อบเจ็กต์ด้วย
function sanitizeValue(key, value) {
  if (typeof value === 'string') {
    if (key === 'gallery' || URL_KEYS.test(key) || /image/i.test(key)) return safeUrl(value)
    if (RICH_TEXT_KEYS.test(key)) return sanitizeRichText(value)
    return cleanText(value, MAX_TEXT_LENGTH)
  }
  // อาร์เรย์ส่งชื่อ key เดิมลงไป ให้ gallery: [path] ถูกตรวจแบบลิงก์
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

// เขียนข้อมูลสำเร็จ = ล้างแคช public ทั้งหมด (ของที่แคชมีไม่กี่ชิ้น ล้างทั้งก้อนง่ายกว่าไล่ทีละตัว)
router.use((req, res, next) => {
  if (req.method === 'GET') return next()
  res.on('finish', () => {
    if (res.statusCode < 400) clearPublicCache()
  })
  next()
})

// นำเข้า Excel — mount ตรงนี้ให้ผ่าน JWT/sanitize/ล้างแคชด้านบน
router.use('/import', require('./adminImport'))

// ค้นชื่อสินค้าแบบทนพิมพ์ผิดในหน้า "สินค้าของฉัน" (เรียบง่ายกว่าตัวค้นหา public โดยตั้งใจ)
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
// ข้อความ → Date (ว่าง/ผิด = null)
function parseDateOrNull(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}
// ข้อความ → ตัวเลข (ว่าง/ผิด = null)
function parseNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}
// สร้างรหัสถัดไปจากรหัสมากสุดในตาราง (เช่น itm-0000085)
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

// slug ของสินค้า: ว่าง = สร้างจากชื่อ · ชนกับตัวอื่น = ต่อท้าย -2, -3, …
function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// หา slug ที่ไม่ซ้ำกับสินค้าอื่น
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

// multer เก็บไฟล์ในหน่วยความจำ (≤ 5MB) แล้วให้ utils/imageStore.js เขียนจริง (ดิสก์หรือ Supabase)
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const IMAGE_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED_IMAGE_TYPES.includes(file.mimetype)),
})
// POST /admin/upload/image
router.post('/upload/image', (req, res, next) => {
  upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ message: 'อัปโหลดรูปไม่สำเร็จ' })
    if (!req.file) return res.status(400).json({ message: 'ไฟล์ไม่ถูกต้อง (รองรับ jpeg/png/webp/gif ขนาดไม่เกิน 5MB)' })
    try {
      // นามสกุลตามชนิดไฟล์ที่ตรวจแล้ว ไม่ใช่ชื่อไฟล์ที่ส่งมา (กัน evil.php ปลอมเป็นรูป)
      const { url } = await saveImage({ buffer: req.file.buffer, ext: IMAGE_EXT[req.file.mimetype] })
      res.json({ url })
    } catch (e) {
      next(e)
    }
  })
})
// แถว tbl_item → รูปที่หน้ารายการสินค้าแอดมินใช้
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
    sale_start_date: item.pb_dt,
    sale_end_date: item.exp_dt,
    removed_at: item.rm_dt,
  }
}
// GET /admin/dashboard — สถิติจาก tbl_logs (สินค้าที่เข้าชมเก็บเป็น slug ใน message จึงต้อง split_part แล้ว join กลับ)
router.get('/dashboard', asyncHandler(async (req, res) => {
  const now = new Date()
  const end = parseDateOrNull(req.query.end) || now
  const start = parseDateOrNull(req.query.start) || new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)
  // รวมทั้งวันของวันสิ้นสุด
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

// GET /admin/products — รายการสินค้า (?deleted=1 = ถังขยะ · ?q = ค้นแบบทนพิมพ์ผิด)
router.get('/products', asyncHandler(async (req, res) => {
  const { q = '', deleted = '' } = req.query
  const limit = toLimit(req.query.limit, 50, 500)
  const where = { itm_flag: deleted ? '0' : { not: '0' } }
  let items = await prisma.tbl_item.findMany({
    where,
    include: { item_type: true },
    // ใหม่สุดก่อน แล้ว itm_code (สินค้านำเข้าชุดเดียวกันมี ist_dt เท่ากัน)
    orderBy: [{ ist_dt: 'desc' }, { itm_code: 'desc' }],
  })
  if (q) items = fuzzyFilterProducts(items, q)
  const total = items.length
  res.json({ products: items.slice(0, limit).map(toAdminProductShape), total })
}))

// GET /admin/products/:id — ข้อมูลเต็มสำหรับฟอร์มแก้ไข
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
// เขียนสเปคของสินค้า (หรือของโมเดล) แบบ full-replace
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

// ติ๊กโมเดลในฟอร์มสินค้า: ติ๊กโมเดลของสินค้าอื่น = แย่งมา · ถอนติ๊ก = ปลดออก ไม่ลบโมเดล
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

// รหัสตัวเลือกเสริม → ข้อความคอมม่าคั่น (ตัวเลือกใช้ร่วมกันหลายสินค้าได้ ไม่ต้องแย่ง)
function normalizeOptionIds(optionIds) {
  return Array.from(new Set((optionIds || []).map((id) => String(id).trim()).filter(Boolean))).join(',')
}

// ช่วงราคาของสินค้าจากราคาฐาน + ส่วนเพิ่มของแต่ละโมเดล
function computePriceRange(basePrice, modelRows) {
  const priced = modelRows.map((r) => basePrice + (r.itm_model_addon_price ?? 0))
  if (priced.length === 0) return { lowest: basePrice, highest: basePrice }
  return { lowest: Math.min(...priced), highest: Math.max(...priced) }
}

// รายการรูป → คอลัมน์รูปหลัก + รูปย่อย 9 ช่อง
function galleryToImageColumns(gallery) {
  const paths = (gallery || []).filter((p) => typeof p === 'string' && p.trim()).slice(0, 10)
  const data = { itm_image_master: paths[0] ?? null }
  for (let i = 1; i <= 9; i++) data[`itm_image_sub${i}`] = paths[i] ?? null
  return data
}

// body ของฟอร์ม → คอลัมน์ของ tbl_item
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
// POST /admin/products — เพิ่มสินค้า
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
// PUT /admin/products/:id — แก้สินค้าแบบ full-replace (ยกเว้น option_ids)
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
  // slug ว่าง = คง URL เดิม (อาจมีคนแชร์ไว้แล้ว)
  const slug = await resolveSlug(req.body.slug || existing.slug, productName, itm_code)

  await prisma.tbl_item.update({
    where: { itm_code },
    data: { itm_price: basePrice, mdf_dt: new Date(), slug, ...baseFieldsFromBody(req.body) },
  })

  const itm_model_code = await reassignProductModels(itm_code, req.body.model_ids)
  // ไม่ส่ง option_ids = ไม่แตะตัวเลือกเดิม
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
// DELETE /admin/products/:id — ลบแบบ soft (itm_flag='0')
router.delete('/products/:id', asyncHandler(async (req, res) => {
  const itm_code = String(req.params.id)
  const existing = await prisma.tbl_item.findFirst({ where: { itm_code } })
  if (!existing) return res.status(404).json({ message: 'ไม่พบสินค้า' })
  await prisma.tbl_item.update({ where: { itm_code }, data: { itm_flag: '0', rm_dt: new Date() } })
  res.json({ message: 'ลบสินค้าแล้ว' })
}))
// PUT /admin/products/:id/restore — กู้คืนสินค้าที่ถูกลบ
router.put('/products/:id/restore', asyncHandler(async (req, res) => {
  const itm_code = String(req.params.id)
  const existing = await prisma.tbl_item.findFirst({ where: { itm_code } })
  if (!existing) return res.status(404).json({ message: 'ไม่พบสินค้า' })
  if (existing.itm_flag !== '0') return res.status(400).json({ message: 'สินค้านี้ไม่ได้ถูกลบอยู่' })
  await prisma.tbl_item.update({ where: { itm_code }, data: { itm_flag: '1', rm_dt: null, mdf_dt: new Date() } })
  res.json({ message: 'กู้คืนสินค้าแล้ว' })
}))
// PATCH /admin/products/:id/sale-dates — แก้เฉพาะวันที่วางจำหน่าย (PUT เป็น full-replace จะล้างฟิลด์อื่น)
router.patch('/products/:id/sale-dates', asyncHandler(async (req, res) => {
  const itm_code = String(req.params.id)
  const existing = await prisma.tbl_item.findFirst({ where: { itm_code } })
  if (!existing) return res.status(404).json({ message: 'ไม่พบสินค้า' })

  const { sale_start_date, sale_end_date } = req.body
  const pb_dt = parseDateOrNull(sale_start_date)
  const exp_dt = parseDateOrNull(sale_end_date)
  // ส่งมาแต่ parse ไม่ได้ = รูปแบบผิด (null/ว่าง = ล้างวันที่)
  if ((sale_start_date && !pb_dt) || (sale_end_date && !exp_dt)) {
    return res.status(400).json({ message: 'รูปแบบวันที่ไม่ถูกต้อง' })
  }
  if (pb_dt && exp_dt && pb_dt > exp_dt) {
    return res.status(400).json({ message: 'วันที่จำหน่ายต้องไม่เกินวันที่สิ้นสุด' })
  }

  await prisma.tbl_item.update({ where: { itm_code }, data: { pb_dt, exp_dt, mdf_dt: new Date() } })
  res.json({ message: 'บันทึกวันที่จำหน่ายแล้ว', sale_start_date: pb_dt, sale_end_date: exp_dt })
}))

// GET /admin/categories
router.get('/categories', asyncHandler(async (_req, res) => {
  const rows = await prisma.tbl_item_type.findMany({ orderBy: { itm_type_desc: 'asc' } })
  res.json(rows.map((r) => ({ category_id: r.itm_type_code, category_name: r.itm_type_desc })))
}))
// GET /admin/categories/:id — พร้อม product_ids ของสินค้าในหมวด
router.get('/categories/:id', asyncHandler(async (req, res) => {
  const itm_type_code = String(req.params.id)
  const row = await prisma.tbl_item_type.findUnique({ where: { itm_type_code } })
  if (!row) return res.status(404).json({ message: 'ไม่พบหมวดหมู่' })
  const members = await prisma.tbl_item.findMany({ where: { itm_type_code, itm_flag: { not: '0' } }, select: { itm_code: true } })
  res.json({ category_id: row.itm_type_code, category_name: row.itm_type_desc, thumbnail: row.thumbnail, product_ids: members.map((m) => m.itm_code) })
}))

// ย้ายสินค้าที่ติ๊กเข้าหมวดนี้ และปลดสินค้าที่ไม่ได้ติ๊กแล้วออก (สินค้ามีได้หมวดเดียว)
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

// POST /admin/categories — สร้างหมวด + ย้ายสินค้าที่เลือกเข้ามา
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
// PUT /admin/categories/:id — product_ids (ถ้าส่ง) แทนที่สมาชิกทั้งชุด
router.put('/categories/:id', asyncHandler(async (req, res) => {
  const name = String(req.body.category_name ?? '').trim()
  if (!name) return res.status(400).json({ message: 'กรุณากรอกชื่อหมวดหมู่', code: 'missingRequiredFields' })
  const itm_type_code = String(req.params.id)
  const row = await prisma.tbl_item_type.update({
    where: { itm_type_code },
    // ไม่ส่ง thumbnail = คงรูปเดิม
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
// DELETE /admin/categories/:id — ลบไม่ได้ถ้ามีสินค้าผูก
router.delete('/categories/:id', asyncHandler(async (req, res) => {
  const code = String(req.params.id)
  const inUse = await prisma.tbl_item.count({ where: { itm_type_code: code, itm_flag: '1' } })
  if (inUse > 0) {
    return res.status(400).json({ message: 'ลบไม่ได้ เนื่องจากมีสินค้าที่ใช้หมวดหมู่นี้อยู่', code: 'categoryInUse' })
  }
  await prisma.tbl_item_type.delete({ where: { itm_type_code: code } })
  res.json({ message: 'ลบหมวดหมู่แล้ว' })
}))


// ตั้งค่าคุณสมบัตินี้ให้หลายสินค้า แบบ full-replace (เฉพาะค่าร่วม ไม่แตะค่าเฉพาะโมเดล)
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

// GET /admin/attributes
router.get('/attributes', asyncHandler(async (_req, res) => {
  const rows = await prisma.tbl_attribute.findMany({ orderBy: { attribute_name: 'asc' } })
  res.json(rows.map((r) => ({ attribute_id: r.attribute_code, attribute_name: r.attribute_name })))
}))
// GET /admin/attributes/:id — พร้อมค่าของแต่ละสินค้า (product_values)
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
// POST /admin/attributes — product_values (ถ้าส่ง) ตั้งค่าให้สินค้าทันที
router.post('/attributes', asyncHandler(async (req, res) => {
  const name = String(req.body.attribute_name ?? '').trim()
  if (!name) return res.status(400).json({ message: 'กรุณากรอกชื่อคุณสมบัติ', code: 'missingRequiredFields' })
  const row = await prisma.tbl_attribute.create({ data: { attribute_name: name, flag: '1', ist_dt: new Date() } })
  if (req.body.product_values !== undefined) {
    await applyAttributeProductValues(row.attribute_code, req.body.product_values)
  }
  res.status(201).json({ attribute_id: row.attribute_code, attribute_name: row.attribute_name })
}))
// PUT /admin/attributes/:id — product_values (ถ้าส่ง) แทนที่ทั้งชุด
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
// DELETE /admin/attributes/:id — ลบไม่ได้ถ้ามีค่าผูก
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

const nextShopId = () => nextCode('tbl_shop', 'shop_id', 'shop', 7)
const nextBannerCode = () => nextCode('tbl_bnn_slide', 'bnn_slide_code', 'bnn', 7)

// GET/POST/PUT/DELETE /admin/shops — สาขา DTC Shop
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

// GET/POST/PUT/DELETE /admin/banners — แบนเนอร์หน้าแรก
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

// GET/POST/PUT/DELETE /admin/footer — เนื้อหา footer
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


// หาสินค้าเจ้าของโมเดลนี้ (แยกรหัสทีละตัว ไม่ใช้ contains เพราะรหัสหนึ่งอาจเป็น substring ของอีกตัว)
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

// GET /admin/models — โมเดลทั้งหมด + สินค้าเจ้าของ + สเปคเฉพาะโมเดล (?q = ค้น)
router.get('/models', asyncHandler(async (req, res) => {
  const { q = '' } = req.query
  const [models, items] = await Promise.all([
    prisma.tbl_item_model.findMany({ orderBy: { itm_model_desc: 'asc' } }),
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
// GET /admin/models/:id
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
// POST /admin/models — สร้างโมเดลแล้วต่อรหัสเข้า itm_model_code ของสินค้าที่เลือก
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
// ย้ายเจ้าของโมเดลไปสินค้าใหม่ (ถอดออกจากเจ้าของเดิมก่อน)
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

// PUT /admin/models/:id — แก้โมเดล / ย้ายเจ้าของ / สเปคเฉพาะโมเดล
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
  // ส่ง attributes = แทนที่ทั้งชุด · ไม่ส่ง = ไม่แตะ
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

// DELETE /admin/models/:id — ลบจริง (สเปคเฉพาะโมเดลลบตามด้วย cascade)
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

// ตัวเลือกเสริม (SD Card ฯลฯ) — ผูกผ่าน itm_option_code ใช้ร่วมกันหลายสินค้า ไม่เข้าตารางเปรียบเทียบ

// ตัวเลือกแต่ละตัวถูกใช้กับสินค้าไหนบ้าง (แยกรหัสทีละตัว กันรหัสที่เป็น substring)
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

// แถวตัวเลือก → รูปที่หน้าแอดมินใช้
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

// GET /admin/options (?q = ค้น)
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

// GET /admin/options/:id
router.get('/options/:id', asyncHandler(async (req, res) => {
  const option_code = String(req.params.id)
  const row = await prisma.tbl_item_option.findUnique({ where: { itm_option_code: option_code } })
  if (!row) return res.status(404).json({ message: 'ไม่พบตัวเลือกสินค้า' })
  const usage = await buildOptionUsage()
  res.json(optionShape(row, usage.get(option_code)))
}))

// POST /admin/options
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
  // ต่อท้ายตัวเลือกเดิมของสินค้า ไม่ทับ
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

// PUT /admin/options/:id
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
  // ส่ง product_ids = กำหนดสินค้าที่ใช้ตัวเลือกนี้ใหม่ทั้งชุด
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

// DELETE /admin/options/:id — ลบแบบ soft + ปลดออกจากทุกสินค้า
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