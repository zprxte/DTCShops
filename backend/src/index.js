// จุดเริ่มของ API: ตั้ง middleware, rate limit, route ทั้งหมด และตัวจัดการ error กลาง
require('dotenv').config()
const express = require('express')
const path = require('path')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')

// ขาด JWT_SECRET / DATABASE_URL ให้หยุดตั้งแต่เปิด ดีกว่าไปพังตอนมีคนใช้
for (const name of ['JWT_SECRET', 'DATABASE_URL']) {
  if (!process.env[name]) {
    console.error(`ขาดตัวแปร ${name} ใน backend/.env — ดู backend/.env.example`)
    process.exit(1)
  }
}

const isProduction = process.env.NODE_ENV === 'production'
const app = express()
const PORT = process.env.PORT || 4000

// อยู่หลัง nginx ต้องเชื่อ X-Forwarded-For ไม่งั้น rate limit เห็นทุกคนเป็น IP เดียวกัน (ค่า = จำนวน proxy)
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY)
  app.set('trust proxy', Number.isNaN(hops) ? process.env.TRUST_PROXY : hops)
}

app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}))
// นำเข้า Excel ส่ง body ใหญ่เกิน 100KB — ต้องอยู่ก่อน express.json() ตัวทั่วไป
app.use('/api/admin/import', express.json({ limit: '50mb' }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(morgan(isProduction ? 'combined' : 'dev'))

// เสิร์ฟรูปจาก database/uploads · ผ่อน Cross-Origin-Resource-Policy ให้หน้าเว็บคนละพอร์ตโหลดรูปได้
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  next()
}, express.static(path.join(__dirname, '../../database/uploads')))

// จำกัด 300 คำขอ / 15 นาที ต่อ IP
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { message: 'Too many requests, please try again later.' }
}))

// ล็อกอินจำกัด 10 ครั้ง / 15 นาที
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many login attempts, please try again later.' }
}))

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

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }))

app.use((req, res) => res.status(404).json({ message: 'Route not found' }))

// ตัวจัดการ error กลาง — P2025 = 404 · production ไม่ส่งข้อความ error ภายในออกไป
app.use((err, req, res, _next) => {
  if (err.code === 'P2025') return res.status(404).json({ message: 'ไม่พบข้อมูล' })
  console.error(err.stack)
  const status = err.status || err.statusCode || 500
  res.status(status).json({
    message: isProduction && status >= 500 ? 'Internal server error' : (err.message || 'Internal server error'),
  })
})

// รันตรง = เปิดพอร์ตเอง · ถูก require (Vercel) = ส่ง app ออกไปให้แพลตฟอร์มเรียก
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(` Server running at http://localhost:${PORT}`)
  })
}

module.exports = app