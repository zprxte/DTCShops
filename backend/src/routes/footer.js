const express = require('express')
const router = express.Router()
const { PrismaClient } = require('@prisma/client')
const { cached } = require('../utils/cache')
const prisma = new PrismaClient()

// เนื้อหา footer มาจากตาราง CMS ที่แทบไม่เปลี่ยน แต่ทุกหน้าฝั่ง public เรียกใช้
// ตอน mount — แคชไว้ 5 นาที (หน้าแอดมิน "footer" ล้างแคชให้เองตอนบันทึก)
async function loadFooter() {
  const rows = await prisma.tbl_footer.findMany({
    where: { flag: '1', deleted_at: null },
    orderBy: { sequence: 'asc' },
  })

  const byType = (type) => rows.filter((r) => r.type === type)

  const company = {}
  for (const r of byType('text')) {
    if (r.name === 'ชื่อบริษัท') company.name = r.title
    else if (r.name === 'ที่อยู่') company.address = r.title
  }

  // The 'email' row's title is a full `<a href="mailto:...">` anchor in
  // production (the real site injects it via v-html) — strip tags so the
  // frontend gets plain text and builds its own mailto: link/icon instead.
  const contact = {}
  for (const r of byType('head')) {
    if (r.head_title) contact[r.head_title] = r.title ? r.title.replace(/<[^>]+>/g, '').trim() : r.title
  }

  const menu = byType('link').map((r) => ({ title: r.title, url: r.url }))

  const certifications = byType('image').map((r) => ({
    title: r.title,
    name: r.name,
    image: r.image || null,
  }))

  const social = byType('social-footer').map((r) => ({
    platform: r.sub_type,
    url: r.url,
    image: r.image || null,
  }))

  return { company, contact, menu, certifications, social }
}

router.get('/', async (_req, res) => {
  try {
    res.json(await cached('footer', loadFooter))
  } catch (err) {
    console.error('Footer content error:', err)
    res.status(500).json({ message: 'ไม่สามารถโหลดข้อมูล footer ได้' })
  }
})

module.exports = router
