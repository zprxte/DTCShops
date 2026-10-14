// ที่เก็บรูป: ไม่มี env Supabase = database/uploads/ · มี = Supabase Storage bucket "uploads" (DB เก็บ /uploads/... เหมือนกัน)
const fs = require('fs')
const path = require('path')

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const BUCKET = process.env.SUPABASE_BUCKET || 'uploads'
const useStorage = Boolean(SUPABASE_URL && SERVICE_KEY)

// database/ — บนเครื่องคือรากโปรเจกต์ · ใน Docker mount ที่ /database
const DATABASE_DIR = path.join(__dirname, '../../../database')
const UPLOAD_ROOT = path.join(DATABASE_DIR, 'uploads')

const CONTENT_TYPE = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }

// URL ของไฟล์ใน Supabase Storage
function storageUrl(key, isPublic) {
  const encoded = key.split('/').map(encodeURIComponent).join('/')
  return `${SUPABASE_URL}/storage/v1/object/${isPublic ? 'public/' : ''}${BUCKET}/${encoded}`
}

const authHeaders = () => ({ Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY })

// บันทึกรูปใหม่ → { url, key } (key ใช้ลบทิ้งตอนบันทึกล้ม)
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

// ลบรูปตาม key
async function removeImage(key) {
  if (useStorage) {
    await fetch(storageUrl(key, false), { method: 'DELETE', headers: authHeaders() }).catch(() => {})
  } else {
    fs.rmSync(path.join(UPLOAD_ROOT, key), { force: true })
  }
}

// path /uploads/... ชี้รูปที่มีอยู่จริงไหม (กัน ../ หลุดนอกโฟลเดอร์)
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
