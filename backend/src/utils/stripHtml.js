function stripHtml(html) {
  if (!html) return html

  let text = String(html)
  const looksLikeHtml = /<[a-z][^>]*>/i.test(text)

  if (looksLikeHtml) {
    text = text.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    text = text.replace(/[\r\n\t]+/g, ' ')

    text = text.replace(/<br\s*\/?>/gi, '\n')
    text = text.replace(/<\/(p|div|li|h[1-6]|tr|article|section)>/gi, '\n')
    text = text.replace(/<(p|div|li|h[1-6]|tr|article|section)[^>]*>/gi, '')

    text = text.replace(/<[^>]+>/g, '')
  }

  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&deg;/gi, '°')
    .replace(/&plusmn;/gi, '±')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')

  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, '').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text
}

module.exports = { stripHtml }