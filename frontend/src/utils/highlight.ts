export interface HighlightSegment {
  text: string
  match: boolean
}

export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const q = query.trim()
  if (!q) return [{ text, match: false }]

  const lowerText = text.toLowerCase()
  const lowerQuery = q.toLowerCase()
  const segments: HighlightSegment[] = []
  let cursor = 0

  while (cursor < text.length) {
    const idx = lowerText.indexOf(lowerQuery, cursor)
    if (idx === -1) {
      segments.push({ text: text.slice(cursor), match: false })
      break
    }
    if (idx > cursor) segments.push({ text: text.slice(cursor, idx), match: false })
    segments.push({ text: text.slice(idx, idx + q.length), match: true })
    cursor = idx + q.length
  }

  return segments.length ? segments : [{ text, match: false }]
}
