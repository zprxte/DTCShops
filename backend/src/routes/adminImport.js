// ===== นำเข้าสินค้าและสเปคจาก Excel (A10 — ทำกลับมา 25 ก.ย. 2026) =====
// mount ใต้ routes/admin.js (/api/admin/import) จึงผ่าน JWT + sanitize + ล้างแคชชุดเดียวกัน
//
//   GET  /template  เทมเพลต .xlsx สร้างจาก DB ทุกครั้ง (มีสินค้า/สเปคปัจจุบันเติมไว้ให้แก้ต่อ)
//   POST /parse     อัปโหลดไฟล์ → { rows, plan } ยังไม่เขียนอะไร
//   POST /plan      { rows, attribute_map } → plan — ใช้ตอนแอดมินเลือกหัวข้อสเปคในหน้าพรีวิว
//   POST /commit    { rows, attribute_map } → คำนวณแผนซ้ำ ถ้าไม่มีข้อผิดพลาดค่อยเขียนใน transaction เดียว
//
// logic ตรวจข้อมูลทั้งหมดอยู่ใน utils/importPlan.js (ไม่แตะ DB, มีเทสต์)
const express = require('express')
const multer = require('multer')
const ExcelJS = require('exceljs')
const { PrismaClient } = require('@prisma/client')
const asyncHandler = require('../utils/asyncHandler')
const { stripHtml } = require('../utils/stripHtml')
const { PRODUCT_COLUMNS, SPEC_COLUMNS, buildPlan, normName, normalizeTags, isRemoteImage, LOCAL_IMAGE } = require('../utils/importPlan')
const { fetchImage, checkImageUrl } = require('../utils/remoteImage')
const { saveImage, removeImage, imageExists } = require('../utils/imageStore')

const router = express.Router()
const prisma = new PrismaClient()

// ชื่อชีตของเทมเพลตรุ่นก่อน (products/specs และชื่อไทย) — ยังอ่านได้ แต่เทมเพลตใหม่เป็นชีตละหมวด
const PRODUCT_SHEET = 'products'
const SPEC_SHEET = 'specs'
const SHEET_ALIASES = { [PRODUCT_SHEET]: ['สินค้า'], [SPEC_SHEET]: ['สเปค'] }
const LIST_SHEET = '_lists' // ชีตซ่อนสำหรับ dropdown (ชื่ออังกฤษ เลี่ยงปัญหาเครื่องหมายคำพูดในสูตร)
const MAX_ROWS = 3000
const MAX_SPEC_ROWS = 30000 // ค่าคุณสมบัติ 1 ช่อง = 1 แถวภายใน (สินค้า × หัวข้อ)
const HEADER_FILL = 'FF4472C4' // สีหัวตารางตามภาพเทมเพลตที่ผู้ใช้ส่งมา

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /\.xlsx$/i.test(file.originalname)),
})

// ภาพข้อมูลปัจจุบันที่ planner ใช้เทียบ — ค่าทุกตัวอยู่ในรูปเดียวกับที่อ่านจากไฟล์
async function loadSnapshot(db = prisma) {
  const [items, categories, attributes, values] = await Promise.all([
    db.tbl_item.findMany(),
    // ไม่กรอง flag — ตรงกับรายการในหน้าแอดมิน (GET /admin/categories, /admin/attributes)
    db.tbl_item_type.findMany({ orderBy: { itm_type_desc: 'asc' } }),
    db.tbl_attribute.findMany({ orderBy: { attribute_name: 'asc' } }),
    db.tbl_attribute_value.findMany({ where: { model_code: null } }),
  ])
  const products = new Map()
  for (const item of items) {
    products.set(item.itm_code, {
      product_id: item.itm_code,
      product_name: item.itm_desc,
      sku: item.itm_sku || null,
      category_id: item.itm_type_code || null,
      product_price: item.itm_price ?? null,
      stock_quantity: item.itm_qty ?? null,
      tags: normalizeTags(item.itm_tags) || null,
      shopee_link: item.itm_shopee_end_point || null,
      lazada_link: item.itm_lazada_end_point || null,
      tiktok_link: item.itm_tiktok_end_point || null,
      line_link: item.itm_line_end_point || null,
      // ฟอร์มแอดมินแสดง/บันทึกรายละเอียดเป็นข้อความล้วนอยู่แล้ว — เทียบแบบเดียวกัน
      // ไม่งั้นสินค้าที่ DB ยังเก็บเป็น HTML จะขึ้น "แก้" ทุกครั้งทั้งที่ไม่ได้แตะ
      description: stripHtml(item.itm_information) || null,
      product_image: item.itm_image_master || null,
      is_active: item.itm_flag !== '0',
    })
  }
  return {
    products,
    categories: categories.map((c) => ({ category_id: c.itm_type_code, category_name: c.itm_type_desc })),
    attributes: attributes.map((a) => ({ attribute_id: a.attribute_code, attribute_name: a.attribute_name })),
    values: new Map(values.map((v) => [`${v.itm_code}|${v.attribute_code}`, v.value])),
  }
}

// ตรวจรูปทุกค่าที่ต่างจากของเดิมก่อนสร้างแผน — ลิงก์ภายนอกลองโหลดจริง (มีแคช 10 นาที)
// ผลใส่ใน snapshot.imageChecks ให้ planner ขึ้น error ในพรีวิวได้ตั้งแต่ก่อนกดยืนยัน
async function attachImageChecks(rows, snapshot) {
  const pending = new Set()
  for (const r of rows.products || []) {
    const value = String(r.product_image ?? '').trim()
    if (!value) continue
    if (r.product_id && snapshot.products.get(String(r.product_id).trim())?.product_image === value) continue
    pending.add(value)
  }
  const checks = new Map()
  const queue = [...pending]
  // โหลดพร้อมกันทีละ 4 ลิงก์ ไม่ถล่มเว็บต้นทาง
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const value = queue.shift()
      if (isRemoteImage(value)) checks.set(value, await checkImageUrl(value))
      else if (LOCAL_IMAGE.test(value)) checks.set(value, (await imageExists(value)) ? { ok: true } : { ok: false, error: 'ไม่พบไฟล์นี้ในระบบ' })
    }
  }))
  snapshot.imageChecks = checks
  return snapshot
}

// ---------- เทมเพลต ----------
// 1 ชีตต่อ 1 หมวดหมู่ (ผู้ใช้เลือก 25 ก.ย. 2026): คอลัมน์ข้อมูลสินค้า (หัวน้ำเงิน) + คอลัมน์หัวข้อคุณสมบัติ
// ที่สินค้าในหมวดนั้นใช้จริง (หัวเขียว) · สินค้า 1 แถวมีสเปคครบในแถวเดียว · หมวดกล้องไม่เห็นคอลัมน์ของ GPS

const ATTR_FILL = 'FF70AD47'
const ID_FILL = 'FF808080' // product_id หัวเทา = ระบบใช้ ไม่ต้องกรอก (สินค้าใหม่เว้นว่าง)
const GUIDE_SHEET = 'วิธีใช้'
const NO_CATEGORY_SHEET = 'ไม่มีหมวดหมู่'
const EXTRA_ATTR_SLOTS = 15 // คอลัมน์ว่างท้ายชีตที่มี dropdown ชื่อหัวข้อ ไว้เพิ่มหัวข้อที่หมวดนี้ยังไม่เคยใช้
const RESERVED_SHEETS = [GUIDE_SHEET, LIST_SHEET, SPEC_SHEET, ...SHEET_ALIASES[SPEC_SHEET]]

// ชื่อชีต Excel: ≤31 ตัว ห้าม : \ / ? * [ ] — ใช้ทั้งตอนสร้างเทมเพลตและตอนเดาหมวดจากชื่อชีตตอนอ่านไฟล์
function sheetNameFor(text) {
  return String(text || '').replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'หมวด'
}

function paintHeader(cell, fill, note) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
  cell.alignment = { vertical: 'middle' }
  if (note) cell.note = note
}

function addCategorySheet(wb, name, { products, attrNames, snapshot, categoryName, listRefs }) {
  const sheet = wb.addWorksheet(name)
  const productCols = PRODUCT_COLUMNS.length
  sheet.columns = [
    ...PRODUCT_COLUMNS.map((c) => ({ key: c.key, width: c.width })),
    ...attrNames.map((a) => ({ key: `attr:${a}`, width: Math.min(Math.max(a.length + 4, 16), 36) })),
  ]
  const header = sheet.getRow(1)
  header.height = 20
  PRODUCT_COLUMNS.forEach((c, i) => {
    header.getCell(i + 1).value = c.key
    const hint = c.key === 'category_name' ? `\nเว้นว่างในแถวสินค้าใหม่ = หมวดของชีตนี้` : ''
    const idNote = 'รหัสสินค้า — ระบบใช้ระบุสินค้าเดิม ไม่ต้องกรอก\nสินค้าใหม่: เว้นว่าง · อย่าแก้รหัสของสินค้าเดิม'
    paintHeader(header.getCell(i + 1), c.key === 'product_id' ? ID_FILL : HEADER_FILL,
      c.key === 'product_id' ? idNote : `${c.label}${c.required ? ' (จำเป็นสำหรับสินค้าใหม่)' : ''}\nตัวอย่าง: ${c.example}${hint}`)
  })
  attrNames.forEach((a, i) => {
    header.getCell(productCols + i + 1).value = a
    paintHeader(header.getCell(productCols + i + 1), ATTR_FILL, 'หัวข้อคุณสมบัติ — ช่องว่าง = ไม่แก้ค่าเดิม')
  })
  // ช่องหัวคอลัมน์ว่างถัดไป: เลือกชื่อหัวข้อจาก dropdown หรือพิมพ์ใหม่ (ถามในหน้าพรีวิว)
  for (let i = 0; i < EXTRA_ATTR_SLOTS; i++) {
    const cell = header.getCell(productCols + attrNames.length + i + 1)
    cell.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [listRefs.attributes],
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'หัวข้อนี้ยังไม่มีในระบบ',
      error: 'ใช้ต่อได้ ระบบจะถามในหน้าพรีวิวว่าหมายถึงหัวข้อไหน หรือจะสร้างหัวข้อใหม่',
    }
    if (i === 0) cell.note = 'เพิ่มหัวข้อคุณสมบัติ: เลือกชื่อจากรายการ หรือพิมพ์ชื่อใหม่ แล้วกรอกค่าในแถวสินค้า'
  }

  for (const p of products) {
    const row = { ...p, category_name: categoryName(p.category_id) }
    for (const a of attrNames) {
      const value = snapshot.valueByName.get(`${p.product_id}|${a}`)
      if (value !== undefined) row[`attr:${a}`] = value
    }
    sheet.addRow(row)
  }

  if (listRefs.categories) {
    const col = PRODUCT_COLUMNS.findIndex((c) => c.key === 'category_name') + 1
    for (let r = 2; r <= Math.max(products.length + 300, 500); r++) {
      sheet.getCell(r, col).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [listRefs.categories],
        showErrorMessage: true,
        errorTitle: 'หมวดหมู่ไม่ถูกต้อง',
        error: 'เลือกหมวดหมู่จากรายการเท่านั้น',
      }
    }
  }
  // ตรึงหัวตาราง + product_id/sku/product_name ไว้ เลื่อนไปดูคอลัมน์คุณสมบัติแล้วยังรู้ว่าแถวไหนสินค้าอะไร
  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 3 }]
  return sheet
}

router.get('/template', asyncHandler(async (_req, res) => {
  const snapshot = await loadSnapshot()
  const categoryName = (id) => snapshot.categories.find((c) => c.category_id === id)?.category_name ?? null
  const attrName = new Map(snapshot.attributes.map((a) => [String(a.attribute_id), a.attribute_name]))
  snapshot.valueByName = new Map()
  for (const [key, value] of snapshot.values) {
    const [itm, attr] = key.split('|')
    if (attrName.has(attr)) snapshot.valueByName.set(`${itm}|${attrName.get(attr)}`, value)
  }
  const active = [...snapshot.products.values()]
    .filter((p) => p.is_active)
    .sort((a, b) => a.product_id.localeCompare(b.product_id))

  const wb = new ExcelJS.Workbook()
  wb.creator = 'DTC Product Compare'
  wb.created = new Date()

  const guide = wb.addWorksheet(GUIDE_SHEET)
  const lines = [
    'วิธีใช้ไฟล์นำเข้าสินค้า',
    '',
    '1 ชีตต่อ 1 หมวดหมู่ · 1 แถวต่อสินค้า 1 ตัว (มีสินค้าปัจจุบันเติมไว้ให้แล้ว)',
    '  • หัวสีน้ำเงิน = ข้อมูลสินค้า · หัวสีเขียว = หัวข้อคุณสมบัติที่สินค้าในหมวดนั้นใช้อยู่',
    '  • เพิ่มสินค้าใหม่: พิมพ์แถวใหม่ต่อท้าย ใส่ product_name (จำเป็น) — category_name เว้นว่างได้ จะใช้หมวดของชีต',
    '  • แก้สินค้าเดิม: แก้ในแถวของสินค้านั้นได้เลย · product_id (หัวสีเทา) ระบบใช้ระบุว่าแถวไหนเป็นสินค้าตัวไหน อย่าแก้ค่านี้ · สินค้าใหม่เว้นว่าง',
    '  • คัดลอกแถวสินค้าเดิมไปทำสินค้าใหม่ได้ แต่ต้องลบ product_id ของแถวใหม่ออก (ถ้าลืม ระบบจะเตือนในหน้าพรีวิว)',
    '  • ช่องที่เว้นว่าง = ไม่แก้ค่าเดิม (ล้างค่าผ่าน Excel ไม่ได้ ต้องล้างในหน้าแก้ไขสินค้า) · แถวที่ไม่ได้แก้อะไรจะถูกข้ามเอง',
    '  • เพิ่มหัวข้อคุณสมบัติ: เลือก/พิมพ์ชื่อในหัวคอลัมน์ว่างถัดจากคอลัมน์สีเขียว — ชื่อที่ยังไม่มีในระบบ หน้าพรีวิวจะถามว่าหมายถึงหัวข้อไหนหรือจะสร้างใหม่',
    '  • category_name เลือกจากรายการ · tags คั่นด้วยจุลภาค · ลิงก์ต้องขึ้นต้นด้วย https://',
    '  • product_image ใส่ลิงก์รูป ระบบจะดาวน์โหลดมาเก็บเองตอนกดยืนยัน (jpeg/png/webp/gif ไม่เกิน 5MB) — ค่า /uploads/... คือรูปเดิมในระบบ',
    '  • ค่าคุณสมบัติในไฟล์นี้คือค่าที่ใช้ร่วมทุกโมเดล · สเปคเฉพาะโมเดลต้องแก้ในหน้าโมเดลสินค้า',
    '  • ชี้เมาส์ที่หัวคอลัมน์เพื่อดูความหมายและตัวอย่าง',
    '',
    'อัปโหลดแล้วระบบจะแสดงพรีวิวให้ตรวจก่อน ยังไม่บันทึกจนกว่าจะกดยืนยัน',
    `สร้างไฟล์เมื่อ ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
    '',
    'ตัวอย่างแถวสินค้าใหม่ (ใส่ในชีตหมวดหมู่ ไม่ใช่ชีตนี้):',
  ]
  lines.forEach((line, i) => {
    const cell = guide.getCell(i + 1, 1)
    cell.value = line
    if (i === 0) cell.font = { bold: true, size: 14 }
  })
  const exampleRow = { sku: 'PROD-001', product_name: 'ตัวอย่างสินค้า', product_price: 9990, description: 'รายละเอียดสินค้า', product_image: 'https://dtcshops.com/api/image/2024-12/1734946529659-730706673.jpg', stock_quantity: 10, tags: 'ตัวอย่าง, สินค้าใหม่' }
  const exampleAttrs = [['ความละเอียดกล้อง', '1080p'], ['มาตรฐานกันน้ำกันฝุ่น', 'IP67']]
  const headRow = guide.getRow(lines.length + 1)
  const bodyRow = guide.getRow(lines.length + 2)
  PRODUCT_COLUMNS.forEach((c, i) => {
    guide.getColumn(i + 1).width = c.width
    headRow.getCell(i + 1).value = c.key
    paintHeader(headRow.getCell(i + 1), HEADER_FILL)
    bodyRow.getCell(i + 1).value = exampleRow[c.key] ?? null
  })
  exampleAttrs.forEach(([name, value], i) => {
    const col = PRODUCT_COLUMNS.length + i + 1
    guide.getColumn(col).width = 18
    headRow.getCell(col).value = name
    paintHeader(headRow.getCell(col), ATTR_FILL)
    bodyRow.getCell(col).value = value
  })

  const lists = wb.addWorksheet(LIST_SHEET, { state: 'hidden' })
  snapshot.categories.forEach((c, i) => { lists.getCell(i + 1, 1).value = c.category_name })
  snapshot.attributes.forEach((a, i) => { lists.getCell(i + 1, 2).value = a.attribute_name })
  const listRefs = {
    categories: snapshot.categories.length ? `${LIST_SHEET}!$A$1:$A$${snapshot.categories.length}` : null,
    attributes: `${LIST_SHEET}!$B$1:$B$${Math.max(snapshot.attributes.length, 1)}`,
  }

  // หัวข้อของแต่ละกลุ่ม = หัวข้อที่สินค้าในกลุ่มมีค่า เรียงจากที่ใช้บ่อยสุด (หัวข้อหลักของหมวดอยู่ซ้าย)
  const attrsOf = (products) => {
    const count = new Map()
    for (const p of products) {
      for (const a of snapshot.attributes) {
        if (snapshot.valueByName.has(`${p.product_id}|${a.attribute_name}`)) count.set(a.attribute_name, (count.get(a.attribute_name) || 0) + 1)
      }
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th')).map(([n]) => n)
  }
  const used = new Set(RESERVED_SHEETS.map(normName))
  const uniqueName = (text) => {
    const base = sheetNameFor(text)
    let name = base
    for (let n = 2; used.has(normName(name)); n++) name = `${base.slice(0, 28)} (${n})`
    used.add(normName(name))
    return name
  }
  for (const c of snapshot.categories) {
    const products = active.filter((p) => p.category_id === c.category_id)
    addCategorySheet(wb, uniqueName(c.category_name), { products, attrNames: attrsOf(products), snapshot, categoryName, listRefs })
  }
  const orphans = active.filter((p) => !p.category_id || !snapshot.categories.some((c) => c.category_id === p.category_id))
  if (orphans.length) {
    addCategorySheet(wb, uniqueName(NO_CATEGORY_SHEET), { products: orphans, attrNames: attrsOf(orphans), snapshot, categoryName, listRefs })
  }

  // เปิดไฟล์มาเจอชีตหมวดแรก (ลำดับ: วิธีใช้, _lists ซ่อน, หมวด…)
  wb.views = [{ activeTab: 2 }]
  const stamp = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="product-import-${stamp}.xlsx"`)
  await wb.xlsx.write(res)
  res.end()
}))

// ---------- อ่านไฟล์ ----------

// ค่าในเซลล์ของ exceljs มีหลายรูป (ข้อความ, ตัวเลข, วันที่, ลิงก์, rich text, สูตร)
function cellText(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (Array.isArray(value.richText)) return value.richText.map((t) => t.text).join('')
  if (value.text !== undefined) return cellText(value.text) // ลิงก์ { text, hyperlink }
  if (value.result !== undefined) return cellText(value.result) // สูตร
  return String(value)
}

// หัวคอลัมน์ → { key } (ฟิลด์ที่รู้จัก รับทั้งหัวอังกฤษและหัวไทยของเทมเพลตรุ่นแรก) หรือ { attr } (อย่างอื่น = หัวข้อคุณสมบัติ)
function headerMap(sheet, columns, { allowAttributes }) {
  const byHeader = new Map(columns.flatMap((c) => [[normName(c.key), c.key], [normName(c.label), c.key]]))
  const map = {}
  sheet.getRow(1).eachCell((cell, col) => {
    const text = String(cellText(cell.value) ?? '').trim()
    if (!text) return
    const key = byHeader.get(normName(text))
    if (key) map[col] = { key }
    else if (allowAttributes) map[col] = { attr: text }
  })
  return map
}

// ชีตสินค้า (ชีตหมวดหมู่ / products เดิม) → แถวสินค้า + ค่าคุณสมบัติจากคอลัมน์ที่ไม่ใช่ฟิลด์สินค้า
function readProductSheet(sheet, defaultCategory, out) {
  const map = headerMap(sheet, PRODUCT_COLUMNS, { allowAttributes: true })
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const label = `${sheet.name} แถว ${rowNumber}`
    const product = { row: label }
    const attrs = []
    row.eachCell((cell, col) => {
      const target = map[col]
      if (!target) return
      const v = cellText(cell.value)
      if (v === null || String(v).trim() === '') return
      if (target.key) product[target.key] = v
      else attrs.push({ attribute_name: target.attr, value: v })
    })
    if (Object.keys(product).length === 1 && attrs.length === 0) return // แถวว่าง
    if (!product.product_id && !product.category_name && defaultCategory) product.category_name = defaultCategory
    out.products.push(product)
    for (const a of attrs) {
      out.specs.push({ row: label, product_row: label, product_id: product.product_id, product_name: product.product_name, ...a })
    }
  })
}

// ชีต specs ของเทมเพลตรุ่นก่อน (1 แถวต่อ 1 ค่า) — ยังรับอยู่
function readSpecSheet(sheet, out) {
  const map = headerMap(sheet, SPEC_COLUMNS, { allowAttributes: false })
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const data = { row: `${sheet.name} แถว ${rowNumber}` }
    row.eachCell((cell, col) => {
      const key = map[col]?.key
      const v = cellText(cell.value)
      if (key && v !== null && String(v).trim() !== '') data[key] = v
    })
    if (Object.keys(data).length > 1) out.specs.push(data)
  })
}

function readWorkbook(wb, categories) {
  const out = { products: [], specs: [] }
  const categoryBySheet = new Map(categories.map((c) => [normName(sheetNameFor(c.category_name)), c.category_name]))
  const specNames = [SPEC_SHEET, ...SHEET_ALIASES[SPEC_SHEET]].map(normName)
  const skip = [GUIDE_SHEET, LIST_SHEET].map(normName)
  for (const sheet of wb.worksheets) {
    const name = normName(sheet.name)
    if (skip.includes(name) || sheet.state === 'hidden' || sheet.state === 'veryHidden') continue
    if (specNames.includes(name)) readSpecSheet(sheet, out)
    else readProductSheet(sheet, categoryBySheet.get(name) ?? null, out)
  }
  return out
}

// body จาก /plan และ /commit — รับเฉพาะฟิลด์ที่รู้จัก ป้องกันของแปลกปนมา
function rowsFromBody(body) {
  const label = (v) => String(v ?? '').slice(0, 200)
  const products = (Array.isArray(body?.rows?.products) ? body.rows.products : []).slice(0, MAX_ROWS).map((r) => {
    const out = { row: label(r?.row) }
    for (const c of PRODUCT_COLUMNS) if (r?.[c.key] !== undefined && r[c.key] !== null) out[c.key] = r[c.key]
    return out
  })
  const specs = (Array.isArray(body?.rows?.specs) ? body.rows.specs : []).slice(0, MAX_SPEC_ROWS).map((r) => {
    const out = { row: label(r?.row) }
    if (r?.product_row != null) out.product_row = label(r.product_row)
    for (const c of SPEC_COLUMNS) if (r?.[c.key] !== undefined && r[c.key] !== null) out[c.key] = r[c.key]
    return out
  })
  return { products, specs }
}

router.post('/parse', (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    try {
      if (err) return res.status(400).json({ message: 'อ่านไฟล์ไม่สำเร็จ (ขนาดไม่เกิน 5MB)' })
      if (!req.file) return res.status(400).json({ message: 'กรุณาเลือกไฟล์ .xlsx' })
      const wb = new ExcelJS.Workbook()
      try {
        await wb.xlsx.load(req.file.buffer)
      } catch {
        return res.status(400).json({ message: 'ไฟล์นี้ไม่ใช่ Excel (.xlsx) ที่อ่านได้' })
      }
      const snapshot = await loadSnapshot()
      const rows = readWorkbook(wb, snapshot.categories)
      if (rows.products.length === 0 && rows.specs.length === 0) {
        return res.status(400).json({ message: 'ไม่พบข้อมูลสินค้าในไฟล์ — ใช้เทมเพลตที่ดาวน์โหลดจากหน้านี้' })
      }
      if (rows.products.length > MAX_ROWS || rows.specs.length > MAX_SPEC_ROWS) {
        return res.status(400).json({ message: `ไฟล์ใหญ่เกินไป (สินค้าไม่เกิน ${MAX_ROWS} แถว, ค่าคุณสมบัติไม่เกิน ${MAX_SPEC_ROWS} ช่อง)` })
      }
      const plan = buildPlan(rows, await attachImageChecks(rows, snapshot), {})
      res.json({ file_name: req.file.originalname, rows, plan })
    } catch (e) {
      next(e)
    }
  })
})

router.post('/plan', asyncHandler(async (req, res) => {
  const rows = rowsFromBody(req.body)
  res.json({ plan: buildPlan(rows, await attachImageChecks(rows, await loadSnapshot()), req.body?.attribute_map) })
}))

// ---------- บันทึก ----------

function slugify(text) {
  return String(text || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

router.post('/commit', asyncHandler(async (req, res) => {
  const rows = rowsFromBody(req.body)
  const attributeMap = req.body?.attribute_map

  // ดาวน์โหลดรูปก่อนเปิด transaction (ไม่ถือ transaction ค้างระหว่างรอเน็ต)
  // ถ้าบันทึกไม่สำเร็จจะลบไฟล์ที่โหลดมาทิ้งให้หมด ไม่ให้มีไฟล์กำพร้าค้างในโฟลเดอร์
  const preSnapshot = await attachImageChecks(rows, await loadSnapshot())
  const pre = buildPlan(rows, preSnapshot, attributeMap)
  if (!pre.ready) {
    return res.status(400).json({ message: 'ยังบันทึกไม่ได้ — มีแถวที่ผิดพลาดหรือหัวข้อสเปคที่ยังไม่ได้เลือก', plan: pre })
  }
  const imageChecks = new Map()
  const localByUrl = new Map()
  const savedFiles = []
  const cleanup = () => Promise.all(savedFiles.map(removeImage))
  for (const p of pre.products) {
    const url = p.values?.product_image
    if (!['create', 'update'].includes(p.action) || !isRemoteImage(url) || localByUrl.has(url)) continue
    if (!p.changes.some((c) => c.field === 'product_image')) continue
    try {
      const saved = await saveImage(await fetchImage(url))
      savedFiles.push(saved.key)
      localByUrl.set(url, saved.url)
      imageChecks.set(url, { ok: true })
    } catch (e) {
      await cleanup()
      return res.status(400).json({ message: `โหลดรูปแถว ${p.row} ไม่สำเร็จ: ${e.message}` })
    }
  }

  let result
  try {
    result = await prisma.$transaction(async (tx) => {
      // คำนวณแผนใหม่ในธุรกรรมเดียวกับที่เขียน — ข้อมูลเปลี่ยนระหว่างดูพรีวิวก็ยังตรวจถูก
      // (ผลตรวจรูปใช้ของรอบก่อนหน้า ไม่โหลดซ้ำ)
      const snapshot = await loadSnapshot(tx)
      snapshot.imageChecks = new Map([...preSnapshot.imageChecks, ...imageChecks])
      const plan = buildPlan(rows, snapshot, attributeMap)
      if (!plan.ready) return { plan }
      return writePlan(tx, plan, localByUrl)
    }, { timeout: 60000 })
  } catch (e) {
    await cleanup()
    throw e
  }

  if (!result.created) {
    await cleanup()
    return res.status(400).json({ message: 'ยังบันทึกไม่ได้ — ข้อมูลในระบบเปลี่ยนระหว่างดูพรีวิว ตรวจรายการใหม่อีกครั้ง', plan: result.plan })
  }
  res.json({
    message: 'นำเข้าข้อมูลแล้ว',
    created: result.created,
    updated: result.updated,
    spec_written: result.specWrites,
    attributes_created: result.attributesCreated,
    images_downloaded: localByUrl.size,
  })
}))

// เขียนแผนที่ตรวจผ่านแล้วลง DB (เรียกภายใน $transaction เท่านั้น)
async function writePlan(tx, plan, localByUrl) {
  {
    // หัวข้อสเปคใหม่ที่แอดมินกดยืนยันให้สร้าง — สร้างชื่อละครั้งเดียว
    const createdAttr = new Map()
    for (const spec of plan.specs) {
      if (!spec.new_attribute || !['create', 'update'].includes(spec.action)) continue
      const key = normName(spec.attribute_name)
      if (createdAttr.has(key)) continue
      const row = await tx.tbl_attribute.create({ data: { attribute_name: spec.attribute_name, flag: '1', ist_dt: new Date() } })
      createdAttr.set(key, row.attribute_code)
    }

    // รหัส/slug ของสินค้าใหม่ — ไล่เลขต่อจากตัวมากสุด และจำ slug ที่ใช้ไปในรอบนี้ด้วย
    let maxCode = 0
    const usedSlugs = new Set()
    for (const p of await tx.tbl_item.findMany({ select: { itm_code: true, slug: true } })) {
      const m = String(p.itm_code).match(/^itm-?0*(\d+)$/)
      if (m) maxCode = Math.max(maxCode, Number(m[1]))
      if (p.slug) usedSlugs.add(p.slug)
    }
    const takeSlug = (name) => {
      const base = slugify(name) || 'product'
      let slug = base
      for (let n = 2; usedSlugs.has(slug); n++) slug = `${base}-${n}`
      usedSlugs.add(slug)
      return slug
    }

    const columnsOf = (v) => ({
      ...(v.product_name !== undefined ? { itm_desc: v.product_name } : {}),
      ...(v.sku !== undefined ? { itm_sku: v.sku } : {}),
      ...(v.category_id !== undefined ? { itm_type_code: v.category_id } : {}),
      ...(v.stock_quantity !== undefined ? { itm_qty: v.stock_quantity } : {}),
      ...(v.tags !== undefined ? { itm_tags: v.tags } : {}),
      ...(v.shopee_link !== undefined ? { itm_shopee_end_point: v.shopee_link } : {}),
      ...(v.lazada_link !== undefined ? { itm_lazada_end_point: v.lazada_link } : {}),
      ...(v.tiktok_link !== undefined ? { itm_tiktok_end_point: v.tiktok_link } : {}),
      ...(v.line_link !== undefined ? { itm_line_end_point: v.line_link } : {}),
      ...(v.description !== undefined ? { itm_information: v.description } : {}),
      // ลิงก์ภายนอกถูกแทนด้วย path ของไฟล์ที่ดาวน์โหลดมาแล้ว — ไม่เก็บ URL เว็บอื่นลง DB
      ...(v.product_image !== undefined ? { itm_image_master: localByUrl.get(v.product_image) ?? v.product_image } : {}),
    })

    const newCodeByRow = new Map()
    const created = []
    const updated = []
    for (const p of plan.products) {
      if (p.action === 'create') {
        const itm_code = `itm-${String(++maxCode).padStart(7, '0')}`
        const price = p.values.product_price ?? 0
        await tx.tbl_item.create({
          data: {
            itm_code,
            itm_flag: '1',
            itm_price: price,
            itm_lowest_price: price,
            itm_highest_price: price,
            ist_dt: new Date(),
            slug: takeSlug(p.values.product_name),
            ...columnsOf(p.values),
          },
        })
        newCodeByRow.set(p.row, itm_code)
        created.push(itm_code)
      } else if (p.action === 'update') {
        const data = { ...columnsOf(p.values), mdf_dt: new Date() }
        if (p.values.product_price !== undefined) {
          // ช่วงราคาบนการ์ดคิดจากราคาสินค้า + ส่วนเพิ่มของโมเดล (กติกาเดียวกับ PUT /admin/products)
          const item = await tx.tbl_item.findUnique({ where: { itm_code: p.product_id } })
          const codes = (item.itm_model_code || '').split(',').map((c) => c.trim()).filter(Boolean)
          const models = codes.length ? await tx.tbl_item_model.findMany({ where: { itm_model_code: { in: codes } } }) : []
          const prices = models.map((m) => p.values.product_price + (m.itm_model_addon_price ?? 0))
          data.itm_price = p.values.product_price
          data.itm_lowest_price = prices.length ? Math.min(...prices) : p.values.product_price
          data.itm_highest_price = prices.length ? Math.max(...prices) : p.values.product_price
        }
        await tx.tbl_item.update({ where: { itm_code: p.product_id }, data })
        updated.push(p.product_id)
      }
    }

    let specWrites = 0
    for (const s of plan.specs) {
      if (!['create', 'update'].includes(s.action)) continue
      const itm_code = s.product_id ?? newCodeByRow.get(s.new_product_row)
      const attribute_code = s.attribute_id ?? createdAttr.get(normName(s.attribute_name))
      const current = await tx.tbl_attribute_value.findFirst({ where: { itm_code, attribute_code, model_code: null } })
      if (current) {
        await tx.tbl_attribute_value.update({ where: { id: current.id }, data: { value: s.to, mdf_dt: new Date() } })
      } else {
        await tx.tbl_attribute_value.create({ data: { itm_code, attribute_code, value: s.to, model_code: null, flag: '1', ist_dt: new Date() } })
      }
      specWrites++
    }

    return { plan, created, updated, specWrites, attributesCreated: createdAttr.size }
  }
}

module.exports = router
module.exports.loadSnapshot = loadSnapshot
