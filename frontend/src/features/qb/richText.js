// D72 (QB.12): question-bank text may carry qbank's small formatting vocabulary. The server already keeps only that vocabulary
// (QbRichText); here it is read again from an allowlist into plain node objects - the page builds React elements from them and
// never inserts an HTML string. DOMParser does not run scripts; anything outside the list is unwrapped (its text stays).

const TAGS = new Set(['strong', 'em', 'u', 's', 'sup', 'sub', 'mark', 'br', 'span', 'div', 'ol', 'ul', 'li', 'dl', 'dt', 'dd', 'table', 'caption', 'thead', 'tbody', 'tr', 'th', 'td', 'img'])
const RENAME = { b: 'strong', i: 'em', strike: 's', del: 's', p: 'div' }
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math', 'textarea', 'select', 'button', 'input', 'form'])
const COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const ALIGN = /^qmx-align-(left|center|right|justify)$/
const LIST = /^qmx-list-([a-z-]+)$/
const DIR = /^(?:auto|ltr|rtl)$/
const SPAN = /^(?:[2-9]|1\d|20)$/
const TABLE_WIDTH = /^qmx-table-width-(auto|50|75|100)$/
const TABLE_ALIGN = /^qmx-table-align-(left|center|right)$/
const TABLE_SPACING = /^qmx-table-(compact|normal|comfortable)$/

const hasMarkup = (text) => /[<&]/.test(text)

function attrsOf(tag, el, options) {
  const a = {}
  const get = (name) => el.getAttribute(name)?.trim() ?? null
  if (tag === 'span') {
    if (COLOR.test(get('data-qmx-color') ?? '')) a.color = get('data-qmx-color')
    if (COLOR.test(get('data-qmx-bg') ?? '')) a.bg = get('data-qmx-bg')
    const printSize = Number(get('data-qbp-font-size'))
    if (options.allowPreviewFontSize && Number.isInteger(printSize) && printSize >= 5 && printSize <= 2048) a.printFontSize = printSize
  }
  if (tag === 'div') {
    const m = ALIGN.exec(get('class') ?? '')
    if (m) a.align = m[1]
    if (DIR.test(get('dir') ?? '')) a.dir = get('dir')
  }
  if (tag === 'ol' || tag === 'ul') {
    const m = LIST.exec(get('class') ?? '')
    if (m) a.list = m[1]
  }
  if (tag === 'table') {
    const classes = (get('class') ?? '').split(/\s+/)
    for (const className of classes) {
      const width = TABLE_WIDTH.exec(className)
      const align = TABLE_ALIGN.exec(className)
      const spacing = TABLE_SPACING.exec(className)
      if (width) a.width = width[1]
      if (align) a.align = align[1]
      if (spacing) a.spacing = spacing[1]
      if (className === 'qmx-table-striped') a.striped = true
    }
  }
  if (tag === 'th' || tag === 'td') {
    if (DIR.test(get('dir') ?? '')) a.dir = get('dir')
    for (const k of ['colspan', 'rowspan']) if (SPAN.test(get(k) ?? '')) a[k] = Number(get(k))
  }
  if (tag === 'img') {
    if (/^[1-9]\d{0,9}$/.test(get('data-qmx-media') ?? '')) a.media = get('data-qmx-media')
    if (/^(?:[1-9]\d|100)$/.test(get('data-qmx-width') ?? '')) a.width = Number(get('data-qmx-width'))
    if (/^(?:left|center|right)$/.test(get('data-qmx-align') ?? '')) a.align = get('data-qmx-align')
  }
  return a
}

function walk(node, tableSpacing = 'normal', options = {}) {
  const out = []
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) { out.push({ text: n.data }); return }
    if (n.nodeType !== 1) return
    let tag = n.tagName.toLowerCase()
    if (DROP.has(tag)) return
    tag = RENAME[tag] ?? tag
    if (!TAGS.has(tag)) { out.push(...walk(n)); return }
    const attrs = attrsOf(tag, n, options)
    if (tag === 'img' && !attrs.media) return
    if (tag === 'span' && !attrs.color && !attrs.bg && !attrs.printFontSize) { out.push(...walk(n, tableSpacing, options)); return }
    if (tag === 'th' || tag === 'td') attrs.spacing = tableSpacing
    out.push({ tag, attrs, children: tag === 'br' || tag === 'img' ? [] : walk(n, tag === 'table' ? attrs.spacing ?? tableSpacing : tableSpacing, options) })
  })
  return out
}

/** The text as safe nodes: { text } or { tag, attrs, children } - only the vocabulary, only checked attribute values */
export function parseRich(text, options = {}) {
  const s = String(text ?? '')
  if (!hasMarkup(s)) return [{ text: s }]
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${s}`, 'text/html')
  return walk(doc.body, 'normal', options)
}

const BLOCK = new Set(['div', 'li', 'dt', 'dd', 'tr', 'ol', 'ul', 'dl', 'table'])

/** The text without formatting - lists, search results, labels */
export function plainText(text) {
  const s = String(text ?? '')
  if (!hasMarkup(s)) return s
  const flat = (nodes) => nodes.map((n) => (n.text !== undefined ? n.text : n.tag === 'br' ? '\n' : (BLOCK.has(n.tag) ? '\n' : '') + flat(n.children) + (BLOCK.has(n.tag) ? '\n' : ''))).join('')
  return flat(parseRich(s)).replace(/[ \t]*\n[ \t\n]*/g, '\n').trim()
}
