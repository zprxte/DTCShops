// แบนเนอร์หน้าแรก (อ่านอย่างเดียว) — ลิงก์ที่ไม่ใช่ URL ไม่ทำให้กดได้
const express = require('express')
const router = express.Router()
const { PrismaClient } = require('@prisma/client')
const { cached } = require('../utils/cache')
const prisma = new PrismaClient()

// โหลดแบนเนอร์จาก tbl_bnn_slide (แคช 5 นาที แอดมินบันทึกแล้วล้างให้)
async function loadBanners() {
  const slides = await prisma.tbl_bnn_slide.findMany({
    where: { bnn_slide_flag: '1', bnn_image_master: { not: null } },
    // bnn_slide_index ซ้ำกันได้ — เรียงต่อด้วยรหัสให้ลำดับคงที่
    orderBy: [{ bnn_slide_index: 'asc' }, { bnn_slide_code: 'asc' }],
  })
  return slides.map((s) => ({
      banner_id: s.bnn_slide_code,
      image: s.bnn_image_master || null,
      title: s.bnn_slide_desc,
      link: /^https?:\/\//i.test(s.bnn_slide_end_point ?? '') ? s.bnn_slide_end_point : null,
    }))
}

// GET /api/banners
router.get('/', async (_req, res) => {
  try {
    res.json(await cached('banners', loadBanners))
  } catch (err) {
    console.error('Banner list error:', err)
    res.status(500).json({ message: 'ไม่สามารถโหลดแบนเนอร์ได้' })
  }
})

module.exports = router
