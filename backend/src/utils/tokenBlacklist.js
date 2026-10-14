// บัญชีดำ token ที่ออกจากระบบแล้ว (ในหน่วยความจำ — รีสตาร์ทแล้วหาย)
const revoked = new Map()

// กวาดรายการที่หมดอายุทิ้ง ไม่ให้ Map โตไม่สิ้นสุด
function purgeExpired(nowSeconds) {
  for (const [jti, exp] of revoked) {
    if (exp <= nowSeconds) revoked.delete(jti)
  }
}

// ยกเลิก token ใบหนึ่ง — token รุ่นเก่าที่ไม่มี jti ยกเลิกไม่ได้ คืน false
function revokeToken(payload) {
  if (!payload?.jti || !payload?.exp) return false
  const now = Math.floor(Date.now() / 1000)
  purgeExpired(now)
  revoked.set(payload.jti, payload.exp)
  return true
}

// token นี้ถูกยกเลิกแล้วหรือยัง
function isRevoked(jti) {
  if (!jti) return false
  const exp = revoked.get(jti)
  if (exp === undefined) return false
  if (exp <= Math.floor(Date.now() / 1000)) {
    revoked.delete(jti)
    return false
  }
  return true
}

module.exports = { revokeToken, isRevoked }
