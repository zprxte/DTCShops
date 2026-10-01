// รูปแบบ "การ์ดสินค้า" ที่ใช้ร่วมกันระหว่าง GET /api/products และ GET /api/search
//
// เดิมโค้ดชุดนี้มีสองสำเนา: withCardFields() ใน routes/products.js กับ toCard()
// ใน routes/search.js ซึ่งเป็นสำเนาที่ไม่ครบ — /search ไม่ส่ง model_ids มาเลย และ
// ตั้ง has_priced_models เป็น false ตายตัว ทำให้ป็อปอัปเลือกสินค้า (ทั้งเว็บและแอป)
// บอกไม่ได้ว่าสินค้าตัวนี้ถูกเลือกไปกี่โมเดลแล้วเมื่อรายการมาจากการค้นหา
//
// รวมเป็นที่เดียวแล้วเพิ่มอะไรทีหลังจะได้ไปถึงทั้งสองเส้นทางพร้อมกัน

// ดึงโมเดลของสินค้าหลายตัว "ครั้งเดียว" แล้วทำดัชนีไว้ให้ cardShape() หยิบใช้
//
// เดิม withCardFields() เรียก resolveModels() ต่อสินค้าหนึ่งตัว = ยิง DB 2 ครั้ง
// ต่อสินค้า (รายการ 100 ตัว = 200 คำสั่ง) ส่วนการ์ดสินค้าใช้แค่รหัสโมเดลกับราคา
// ไม่ต้องใช้สเปคเฉพาะโมเดลเลย ตรงนี้จึงเหลือคำสั่งเดียวและไม่แตะตาราง
// tbl_attribute_value อีก (สเปคเฉพาะโมเดลยังดึงตามเดิมในเส้นทางหน้ารายละเอียด)
async function loadModelIndex(items, prisma) {
  const codesByItem = new Map()
  const allCodes = new Set()
  for (const item of items) {
    const codes = String(item.itm_model_code ?? '')
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean)
    codesByItem.set(item.itm_code, codes)
    for (const code of codes) allCodes.add(code)
  }

  const rows = allCodes.size === 0
    ? []
    : await prisma.tbl_item_model.findMany({
      where: { itm_model_code: { in: [...allCodes] } },
    })
  const byCode = new Map(rows.map((row) => [row.itm_model_code, row]))

  const index = new Map()
  for (const item of items) {
    // รหัสที่อ้างถึงโมเดลที่ถูกลบไปแล้วต้องตกไป ไม่ใช่กลายเป็นช่องว่างในรายการ
    const models = (codesByItem.get(item.itm_code) ?? [])
      .map((code) => byCode.get(code))
      .filter(Boolean)
    index.set(item.itm_code, {
      ids: models.map((row) => row.itm_model_code),
      // ราคาโมเดล = ราคาสินค้า + ส่วนเพิ่มของโมเดลนั้น (กติกาเดียวกับ modelToCardShape)
      prices: models
        .map((row) => Number(item.itm_price ?? 0) + Number(row.itm_model_addon_price ?? 0))
        .filter((price) => !Number.isNaN(price)),
    })
  }
  return index
}

// แปลงแถว tbl_item หนึ่งแถวเป็นการ์ดสินค้า (ไม่มีสเปค — นั่นเป็นหน้าที่ของ
// /products/:id กับ /products/compare)
function cardShape(item, modelIndex) {
  const models = modelIndex.get(item.itm_code) ?? { ids: [], prices: [] }
  const prices = models.prices
  return {
    product_id: item.itm_code,
    sku: item.itm_sku,
    product_name: item.itm_desc,
    // มีโมเดล = ราคาที่โชว์บนการ์ดคือช่วงราคาของโมเดล ไม่ใช่ราคาตั้งต้นของสินค้า
    product_price: prices.length > 0 ? Math.min(...prices) : item.itm_price,
    product_price_max: prices.length > 0 ? Math.max(...prices) : item.itm_price,
    has_models: models.ids.length > 0,
    has_priced_models: prices.length > 0,
    product_image: item.itm_image_master || null,
    category_name: item.item_type?.itm_type_desc ?? null,
    // ใช้ทำลิงก์หน้ารายละเอียด (utils/slug.ts ฝั่งหน้าเว็บ) — ไม่มีก็ใช้ product_id แทน
    slug: item.slug ?? null,
    // รหัสโมเดลทั้งหมด (ไม่มีรายละเอียด/สเปค) — ป็อปอัป "เพิ่มสินค้า"/"เปลี่ยนสินค้า"
    // ใช้แยกระหว่าง "ยังเหลือโมเดลให้เลือก" กับ "เลือกครบทุกโมเดลแล้ว"
    model_ids: models.ids,
  }
}

// ทางลัดสำหรับที่ที่มีสินค้าเป็นชุดอยู่แล้ว: ดึงโมเดลครั้งเดียวแล้วแปลงทั้งชุด
async function buildCards(items, prisma) {
  const index = await loadModelIndex(items, prisma)
  return items.map((item) => cardShape(item, index))
}

module.exports = { loadModelIndex, cardShape, buildCards }
