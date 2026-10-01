const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { PrismaClient } = require('@prisma/client')
const authMiddleware = require('../middleware/auth')
const { revokeToken, isRevoked } = require('../utils/tokenBlacklist')
const prisma = new PrismaClient()

const JWT_SECRET = process.env.JWT_SECRET
// ค่าสำรอง '2h' — ถ้า .env ไม่มีบรรทัดนี้ jwt.sign จะได้ expiresIn: undefined
// แล้วออก token ที่ไม่มีวันหมดอายุแบบเงียบๆ
const JWT_EXPIRES = process.env.JWT_EXPIRES || '2h'

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ code: 'missingCredentials', message: 'กรุณากรอก username และ password' })
    }

    const admin = await prisma.tbl_users.findFirst({ where: { username, flag: '1' } })
    if (!admin || !admin.password) {
      return res.status(401).json({ code: 'invalidCredentials', message: 'username หรือ password ไม่ถูกต้อง' })
    }

    const valid = await bcrypt.compare(password, admin.password)
    if (!valid) {
      return res.status(401).json({ code: 'invalidCredentials', message: 'username หรือ password ไม่ถูกต้อง' })
    }

    // jti = รหัสประจำ token ใบนี้ ต้องมีถึงจะสั่งยกเลิกทีหลังได้ (ดู utils/tokenBlacklist.js)
    // ไม่มีมันจะแยกไม่ออกว่า token ใบไหนคือใบที่ผู้ใช้เพิ่งกดออกจากระบบ
    const token = jwt.sign(
      { admin_id: admin.user_id, username: admin.username, jti: crypto.randomUUID() },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    )

    res.json({
      token,
      admin: { admin_id: admin.user_id, username: admin.username },
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ code: 'loginFailedGeneric', message: 'เข้าสู่ระบบไม่สำเร็จ' })
  }
})

/**
 * POST /api/auth/logout — ยกเลิก token ใบที่ส่งมาทันที
 *
 * ผ่าน authMiddleware ก่อน จึงมั่นใจว่า token ถูกต้องและยังไม่หมดอายุ — ไม่งั้นใครก็
 * ยิง jti มั่วๆ มาถมบัญชีดำจนหน่วยความจำเต็มได้
 *
 * ตอบ 200 เสมอแม้ยกเลิกไม่ได้ (token รุ่นเก่าที่ไม่มี jti) เพราะฝั่งหน้าเว็บลบ token
 * ทิ้งไปแล้วในทุกกรณี การตอบ error กลับไปมีแต่จะทำให้ผู้ใช้เห็นข้อความผิดพลาดทั้งที่
 * ออกจากระบบสำเร็จ · ฟิลด์ revoked บอกความจริงไว้ให้ตรวจสอบได้
 */
router.post('/logout', authMiddleware, (req, res) => {
  const revoked = revokeToken(req.admin)
  res.json({ message: 'ออกจากระบบแล้ว', revoked })
})

/**
 * GET /api/auth/me — verify token and return admin info
 */
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ message: 'Unauthorized' })

    const decoded = jwt.verify(token, JWT_SECRET)
    // เส้นทางนี้ตรวจ token เองไม่ได้ผ่าน authMiddleware จึงต้องเช็คบัญชีดำเองด้วย
    // ไม่งั้น token ที่กดออกจากระบบไปแล้วจะยังผ่านด่านนี้ และหน้าเว็บจะเข้าใจว่ายังล็อกอินอยู่
    if (isRevoked(decoded.jti)) return res.status(401).json({ message: 'Token has been revoked' })
    const admin = await prisma.tbl_users.findFirst({
      where: { user_id: decoded.admin_id, flag: '1' },
      select: { user_id: true, username: true },
    })

    if (!admin) return res.status(401).json({ message: 'Admin not found' })
    res.json({ admin: { admin_id: admin.user_id, username: admin.username } })
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' })
  }
})

module.exports = router
