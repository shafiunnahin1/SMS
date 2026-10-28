import { plainText } from './richText'

const DISPLAY_FORMULA = /(?:\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])/
const PICTURE = /<img\b|\[\[qmx-image:/i
const TABLE = /<table\b/i

function rawOption(option) {
  return typeof option === 'string' ? option : String(option?.content_text ?? '')
}

// D179 (1): auto option columns. Without a measure the thresholds are the decided ones (<= 12 displayed characters -> 4, <= 30 -> 2,
// else 1). With `fit` = { width, fontPx } (the paper column's width and the text size) an option must also fit its cell on one line:
// a character is taken as about 0.55 em and the label ("ক)" and its gap) as 2.6 em, so 4 short options never split a word in a
// narrow two-column paper.
export function optionColumnCount(options, setting = 'auto', fit = null) {
  if (['1', '2', '4'].includes(String(setting))) return Number(setting)
  const raw = (options ?? []).map(rawOption)
  if (raw.some(text => DISPLAY_FORMULA.test(text) || TABLE.test(text))) return 1
  if (raw.some(text => PICTURE.test(text))) return 2
  const longest = Math.max(0, ...raw.map(text => plainText(text)
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/\\\((.*?)\\\)/g, '$1')
    .trim().length))
  const fits = (cols) => !fit?.width || !fit?.fontPx || longest * 0.55 * fit.fontPx <= fit.width / cols - 2.6 * fit.fontPx - (cols - 1) * 4
  return longest <= 12 && fits(4) ? 4 : longest <= 30 && fits(2) ? 2 : 1
}

function escapedSelection(text) {
  const escaped = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return text.replace(/[&<>"']/g, char => escaped[char])
}

export function applyPreviewFontSize(source, selection, size) {
  const text = String(source ?? '')
  const selected = String(selection ?? '')
  const points = Number(size)
  if (!selected || !Number.isInteger(points) || points < 5 || points > 2048) return null
  const encoded = escapedSelection(selected)
  const match = previewSelectionMatch(text, encoded)
  if (!match) return null
  return `${text.slice(0, match.index)}<span data-qbp-font-size="${points}">${encoded}</span>${text.slice(match.index + match[0].length)}`
}

export function resetPreviewFontSize(source, selection) {
  const text = String(source ?? '')
  const encoded = escapedSelection(String(selection ?? ''))
  if (!encoded) return null
  const match = previewSelectionMatch(text, encoded)
  if (!match || !match[1]) return null
  return `${text.slice(0, match.index)}${encoded}${text.slice(match.index + match[0].length)}`
}

function previewSelectionMatch(text, encoded) {
  const escaped = encoded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`((?:<span data-qbp-font-size="\\d{1,4}">)*)${escaped}((?:</span>)*)`)
  const match = pattern.exec(text)
  if (!match) return null
  const openingCount = (match[1].match(/<span data-qbp-font-size="\d{1,4}">/g) ?? []).length
  const closingCount = (match[2].match(/<\/span>/g) ?? []).length
  return openingCount === closingCount ? match : null
}
// D179 (5): the preview's real pages. Each block (a section title or a question with its own boxes) has a measured height; blocks
// fill the first column of a page, then the next column, then the next page. A page's first column is shorter on page 1 (the header
// sits above the columns). A block never splits; one taller than a whole column still gets a column of its own. A section title
// moves with the block after it; a block marked `breakBefore` starts a new page. Returns [[keys of column 1, keys of column 2, ..], ..].
export function paginateBlocks(blocks, { columns = 1, firstHeight, height }) {
  const cols = Math.max(1, Number(columns) || 1)
  const pages = []
  let page = null
  let col = 0
  let used = 0
  const capacity = () => (pages.length === 1 ? firstHeight : height)
  const newPage = () => { page = Array.from({ length: cols }, () => []); pages.push(page); col = 0; used = 0 }
  const advance = () => { if (col + 1 < cols) { col += 1; used = 0 } else newPage() }
  newPage()
  blocks.forEach((block, i) => {
    const h = Math.max(0, Number(block.height) || 0)
    if (block.breakBefore && pages.length > 0 && page.some(c => c.length)) newPage()
    const next = block.keepWithNext ? blocks[i + 1] : null
    const need = h + (next ? Math.max(0, Number(next.height) || 0) : 0)
    if (used > 0 && used + need > capacity()) advance()
    page[col].push(block.key)
    used += h
  })
  return pages
}
