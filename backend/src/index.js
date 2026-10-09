require('dotenv').config()
const express = require('express')
const path = require('path')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')

// ค่าที่ขาดไม่ได้ — ขาดแล้วให้หยุดตั้งแต่เปิดเครื่อง ดีกว่าไปพังตอนมีคนล็อกอิน
// (JWT_SECRET ว่าง = jwt.sign โยน error ทุกครั้ง / DATABASE_URL ว่าง = ทุก query 500)
for (const name of ['JWT_SECRET', 'DATABASE_URL']) {
  if (!process.env[name]) {
    console.error(`ขาดตัวแปร ${name} ใน backend/.env — ดู backend/.env.example`)
    process.exit(1)
  }
}

const isProduction = process.env.NODE_ENV === 'production'
const app = express()
const PORT = process.env.PORT || 4000

// อยู่หลัง reverse proxy (nginx) ตอน deploy — ต้องบอก Express ให้เชื่อ X-Forwarded-For
// ไม่งั้น rate limit จะเห็นผู้ใช้ทุกคนเป็น IP เดียวกัน (IP ของ proxy) แล้วคนทั้งบริษัท
// แชร์โควตา 300 ครั้ง / 15 นาทีร่วมกัน · ค่า = จำนวน proxy ที่อยู่หน้า backend (ปกติ 1)
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY)
  app.set('trust proxy', Number.isNaN(hops) ? process.env.TRUST_PROXY : hops)
}

// ===== Middleware =====
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}))
// นำเข้า Excel ส่งแถวทั้งไฟล์กลับมาตอน /plan และ /commit (สินค้า + ค่าคุณสมบัติทุกช่อง) —
// เกินเพดาน 100KB ของ express.json() ตั้งแต่ไฟล์เทมเพลตเปล่าๆ จึงขยายเฉพาะเส้นนี้
// (ต้องมาก่อนตัวทั่วไป — body-parser ข้ามคำขอที่ถูกอ่าน body ไปแล้ว)
app.use('/api/admin/import', express.json({ limit: '50mb' }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(morgan(isProduction ? 'combined' : 'dev'))

// Uploaded product images — served as static files, referenced from the DB
// only by their relative /uploads/... path (see routes/admin.js POST /admin/upload/image).
// Files actually live under the project-root database/uploads (moved 2026-09-03,
// see that route's own comment), the "/uploads" URL prefix here is unchanged.
// '../../database' = project root on the host (backend/src → root) AND inside
// Docker (/app/src → /, where compose mounts database/ at /database).
// helmet's default Cross-Origin-Resource-Policy would block the frontend (different
// port/origin in dev) from loading these in <img>, so relax it for this route only.
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  next()
}, express.static(path.join(__dirname, '../../database/uploads')))

// Rate limiting
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  message: { message: 'Too many requests, please try again later.' }
}))

// Stricter limit for auth
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many login attempts, please try again later.' }
}))

// ===== Routes =====
app.use('/api/auth', require('./routes/auth'))
app.use('/api/search', require('./routes/search'))
app.use('/api/products', require('./routes/products'))
app.use('/api/categories', require('./routes/categories'))
app.use('/api/compare', require('./routes/compare'))
app.use('/api/footer', require('./routes/footer'))
app.use('/api/banners', require('./routes/banners'))
app.use('/api/shops', require('./routes/shops'))
app.use('/api/logs', require('./routes/logs'))
app.use('/api/admin', require('./routes/admin'))

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }))

// 404
app.use((req, res) => res.status(404).json({ message: 'Route not found' }))

// Global error handler
app.use((err, req, res, _next) => {
  // Prisma P2025 = แก้/ลบแถวที่ไม่มีอยู่ (ไอดีผิดหรือถูกลบไปแล้ว) — เป็น 404 ไม่ใช่ error ของเซิร์ฟเวอร์
  if (err.code === 'P2025') return res.status(404).json({ message: 'ไม่พบข้อมูล' })
  console.error(err.stack)
  const status = err.status || err.statusCode || 500
  // production ไม่ส่งข้อความ error ภายใน (ชื่อตาราง/คำสั่ง SQL จาก Prisma) ออกไปให้ผู้ใช้เห็น
  // error ฝั่งผู้ใช้ (4xx เช่น JSON พัง / ไฟล์ใหญ่เกิน) ยังบอกเหตุตามเดิม
  res.status(status).json({
    message: isProduction && status >= 500 ? 'Internal server error' : (err.message || 'Internal server error'),
  })
})

// รันตรง (node src/index.js) = เปิดพอร์ตเอง · ถูก require (Vercel function) = ส่ง app ให้แพลตฟอร์มเรียก
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(` Server running at http://localhost:${PORT}`)
  })
}

module.exports = app