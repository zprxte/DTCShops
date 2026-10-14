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
// ต้องมีค่าสำรอง — expiresIn: undefined = token ไม่มีวันหมดอายุแบบเงียบๆ
const JWT_EXPIRES = process.env.JWT_EXPIRES || '2h'

// POST /api/auth/login — ตรวจ username/password แล้วออก JWT
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

    // jti = รหัสประจำ token ต้องมีถึงจะยกเลิกทีหลังได้
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

// POST /api/auth/logout — ยกเลิก token ใบนี้ทันที (ตอบ 200 เสมอ · revoked บอกว่ายกเลิกได้จริงไหม)
router.post('/logout', authMiddleware, (req, res) => {
  const revoked = revokeToken(req.admin)
  res.json({ message: 'ออกจากระบบแล้ว', revoked })
})

// GET /api/auth/me — ตรวจ token แล้วคืนข้อมูลแอดมิน
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ message: 'Unauthorized' })

    const decoded = jwt.verify(token, JWT_SECRET)
    // เส้นนี้ไม่ผ่าน authMiddleware จึงต้องเช็คบัญชีดำเอง
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
