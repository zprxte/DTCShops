export interface HighlightSegment {
  text: string
  match: boolean
}

// ตัดข้อความเป็นช่วงที่ตรง/ไม่ตรงคำค้น ไว้ไฮไลต์
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const terms = [...new Set(query.trim().split(/\s+/).filter(Boolean))]
  if (!terms.length) return [{ text, match: false }]

  // คำยาวมาก่อนที่ตำแหน่งเดียวกัน · escape ให้ชื่ออย่าง "C++" เป็นตัวอักษรธรรมดา
  const pattern = terms
    .sort((a, b) => b.length - a.length)
    .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const matches = new RegExp(pattern, 'giu')
  const segments: HighlightSegment[] = []
  let cursor = 0

  for (const match of text.matchAll(matches)) {
    const idx = match.index
    if (idx > cursor) segments.push({ text: text.slice(cursor, idx), match: false })
    segments.push({ text: match[0], match: true })
    cursor = idx + match[0].length
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false })

  return segments.length ? segments : [{ text, match: false }]
}
