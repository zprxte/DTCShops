// ที่เก็บรูปสินค้า — ใช้ร่วมกันโดย POST /admin/upload/image และนำเข้า Excel
//
// DB เก็บ path แบบเดียวกันเสมอ: /uploads/products/<ปี-เดือน>/<ไฟล์>
//   ไม่ได้ตั้ง SUPABASE_URL  → เขียนลง database/uploads/ (Docker / เครื่องตัวเอง — เหมือนเดิม)
//   ตั้ง SUPABASE_URL + SUPABASE_SERVICE_KEY → อัปขึ้น Supabase Storage bucket "uploads" (Vercel ดิสก์อ่านอย่างเดียว)
//     key ใน bucket = path หลัง /uploads/ · หน้าเว็บส่ง /uploads/* ต่อไป bucket (deploy/vercel/build.mjs)
//     หน้าเว็บ แอป และบอท LINE จึงไม่ต้องรู้ว่ารูปอยู่ที่ไหน
const fs = require('fs')
const path = require('path')

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const BUCKET = process.env.SUPABASE_BUCKET || 'uploads'
const useStorage = Boolean(SUPABASE_URL && SERVICE_KEY)

// โฟลเดอร์ database/ — บนเครื่อง backend/src/utils → ราก · ใน Docker /app/src/utils → / (mount ที่ /database)
const DATABASE_DIR = path.join(__dirname, '../../../database')
const UPLOAD_ROOT = path.join(DATABASE_DIR, 'uploads')

const CONTENT_TYPE = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }

function storageUrl(key, isPublic) {
  const encoded = key.split('/').map(encodeURIComponent).join('/')
  return `${SUPABASE_URL}/storage/v1/object/${isPublic ? 'public/' : ''}${BUCKET}/${encoded}`
}

const authHeaders = () => ({ Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY })

// บันทึกรูปใหม่ → { url: '/uploads/products/...', key } (key ใช้ลบทิ้งตอนบันทึกล้ม)
async function saveImage({ buffer, ext }) {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const key = `products/${month}/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`
  if (useStorage) {
    const res = await fetch(storageUrl(key, false), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': CONTENT_TYPE[ext] || 'application/octet-stream' },
      body: buffer,
    })
    if (!res.ok) throw new Error(`อัปรูปขึ้น Supabase Storage ไม่สำเร็จ (${res.status}) ${await res.text()}`)
  } else {
    const full = path.join(UPLOAD_ROOT, key)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, buffer)
  }
  return { url: `/uploads/${key}`, key }
}

async function removeImage(key) {
  if (useStorage) {
    await fetch(storageUrl(key, false), { method: 'DELETE', headers: authHeaders() }).catch(() => {})
  } else {
    fs.rmSync(path.join(UPLOAD_ROOT, key), { force: true })
  }
}

// path /uploads/... ชี้ไปรูปที่มีอยู่จริงไหม (กัน ../ หลุดออกนอกโฟลเดอร์)
async function imageExists(value) {
  const key = String(value).replace(/^\/uploads\//, '')
  if (!key || key.split('/').includes('..')) return false
  if (useStorage) {
    const res = await fetch(storageUrl(key, true), { method: 'HEAD' }).catch(() => null)
    return Boolean(res?.ok)
  }
  const full = path.normalize(path.join(UPLOAD_ROOT, key))
  return full.startsWith(UPLOAD_ROOT + path.sep) && fs.existsSync(full)
}

module.exports = { saveImage, removeImage, imageExists, useStorage }
