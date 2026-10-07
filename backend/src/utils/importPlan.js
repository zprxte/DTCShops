const Fuse = require('fuse.js')
const { cleanText, safeUrl } = require('./sanitize')

// คอลัมน์ในไฟล์ (ลำดับนี้คือลำดับในเทมเพลตด้วย) — หัวคอลัมน์ในไฟล์คือ key ภาษาอังกฤษ
const PRODUCT_COLUMNS = [
  { key: 'product_id', label: 'รหัสสินค้า', width: 14, example: 'itm-0000003 (เว้นว่าง = สินค้าใหม่)' },
  { key: 'sku', label: 'SKU', width: 14, example: 'PROD-001' },
  { key: 'product_name', label: 'ชื่อสินค้า', width: 44, example: 'ตัวอย่างสินค้า', required: true },
  { key: 'category_name', label: 'หมวดหมู่', width: 18, example: 'กล้องติดรถยนต์ (เลือกจากรายการ)' },
  { key: 'product_price', label: 'ราคา', width: 14, example: '9990' },
  { key: 'description', label: 'รายละเอียด', width: 50, example: 'รายละเอียดสินค้า' },
  { key: 'product_image', label: 'รูปภาพหลัก', width: 50, example: 'https://dtcshops.com/api/image/2024-12/xxx.jpg — ระบบดาวน์โหลดมาเก็บเองตอนกดยืนยัน' },
  { key: 'stock_quantity', label: 'สต็อก', width: 14, example: '10' },
  { key: 'tags', label: 'แท็ก', width: 28, example: 'dashcam, 4k' },
  { key: 'shopee_link', label: 'ลิงก์ Shopee', width: 28, example: 'https://shopee.co.th/...' },
  { key: 'lazada_link', label: 'ลิงก์ Lazada', width: 28, example: 'https://www.lazada.co.th/...' },
  { key: 'tiktok_link', label: 'ลิงก์ TikTok', width: 28, example: 'https://www.tiktok.com/...' },
  { key: 'line_link', label: 'ลิงก์ LINE', width: 28, example: 'https://line.me/...' },
]
const SPEC_COLUMNS = [
  { key: 'product_id', label: 'รหัสสินค้า', width: 14, example: 'itm-0000003 (สินค้าใหม่ให้เว้นว่าง แล้วใส่ product_name)' },
  { key: 'product_name', label: 'ชื่อสินค้า', width: 44, example: 'ต้องตรงกับชีต products ถ้าเป็นสินค้าใหม่' },
  { key: 'attribute_name', label: 'หัวข้อสเปค', width: 36, example: 'ความละเอียดกล้อง (เลือกจากรายการ หรือพิมพ์ใหม่)' },
  { key: 'value', label: 'ค่า', width: 44, example: '1080p' },
]

// ชื่อฟิลด์ที่แสดงในหน้าพรีวิว (คอลัมน์ "เปลี่ยนอะไร")
const FIELD_LABELS = Object.fromEntries(PRODUCT_COLUMNS.map((c) => [c.key, c.label]))
// รูปที่อ้างถึงไฟล์ในระบบอยู่แล้ว (ค่าที่เทมเพลตเติมให้) กับลิงก์ภายนอกที่ต้องดาวน์โหลด
const LOCAL_IMAGE = /^\/uploads\/[^?#]+$/
const isRemoteImage = (value) => /^https?:\/\//i.test(String(value ?? ''))
const LINK_FIELDS = ['shopee_link', 'lazada_link', 'tiktok_link', 'line_link']
const MAX_VALUE_LENGTH = 255

// เทียบชื่อแบบไม่สนตัวพิมพ์และช่องว่างซ้ำ — "Wi-Fi  " กับ "wi-fi" ถือเป็นหัวข้อเดียวกัน
function normName(text) {
  return String(text ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

// ตัวเลขจากเซลล์ — รับทั้ง number และข้อความอย่าง "1,990" / "฿1,990"
function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return value
  const n = Number(String(value).replace(/[,฿\s]/g, ''))
  return Number.isNaN(n) ? NaN : n
}

function normalizeTags(text) {
  return String(text ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .join(', ')
}

// ตรวจแถวชีต "สินค้า" ทีละแถว
function planProducts(rows, snapshot) {
  const categoriesByName = new Map()
  for (const c of snapshot.categories) {
    categoriesByName.set(normName(c.category_name), c)
    categoriesByName.set(normName(c.category_id), c)
  }
  const categoryName = (id) => snapshot.categories.find((c) => c.category_id === id)?.category_name ?? null

  // SKU ของสินค้าอื่นในระบบ — ใช้เช็คซ้ำ (SKU ว่างไม่นับ)
  const skuOwner = new Map()
  for (const p of snapshot.products.values()) if (p.sku) skuOwner.set(normName(p.sku), p.product_id)

  const seenIds = new Map() // รหัส → ตำแหน่งแถวแรกที่ใช้
  const seenSkus = new Map() // sku → แถวแรกในไฟล์ที่ใช้
  const newNames = new Map() // ชื่อสินค้าใหม่ → แถว (ชีตสเปคอ้างสินค้าใหม่ด้วยชื่อ)

  return rows.map((raw) => {
    const errors = []
    const id = cleanText(raw.product_id, 50)
    const existing = id ? snapshot.products.get(id) : null
    const plan = { row: raw.row, action: id ? 'update' : 'create', product_id: id, product_name: null, changes: [], errors }

    if (id) {
      if (!existing) errors.push(`ไม่พบสินค้ารหัส ${id}`)
      else if (!existing.is_active) errors.push(`สินค้า ${id} ถูกลบอยู่ — กู้คืนก่อนถึงจะแก้ผ่าน Excel ได้`)
      // คัดลอกแถวสินค้าเดิมไปทำสินค้าใหม่แล้วลืมลบรหัส — บอกแถวต้นทางและวิธีแก้
      if (seenIds.has(id)) errors.push(`แถวนี้มีรหัสสินค้าเดียวกับ ${seenIds.get(id)} (${id}) — ถ้าคัดลอกแถวมาทำสินค้าใหม่ ให้ลบค่าในช่อง product_id ของแถวนี้`)
      else seenIds.set(id, raw.row)
    }

    // ค่าที่จะเขียน — undefined = ไม่แตะ (ช่องว่าง)
    const next = {}
    const name = cleanText(raw.product_name, 255)
    if (name) next.product_name = name
    else if (!id) errors.push('สินค้าใหม่ต้องมีชื่อสินค้า')
    plan.product_name = name ?? existing?.product_name ?? null

    const sku = cleanText(raw.sku, 50)
    if (sku) {
      const owner = skuOwner.get(normName(sku))
      if (owner && owner !== id) errors.push(`SKU ${sku} ซ้ำกับสินค้า ${owner}`)
      const firstRow = seenSkus.get(normName(sku))
      if (firstRow) errors.push(`SKU ${sku} ซ้ำกับ ${firstRow} ในไฟล์`)
      else seenSkus.set(normName(sku), raw.row)
      next.sku = sku
    }

    const cat = cleanText(raw.category_name, 100)
    if (cat) {
      const found = categoriesByName.get(normName(cat))
      if (!found) errors.push(`ไม่พบหมวดหมู่ "${cat}"`)
      else next.category_id = found.category_id
    }

    const price = parseNumber(raw.product_price)
    if (price !== null) {
      if (Number.isNaN(price) || price < 0) errors.push('ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป')
      else next.product_price = price
    }

    const stock = parseNumber(raw.stock_quantity)
    if (stock !== null) {
      if (Number.isNaN(stock) || stock < 0 || !Number.isInteger(stock)) errors.push('สต็อกต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป')
      else next.stock_quantity = stock
    }

    const tags = normalizeTags(raw.tags)
    if (tags) {
      if (tags.length > 255) errors.push('แท็กยาวเกิน 255 ตัวอักษร')
      else next.tags = tags
    }

    for (const field of LINK_FIELDS) {
      const text = cleanText(raw[field], 500)
      if (!text) continue
      const url = safeUrl(text)
      if (!url) errors.push(`${FIELD_LABELS[field]} ต้องขึ้นต้นด้วย http:// หรือ https://`)
      else next[field] = url
    }

    const description = cleanText(raw.description, 20000)
    if (description) next.description = description

    // รูปภาพหลัก — ค่าเดิมจากเทมเพลตเป็น path ในระบบ (/uploads/...) ส่วนลิงก์ใหม่ต้องดาวน์โหลด
    // snapshot.imageChecks คือผลตรวจที่ route ทำไว้ก่อน (ลองโหลดจริง / ไฟล์มีอยู่จริง)
    const image = cleanText(raw.product_image, 500)
    if (image && image !== existing?.product_image) {
      if (!isRemoteImage(image) && !LOCAL_IMAGE.test(image)) {
        errors.push('รูปภาพหลักต้องเป็นลิงก์ http(s):// หรือ path /uploads/... ที่ได้จากเทมเพลต')
      } else {
        const check = snapshot.imageChecks?.get(image)
        if (check && !check.ok) errors.push(`รูปภาพหลัก: ${check.error}`)
        else next.product_image = image
      }
    } else if (image) {
      next.product_image = image // เท่าค่าเดิม — ถูกกรองออกตอนเทียบด้านล่าง
    }

    if (!id && name) {
      const key = normName(name)
      if (newNames.has(key)) errors.push(`ชื่อสินค้าใหม่ซ้ำกับ ${newNames.get(key)} — ใช้ชื่อต่างกัน จะได้แยกออกว่าสเปคเป็นของตัวไหน`)
      else newNames.set(key, raw.row)
    }

    if (errors.length > 0) {
      plan.action = 'error'
      return plan
    }

    // เก็บเฉพาะฟิลด์ที่ค่าต่างจากเดิมจริง — เปิดเทมเพลตแล้วอัปโหลดกลับโดยไม่แก้อะไร
    // ต้องได้ "ไม่เปลี่ยน" ทุกแถว ไม่ใช่เขียนทับทั้งแคตตาล็อก
    for (const [field, to] of Object.entries(next)) {
      const from = existing ? existing[field] ?? null : null
      if (existing && String(from ?? '') === String(to)) continue
      const show = (v) => (field === 'category_id' ? categoryName(v) ?? v : v)
      plan.changes.push({ field, label: FIELD_LABELS[field === 'category_id' ? 'category_name' : field], from: show(from), to: show(to) })
    }
    plan.values = next
    if (id && plan.changes.length === 0) plan.action = 'unchanged'
    return plan
  })
}

// หัวข้อที่ชื่อใกล้เคียง — ใช้ตอบ "หมายถึง … ใช่ไหม?" ในหน้าพรีวิว
// ---------- แนะนำหัวข้อสำหรับชื่อที่ไม่รู้จัก ----------
// เทียบแค่ชื่อไม่พอ: หัวคอลัมน์ "Resolution" กับหัวข้อ "ความละเอียดกล้อง" ไม่มีตัวอักษรร่วมกันเลย
// (ผู้ใช้เจอ 25 ก.ย. 2026) จึงให้คะแนนจาก 3 ทาง แล้วเอาคะแนนสูงสุด:
//   1. ค่าคล้ายกัน — ค่าในไฟล์ (1080P) หน้าตาเหมือนค่าที่หัวข้อนั้นเก็บอยู่ (1080P (1920X1080)) ไม่สนภาษาของชื่อ
//   2. ชื่อคล้ายกัน — ชื่อซ้อนกัน หรือ fuse.js
//   3. โบนัสถ้าสินค้าในหมวดเดียวกันใช้หัวข้อนั้นอยู่แล้ว

// ค่าที่บอกอะไรเกี่ยวกับหัวข้อไม่ได้ (ทุกหัวข้อแบบ มี/ไม่มี มีค่าแบบนี้)
const GENERIC_VALUES = new Set(['มี', 'ไม่มี', 'yes', 'no', '-', '✓', '✗', 'x', 'true', 'false', '0', '1'])

// แยกค่าเป็นชิ้น 3 ชุด:
//   exact — ชิ้นที่มีตัวอักษร (1080p, ip67, 128gb) · ตัวเลขเปล่าๆ ไม่นับ ("150" ไปตรงกับ "150 mA" แบบบังเอิญ)
//   shape — แทนเลขแต่ละหลักด้วย # (####p, ###g, ##°c) จับค่าชนิดเดียวกันที่ตัวเลขต่างกัน
//            นับจำนวนหลักด้วย ไม่งั้นน้ำหนัก 150g (###g) ไปตรงกับเครือข่าย 4G (#g)
//   loose  — เลขทุกชุดเป็น # ตัวเดียว ใช้เฉพาะรูปที่มีโครงพอ เช่น ขนาด #x#x#mm
function valueTokens(value) {
  let text = String(value ?? '').toLowerCase().trim()
  if (!text || GENERIC_VALUES.has(text)) return null
  text = text
    .replace(/(\d),(?=\d{3}\b)/g, '$1') // 1,260 → 1260
    .replace(/ํ/g, '°') // ใช้ "ํ" แทนองศา (20ํC)
    .replace(/\b[lwhd](?=\d)/g, '') // L101 x W52 x H4 → 101 x 52 x 4
    .replace(/(\d)\s*[x×*]\s*(?=\d)/g, '$1x') // 100 x 60 → 100x60
    .replace(/(\d)\s+(°?[a-z]{1,4}\b|°)/g, '$1$2') // 150 g → 150g, 20 °c → 20°c
  const raw = text.match(/[a-z0-9฀-๿.°]+/g) || []
  const exact = new Set(raw.filter((t) => t.length >= 2 && /[a-z฀-๿°]/.test(t)))
  const numeric = raw.filter((t) => /\d/.test(t))
  const shape = new Set(numeric.map((t) => t.replace(/\d/g, '#')).filter((t) => /[^#.]/.test(t)))
  const loose = new Set(numeric.map((t) => t.replace(/\d+(\.\d+)?/g, '#')).filter((t) => t.length >= 4 && /#.*#/.test(t)))
  return exact.size || shape.size || loose.size ? { exact, shape, loose } : null
}

function overlap(a, b) {
  if (!a.size || !b.size) return 0
  let hit = 0
  for (const t of a) if (b.has(t)) hit++
  return hit / Math.min(a.size, b.size)
}

// เตรียมครั้งเดียวต่อแผน: ชิ้นส่วนค่าของแต่ละหัวข้อ + หัวข้อที่แต่ละหมวดใช้
function suggestionIndex(snapshot) {
  const tokensByAttr = new Map()
  const attrsByCategory = new Map()
  for (const [key, value] of snapshot.values) {
    const [itm, attr] = key.split('|')
    const tokens = valueTokens(value)
    if (tokens) {
      if (!tokensByAttr.has(attr)) tokensByAttr.set(attr, [])
      if (tokensByAttr.get(attr).length < 60) tokensByAttr.get(attr).push(tokens)
    }
    const cat = snapshot.products.get(itm)?.category_id
    if (cat) {
      if (!attrsByCategory.has(cat)) attrsByCategory.set(cat, new Set())
      attrsByCategory.get(cat).add(attr)
    }
  }
  const fuse = new Fuse(snapshot.attributes, { keys: ['attribute_name'], threshold: 0.45, ignoreLocation: true, includeScore: true })
  return { tokensByAttr, attrsByCategory, fuse }
}

function suggestAttributes(entry, snapshot, index) {
  const scores = new Map() // attribute_id → { score, reasons }
  const bump = (id, score, reason) => {
    const key = String(id)
    const cur = scores.get(key) ?? { score: 0, reasons: new Set() }
    if (score > cur.score) cur.score = score
    cur.reasons.add(reason)
    scores.set(key, cur)
  }

  // 1. ค่าคล้ายกัน
  const fileTokens = entry.values.map(valueTokens).filter(Boolean).slice(0, 20)
  if (fileTokens.length) {
    for (const [attr, list] of index.tokensByAttr) {
      let best = 0
      for (const f of fileTokens) {
        for (const t of list) {
          best = Math.max(best, overlap(f.exact, t.exact), 0.7 * overlap(f.shape, t.shape), 0.6 * overlap(f.loose, t.loose))
          if (best >= 1) break
        }
      }
      if (best >= 0.5) bump(attr, best, 'value')
    }
  }

  // 2. ชื่อคล้ายกัน
  const n = normName(entry.name)
  for (const a of snapshot.attributes) {
    const m = normName(a.attribute_name)
    if (m.length >= 3 && n.length >= 3 && (m.includes(n) || n.includes(m))) bump(a.attribute_id, 0.9, 'name')
  }
  for (const r of index.fuse.search(String(entry.name))) bump(r.item.attribute_id, 0.85 * (1 - r.score), 'name')

  // 3. หมวดเดียวกันใช้อยู่ — โบนัสให้ตัวที่ผ่านเกณฑ์ข้างบนแล้วเท่านั้น (ไม่ใช่ดันทุกหัวข้อของหมวดขึ้นมา)
  const usedInCategory = new Set()
  for (const cat of entry.categories) for (const attr of index.attrsByCategory.get(cat) ?? []) usedInCategory.add(attr)
  for (const [attr, s] of scores) {
    if (usedInCategory.has(attr)) {
      s.score += 0.15
      s.reasons.add('category')
    }
  }

  const byId = new Map(snapshot.attributes.map((a) => [String(a.attribute_id), a]))
  return [...scores.entries()]
    .filter(([id, s]) => byId.has(id) && s.score >= 0.5)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 3)
    .map(([id, s]) => ({ attribute_id: byId.get(id).attribute_id, attribute_name: byId.get(id).attribute_name, reasons: [...s.reasons] }))
}

/**
 * ตรวจแถวชีต "สเปค"
 * snapshot.values: Map<`${itm_code}|${attribute_id}`, value> — เฉพาะค่าร่วม (model_code NULL)
 * attributeMap: { [ชื่อหัวข้อตามไฟล์]: { attribute_id } | { create: true } }
 */
function planSpecs(rows, snapshot, productPlans, attributeMap = {}) {
  const attrByName = new Map(snapshot.attributes.map((a) => [normName(a.attribute_name), a]))
  const attrById = new Map(snapshot.attributes.map((a) => [String(a.attribute_id), a]))
  const resolution = new Map(Object.entries(attributeMap || {}).map(([k, v]) => [normName(k), v]))

  const newByName = new Map()
  for (const p of productPlans) if (!p.product_id && p.product_name) newByName.set(normName(p.product_name), p)
  const planById = new Map(productPlans.filter((p) => p.product_id).map((p) => [p.product_id, p]))
  const planByRow = new Map(productPlans.map((p) => [String(p.row), p]))
  const existingByName = new Map()
  for (const p of snapshot.products.values()) {
    if (!p.is_active) continue
    const key = normName(p.product_name)
    existingByName.set(key, existingByName.has(key) ? null : p) // null = ชื่อซ้ำ ใช้อ้างไม่ได้
  }

  const unknown = new Map() // ชื่อหัวข้อที่ไม่มีในระบบ → { name, rows }
  const seenPairs = new Map()

  const specs = []
  for (const raw of rows) {
    const value = cleanText(raw.value, 5000)
    const attrName = cleanText(raw.attribute_name, 255)
    if (!value && !attrName) continue
    const errors = []
    const spec = { row: raw.row, action: 'create', product_id: null, product_name: null, attribute_name: attrName, attribute_id: null, from: null, to: value, errors }
    specs.push(spec)

    // ช่องค่าว่าง = ไม่แตะค่าเดิม (เหมือนชีต products) — ไม่นับเป็นข้อผิดพลาด
    if (!value) {
      spec.action = 'skip'
      continue
    }
    if (value.length > MAX_VALUE_LENGTH) errors.push(`ค่ายาวเกิน ${MAX_VALUE_LENGTH} ตัวอักษร`)
    if (!attrName) errors.push('ไม่ได้ระบุหัวข้อสเปค')

    // หาว่าแถวนี้เป็นของสินค้าไหน
    const id = cleanText(raw.product_id, 50)
    const name = cleanText(raw.product_name, 255)
    let productKey = null // ใช้กันคู่ (สินค้า, หัวข้อ) ซ้ำ
    // คอลัมน์คุณสมบัติในชีตหมวดหมู่ — ผูกกับแถวสินค้าแถวเดียวกันตรงๆ ไม่ต้องจับคู่ด้วยชื่อ
    const owner = raw.product_row != null ? planByRow.get(String(raw.product_row)) : null
    if (owner && !owner.product_id) {
      spec.product_name = owner.product_name
      spec.new_product_row = owner.row
      productKey = `new:${owner.row}`
      if (owner.action === 'error') errors.push(`สินค้าใหม่ (${owner.row}) มีข้อผิดพลาด`)
    } else if (owner && owner.action === 'error') {
      spec.product_id = owner.product_id
      spec.product_name = owner.product_name
      errors.push(`แถวสินค้านี้มีข้อผิดพลาด`)
    } else if (id) {
      const product = snapshot.products.get(id)
      if (!product || !product.is_active) errors.push(`ไม่พบสินค้ารหัส ${id}`)
      else {
        spec.product_id = id
        spec.product_name = product.product_name
        productKey = id
        if (planById.get(id)?.action === 'error') errors.push(`สินค้า ${id} มีข้อผิดพลาดในแถวข้อมูลสินค้า`)
      }
    } else if (name) {
      const fresh = newByName.get(normName(name))
      const old = existingByName.get(normName(name))
      if (fresh) {
        spec.product_name = fresh.product_name
        spec.new_product_row = fresh.row
        productKey = `new:${fresh.row}`
        if (fresh.action === 'error') errors.push(`สินค้าใหม่ (${fresh.row}) มีข้อผิดพลาด`)
      } else if (old) {
        spec.product_id = old.product_id
        spec.product_name = old.product_name
        productKey = old.product_id
      } else if (old === null) {
        errors.push(`มีสินค้าชื่อ "${name}" มากกว่า 1 ตัว — ใส่รหัสสินค้าแทน`)
      } else {
        errors.push(`ไม่พบสินค้าชื่อ "${name}" ทั้งในระบบและในไฟล์`)
      }
    } else {
      errors.push('ต้องระบุรหัสสินค้า หรือชื่อสินค้าใหม่ที่อยู่ในไฟล์')
    }

    // หาหัวข้อสเปค
    if (attrName) {
      const known = attrByName.get(normName(attrName))
      if (known) {
        spec.attribute_id = known.attribute_id
        spec.attribute_name = known.attribute_name
      } else {
        const entry = unknown.get(normName(attrName)) ?? { name: attrName, rows: [] }
        entry.rows.push(raw.row)
        // เก็บค่าและหมวดของสินค้าไว้ให้ตัวแนะนำ (ค่าคล้ายกัน / หมวดเดียวกันใช้)
        entry.values ??= []
        entry.categories ??= new Set()
        if (value) entry.values.push(value)
        const cat = spec.product_id
          ? snapshot.products.get(spec.product_id)?.category_id
          : planByRow.get(String(spec.new_product_row))?.values?.category_id
        if (cat) entry.categories.add(cat)
        unknown.set(normName(attrName), entry)
        const pick = resolution.get(normName(attrName))
        if (pick?.create) {
          spec.new_attribute = true
        } else if (pick?.attribute_id != null && attrById.has(String(pick.attribute_id))) {
          const chosen = attrById.get(String(pick.attribute_id))
          spec.attribute_id = chosen.attribute_id
          spec.attribute_name = chosen.attribute_name
          spec.mapped_from = attrName
        } else {
          spec.action = 'pending' // รอแอดมินเลือกในหน้าพรีวิว
        }
      }
    }

    if (productKey && attrName && spec.action !== 'pending') {
      const pairKey = `${productKey}|${spec.attribute_id ?? `new:${normName(attrName)}`}`
      if (seenPairs.has(pairKey)) {
        const first = seenPairs.get(pairKey)
        errors.push(first === raw.row ? 'หัวข้อนี้ซ้ำกับอีกคอลัมน์ในแถวเดียวกัน' : `หัวข้อนี้ของสินค้านี้ซ้ำกับ ${first}`)
      }
      else seenPairs.set(pairKey, raw.row)
    }

    if (errors.length > 0) {
      spec.action = 'error'
      continue
    }
    if (spec.action === 'pending') continue
    if (spec.product_id && spec.attribute_id != null) {
      const from = snapshot.values.get(`${spec.product_id}|${spec.attribute_id}`)
      if (from !== undefined) {
        spec.from = from
        spec.action = from === value ? 'unchanged' : 'update'
      }
    }
  }

  const index = unknown.size ? suggestionIndex(snapshot) : null
  const unknownList = [...unknown.values()].map((u) => ({
    name: u.name,
    rows: u.rows,
    // ตัวอย่างค่าในไฟล์ ให้แอดมินเห็นประกอบการตัดสินใจว่าหมายถึงหัวข้อไหน
    samples: [...new Set(u.values ?? [])].slice(0, 3).map((v) => String(v).slice(0, 60)),
    suggestions: suggestAttributes(u, snapshot, index),
    resolution: resolution.get(normName(u.name)) ?? null,
  }))
  return { specs: specs.filter((s) => s.action !== 'skip'), unknown_attributes: unknownList }
}

function buildPlan(rows, snapshot, attributeMap) {
  const products = planProducts(rows.products || [], snapshot)
  const { specs, unknown_attributes } = planSpecs(rows.specs || [], snapshot, products, attributeMap)
  const count = (list, action) => list.filter((x) => x.action === action).length
  const summary = {
    product_create: count(products, 'create'),
    product_update: count(products, 'update'),
    product_unchanged: count(products, 'unchanged'),
    product_error: count(products, 'error'),
    spec_create: count(specs, 'create'),
    spec_update: count(specs, 'update'),
    spec_unchanged: count(specs, 'unchanged'),
    spec_error: count(specs, 'error'),
    spec_pending: count(specs, 'pending'),
  }
  const hasErrors = summary.product_error > 0 || summary.spec_error > 0
  const hasWork = summary.product_create + summary.product_update + summary.spec_create + summary.spec_update > 0
  return { products, specs, unknown_attributes, summary, ready: !hasErrors && summary.spec_pending === 0 && hasWork }
}

module.exports = { PRODUCT_COLUMNS, SPEC_COLUMNS, buildPlan, normName, normalizeTags, isRemoteImage, LOCAL_IMAGE }
