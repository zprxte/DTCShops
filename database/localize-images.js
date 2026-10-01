#!/usr/bin/env node
/**
 * ดึงรูปทั้งหมดที่ DB ยังอ้างถึงเซิร์ฟเวอร์ภายนอก (เว็บต้นแบบ dtcshops.com)
 * มาเก็บไว้ในเครื่องที่ database/uploads/products/ แล้วเขียน path ใน DB ใหม่
 * เป็น /uploads/products/<YYYY-MM>/<ไฟล์>
 *
 * ทำไมต้องมี: ถ้าปล่อยให้ DB เก็บ URL ของเว็บต้นแบบไว้ เบราว์เซอร์ของผู้ใช้
 * จะไปดึงรูปจากเซิร์ฟเวอร์เขาโดยตรง (hotlink) — เน็ตหลุด หรือเขาย้าย/ลบไฟล์
 * เมื่อไหร่ รูปก็หายทันที ซึ่งรับไม่ได้ตอนนำเสนอ
 *
 * รันซ้ำได้เสมอ (idempotent): ค่าที่เป็น /uploads/ อยู่แล้วจะถูกข้าม และไฟล์ที่
 * มีอยู่แล้วบนดิสก์ก็ไม่โหลดซ้ำ
 *
 * ต้องรันทุกครั้งหลัง restore-full-dump.sh หรือหลังสร้าง volume ของ DB ใหม่
 *
 *   node database/localize-images.js
 */
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const CONTAINER = process.env.DB_CONTAINER || 'product_compare_db'
const DB_USER = process.env.POSTGRES_USER || 'postgres'
const DB_NAME = process.env.POSTGRES_DB || 'product_compare'
const REMOTE_BASE = 'https://dtcshops.com/api/image/'
const URL_PREFIX = '/uploads/products/'
const DEST_ROOT = path.join(__dirname, 'uploads', 'products')

// ตาราง -> คอลัมน์ที่เก็บ path รูป
const TARGETS = [
  ['tbl_item', ['itm_image_master', ...Array.from({ length: 9 }, (_, i) => `itm_image_sub${i + 1}`)]],
  ['tbl_item_type', ['thumbnail']],
  ['tbl_footer', ['image']],
  ['tbl_shop', ['thumbnail']],
  ['tbl_bnn_slide', ['bnn_image_master']],
]

const psql = (sql, quiet) =>
  execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, quiet ? '-Atc' : '-c', sql], {
    encoding: 'utf8',
  })

// path ที่ "ยังไม่ localize" = ไม่ว่าง และไม่ได้ขึ้นต้นด้วย /uploads/
const notLocal = (col) => `${col} IS NOT NULL AND ${col} <> '' AND ${col} NOT LIKE '/uploads/%'`

// ตัด URL เต็มของเว็บต้นแบบออก เหลือ path สัมพัทธ์ (YYYY-MM/ไฟล์) — ข้อมูลจริง
// เก็บมาทั้งสองแบบปนกัน บางแถวเป็น URL เต็ม บางแถวเป็น path สั้น
const toRelative = (value) => value.replace(REMOTE_BASE, '')

async function main() {
  // 1) เก็บ path ที่ยังไม่ localize ทั้งหมดจากทุกตาราง
  const found = new Set()
  for (const [table, cols] of TARGETS) {
    for (const col of cols) {
      const out = psql(`SELECT ${col} FROM ${table} WHERE ${notLocal(col)}`, true).trim()
      if (out) out.split(/\r?\n/).forEach((v) => found.add(v.trim()))
    }
  }
  if (found.size === 0) {
    console.log('ไม่มีรูปที่ต้อง localize — DB เก็บ path แบบ /uploads/ ครบแล้ว')
    return
  }

  // 2) ดาวน์โหลดไฟล์ที่ยังไม่มีบนดิสก์
  console.log(`พบ path ที่ยังชี้ออกนอก ${found.size} รายการ — เริ่มดาวน์โหลด`)
  let downloaded = 0
  let existed = 0
  const failed = []
  for (const value of found) {
    const rel = toRelative(value)
    if (!/^\d{4}-\d{2}\//.test(rel)) {
      failed.push(`${value} -> รูปแบบ path ไม่รู้จัก ข้ามไป`)
      continue
    }
    const dest = path.join(DEST_ROOT, rel)
    if (fs.existsSync(dest) && fs.statSync(dest).size > 100) {
      existed++
      continue
    }
    try {
      const res = await fetch(REMOTE_BASE + rel)
      if (!res.ok) {
        failed.push(`${rel} -> HTTP ${res.status}`)
        continue
      }
      const buf = Buffer.from(await res.arrayBuffer())
      // กันไฟล์ error page/ไฟล์ว่างที่ตอบ 200 มาแต่ไม่ใช่รูป
      const isImage =
        (buf[0] === 0x89 && buf[1] === 0x50) || (buf[0] === 0xff && buf[1] === 0xd8) || buf.slice(0, 4).toString() === 'RIFF'
      if (!isImage) {
        failed.push(`${rel} -> ไม่ใช่ไฟล์รูป (${buf.length} ไบต์)`)
        continue
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, buf)
      downloaded++
    } catch (err) {
      failed.push(`${rel} -> ${err.message}`)
    }
  }
  console.log(`ดาวน์โหลดใหม่ ${downloaded} ไฟล์, มีอยู่แล้ว ${existed} ไฟล์, ล้มเหลว ${failed.length}`)
  failed.forEach((f) => console.log('  ล้มเหลว:', f))

  // 3) เขียน path ใน DB ใหม่ — เฉพาะแถวที่ไฟล์ปลายทางมีอยู่จริง จะได้ไม่เปลี่ยน
  //    ลิงก์ที่ยังใช้ได้ให้กลายเป็น 404 เวลาดาวน์โหลดพลาด
  const ok = [...found].filter((v) => {
    const rel = toRelative(v)
    return /^\d{4}-\d{2}\//.test(rel) && fs.existsSync(path.join(DEST_ROOT, rel))
  })
  if (ok.length === 0) {
    console.log('ไม่มีไฟล์ที่พร้อมใช้ ไม่แก้ DB')
    process.exitCode = 1
    return
  }
  const cases = ok
    .map((v) => `WHEN ${quote(v)} THEN ${quote(URL_PREFIX + toRelative(v))}`)
    .join(' ')
  const statements = TARGETS.flatMap(([table, cols]) =>
    cols.map(
      (col) => `UPDATE ${table} SET ${col} = CASE ${col} ${cases} ELSE ${col} END WHERE ${notLocal(col)};`
    )
  )
  psql(`BEGIN; ${statements.join(' ')} COMMIT;`)
  console.log(`เขียน path ใน DB ใหม่แล้ว ${ok.length} รายการ`)

  // 4) ตรวจซ้ำว่าไม่เหลือ path ที่ชี้ออกนอกแล้วจริง
  let leftover = 0
  for (const [table, cols] of TARGETS) {
    for (const col of cols) {
      leftover += Number(psql(`SELECT count(*) FROM ${table} WHERE ${notLocal(col)}`, true).trim())
    }
  }
  console.log(leftover === 0 ? 'ตรวจแล้ว: ไม่เหลือ path ที่ชี้ออกนอก' : `เหลือ path ที่ชี้ออกนอกอีก ${leftover} แถว`)
  if (leftover !== 0) process.exitCode = 1
}

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
