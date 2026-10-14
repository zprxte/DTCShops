// บันทึกการเข้าชมหน้าเว็บที่ไม่มี endpoint ของตัวเอง (หน้าสินค้าบันทึกใน products.js แล้ว)

const express = require('express')
const router = express.Router()
const { PrismaClient } = require('@prisma/client')
const { logPageView } = require('../utils/activityLog')

const prisma = new PrismaClient()

// ค่า page ที่รับได้ — กันคนยิงขยะเข้าตารางสถิติ
const ALLOWED_PAGES = new Set(['home', 'products', 'compare'])

// POST /api/logs/view
router.post('/view', async (req, res) => {
  const page = String(req.body?.page || '').trim()
  if (!ALLOWED_PAGES.has(page)) {
    return res.status(400).json({ message: 'Invalid page' })
  }
  await logPageView(prisma, page)
  res.status(201).json({ logged: true })
})

module.exports = router
