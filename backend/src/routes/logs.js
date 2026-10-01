// POST /api/logs/view — บันทึกการเข้าชมหน้าเว็บฝั่ง public ลง tbl_logs
//
// ทำไมต้องให้ frontend เป็นคนเรียก: หน้าแรก/ค้นหา/เปรียบเทียบ ไม่ได้ผูกกับ
// endpoint ใดเป็นการเฉพาะ (หน้าแรกยิงทั้ง /categories /banners /products
// พร้อมกัน ถ้านับฝั่ง server จะกลายเป็นนับ 3 ครั้งต่อการเข้าชมครั้งเดียว)
// ส่วนหน้ารายละเอียดสินค้ามี endpoint ของตัวเองชัดเจน จึงบันทึกฝั่ง server
// ไปแล้วใน routes/products.js — หน้านี้จึงไม่ต้องส่งเข้ามาซ้ำ
//
// endpoint นี้ไม่ต้อง auth (ฝั่ง public ไม่มีระบบผู้ใช้) แต่จำกัดค่า page
// ที่รับได้ไว้เป็นลิสต์ตายตัว กันคนยิงขยะเข้าตารางสถิติ

const express = require('express')
const router = express.Router()
const { PrismaClient } = require('@prisma/client')
const { logPageView } = require('../utils/activityLog')

const prisma = new PrismaClient()

// หน้าที่นับเป็น "การเข้าชมเว็บไซต์" ได้ — ค่านอกลิสต์นี้ถูกปฏิเสธ
const ALLOWED_PAGES = new Set(['home', 'products', 'compare'])

router.post('/view', async (req, res) => {
  const page = String(req.body?.page || '').trim()
  if (!ALLOWED_PAGES.has(page)) {
    return res.status(400).json({ message: 'Invalid page' })
  }
  await logPageView(prisma, page)
  res.status(201).json({ logged: true })
})

module.exports = router
