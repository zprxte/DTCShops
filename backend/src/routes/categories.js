const express = require('express')
const router = express.Router()
const { PrismaClient } = require('@prisma/client')
const { cached } = require('../utils/cache')
const prisma = new PrismaClient()

router.get('/', async (_req, res) => {
  try {
    const payload = await cached('categories', async () => {
      const categories = await prisma.tbl_item_type.findMany({
        where: { itm_type_flag: '1', items: { some: { itm_flag: '1' } } },
        orderBy: { itm_type_desc: 'asc' },
      })
      return categories.map((c) => ({
        category_id: c.itm_type_code,
        category_name: c.itm_type_desc,
        sample_image: c.thumbnail || null,
      }))
    })
    res.json(payload)
  } catch (err) {
    console.error('Category list error:', err)
    res.status(500).json({ message: 'ไม่สามารถโหลดหมวดหมู่ได้' })
  }
})

module.exports = router
