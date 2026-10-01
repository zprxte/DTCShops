/**
 * ตัวช่วยทำความสะอาด/ตรวจค่าที่รับมาจากฟอร์มแอดมิน (Week 15 — Input
 * sanitization & XSS prevention)
 *
 * Vue escape ข้อความให้อัตโนมัติอยู่แล้วทุกจุด (ทั้งโปรเจกต์ไม่มี v-html
 * เลยสักที่) ข้อความธรรมดาจึงไม่ใช่ช่องโหว่ XSS — **แต่ลิงก์เป็นคนละเรื่อง**
 * ค่าอย่าง itm_line_end_point/itm_video_master ถูกเอาไปใส่ `:href`/iframe
 * ตรงๆ บนหน้าสินค้า ถ้าแอดมิน (หรือใครที่ได้ token ไป) บันทึกค่าเป็น
 * `javascript:...` ไว้ มันจะรันจริงตอนลูกค้ากดปุ่ม — safeUrl() ปิดช่องนี้
 * ด้วยการรับเฉพาะ http/https/mailto/tel กับ path ภายในระบบ (/uploads/...)
 */

// อักขระควบคุมที่ไม่ควรหลุดลงฐานข้อมูล (เว้น \t \n \r ไว้ เพราะรายละเอียด
// สินค้าเป็นข้อความหลายบรรทัดจริง)
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

/**
 * ข้อความธรรมดา — ตัดช่องว่างหัวท้าย, ตัดอักขระควบคุม, จำกัดความยาวไม่ให้
 * เกินขนาดคอลัมน์ (ค่าว่างคืน null เสมอ ไม่ใช่สตริงว่าง เพื่อให้ทั้งระบบ
 * เช็ค "ไม่มีค่า" ด้วย null อย่างเดียว)
 */
function cleanText(value, maxLength = 1000) {
  if (value === null || value === undefined) return null
  const text = String(value).replace(CONTROL_CHARS, '').trim()
  if (!text) return null
  return text.slice(0, maxLength)
}

// ข้อความที่ "ต้องมี" (ชื่อสินค้า/ชื่อหมวดหมู่) — คืนสตริงว่างแทน null
// ให้ผู้เรียกเช็ค falsy แล้วตอบ 400 ได้ตรงๆ
function requiredText(value, maxLength = 255) {
  return cleanText(value, maxLength) ?? ''
}

const SAFE_URL_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:']

/**
 * ลิงก์ — รับเฉพาะ http/https/mailto/tel หรือ path ภายในระบบที่ขึ้นต้นด้วย /
 * อย่างอื่น (javascript:, data:, vbscript:, ค่าที่ parse ไม่ได้) คืน null
 */
function safeUrl(value, maxLength = 500) {
  const text = cleanText(value, maxLength)
  if (!text) return null
  // path ภายในระบบ เช่น /uploads/products/2026-09/xxx.jpg — แต่กัน "//host"
  // ที่เบราว์เซอร์ตีความเป็นลิงก์ออกนอกเว็บ (protocol-relative URL)
  if (text.startsWith('/') && !text.startsWith('//')) return text
  try {
    const parsed = new URL(text)
    return SAFE_URL_SCHEMES.includes(parsed.protocol) ? text : null
  } catch {
    return null
  }
}

// แท็กที่รันโค้ดได้ + attribute ที่เป็น event handler — ตัดทิ้งก่อนบันทึก
const SCRIPT_BLOCKS = /<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi
const DANGEROUS_TAGS = /<\s*\/?\s*(script|iframe|object|embed|link|style|form)\b[^>]*>/gi
const EVENT_ATTRS = /\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi
const JS_URL_ATTRS = /\s(href|src)\s*=\s*("|')?\s*javascript:[^"'>\s]*("|')?/gi

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

function toPage(value, fallback = 1) {
  const page = Math.floor(Number(value))
  return Number.isFinite(page) && page > 0 ? page : fallback
}

function toLimit(value, fallback = 20, max = 100) {
  const limit = Math.floor(Number(value))
  if (!Number.isFinite(limit) || limit < 1) return fallback
  return Math.min(limit, max)
}

module.exports = { cleanText, requiredText, safeUrl, sanitizeRichText, toPage, toLimit }
