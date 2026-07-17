const SRCDOC_BASE = '<base href="about:srcdoc">'
const EXPLICIT_BASE_HREF = /<base\s+[^>]*href\s*=/i
const HEAD_START = /<head(?:\s[^>]*)?>/i
const HTML_START = /<html(?:\s[^>]*)?>/i
const DOCTYPE = /<!doctype[^>]*>/i

/** Keep relative fragment links inside a sandboxed srcdoc document. */
export function htmlPreviewSrcDoc(content: string): string {
  if (EXPLICIT_BASE_HREF.test(content)) return content

  const head = HEAD_START.exec(content)
  if (head?.index !== undefined) {
    const insertAt = head.index + head[0].length
    return `${content.slice(0, insertAt)}${SRCDOC_BASE}${content.slice(insertAt)}`
  }

  const html = HTML_START.exec(content)
  if (html?.index !== undefined) {
    const insertAt = html.index + html[0].length
    return `${content.slice(0, insertAt)}<head>${SRCDOC_BASE}</head>${content.slice(insertAt)}`
  }

  const doctype = DOCTYPE.exec(content)
  if (doctype?.index !== undefined) {
    const insertAt = doctype.index + doctype[0].length
    return `${content.slice(0, insertAt)}${SRCDOC_BASE}${content.slice(insertAt)}`
  }

  return `${SRCDOC_BASE}${content}`
}
