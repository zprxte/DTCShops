const express = require('express')
const router = express.Router()
const { PrismaClient } = require('@prisma/client')
const { stripHtml } = require('../utils/stripHtml')
const { toPage, toLimit } = require('../utils/sanitize')
const { logProductView } = require('../utils/activityLog')
const { buildCards } = require('../utils/productShape')
const prisma = new PrismaClient()

function buildGallery(item) {
  const paths = [item.itm_image_master, ...Array.from({ length: 9 }, (_, i) => item[`itm_image_sub${i + 1}`])].filter(Boolean)
  return paths.map((path, i) => ({ gallery_id: i, product_image: path, sort_order: i }))
}

function parseModelCodes(itm_model_code) {
  return (itm_model_code || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
}

//ฟังก์ชันสำหรับแปลงข้อมูลโมเดลสินค้าให้อยู่ในรูปแบบที่ต้องการ
function modelToCardShape(basePrice, modelRow, index, attributeValues) {
  const addon = Number(modelRow.itm_model_addon_price ?? 0)
  return {
    model_id: modelRow.itm_model_code,
    model_name: modelRow.itm_model_desc ?? modelRow.itm_model_code,
    sku: null,
    product_price: Number(basePrice ?? 0) + addon,
    stock_quantity: modelRow.qty ?? null,
    sold_count: null,
    sort_order: index,
    updated_at: modelRow.mdf_dt ?? modelRow.ist_dt ?? null,
    product_attribute_value: (attributeValues || []).map(attrValueShape),
  }
}

// โมเดลสินค้า (tbl_item_model) เป็น shared catalog (2026-09-03) — ผูกกับ
// สินค้าผ่าน tbl_item.itm_model_code (คอมม่าคั่น) เท่านั้น ไม่มีสถานะ
// เปิด/ปิดใช้งานแยกต่างหากอีกต่อไป (การ "แสดง/ไม่แสดง" คุมด้วยการติ๊กเลือก
// ในฟอร์มแก้ไขสินค้าล้วนๆ — ดู reassignProductModels() ใน routes/admin.js)
async function resolveModels(item) {
  const codes = parseModelCodes(item.itm_model_code)
  if (codes.length === 0) return []
  const rows = await prisma.tbl_item_model.findMany({ where: { itm_model_code: { in: codes } } })
  const byCode = new Map(rows.map((r) => [r.itm_model_code, r]))
  const overrides = await prisma.tbl_attribute_value.findMany({
    where: { model_code: { in: codes } },
    include: { attribute: true },
  })
  const overridesByModel = new Map()
  for (const v of overrides) {
    if (!overridesByModel.has(v.model_code)) overridesByModel.set(v.model_code, [])
    overridesByModel.get(v.model_code).push(v)
  }
  return codes
    .map((code) => byCode.get(code))
    .filter(Boolean)
    .map((row, i) => modelToCardShape(item.itm_price, row, i, overridesByModel.get(row.itm_model_code)))
}

// ตัวเลือกสินค้า / อุปกรณ์เสริม (tbl_item_option) — ผูกผ่าน tbl_item.itm_option_code
// (คอมม่าคั่น) เหมือนโมเดล แต่ใช้ร่วมกันหลายสินค้าได้ และ **ใช้เฉพาะหน้ารายละเอียด
// สินค้าเท่านั้น** ไม่แนบไปกับ cardShape()/withDetailFields() เพื่อไม่ให้หลุดเข้า
// การ์ดสินค้า/ผลค้นหา/ตารางเปรียบเทียบ (คำขอผู้ใช้ 2026-09-09: "ไม่ต้องเอาเข้าเปรียบเทียบ")
async function resolveOptions(item) {
  const codes = (item.itm_option_code || '').split(',').map((c) => c.trim()).filter(Boolean)
  if (codes.length === 0) return []
  const rows = await prisma.tbl_item_option.findMany({
    where: { itm_option_code: { in: codes }, itm_option_flag: { not: '0' } },
  })
  const byCode = new Map(rows.map((r) => [r.itm_option_code, r]))
  return codes
    .map((code) => byCode.get(code))
    .filter(Boolean)
    .map((row, index) => ({
      option_id: row.itm_option_code,
      option_name: row.itm_option_desc ?? row.itm_option_code,
      addon_price: Number(row.itm_option_addon_price ?? 0),
      stock_quantity: row.qty ?? null,
      sort_order: index,
    }))
}

function attrValueShape(v) {
  return {
    value: v.value,
    attribute: { attribute_id: v.attribute_code, attribute_name: v.attribute.attribute_name },
  }
}

// Detail/compare shape — includes the full product_model array (each with
// its own spec overrides) and base attribute_value list, matching the old
// withCompareFields()/GET /:id shape.
async function withDetailFields(item, attributeValues) {
  const models = await resolveModels(item)
  const modelPrices = models.map((m) => Number(m.product_price)).filter((p) => !Number.isNaN(p))
  return {
    product_id: item.itm_code,
    sku: item.itm_sku,
    product_name: item.itm_desc,
    product_price: modelPrices.length > 0 ? Math.min(...modelPrices) : item.itm_price,
    product_price_max: modelPrices.length > 0 ? Math.max(...modelPrices) : item.itm_price,
    has_models: models.length > 0,
    has_priced_models: modelPrices.length > 0,
    product_image: item.itm_image_master || null,
    product_gallery: buildGallery(item),
    description: stripHtml(item.itm_information) ?? null,
    slug: item.slug ?? null,
    video_url: item.itm_video_master ?? null,
    // Metadata shown on the product-detail page's "ความคุ้มครอง"/"การจัดส่ง"
    // rows and its 4 purchase-link buttons — plain display fields, no
    // search/compare/filter logic touches any of them.
    sold_count: item.itm_sold ?? null,
    warranty_text: item.itm_guarantee ?? null,
    shipping_text: item.itm_shipping ?? null,
    shopee_link: item.itm_shopee_end_point ?? null,
    lazada_link: item.itm_lazada_end_point ?? null,
    tiktok_link: item.itm_tiktok_end_point ?? null,
    line_link: item.itm_line_end_point ?? null,
    category: item.item_type
      ? { category_id: item.item_type.itm_type_code, category_name: item.item_type.itm_type_desc }
      : null,
    // Only the shared/base specs (model_code IS NULL) — a model's own
    // override lives on that model's own product_attribute_value inside
    // product_model above instead (see modelToCardShape()).
    product_attribute_value: attributeValues.filter((v) => v.model_code == null).map(attrValueShape),
    product_model: models,
  }
}

/**
 * GET /api/products/compare?ids=itm-0000001,itm-0000002
 * NOTE: declared before /:id so it isn't swallowed by the param route.
 * Each id can be either the real itm_code or the product's own `slug` —
 * ComparePage.vue's share link now builds its URL from slugs (see
 * utils/slug.ts's productSlug()), matching the product-detail page's own
 * URL, so this needs to resolve either one the same way GET /:id does.
 */
router.get('/compare', async (req, res) => {
  try {
    const ids = String(req.query.ids || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)

    if (ids.length === 0) return res.json({ products: [] })

    const items = await prisma.tbl_item.findMany({
      where: { OR: [{ itm_code: { in: ids } }, { slug: { in: ids } }], itm_flag: '1' },
      include: {
        item_type: true,
        attribute_values: { include: { attribute: true } },
      },
    })
    const products = await Promise.all(items.map((item) => withDetailFields(item, item.attribute_values)))
    res.json({ products })
  } catch (err) {
    console.error('Compare fetch error:', err)
    res.status(500).json({ message: 'ไม่สามารถโหลดข้อมูลเปรียบเทียบได้' })
  }
})

/**
 * รายชื่อตัวกรองที่หน้า "สินค้าทั้งหมด" เอาไปทำ checkbox — คำนวณจากข้อมูลจริง
 * ทุกครั้ง ไม่ได้ hardcode ไว้ที่ frontend (เพิ่มสินค้า/สเปคใหม่แล้วตัวกรองโผล่เอง)
 *
 * แท็กที่คืนมาคัดเฉพาะตัวที่ "กรองแล้วได้ผล" — ต้องมีสินค้าที่ยังขายอยู่ใช้
 * ตั้งแต่ MIN_FACET_PRODUCTS ตัวขึ้นไป (ตัดแท็กที่มีสินค้าตัวเดียวใช้ ซึ่งกรอง
 * แล้วก็ได้สินค้านั้นตัวเดียว ไม่ต่างจากกดเข้าไปดูตรงๆ) และต้องไม่ใช่ทุกตัวใน
 * ระบบ (แท็กที่ทุกตัวมีเหมือนกันหมด ติ๊กไปก็ไม่ตัดอะไรออกเลย)
 *
 * ต้องประกาศก่อน '/:id' เสมอ ไม่งั้น Express จะจับ "filters" เป็น :id
 */
const MIN_FACET_PRODUCTS = 2
// แท็กเก็บเป็นข้อความคอมม่าคั่นในคอลัมน์เดียว (tbl_item.itm_tags) ไม่ใช่ตารางแยก
const splitTags = (value) => String(value ?? '').split(',').map((t) => t.trim()).filter(Boolean)

router.get('/filters', async (req, res) => {
  try {
    const items = await prisma.tbl_item.findMany({
      where: { itm_flag: '1' },
      select: { itm_code: true, itm_tags: true },
    })

    const categories = await prisma.tbl_item_type.findMany({
      include: { _count: { select: { items: { where: { itm_flag: '1' } } } } },
      orderBy: { itm_type_code: 'asc' },
    })

    // จับกลุ่มแท็กแบบไม่สนตัวพิมพ์เล็ก/ใหญ่ แต่แสดงผลด้วยรูปแบบที่พบบ่อยที่สุด
    // (ข้อมูลจริงเคยมีทั้ง "GPS"/"gps" ปนกัน จะได้ไม่กลายเป็นสองชิป)
    const byTag = new Map()
    for (const item of items) {
      for (const tag of new Set(splitTags(item.itm_tags))) {
        const key = tag.toLowerCase()
        if (!byTag.has(key)) byTag.set(key, { labels: new Map(), items: new Set() })
        const entry = byTag.get(key)
        entry.labels.set(tag, (entry.labels.get(tag) ?? 0) + 1)
        entry.items.add(item.itm_code)
      }
    }
    const tags = [...byTag.entries()]
      .map(([key, entry]) => ({
        tag: key,
        label: [...entry.labels.entries()].sort((a, b) => b[1] - a[1])[0][0],
        count: entry.items.size,
      }))
      .filter((t) => t.count >= MIN_FACET_PRODUCTS && t.count < items.length)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'th'))

    res.json({
      categories: categories
        .map((c) => ({ category_id: c.itm_type_code, category_name: c.itm_type_desc, count: c._count.items }))
        .filter((c) => c.count > 0),
      tags,
    })
  } catch (err) {
    console.error('Product filters error:', err)
    res.status(500).json({ message: 'ไม่สามารถโหลดตัวกรองได้' })
  }
})

/**
 * GET /api/products — list with pagination & filter
 * category_id here means tbl_item_type.itm_type_code (a string, not the
 * old integer Category.category_id) — the query param name is kept
 * unchanged so SearchPage.vue's filter dropdown didn't need to change.
 *
 * ตัวกรองแบบติ๊กหลายรายการ (9 ก.ย. 2026):
 *   category_ids  — itm_type_code คั่นด้วยคอมม่า, ติ๊กหลายหมวด = "หรือ"
 *                   (กว้างขึ้น) สินค้าอยู่ได้หมวดเดียวอยู่แล้ว ถ้าใช้ "และ"
 *                   จะไม่มีวันเจออะไรเลย
 *   tags          — ชื่อแท็กคั่นด้วยคอมม่า, แต่ละอันเป็นเงื่อนไขเพิ่ม = "และ"
 *                   (ติ๊ก AI + IoT = ต้องมีทั้งคู่) ตามแบบ facet ของเว็บ
 *                   e-commerce ทั่วไป
 * category_id เดิม (ค่าเดียว) ยังใช้ได้เหมือนเดิม — ลิงก์การ์ดหมวดหมู่หน้าแรก
 * และลิงก์เก่าที่แชร์กันไว้ยังทำงานปกติ
 */
// ยอดเข้าดูหน้าสินค้าตลอดช่วงที่เก็บ → Map<itm_code, จำนวน>
// log เก็บ slug ไว้ใน message ('การเข้าดูสินค้า : <slug>') และข้อมูลเก่าจากเว็บจริง
// ตัวพิมพ์ไม่ตรงกับ slug ปัจจุบันบ้าง (GPS-DTRCK-M กับ gps-dtrck-m) จึงเทียบแบบไม่สนตัวพิมพ์
// ใช้ index idx_tbl_logs_type_created ช่วยกรอง type
async function productViewCounts() {
  const rows = await prisma.$queryRaw`
    SELECT i.itm_code AS product_id, COUNT(*)::int AS views
      FROM tbl_logs l
      JOIN tbl_item i ON lower(i.slug) = lower(btrim(split_part(l.message, ':', 2)))
     WHERE l.type = 'view'
       AND l.page = 'product-single'
     GROUP BY i.itm_code
  `
  return new Map(rows.map((r) => [r.product_id, r.views]))
}

const csv = (value) => String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean)

router.get('/', async (req, res) => {
  try {
    const { category_id, category_ids, tags, sort = 'newest' } = req.query
    // บังคับช่วงที่รับได้เสมอ — ?limit=999999 เดิมดึงทั้งตารางมาทีเดียว และ
    // ?page=abc ทำให้ skip เป็น NaN แล้ว Prisma โยน error ออกมาเป็น 500
    const page = toPage(req.query.page)
    const limit = toLimit(req.query.limit, 20, 100)
    const where = { itm_flag: '1' }

    const categoryCodes = category_ids ? csv(category_ids) : (category_id ? [String(category_id)] : [])
    if (categoryCodes.length === 1) where.itm_type_code = categoryCodes[0]
    else if (categoryCodes.length > 1) where.itm_type_code = { in: categoryCodes }

    // แท็กอยู่ในคอลัมน์ข้อความคอมม่าคั่น ไม่มีตารางให้ join — ใช้ contains แบบ
    // ไม่สนตัวพิมพ์ แล้วกรองซ้ำอีกชั้นฝั่ง JS ให้ตรงทั้งคำ (กัน "AI" ไปแมตช์
    // แท็กอย่าง "AIR" หรือคำที่มี ai อยู่ข้างใน)
    const wantedTags = csv(tags)
    if (wantedTags.length > 0) {
      where.AND = wantedTags.map((tag) => ({ itm_tags: { contains: tag, mode: 'insensitive' } }))
    }
    const hasTag = (item, tag) =>
      splitTags(item.itm_tags).some((t) => t.toLowerCase() === tag.toLowerCase())

    const orderBy = {
      newest: { ist_dt: 'desc' },
      price_asc: { itm_price: 'asc' },
      price_desc: { itm_price: 'desc' },
      name: { itm_desc: 'asc' },
      // "popular" เรียงฝั่ง JS ด้วยยอดเข้าชมจาก tbl_logs (ดู popularSort ด้านล่าง)
      // คอลัมน์ `view` ของ tbl_item เป็น 0 ทุกแถว ใช้เรียงไม่ได้
      popular: { ist_dt: 'desc' },
    }[sort] || { ist_dt: 'desc' }

    // เรียงตามราคา = ต้องดันสินค้า "ราคาติดต่อสอบถาม" (ราคา 0/ว่าง) ไปท้ายสุด
    // เสมอไม่ว่าจะน้อย→มาก หรือมาก→น้อย ซึ่ง ORDER BY ของ Prisma เขียนแบบมี
    // เงื่อนไข (CASE) ไม่ได้ จึงต้องเรียง/ตัดหน้าฝั่ง JS แทน
    const priceSort = sort === 'price_asc' || sort === 'price_desc'
    // เรียงตามความนิยม = ยอดเข้าดูหน้าสินค้าทั้งหมดใน tbl_logs (ตั้งแต่เริ่มเก็บ)
    // นับจาก log ต้องรวมยอดแล้วเรียงฝั่ง JS เหมือน priceSort
    const popularSort = sort === 'popular'

    // ติ๊กแท็กไว้ = ต้องกรองให้ตรงทั้งคำอีกชั้นฝั่ง JS ซึ่ง DB นับให้ไม่ได้ จึงดึง
    // ทั้งชุดมาแล้วตัดหน้าเอง (แคตตาล็อกมี 40 กว่าตัว ไม่ใช่ภาระ) — ไม่ติ๊กแท็ก
    // ก็ใช้ทางเดิมที่ให้ DB นับและตัดหน้าให้ตามปกติ
    const paginateInDb = wantedTags.length === 0 && !priceSort && !popularSort
    const items = await prisma.tbl_item.findMany({
      where,
      ...(paginateInDb ? { skip: (page - 1) * limit, take: limit } : {}),
      include: { item_type: true },
      // ต้องมี itm_code ปิดท้ายเสมอเป็นตัวตัดสินลำดับสำรอง — คอลัมน์ที่ใช้เรียงหลัก
      // มีค่าซ้ำกันเยอะมาก (สินค้า 31 จาก 44 ตัวมี ist_dt เท่ากันเป๊ะเพราะนำเข้าชุดเดียวกัน,
      // 34 ตัวราคา 0 เท่ากัน) พอค่าเท่ากัน Postgres ไม่รับประกันลำดับ ทำให้แต่ละ
      // request ของแต่ละหน้าได้ลำดับไม่ตรงกัน → สินค้าตัวเดียวโผล่ทั้งหน้า 1 และ 2
      // ส่วนตัวอื่นหายไปเลย (เจอจริง 9 ก.ย. 2026: 8 ซ้ำ / 8 หาย จาก 44 ตัว)
      orderBy: [orderBy, { itm_code: 'asc' }],
    })

    const matched = paginateInDb ? items : items.filter((item) => wantedTags.every((tag) => hasTag(item, tag)))

    // ยอดเท่ากัน (รวมถึงสินค้าที่ยังไม่มีใครเข้าดู = 0) คงลำดับเดิมจาก DB คือ
    // ใหม่สุดก่อนแล้ว itm_code — Array.sort ของ Node เป็น stable sort
    if (popularSort) {
      const views = await productViewCounts()
      matched.sort((a, b) => (views.get(b.itm_code) ?? 0) - (views.get(a.itm_code) ?? 0))
    }
    const total = paginateInDb ? await prisma.tbl_item.count({ where }) : matched.length

    // เรียงตามราคา = เรียงด้วย "ราคาที่การ์ดแสดง" (สินค้ามีโมเดล = ราคาต่ำสุดของโมเดล)
    // ไม่ใช่ itm_price — เดิมเรียงด้วย itm_price แล้วสินค้าที่ราคาฐาน 0 แต่โมเดลมีราคา
    // (itm-0000056 การ์ดขึ้น ฿200–600) ตกไปอยู่กองท้ายกับสินค้า "ติดต่อสอบถาม"
    // (พบจาก test/productsApi.test.js 28 ก.ย. 2026) · สร้างการ์ดทั้งชุดก่อนเรียง
    // ไม่เป็นภาระ เพราะเส้นนี้ดึงทั้งชุดมาอยู่แล้ว (paginateInDb = false)
    // สินค้าไม่มีราคาไปท้ายเสมอทั้งสองทิศ · ปิดท้ายด้วย product_id กันลำดับไม่คงที่
    // ตอนราคาเท่ากัน — กติกาเดียวกับ sortFns ของ /search
    let cards
    if (priceSort) {
      const all = await buildCards(matched, prisma)
      const price = (card) => Number(card.product_price ?? 0)
      const noPrice = (card) => !price(card)
      const dir = sort === 'price_asc' ? 1 : -1
      all.sort(
        (a, b) =>
          Number(noPrice(a)) - Number(noPrice(b)) ||
          (noPrice(a) ? 0 : (price(a) - price(b)) * dir) ||
          String(a.product_id).localeCompare(String(b.product_id)),
      )
      cards = all.slice((page - 1) * limit, page * limit)
    } else {
      const pageItems = paginateInDb ? matched : matched.slice((page - 1) * limit, page * limit)
      cards = await buildCards(pageItems, prisma)
    }

    res.json({
      products: cards,
      total,
      page,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    })
  } catch (err) {
    console.error('Product list error:', err)
    res.status(500).json({ message: 'ไม่สามารถโหลดรายการสินค้าได้' })
  }
})

/**
 * GET /api/products/:id — product detail + attributes
 * :id can be either the real itm_code ("itm-0000003") OR the product's own
 * `slug` column ("hikvision-dash-card-k5") — production already had real,
 * unique, human-readable slugs filled in for every active item, so
 * ProductDetailPage.vue's URL uses those now (see utils/slug.ts's
 * productSlug()) instead of the bare itm_code. Matching on either keeps old
 * bookmarked/shared itm_code links working too.
 * (Product_view_log was dropped along with this project's own analytics
 * tables, so this no longer logs a view — see CLAUDE.md.)
 */
router.get('/:id', async (req, res) => {
  try {
    const identifier = String(req.params.id || '').trim()
    if (!identifier) return res.status(400).json({ message: 'Invalid product id' })

    const item = await prisma.tbl_item.findFirst({
      where: { OR: [{ itm_code: identifier }, { slug: identifier }], itm_flag: '1' },
      include: {
        item_type: true,
        attribute_values: { include: { attribute: true } },
      },
    })

    if (!item) return res.status(404).json({ message: 'ไม่พบสินค้า' })

    // บันทึกการเข้าชมสินค้าลง tbl_logs (ไม่ await — ไม่ให้ถ่วง response
    // และไม่ให้ log ที่เขียนไม่สำเร็จทำให้หน้าสินค้าพัง)
    logProductView(prisma, item)

    const detail = await withDetailFields(item, item.attribute_values)
    const product_option = await resolveOptions(item)

    // สินค้าที่เกี่ยวข้อง: ทุกตัวในหมวดหมู่เดียวกัน ยกเว้นตัวเอง (ไม่จำกัดจำนวน
    // เพราะหมวดหมู่ใหญ่สุดมีแค่ 15 ตัว และแคโรเซลฝั่งหน้าเว็บเลื่อนดูได้อยู่แล้ว)
    const related_products = item.itm_type_code
      ? await buildCards(
        await prisma.tbl_item.findMany({
          where: { itm_type_code: item.itm_type_code, itm_flag: '1', itm_code: { not: item.itm_code } },
          include: { item_type: true },
          orderBy: { ist_dt: 'desc' },
        }),
        prisma
      )
      : []

    res.json({ ...detail, product_option, related_products })
  } catch (err) {
    console.error('Product detail error:', err)
    res.status(500).json({ message: 'ไม่สามารถโหลดข้อมูลสินค้าได้' })
  }
})

module.exports = router
module.exports.resolveModels = resolveModels
module.exports.buildGallery = buildGallery
