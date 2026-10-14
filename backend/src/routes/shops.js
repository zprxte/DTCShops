// สาขา DTC Shop (อ่านอย่างเดียว) — แปลง lat/lon เป็นตัวเลข ตัดสาขาที่ไม่มีพิกัด
const express = require('express')
const router = express.Router()
const { PrismaClient } = require('@prisma/client')
const { cached } = require('../utils/cache')
const prisma = new PrismaClient()

// เลขต่อท้าย "1176 ต่อ 62" → 62 ไว้เรียงสาขา (ไม่มีเลข = Infinity ไปอยู่ท้าย)
function extNumber(tel) {
  const match = String(tel ?? '').match(/(\d+)\s*$/)
  return match ? Number(match[1]) : Infinity
}

// โหลดสาขา กรอง และเรียง (แคช 5 นาที)
async function loadShops() {
  const shops = await prisma.tbl_shop.findMany({
    where: { flag: '1' },
  })
  const withCoords = shops
    .map((s) => ({
      shop_id: s.shop_id,
      shop_name: s.shop_name,
      address: [s.address, s.road, s.sub_district, s.district, s.province, s.postcode]
        .filter(Boolean)
        .join(' '),
      tel: s.tel,
      image: s.thumbnail || null,
      lat: Number(s.lat),
      lon: Number(s.lon),
    }))
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon))
    .sort((a, b) => extNumber(a.tel) - extNumber(b.tel))
  return withCoords
}

// GET /api/shops
router.get('/', async (_req, res) => {
  try {
    res.json(await cached('shops', loadShops))
  } catch (err) {
    console.error('Shop list error:', err)
    res.status(500).json({ message: 'ไม่สามารถโหลดข้อมูลสาขาได้' })
  }
})

module.exports = router
