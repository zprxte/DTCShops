// ดาวน์โหลดรูปจากลิงก์ในไฟล์ Excel — กัน SSRF: ตรวจ IP ปลายทางทุกทอดของ redirect ไม่ให้ไปเครือข่ายภายใน
const dns = require('dns').promises
const net = require('net')

const MAX_BYTES = 5 * 1024 * 1024 // เท่าเพดานของ POST /admin/upload/image
const TIMEOUT_MS = 15000
const MAX_REDIRECTS = 3
const EXT_BY_TYPE = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }

// IP วงภายใน/สงวนไหม
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  }
  const v6 = ip.toLowerCase()
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7))
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80')
}

// throw ถ้าโดเมนชี้ไป IP ภายใน
async function assertPublicHost(url) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('รองรับเฉพาะลิงก์ http/https')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address)
  if (addresses.length === 0 || addresses.some(isPrivateIp)) throw new Error('ลิงก์นี้ชี้ไปเครือข่ายภายใน ไม่อนุญาต')
}

// อ่าน body ทีละก้อน ตัดทันทีที่เกินเพดาน (ไม่เชื่อ content-length)
async function readLimited(res) {
  const chunks = []
  let size = 0
  for await (const chunk of res.body) {
    size += chunk.length
    if (size > MAX_BYTES) throw new Error('ไฟล์รูปใหญ่เกิน 5MB')
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

// ดาวน์โหลดรูป → { buffer, ext } หรือ throw ข้อความไทยพร้อมแสดง
async function fetchImage(rawUrl) {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('ลิงก์รูปไม่ถูกต้อง')
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url)
    let res
    try {
      res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'image/*' } })
    } catch (e) {
      throw new Error(e?.name === 'TimeoutError' ? 'โหลดรูปไม่ทันเวลา (15 วินาที)' : 'เชื่อมต่อเว็บต้นทางไม่ได้')
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url)
      continue
    }
    if (!res.ok) throw new Error(`เว็บต้นทางตอบ ${res.status}`)
    const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    const ext = EXT_BY_TYPE[type]
    if (!ext) throw new Error(`ลิงก์นี้ไม่ใช่รูป jpeg/png/webp/gif (${type || 'ไม่ทราบชนิด'})`)
    return { buffer: await readLimited(res), ext }
  }
  throw new Error('ลิงก์ redirect หลายทอดเกินไป')
}

// จำผลตรวจ 10 นาที — /plan ถูกเรียกซ้ำทุกครั้งที่แอดมินเลือกหัวข้อ
const checkCache = new Map()
const CHECK_TTL_MS = 10 * 60 * 1000

// ลองโหลดจริงแล้วทิ้งข้อมูล → { ok, error }
async function checkImageUrl(url) {
  const hit = checkCache.get(url)
  if (hit && Date.now() - hit.at < CHECK_TTL_MS) return hit.result
  let result
  try {
    await fetchImage(url)
    result = { ok: true }
  } catch (e) {
    result = { ok: false, error: e.message }
  }
  checkCache.set(url, { at: Date.now(), result })
  return result
}

module.exports = { fetchImage, checkImageUrl, isPrivateIp }
