// ใช้เฉพาะตอน deploy บน Vercel (frontend/vercel.json) — /api/* ทั้งหมดเข้า Express ตัวเดียวกับที่รันบน Docker
// Docker ไม่ใช้ไฟล์นี้: ตอน dev Vite proxy ส่ง /api ไป backend:4000, ตอน prod nginx ทำแทน
import app from '../../backend/src/index.js'

export default app
