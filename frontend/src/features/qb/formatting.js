// D72 (QB.12): qbank's ribbon actions as pure functions on a text field's value and selection. Each returns the new value and
// the new selection, so the editor only has to write it back. The markup written is D72's vocabulary - the same tags qbank's
// editor writes - and the server keeps nothing else (QbRichText). Inside a maths region ($...$ or \( ... \)) the format is written
// in LaTeX instead, as qbank does, so the formula still draws.

export const DEFAULT_TEXT_COLOR = '#2563eb'   // theme-lint-ignore: the writer's content colour (qbank's default), not a theme colour
export const DEFAULT_BG_COLOR = '#fff59d'     // theme-lint-ignore: the writer's content colour (qbank's default), not a theme colour
export const LIST_STYLES = {
  ul: ['disc', 'circle', 'square', 'check', 'star'],
  ol: ['decimal', 'bengali-number', 'bengali-letter', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman'],
}

const COLOR = /^#[0-9a-f]{6}$/i
const HTML = {
  bold: (v) => `<strong>${v}</strong>`, italic: (v) => `<em>${v}</em>`, underline: (v) => `<u>${v}</u>`, strike: (v) => `<s>${v}</s>`,
  superscript: (v) => `<sup>${v}</sup>`, subscript: (v) => `<sub>${v}</sub>`, highlight: (v) => `<mark>${v}</mark>`,
  'text-color': (v, c) => `<span data-qmx-color="${c}">${v}</span>`, background: (v, c) => `<span data-qmx-bg="${c}">${v}</span>`,
}
const LATEX = {
  bold: (v) => `\\boldsymbol{${v}}`, italic: (v) => `\\mathit{${v}}`, underline: (v) => `\\underline{${v}}`, strike: (v) => `\\cancel{${v}}`,
  superscript: (v) => `^{${v}}`, subscript: (v) => `_{${v}}`, highlight: (v) => `\\bbox[background:${DEFAULT_BG_COLOR}]{${v}}`,
  'text-color': (v, c) => `\\color{${c}}{${v}}`, background: (v, c) => `\\bbox[background:${c}]{${v}}`,
}

const result = (value, start, end) => ({ value, start, end })
const splice = (value, start, end, text) => result(value.slice(0, start) + text + value.slice(end), start, start + text.length)

/** The maths region holding [start, end) entirely, if any: { bodyStart, bodyEnd } */
export function mathRegionAt(value, start, end) {
  const re = /\$([^$]+)\$|\\\(([\s\S]*?)\\\)/g
  let m
  while ((m = re.exec(value)) !== null) {
    const open = m[0].startsWith('$') ? 1 : 2
    const bodyStart = m.index + open
    const bodyEnd = m.index + m[0].length - open
    if (start >= bodyStart && end <= bodyEnd) return { bodyStart, bodyEnd }
  }
  return null
}

/** bold / italic / underline / strike / superscript / subscript / highlight / text-color / background */
export function applyFormat(value, start, end, format, color) {
  if (start === end || !HTML[format]) return result(value, start, end)
  const c = COLOR.test(color ?? '') ? color.toLowerCase() : (format === 'background' ? DEFAULT_BG_COLOR : DEFAULT_TEXT_COLOR)
  const sel = value.slice(start, end)
  const wrap = mathRegionAt(value, start, end) ? LATEX[format] : HTML[format]
  return splice(value, start, end, wrap(sel, c))
}

/** UPPER / lower / Sentence case - only the text, never inside a tag */
export function applyCase(value, start, end, mode) {
  if (start === end) return result(value, start, end)
  const sel = value.slice(start, end)
  const map = (s) => (mode === 'upper' ? s.toUpperCase() : mode === 'lower' ? s.toLowerCase()
    : s.toLowerCase().replace(/(^\s*|[.!?।]\s+)(\p{L})/gu, (_, a, b) => a + b.toUpperCase()))
  const out = sel.split(/(<[^>]*>)/).map((part) => (part.startsWith('<') ? part : map(part))).join('')
  return splice(value, start, end, out)
}

/** A list from the selected lines: ul / ol (with a style) or dl ("term - description" or alternate lines) */
export function applyList(value, start, end, tag, style) {
  if (start === end) return result(value, start, end)
  const lines = value.slice(start, end).split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|[a-z][.)])\s+/i, '').trim()).filter(Boolean)
  if (tag === 'dl') {
    const rows = []
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(.+?)(?:\t+|\s+[-–—]\s+|:\s+)(.+)$/)
      if (m) rows.push([m[1], m[2]])
      else { rows.push([lines[i], lines[i + 1] ?? '']); i++ }
    }
    return splice(value, start, end, `<dl>${rows.map(([dt, dd]) => `<dt>${dt}</dt><dd>${dd}</dd>`).join('')}</dl>`)
  }
  const cls = LIST_STYLES[tag]?.includes(style) ? ` class="qmx-list-${style}"` : ''
  return splice(value, start, end, `<${tag}${cls}>${lines.map((l) => `<li>${l}</li>`).join('')}</${tag}>`)
}

export function applyAlign(value, start, end, align) {
  if (start === end || !['left', 'center', 'right', 'justify'].includes(align)) return result(value, start, end)
  return splice(value, start, end, `<div class="qmx-align-${align}">${value.slice(start, end)}</div>`)
}

export function insertTab(value, start, end) {
  return splice(value, start, end, `\t${value.slice(start, end)}`)
}

/** Clear formatting: the selection keeps its text, loses its tags */
export function clearFormat(value, start, end) {
  if (start === end) return result(value, start, end)
  return splice(value, start, end, value.slice(start, end).replace(/<[^>]*>/g, ''))
}

/** A qmx table: rows x columns, the first row as a header if asked; inserted at the cursor */
export function insertTable(value, start, end, { rows = 2, cols = 2, header = true, style = 'grid' } = {}) {
  const r = Math.min(Math.max(Number(rows) || 1, 1), 20)
  const c = Math.min(Math.max(Number(cols) || 1, 1), 10)
  const cell = (tag) => `<${tag} dir="auto"></${tag}>`
  const body = Array.from({ length: r }, (_, i) => `<tr>${Array.from({ length: c }, () => cell(header && i === 0 ? 'th' : 'td')).join('')}</tr>`).join('')
  const kind = ['grid', 'horizontal', 'none'].includes(style) ? style : 'grid'
  return splice(value, start, end, `<table class="qmx-table qmx-table-${kind} qmx-table-width-100"><tbody>${body}</tbody></table>`)
}

/** Text at the cursor (maths from the formula dialog, for one) */
export function insertAt(value, start, end, text) {
  return splice(value, start, end, text)
}
