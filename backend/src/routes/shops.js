const express = require('express')
const router = express.Router()
const { PrismaClient } = require('@prisma/client')
const { cached } = require('../utils/cache')
const prisma = new PrismaClient()

/**
 * GET /api/shops — "DTC Shop & Service" branch map on HomePage.vue (below
 * "สินค้าแนะนำ"). Reads tbl_shop (real dtcshops.com production data,
 * restored 2026-09-02 — see CLAUDE.md's Database Schema section), the same
 * table backing the admin "ร้านค้า" > "ข้อมูลร้านค้า" CRUD pages
 * (GET/POST/PUT/DELETE /api/admin/shops in admin.js) — this is the public
 * read-only mirror of that table, additive, no schema change.
 *
 * lat/lon are stored as VARCHAR (matches the production dump verbatim) —
 * parsed to Number here and rows with no usable coordinate are dropped, so
 * the frontend map never has to guard against NaN/null markers itself.
 */
// ตัวเลขต่อท้าย "1176 ต่อ 62" → 62 — ใช้เรียงสาขาน้อยไปมาก (ไม่ใช่เลข "1176"
// ตัวหน้าซึ่งซ้ำกันทุกแถว) คืน Infinity ถ้าไม่มีเลขให้อ่าน กันสาขาไม่มีเบอร์
// ต่อหลุดขึ้นไปอยู่หน้าสุดผิดที่
function extNumber(tel) {
  const match = String(tel ?? '').match(/(\d+)\s*$/)
  return match ? Number(match[1]) : Infinity
}

// รายชื่อสาขาแทบไม่เปลี่ยนเลย และต้องคำนวณ/กรอง/เรียงฝั่ง JS ทุกครั้ง — แคชไว้
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

router.get('/', async (_req, res) => {
  try {
    res.json(await cached('shops', loadShops))
  } catch (err) {
    console.error('Shop list error:', err)
    res.status(500).json({ message: 'ไม่สามารถโหลดข้อมูลสาขาได้' })
  }
})

module.exports = router
