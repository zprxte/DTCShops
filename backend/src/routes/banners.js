const express = require('express')
const router = express.Router()
const { PrismaClient } = require('@prisma/client')
const { cached } = require('../utils/cache')
const prisma = new PrismaClient()

/**
 * GET /api/banners — hero banner slides for HomePage.vue's carousel above
 * "หมวดหมู่สินค้า". Reads tbl_bnn_slide (real dtcshops.com production data,
 * restored 2026-09-02 — see CLAUDE.md's Database Schema section), the same
 * table backing the admin "แบนเนอร์" pages (GET/POST/PUT/DELETE
 * /api/admin/banners in admin.js) — this is the public read-only mirror of
 * that table, additive, no schema change.
 *
 * bnn_slide_end_point holds a real link for some rows and unrelated
 * placeholder text for others (this production dump has a few Lorem-ipsum
 * test rows sitting alongside real ones — not filtered out, shown as-is
 * like every other table restored from this dump) — only used as a click
 * target when it actually looks like a URL, otherwise the slide just isn't
 * clickable.
 */
// แบนเนอร์เปลี่ยนน้อยมากแต่อยู่บนสุดของหน้าแรก — แคชไว้ (หน้าแอดมิน
// "แบนเนอร์" ล้างแคชให้เองตอนเพิ่ม/แก้/ลบ)
async function loadBanners() {
  const slides = await prisma.tbl_bnn_slide.findMany({
    where: { bnn_slide_flag: '1', bnn_image_master: { not: null } },
    // ข้อมูลจริงหลายแถวมี bnn_slide_index ซ้ำกัน (เช่น "1" ทั้งกลุ่ม) — เรียง
    // ต่อด้วย bnn_slide_code กันลำดับสลับไปมาไม่คงที่ระหว่างแต่ละ request
    orderBy: [{ bnn_slide_index: 'asc' }, { bnn_slide_code: 'asc' }],
  })
  return slides.map((s) => ({
      banner_id: s.bnn_slide_code,
      image: s.bnn_image_master || null,
      title: s.bnn_slide_desc,
      link: /^https?:\/\//i.test(s.bnn_slide_end_point ?? '') ? s.bnn_slide_end_point : null,
    }))
}

router.get('/', async (_req, res) => {
  try {
    res.json(await cached('banners', loadBanners))
  } catch (err) {
    console.error('Banner list error:', err)
    res.status(500).json({ message: 'ไม่สามารถโหลดแบนเนอร์ได้' })
  }
})

module.exports = router
