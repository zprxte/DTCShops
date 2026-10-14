// API สินค้าฝั่ง Public: รายการ / ตัวกรอง / เปรียบเทียบ / รายละเอียด
const express = require('express')
const router = express.Router()
const { PrismaClient } = require('@prisma/client')
const { stripHtml } = require('../utils/stripHtml')
const { toPage, toLimit } = require('../utils/sanitize')
const { logProductView } = require('../utils/activityLog')
const { buildCards } = require('../utils/productShape')
const prisma = new PrismaClient()

// รูปหลัก + รูปย่อย 9 ช่อง → แกลเลอรี
function buildGallery(item) {
  const paths = [item.itm_image_master, ...Array.from({ length: 9 }, (_, i) => item[`itm_image_sub${i + 1}`])].filter(Boolean)
  return paths.map((path, i) => ({ gallery_id: i, product_image: path, sort_order: i }))
}

// รหัสโมเดลคั่นคอมม่า → อาร์เรย์
function parseModelCodes(itm_model_code) {
  return (itm_model_code || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
}

// แถวโมเดล → รูปที่หน้าเว็บใช้ (ราคา = ราคาสินค้า + ส่วนเพิ่ม พร้อมสเปคเฉพาะโมเดล)
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

// โมเดลของสินค้าพร้อมสเปค override (โมเดลเป็น shared catalog ผูกผ่าน itm_model_code)
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

// ตัวเลือกเสริมของสินค้า — ใช้เฉพาะหน้ารายละเอียด ไม่เข้าการ์ด/ผลค้นหา/ตารางเปรียบเทียบ
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

// แถวค่าสเปค → { value, attribute }
function attrValueShape(v) {
  return {
    value: v.value,
    attribute: { attribute_id: v.attribute_code, attribute_name: v.attribute.attribute_name },
  }
}

// รูปข้อมูลเต็มสำหรับหน้ารายละเอียด/เปรียบเทียบ (โมเดล + สเปคร่วม + ลิงก์ร้าน/ประกัน/จัดส่ง)
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
    // เฉพาะสเปคร่วม (model_code NULL) — ค่าเฉพาะโมเดลอยู่ใน product_model
    product_attribute_value: attributeValues.filter((v) => v.model_code == null).map(attrValueShape),
    product_model: models,
  }
}

// GET /api/products/compare?ids= (itm_code หรือ slug) — ต้องประกาศก่อน /:id
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

// GET /api/products/filters — หมวด + แท็กสำหรับ checkbox (แท็กต้องมี ≥ MIN_FACET_PRODUCTS ตัวและไม่ใช่ทุกตัว) · ต้องประกาศก่อน /:id
const MIN_FACET_PRODUCTS = 2
// แท็กเก็บเป็นข้อความคอมม่าคั่นใน tbl_item.itm_tags
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

    // รวมแท็กแบบไม่สนตัวพิมพ์ แสดงด้วยรูปที่พบบ่อยสุด ("GPS"/"gps" เป็นชิปเดียว)
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

// ยอดเข้าดูหน้าสินค้าทั้งหมดจาก tbl_logs → Map<itm_code, จำนวน> (เทียบ slug ไม่สนตัวพิมพ์)
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

// GET /api/products — แบ่งหน้า + กรอง (หลายหมวด = "หรือ" · หลายแท็ก = "และ") + เรียง
router.get('/', async (req, res) => {
  try {
    const { category_id, category_ids, tags, sort = 'newest' } = req.query
    // บังคับช่วง page/limit — ค่ามั่วเคยทำให้ดึงทั้งตารางหรือ 500
    const page = toPage(req.query.page)
    const limit = toLimit(req.query.limit, 20, 100)
    const where = { itm_flag: '1' }

    const categoryCodes = category_ids ? csv(category_ids) : (category_id ? [String(category_id)] : [])
    if (categoryCodes.length === 1) where.itm_type_code = categoryCodes[0]
    else if (categoryCodes.length > 1) where.itm_type_code = { in: categoryCodes }

    // DB กรองแท็กหยาบด้วย contains แล้วเช็คทั้งคำอีกชั้นฝั่ง JS (กัน "AI" ตรง "AIR")
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
      // popular เรียงฝั่ง JS — คอลัมน์ view ของ tbl_item เป็น 0 ทุกแถว
      popular: { ist_dt: 'desc' },
    }[sort] || { ist_dt: 'desc' }

    // เรียงราคาต้องดันราคา 0 ไปท้ายทั้งสองทิศ — Prisma ทำไม่ได้ จึงเรียงฝั่ง JS
    const priceSort = sort === 'price_asc' || sort === 'price_desc'
    const popularSort = sort === 'popular'

    // ติ๊กแท็ก/เรียงฝั่ง JS = ดึงทั้งชุดมาตัดหน้าเอง · นอกนั้นให้ DB ตัดหน้า
    const paginateInDb = wantedTags.length === 0 && !priceSort && !popularSort
    const items = await prisma.tbl_item.findMany({
      where,
      ...(paginateInDb ? { skip: (page - 1) * limit, take: limit } : {}),
      include: { item_type: true },
      // ต้องปิดท้ายด้วย itm_code ให้ลำดับคงที่ — ไม่งั้นแบ่งหน้าแล้วสินค้าซ้ำ/หาย (ist_dt / ราคาซ้ำกันเยอะ)
      orderBy: [orderBy, { itm_code: 'asc' }],
    })

    const matched = paginateInDb ? items : items.filter((item) => wantedTags.every((tag) => hasTag(item, tag)))

    // ยอดเท่ากันคงลำดับเดิมจาก DB (Array.sort เป็น stable)
    if (popularSort) {
      const views = await productViewCounts()
      matched.sort((a, b) => (views.get(b.itm_code) ?? 0) - (views.get(a.itm_code) ?? 0))
    }
    const total = paginateInDb ? await prisma.tbl_item.count({ where }) : matched.length

    // เรียงด้วยราคาที่การ์ดแสดง (มีโมเดล = ราคาต่ำสุดของโมเดล) ไม่ใช่ itm_price · ราคา 0 ท้ายเสมอ
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

// GET /api/products/:id — รายละเอียดสินค้า (:id = itm_code หรือ slug)
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

    // บันทึกยอดเข้าชม (ไม่ await — log ล้มต้องไม่ทำหน้าสินค้าพัง)
    logProductView(prisma, item)

    const detail = await withDetailFields(item, item.attribute_values)
    const product_option = await resolveOptions(item)

    // สินค้าที่เกี่ยวข้อง = ทุกตัวในหมวดเดียวกัน ยกเว้นตัวเอง
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
