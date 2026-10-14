// ค้นหาสินค้า: ตัดคำไทย + คำพ้อง + fuzzy (fuse.js) + กู้คำพิมพ์ผิดแป้น + จัดอันดับด้วย IDF · GET /api/search และ /autocomplete
const express = require('express')
const router = express.Router()
const { PrismaClient } = require('@prisma/client')
const Fuse = require('fuse.js')
const { toPage, toLimit } = require('../utils/sanitize')
const { loadModelIndex, cardShape } = require('../utils/productShape')
const prisma = new PrismaClient()

// ตัวตัดคำภาษาไทย
const segmenter = new Intl.Segmenter('th', { granularity: 'word' })
// คำเชื่อมที่ตัดออกจากคำค้น
const fillers = new Set([
  'ที่', 'มี', 'กับ', 'และ', 'ซึ่ง', 'แบบ', 'พร้อม', 'รองรับ', 'อยาก', 'ได้',
  'ต้องการ', 'ช่วย', 'หา', 'แนะนำ', 'สินค้า', 'ระบบ',
  'with', 'has', 'and', 'that', 'which', 'product', 'products',
])

// ตารางแป้นพิมพ์ไทย ↔ อังกฤษ ไว้กู้คำค้นที่พิมพ์ผิดแป้น
const KEDMANEE_ROWS = [
  ['1234567890-=', 'ๅ/_ภถุึคตจขช'],
  ['!@#$%^&*()_+', '+๑๒๓๔ู฿๕๖๗๘๙'],
  ['qwertyuiop[]', 'ๆไำพะัีรนยบล'],
  ['QWERTYUIOP{}', '๐"ฎฑธํ๊ณฯญฐ,'],
  ["asdfghjkl;'", 'ฟหกดเ้่าสวง'],
  ['ASDFGHJKL:"', 'ฤฆฏโฌ็๋ษศซ.'],
  ['zxcvbnm,./', 'ผปแอิืทมใฝ'],
  ['ZXCVBNM<>?', '()ฉฮฺ์?ฒฬฦ'],
]
const THAI_BY_LATIN = new Map()
const LATIN_BY_THAI = new Map()

// แตกตารางเป็น Map สองทิศ (ทำครั้งเดียวตอนโหลดไฟล์)
for (const [latin, thai] of KEDMANEE_ROWS) {
  for (let i = 0; i < latin.length; i++) {
    if (!THAI_BY_LATIN.has(latin[i])) THAI_BY_LATIN.set(latin[i], thai[i])
    if (!LATIN_BY_THAI.has(thai[i])) LATIN_BY_THAI.set(thai[i], latin[i])
  }
}

// แปลงข้อความทั้งก้อนข้ามแป้น (เลือกทิศจากว่าอักษรไทยหรืออังกฤษเยอะกว่า) · แปลงไม่ได้เลย = null
function swapKeyboardLayout(text) {
  const source = String(text)
  const thaiCount = (source.match(/[฀-๿]/g) || []).length
  const latinCount = (source.match(/[a-zA-Z]/g) || []).length
  if (thaiCount === 0 && latinCount === 0) return ''
  const table = thaiCount > latinCount ? LATIN_BY_THAI : THAI_BY_LATIN
  let out = ''
  let converted = 0
  for (const ch of source) {
    const mapped = table.get(ch)
    if (mapped === undefined) { out += ch; continue }
    out += mapped
    converted++
  }
  return converted > 0 ? out : ''
}

// ตารางชั้น Shift ของแป้นไทย ไว้กู้คำที่พิมพ์ตอนติด Caps Lock
const SHIFT_TOGGLE = new Map()
const THAI_UPPER = new Set()
for (let row = 0; row < KEDMANEE_ROWS.length; row += 2) {
  const lower = KEDMANEE_ROWS[row][1]
  const upper = KEDMANEE_ROWS[row + 1][1]
  for (let i = 0; i < lower.length; i++) {
    SHIFT_TOGGLE.set(lower[i], upper[i])
    SHIFT_TOGGLE.set(upper[i], lower[i])
    THAI_UPPER.add(upper[i])
  }
}
// เครื่องหมาย ์ ๊ ๋ ็ อาจตั้งใจพิมพ์หรือติด Shift มาก็ได้ จึงต้องลองทั้งแบบสลับและคงไว้
const AMBIGUOUS_MARKS = new Set(['็', '๊', '๋', '์'])
// ลองสลับ/คงเครื่องหมายได้ไม่เกิน 3 ตำแหน่ง (คำเดาสูงสุด 8 แบบ)
const MAX_AMBIGUOUS_MARKS = 3

// กู้คำที่พิมพ์ตอนติด Shift → รายการคำเดาเรียงจากน่าจะเป็นมากสุด (ว่าง = ไม่ใช่เคสนี้)
function toggleThaiShift(text) {
  const source = String(text)
  let upper = 0
  let lower = 0
  for (const ch of source) {
    if (!SHIFT_TOGGLE.has(ch) || ch < '฀' || AMBIGUOUS_MARKS.has(ch)) continue
    if (THAI_UPPER.has(ch)) upper++
    else lower++
  }
  if (upper === 0 || upper <= lower) return []

  const chars = [...source]
  const toggled = chars.map((ch) => SHIFT_TOGGLE.get(ch) ?? ch)
  const ambiguous = chars
    .map((ch, i) => (AMBIGUOUS_MARKS.has(ch) ? i : -1))
    .filter((i) => i >= 0)
    .slice(0, MAX_AMBIGUOUS_MARKS)
  const masks = [...Array(1 << ambiguous.length).keys()]
    .sort((a, b) => bitCount(a) - bitCount(b) || a - b)
  const candidates = masks.map((mask) => {
    const out = [...toggled]
    ambiguous.forEach((pos, bit) => { if (mask & (1 << bit)) out[pos] = chars[pos] })
    return out.join('')
  })
  return [...new Set(candidates)].filter((candidate) => candidate !== source)
}

// นับจำนวน bit ที่เป็น 1
function bitCount(n) {
  let count = 0
  for (; n; n >>= 1) count += n & 1
  return count
}

// ทำให้คำที่เขียนต่างกันเทียบกันได้ (ตัวพิมพ์ ตัวคั่น สระอำ SDcard ฯลฯ)
function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().trim()
    // NFKC แยกสระอำเป็น ํา แล้วตัดคำผิด ("กล้อ" + "งกันน้ํา") — ต้องประกอบกลับก่อนตัดคำ
    .replace(/ํา/g, 'ำ')
    .replace(/wi[\s-]+fi/g, 'wifi')
    // "SDcard" / "microSD" → "SD card" / "micro SD" ให้ตรงกับที่คนพิมพ์
    .replace(/sd[\s-]?card/g, 'sd card')
    .replace(/micro[\s-]?sd/g, 'micro sd')
    .replace(/dash[\s-]+cam/g, 'dashcam')
}

// ตัดข้อความเป็นคำด้วย Intl.Segmenter (ภาษาไทยไม่มีช่องว่างระหว่างคำ)
function words(value) {
  // แยกอักษรไทยกับอังกฤษก่อน ไม่งั้น "มีGPSกับAI" ติดกันเป็นก้อนเดียว
  return (normalize(value).match(/[a-z0-9]+|[\u0e00-\u0e7f]+/g) || [])
    .flatMap((run) => /[\u0e00-\u0e7f]/.test(run)
      ? [...segmenter.segment(run)].filter((part) => part.isWordLike).map((part) => part.segment)
      : [run])
}

// คำของคำค้น (ตัดคำเชื่อมออก — ไม่ตัดจากข้อมูลสินค้า)
function queryWords(value) {
  return [...new Set(words(value).filter((word) => !fillers.has(word)))]
}
// กลุ่มคำพ้องความหมาย — 1 กลุ่ม = คำที่แปลว่าสิ่งเดียวกัน ห้ามใส่คำกว้างในกลุ่มคำแคบ
const synonymGroups = [
  ['dashcam', 'กล้องติดรถยนต์', 'กล้องติดหน้ารถ'],
  ['camera', 'กล้อง'],
].map((group) => group.map(words))

// คำของข้อมูลสินค้า + คำพ้อง (ขยายฝั่งสินค้าตอนทำดัชนี)
function indexedWords(value) {
  const tokens = words(value)
  const expanded = new Set(tokens)
  for (const group of synonymGroups) {
    // คำพ้องต้องเจอเป็นวลีครบในฟิลด์เดียว ("กล้อง" ลอยๆ ไม่นับเป็นกล้องติดรถ)
    if (group.some((phrase) => tokens.some((_, start) =>
      phrase.every((word, offset) => tokens[start + offset] === word)))) {
      for (const phrase of group) for (const word of phrase) expanded.add(word)
    }
  }
  return [...expanded]
}


// จำนวนตัวอักษรที่ยอมให้พิมพ์ผิดตามความยาวคำ
function editBudget(term, lenient = false) {
  return (term.length >= 8 ? 2 : 1) + (lenient ? 1 : 0)
}

// คำที่ห้ามเดา: ตัวย่อสั้น (AI/4G) คำที่มีตัวเลขปน (รหัสรุ่น — 4G ต้องไม่กลายเป็น 5G) และคำยาวผิดปกติ
function fuzzyAllowed(term) {
  return term.length >= 4 && term.length <= 64 && !/\d/.test(term)
}

// สองคำต่างกันแค่สลับอักษรติดกัน 1 คู่ไหม (GSP → GPS) — fuse นับเป็นผิด 2 ตัว จึงต้องดักเอง
function isAdjacentSwap(a, b) {
  if (a.length !== b.length) return false
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  if (i >= a.length - 1) return false
  if (a[i] !== b[i + 1] || a[i + 1] !== b[i]) return false
  return a.slice(i + 2) === b.slice(i + 2)
}

// ให้คะแนนคำที่พิมพ์กับทุกคำในคลัง: ตรงเป๊ะ 1 / ขึ้นต้น / สลับอักษร / fuzzy (คำนวณครั้งเดียวต่อคำค้น)
function scoreTermAgainstVocabulary(term, vocabulary, { prefix = false, prefixMin = 4, lenient = false } = {}) {
  const scores = new Map()

  if (vocabulary.has(term)) scores.set(term, 1)

  // ขึ้นต้นด้วย: เฉพาะคำสุดท้ายตอน autocomplete และต้องยาวพอ (ไม่งั้น "ad" ลากมาทั้งเว็บ)
  if (prefix && term.length >= prefixMin) {
    for (const token of vocabulary) {
      if (token !== term && token.startsWith(term)) {
        scores.set(token, Math.max(scores.get(token) ?? 0, 0.9))
      }
    }
  }

  // ตัวย่อ 3 ตัวยอมให้เดาการสลับได้ (GSP/GPS) ทั้งที่สั้นกว่าเกณฑ์ fuzzy ปกติ
  const shortAcronym = /^[a-z]{3}$/.test(term)
  if (shortAcronym || fuzzyAllowed(term)) {
    for (const token of vocabulary) {
      if (token === term || !isAdjacentSwap(term, token)) continue
      if (shortAcronym ? !/^[a-z]{3}$/.test(token) : /\d/.test(token)) continue
      scores.set(token, Math.max(scores.get(token) ?? 0, 1 - 1 / term.length))
    }
  }

  if (fuzzyAllowed(term)) {
    const budget = editBudget(term, lenient)
    // ตัดคำที่ยาวต่างกันเกินโควตาก่อน — กัน Bitap จับคำสั้นกลางคำยาว (track ใน tracking)
    const candidates = []
    for (const token of vocabulary) {
      if (/\d/.test(token)) continue
      if (Math.abs(term.length - token.length) > budget) continue
      candidates.push(token)
    }
    if (candidates.length > 0) {
      // location 0 + distance = ความยาวคำ บังคับให้ตรงตั้งแต่ต้นคำ (ไม่งั้น adas ไปตรง waas)
      const fuse = new Fuse(candidates, {
        includeScore: true,
        threshold: Math.min(1, budget / term.length),
        location: 0,
        distance: term.length,
        minMatchCharLength: 1,
        shouldSort: false,
      })
      for (const hit of fuse.search(term)) {
        // พลิกค่าของ fuse เป็นความใกล้เคียง และไม่ให้ทับคะแนนตรงเป๊ะ/ขึ้นต้น
        const similarity = 1 - (hit.score ?? 1)
        scores.set(hit.item, Math.max(scores.get(hit.item) ?? 0, similarity))
      }
    }
  }

  return scores
}

// ฟิลด์ที่ค้น + น้ำหนัก: ชื่อ/SKU/แท็ก 1.0 · หมวด 0.95 · ค่าสเปค 0.8
function itemFields(item) {
  return [
    [item.itm_desc, 1], [item.itm_sku, 1], [item.itm_tags, 1],
    [item.item_type?.itm_type_desc, 0.95],
    ...(item.attribute_values || []).map((entry) => [entry.value, 0.8]),
  ].map(([value, weight]) => ({ tokens: indexedWords(value), weight }))
}

// รวมคำของทุกสินค้าเป็นคลังคำ
function buildVocabulary(fieldsByItem) {
  const vocabulary = new Set()
  for (const fields of fieldsByItem) for (const field of fields) for (const token of field.tokens) vocabulary.add(token)
  return vocabulary
}

// คลังคำของสินค้าชุดหนึ่ง (ใช้ตรวจว่าคำที่กู้แป้นมาเป็นคำที่มีจริง)
function vocabularyOf(items) {
  return buildVocabulary(items.map(itemFields))
}

// รวมชิ้นคำไทยที่สะกดผิดแล้วตัดเพี้ยนกลับเป็นก้อนเดียว ถ้าก้อนนั้นใกล้คำในคลัง
function repairThaiTerms(query, vocabulary) {
  const base = queryWords(query)
  const isThai = (term) => /[฀-๿]/.test(term)
  const exact = (term) => vocabulary.has(term)
  if (!base.some((term) => isThai(term) && !exact(term))) return base
  const bestScore = new Map()
  const best = (term) => {
    if (!bestScore.has(term)) bestScore.set(term, Math.max(0, ...scoreTermAgainstVocabulary(term, vocabulary).values()))
    return bestScore.get(term)
  }

  const out = []
  for (const run of normalize(query).match(/[a-z0-9]+|[฀-๿]+/g) || []) {
    if (!isThai(run)) { out.push(run); continue }
    const pieces = [...segmenter.segment(run)].filter((part) => part.isWordLike).map((part) => part.segment)
    const runStart = out.length
    for (let i = 0; i < pieces.length;) {
      if (exact(pieces[i])) { out.push(pieces[i]); i++; continue }
      let j = i
      while (j < pieces.length && !exact(pieces[j])) j++
      // ลองช่วง: ชิ้นที่ไม่ตรงทั้งหมด / พ่วงชิ้นหน้า / พ่วงชิ้นหลัง / พ่วงทั้งสองข้าง
      const spans = [[i, j], [i - 1, j], [i, j + 1], [i - 1, j + 1]]
        .filter(([a, b]) => a >= 0 && b <= pieces.length && (a === i || out.length > runStart))
        .map(([a, b]) => {
          const merged = pieces.slice(a, b).join('')
          return { a, b, merged, score: fuzzyAllowed(merged) || (a === i && b === j) ? best(merged) : 0 }
        })
        .filter((s) => s.score > 0)
        .sort((x, y) => y.score - x.score || y.merged.length - x.merged.length)
      const span = spans[0] && [spans[0].a, spans[0].b]
      if (!span) { out.push(...pieces.slice(i, j)); i = j; continue }
      if (span[0] < i) out.pop()
      out.push(pieces.slice(span[0], span[1]).join(''))
      i = span[1]
    }
  }
  return [...new Set(out.filter((word) => !fillers.has(word)))]
}

// IDF แบบ BM25 — คำหายากมีน้ำหนักมากกว่าคำที่สินค้าเกือบทุกตัวมี (ไม่เอา tf saturation / length normalization)
function inverseDocumentFrequency(docFreq, totalDocs) {
  return Math.log(1 + (totalDocs - docFreq + 0.5) / (docFreq + 0.5))
}

// จัดอันดับสินค้าตามคำค้น (AND ทุกคำ + ชื่อตรงเป๊ะมาก่อน + IDF) · requireAll: false = ตรงครึ่งหนึ่งพอ (รอบ "คุณหมายถึง…?")
function searchProducts(items, query, { autocomplete = false, prefixMin = 4, requireAll = true, lenient = false } = {}) {
  if (!queryWords(query).length) return []

  const fieldsByItem = items.map(itemFields)
  const vocabulary = buildVocabulary(fieldsByItem)
  const terms = repairThaiTerms(query, vocabulary)

  // ต้องตรงอย่างน้อยครึ่งหนึ่งของคำ — น้อยกว่านี้คำแนะนำจะมั่ว
  const minMatches = requireAll ? terms.length : Math.max(1, Math.ceil(terms.length / 2))

  const scoreTables = terms.map((term, index) =>
    scoreTermAgainstVocabulary(term, vocabulary, {
      prefix: autocomplete && index === terms.length - 1,
      prefixMin,
      lenient,
    })
  )

  // คิดคะแนนรายคำก่อนเพื่อนับว่าแต่ละคำพบในสินค้ากี่ตัว (ใช้คำนวณ IDF)
  const scoresByItem = items.map((_, itemIndex) => {
    const fields = fieldsByItem[itemIndex]
    return scoreTables.map((table) => {
      let score = 0
      for (const field of fields) {
        for (const token of field.tokens) {
          const matched = table.get(token)
          if (matched !== undefined) score = Math.max(score, matched * field.weight)
        }
      }
      return score
    })
  })

  const termWeights = terms.map((_, termIndex) => {
    const docFreq = scoresByItem.reduce((count, scores) => count + (scores[termIndex] > 0 ? 1 : 0), 0)
    return inverseDocumentFrequency(docFreq, items.length)
  })
  const totalWeight = termWeights.reduce((a, b) => a + b, 0)

  const ranked = []
  items.forEach((item, itemIndex) => {
    const scores = scoresByItem[itemIndex]
    // คำที่พิมพ์ผิดก็ยังต้องผ่าน AND — ห้ามตกไปเป็น OR
    const matchedTerms = scores.reduce((count, score) => count + (score > 0 ? 1 : 0), 0)
    if (matchedTerms < minMatches) return
    const exactName = normalize(item.itm_desc) === normalize(query)
    // ค่าเฉลี่ยถ่วงด้วย IDF (ยังอยู่ในช่วง 0–1)
    const weighted = scores.reduce((sum, score, termIndex) => sum + score * termWeights[termIndex], 0) / totalWeight
    ranked.push({
      item,
      relevance_score: exactName ? 1 : weighted,
      matched_words: scores.filter((score) => score >= 0.8).length,
      exact_term: exactName,
    })
  })

  return ranked.sort((a, b) => Number(b.exact_term) - Number(a.exact_term)
    || b.relevance_score - a.relevance_score
    || String(a.item.itm_code).localeCompare(String(b.item.itm_code)))
}

// GET /api/search — กรองหมวด/แท็ก/ราคา แล้วจัดอันดับ · ค้นไม่เจอ = กู้คำพิมพ์ผิดแป้น + "คุณหมายถึง…?"
router.get('/', async (req, res) => {
  try {
    const {
      searchword = '',
      category_id,
      category_ids,
      tags,
      min_price,
      max_price,
      sort = 'relevance',
    } = req.query
    const page = toPage(req.query.page)
    const limit = toLimit(req.query.limit, 20, 100)
    const offset = (page - 1) * limit
    const searchTerm = String(searchword).trim()

    if (!searchTerm) {
      return res.json({ products: [], total: 0, page: 1, suggestions: [] })
    }
    const where = { itm_flag: '1' }
    // หลายหมวด = "หรือ" · แต่ละแท็ก = "และ" (กติกาเดียวกับ /api/products)
    const csv = (value) => String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    const categoryCodes = category_ids ? csv(category_ids) : (category_id ? [String(category_id)] : [])
    if (categoryCodes.length === 1) where.itm_type_code = categoryCodes[0]
    else if (categoryCodes.length > 1) where.itm_type_code = { in: categoryCodes }
    // แท็กเก็บคั่นคอมม่า — DB กรองหยาบด้วย contains แล้วเช็คทั้งคำอีกชั้น (กัน "AI" ตรงคำที่มี ai ข้างใน)
    const wantedTags = csv(tags)
    if (wantedTags.length > 0) {
      where.AND = wantedTags.map((tag) => ({ itm_tags: { contains: tag, mode: 'insensitive' } }))
    }
    if (min_price) where.itm_price = { ...(where.itm_price || {}), gte: Number(min_price) }
    if (max_price) where.itm_price = { ...(where.itm_price || {}), lte: Number(max_price) }
    const candidateRows = await prisma.tbl_item.findMany({
      where,
      include: { item_type: true, attribute_values: { include: { attribute: true } } },
    })
    const hasTag = (item, tag) =>
      String(item.itm_tags ?? '').split(',').map((t) => t.trim().toLowerCase()).includes(tag.toLowerCase())
    const candidates = wantedTags.length === 0
      ? candidateRows
      : candidateRows.filter((item) => wantedTags.every((tag) => hasTag(item, tag)))
    // ดึงโมเดลครั้งเดียวต่อ request — toResults ถูกเรียกซ้ำได้หลายรอบตอนกู้แป้น
    const modelIndex = await loadModelIndex(candidates, prisma)
    const toResults = (term) => searchProducts(candidates, term).map(({ item, ...match }) => ({
      ...cardShape(item, modelIndex),
      ...match,
    }))

    // คำนี้ใช้ได้ไหม: ค้นเจอสินค้า หรือเป็นคำเชื่อมล้วน (ไม่ได้แปลว่าพิมพ์ผิด ห้ามไปแปลงแป้น)
    const usableToken = (token) => queryWords(token).length === 0 || toResults(token).length > 0

    // คำจากการสลับแป้นต้องเป็นคำจริงตรงเป๊ะทุกคำ (ยาว ≥ 2) — ไม่งั้นคำมั่วผ่าน fuzzy ซ้อนอีกชั้น
    const vocabulary = vocabularyOf(candidates)
    const realWords = (text) => {
      const ws = queryWords(text)
      return ws.length === 0 || ws.every((w) => w.length >= 2 && vocabulary.has(w))
    }
    const swapAccepted = (text) => !!text && realWords(text) && queryWords(text).length > 0

    // กู้แป้นทีละคำ — เผื่อสลับแป้นกลางประโยคผิดคนละทิศ ("lbo8hkmuj,u ไรดร" = "สินค้าที่มี wifi")
    const MAX_RECOVER_TOKENS = 6
    function recoverPerToken(term) {
      // split แบบเก็บตัวคั่น จะได้ประกอบกลับโดยช่องว่างไม่เพี้ยน
      const chunks = term.split(/(\s+)/)
      if (chunks.filter((chunk) => chunk.trim()).length > MAX_RECOVER_TOKENS) return ''
      let changed = false
      const recovered = chunks.map((chunk) => {
        if (!chunk.trim() || usableToken(chunk)) return chunk
        const swapped = swapKeyboardLayout(chunk)
        if (!swapped || swapped === chunk || !realWords(swapped) || !usableToken(swapped)) return chunk
        changed = true
        return swapped
      })
      return changed ? recovered.join('') : ''
    }

    let results = toResults(searchTerm)
    // คำที่ใช้หา suggestions — กู้แป้นสำเร็จต้องใช้คำที่แปลงแล้ว
    let effectiveTerm = searchTerm
    // กู้แป้นเฉพาะตอนค้นไม่เจอ: ลองทั้งก้อนก่อน แล้วค่อยทีละคำ
    let searched_as = null
    // อักษรไทยบนปุ่มเครื่องหมาย (ใ = . ช = =) ถูกตัดทิ้งก่อนค้น จึงลองสลับแป้นก่อนแม้จะเจอผลแล้ว (ใช้เมื่อได้คำจริงครบเท่านั้น)
    const hasLayoutSymbol = [...searchTerm].some((ch) => THAI_BY_LATIN.has(ch) && !/[a-zA-Z0-9\s]/.test(ch))
    if (results.length > 0 && hasLayoutSymbol) {
      const swapped = swapKeyboardLayout(searchTerm)
      const retry = swapped && swapped !== searchTerm && swapAccepted(swapped) ? toResults(swapped) : []
      if (retry.length > 0) {
        results = retry
        effectiveTerm = swapped
        searched_as = swapped
      }
    }
    if (results.length === 0) {
      // ลำดับ: สลับภาษาทั้งก้อน → สลับรายคำ → สลับชั้น Shift
      const whole = swapKeyboardLayout(searchTerm)
      const guesses = [swapAccepted(whole) ? whole : '', recoverPerToken(searchTerm), ...toggleThaiShift(searchTerm)]
      for (const candidate of guesses) {
        if (!candidate || candidate === searchTerm) continue
        const retry = toResults(candidate)
        // ใช้คำที่แปลงแล้วเมื่อหาเจอจริงเท่านั้น
        if (retry.length === 0) continue
        results = retry
        effectiveTerm = candidate
        searched_as = candidate
        break
      }
    }

    const sortFns = {
      relevance: (a, b) =>
        Number(b.exact_term) - Number(a.exact_term) ||
        (b.relevance_score || 0) - (a.relevance_score || 0),
      // สินค้าราคา 0 (ติดต่อสอบถาม) อยู่ท้ายเสมอทั้งสองทิศ
      price_asc: (a, b) =>
        Number(!Number(a.product_price)) - Number(!Number(b.product_price)) ||
        Number(a.product_price) - Number(b.product_price),
      price_desc: (a, b) =>
        Number(!Number(a.product_price)) - Number(!Number(b.product_price)) ||
        Number(b.product_price) - Number(a.product_price),
      name: (a, b) => a.product_name.localeCompare(b.product_name),
    }
    // ปิดท้ายด้วย product_id ให้ลำดับคงที่ ไม่งั้นแบ่งหน้าแล้วสินค้าซ้ำ/หาย
    const tieBreak = (a, b) => String(a.product_id).localeCompare(String(b.product_id))
    const sortFn = sortFns[sort] || sortFns.relevance
    const sorted = results.sort((a, b) => sortFn(a, b) || tieBreak(a, b))
    const total = sorted.length
    const paginated = sorted.slice(offset, offset + limit)
    // คุณหมายถึง…? — ค้นไม่เจอค่อยรันซ้ำแบบผ่อน คืน { product_id, product_name, slug } ให้กดเข้าหน้าสินค้าได้
    const suggestions = total === 0
      ? searchProducts(candidates, effectiveTerm, { autocomplete: true, requireAll: false, lenient: true })
        .slice(0, 5).map(({ item }) => ({
          product_id: item.itm_code,
          product_name: item.itm_desc,
          slug: item.slug ?? null,
        }))
      : []

    res.json({
      products: paginated,
      total,
      page,
      total_pages: Math.max(1, Math.ceil(total / limit)),
      suggestions,
      // คำที่ใช้ค้นจริงเมื่อกู้แป้นให้ (null = คำที่พิมพ์)
      searched_as,
      // คำค้นหลังตัดคำ — บอท LINE ใช้เทียบกับ matched_words
      query_words: repairThaiTerms(effectiveTerm, vocabulary),
    })
  } catch (err) {
    console.error('Search error:', err)
    res.status(500).json({ message: 'Search failed' })
  }
})
// GET /api/search/autocomplete — โหมดขึ้นต้นด้วย (พิมพ์ ≥ 2 ตัว) ตัดเหลือ 5 รายการ
router.get('/autocomplete', async (req, res) => {
  try {
    const keyword = String(req.query.searchword ?? '').trim()
    if (keyword.length < 2) return res.json({ suggestions: [] })
    const candidates = await prisma.tbl_item.findMany({
      where: { itm_flag: '1' },
      include: { item_type: true, attribute_values: { include: { attribute: true } } },
    })
    const results = searchProducts(candidates, keyword, { autocomplete: true, prefixMin: 2 })
      .slice(0, 5).map(({ item }) => item)

    res.json({
      suggestions: results.map((r) => ({
        product_id: r.itm_code,
        product_name: r.itm_desc,
        slug: r.slug ?? null,
      })),
    })
  } catch (err) {
    res.status(500).json({ message: 'Autocomplete failed' })
  }
})

module.exports = router
module.exports.searchProducts = searchProducts
module.exports.queryWords = queryWords
module.exports.repairThaiTerms = repairThaiTerms
module.exports.vocabularyOf = vocabularyOf
module.exports.swapKeyboardLayout = swapKeyboardLayout
module.exports.toggleThaiShift = toggleThaiShift