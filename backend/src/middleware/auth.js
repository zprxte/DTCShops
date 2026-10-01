const jwt = require('jsonwebtoken')
const { isRevoked } = require('../utils/tokenBlacklist')
const JWT_SECRET = process.env.JWT_SECRET

module.exports = function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' })
  }

  const token = authHeader.split(' ')[1]
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    // ลายเซ็นถูกและยังไม่หมดอายุ ไม่ได้แปลว่ายังใช้ได้ — ต้องเช็คด้วยว่าถูกสั่งยกเลิก
    // ไปแล้วหรือยัง (ผู้ใช้กดออกจากระบบ) ดู utils/tokenBlacklist.js
    if (isRevoked(payload.jti)) {
      return res.status(401).json({ message: 'Unauthorized: Token has been revoked' })
    }
    req.admin = payload
    next()
  } catch {
    return res.status(401).json({ message: 'Unauthorized: Invalid or expired token' })
  }
}