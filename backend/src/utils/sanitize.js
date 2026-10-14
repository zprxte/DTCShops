// ทำความสะอาดค่าจากฟอร์มแอดมิน — สำคัญที่ลิงก์: กัน javascript: ที่จะรันตอนลูกค้ากดปุ่ม

// อักขระควบคุม (เว้น tab และขึ้นบรรทัดใหม่ เพราะรายละเอียดสินค้ามีหลายบรรทัด)
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

// ข้อความธรรมดา: ตัดช่องว่าง/อักขระควบคุม จำกัดความยาว · ว่าง = null
function cleanText(value, maxLength = 1000) {
  if (value === null || value === undefined) return null
  const text = String(value).replace(CONTROL_CHARS, '').trim()
  if (!text) return null
  return text.slice(0, maxLength)
}

// ข้อความที่ต้องมี — ว่างคืน '' ให้ผู้เรียกตอบ 400
function requiredText(value, maxLength = 255) {
  return cleanText(value, maxLength) ?? ''
}

const SAFE_URL_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:']

// ลิงก์: รับเฉพาะ http/https/mailto/tel หรือ path ภายใน · อย่างอื่นคืน null
function safeUrl(value, maxLength = 500) {
  const text = cleanText(value, maxLength)
  if (!text) return null
  // กัน "//host" ที่เบราว์เซอร์ตีความเป็นลิงก์ออกนอกเว็บ
  if (text.startsWith('/') && !text.startsWith('//')) return text
  try {
    const parsed = new URL(text)
    return SAFE_URL_SCHEMES.includes(parsed.protocol) ? text : null
  } catch {
    return null
  }
}

// แท็กที่รันโค้ดได้ + event handler — ตัดทิ้งก่อนบันทึก
const SCRIPT_BLOCKS = /<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi
const DANGEROUS_TAGS = /<\s*\/?\s*(script|iframe|object|embed|link|style|form)\b[^>]*>/gi
const EVENT_ATTRS = /\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi
const JS_URL_ATTRS = /\s(href|src)\s*=\s*("|')?\s*javascript:[^"'>\s]*("|')?/gi

// HTML รายละเอียดสินค้า: ตัดแท็ก/attribute อันตราย
function sanitizeRichText(value, maxLength = 200000) {
  if (value === null || value === undefined) return null
  const text = String(value)
    .replace(CONTROL_CHARS, '')
    .replace(SCRIPT_BLOCKS, '')
    .replace(DANGEROUS_TAGS, '')
    .replace(EVENT_ATTRS, '')
    .replace(JS_URL_ATTRS, '')
    .trim()
  if (!text) return null
  return text.slice(0, maxLength)
}

// query page → จำนวนเต็ม ≥ 1
function toPage(value, fallback = 1) {
  const page = Math.floor(Number(value))
  return Number.isFinite(page) && page > 0 ? page : fallback
}

// query limit → จำนวนเต็ม 1..max
function toLimit(value, fallback = 20, max = 100) {
  const limit = Math.floor(Number(value))
  if (!Number.isFinite(limit) || limit < 1) return fallback
  return Math.min(limit, max)
}

module.exports = { cleanText, requiredText, safeUrl, sanitizeRichText, toPage, toLimit }
