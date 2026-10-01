const revoked = new Map()

//เก็บเฉพาะจนกว่า token จะหมดอายุก็พอ — หลังจากนั้น jwt.verify() ปฏิเสธเองอยู่แล้ว
//ไม่ต้องจำต่อ กวาดทิ้งทุกครั้งที่มีการเพิ่ม เพื่อไม่ให้ Map โตไม่มีที่สิ้นสุด
function purgeExpired(nowSeconds) {
  for (const [jti, exp] of revoked) {
    if (exp <= nowSeconds) revoked.delete(jti)
  }
}

//สั่งยกเลิก token ใบหนึ่ง — รับ payload ที่ผ่าน jwt.verify() มาแล้ว
//token ที่ออกก่อนมีฟีเจอร์นี้จะไม่มี jti จึงยกเลิกไม่ได้ คืน false ให้ผู้เรียกรู้
function revokeToken(payload) {
  if (!payload?.jti || !payload?.exp) return false
  const now = Math.floor(Date.now() / 1000)
  purgeExpired(now)
  revoked.set(payload.jti, payload.exp)
  return true
}

function isRevoked(jti) {
  if (!jti) return false
  const exp = revoked.get(jti)
  if (exp === undefined) return false
  // หมดอายุแล้วก็ไม่ต้องเก็บต่อ ปล่อยให้ jwt.verify() เป็นคนปฏิเสธแทน
  if (exp <= Math.floor(Date.now() / 1000)) {
    revoked.delete(jti)
    return false
  }
  return true
}

module.exports = { revokeToken, isRevoked }
