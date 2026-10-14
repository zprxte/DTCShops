// รูปการ์ดสินค้าที่ใช้ร่วมกันระหว่าง GET /api/products และ /api/search

// ดึงโมเดลของสินค้าทั้งชุดในคำสั่งเดียว (ไม่ยิง DB ต่อสินค้า) แล้วทำดัชนีให้ cardShape()
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
    // รหัสที่อ้างโมเดลที่ถูกลบไปแล้วต้องตกไป
    const models = (codesByItem.get(item.itm_code) ?? [])
      .map((code) => byCode.get(code))
      .filter(Boolean)
    index.set(item.itm_code, {
      ids: models.map((row) => row.itm_model_code),
      prices: models
        .map((row) => Number(item.itm_price ?? 0) + Number(row.itm_model_addon_price ?? 0))
        .filter((price) => !Number.isNaN(price)),
    })
  }
  return index
}

// แปลงแถว tbl_item เป็นการ์ดสินค้า (ไม่มีสเปค) — มีโมเดล = ราคาเป็นช่วงราคาของโมเดล
function cardShape(item, modelIndex) {
  const models = modelIndex.get(item.itm_code) ?? { ids: [], prices: [] }
  const prices = models.prices
  return {
    product_id: item.itm_code,
    sku: item.itm_sku,
    product_name: item.itm_desc,
    product_price: prices.length > 0 ? Math.min(...prices) : item.itm_price,
    product_price_max: prices.length > 0 ? Math.max(...prices) : item.itm_price,
    has_models: models.ids.length > 0,
    has_priced_models: prices.length > 0,
    product_image: item.itm_image_master || null,
    category_name: item.item_type?.itm_type_desc ?? null,
    slug: item.slug ?? null,
    model_ids: models.ids,
  }
}

// ดึงโมเดลครั้งเดียวแล้วแปลงทั้งชุด
async function buildCards(items, prisma) {
  const index = await loadModelIndex(items, prisma)
  return items.map((item) => cardShape(item, index))
}

module.exports = { loadModelIndex, cardShape, buildCards }
