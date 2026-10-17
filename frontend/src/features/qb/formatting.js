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
const escapeText = (text) => String(text ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

export function pushValueHistory(history, name, value, start, end) {
  return { undo: [...history.undo, { name, value, start, end }], redo: [] }
}

export function stepValueHistory(history, direction, name, current) {
  if (!['undo', 'redo'].includes(direction)) return { history, entry: null }
  const source = history[direction]
  const index = source.findLastIndex((entry) => entry.name === name)
  if (index < 0) return { history, entry: null }
  const entry = source[index]
  const target = direction === 'undo' ? 'redo' : 'undo'
  return {
    entry,
    history: {
      ...history,
      [direction]: source.filter((_, i) => i !== index),
      [target]: [...history[target], { name, ...current }],
    },
  }
}

export function createTableCells(rows, cols, previous = []) {
  const rowCount = Math.min(Math.max(Number.parseInt(rows, 10) || 1, 1), 20)
  const colCount = Math.min(Math.max(Number.parseInt(cols, 10) || 1, 1), 10)
  return Array.from({ length: rowCount }, (_, row) => Array.from({ length: colCount }, (_, col) => ({
    text: String(previous[row]?.[col]?.text ?? ''), markup: previous[row]?.[col]?.markup, rowspan: 1, colspan: 1, mergedInto: null,
  })))
}

export function parseTableSelection(value, start, end) {
  const source = String(value).slice(start, end).trim()
  if (!/^<table\b/i.test(source) || !/<\/table\s*>$/i.test(source)) return null
  const doc = new DOMParser().parseFromString(source, 'text/html')
  const table = doc.body.firstElementChild
  if (doc.body.children.length !== 1 || table?.tagName !== 'TABLE') return null
  const rows = [...table.querySelectorAll('tr')]
  if (!rows.length || rows.length > 20) return null
  const cells = Array.from({ length: rows.length }, () => [])
  let columnCount = 0
  for (const [rowIndex, row] of rows.entries()) {
    let colIndex = 0
    for (const element of [...row.cells]) {
      while (cells[rowIndex][colIndex]?.mergedInto) colIndex++
      const rowSpan = Number(element.getAttribute('rowspan')) || 1
      const colSpan = Number(element.getAttribute('colspan')) || 1
      if (rowSpan < 1 || rowSpan > 20 || colSpan < 1 || colSpan > 20 || rowIndex + rowSpan > rows.length || colIndex + colSpan > 10) return null
      const key = `${rowIndex}:${colIndex}`
      cells[rowIndex][colIndex] = { text: element.textContent ?? '', markup: element.innerHTML, rowspan: rowSpan, colspan: colSpan, mergedInto: null }
      for (let row = rowIndex; row < rowIndex + rowSpan; row++) for (let col = colIndex; col < colIndex + colSpan; col++) {
        if (row !== rowIndex || col !== colIndex) cells[row][col] = { text: '', rowspan: 1, colspan: 1, mergedInto: key }
      }
      colIndex += colSpan
      columnCount = Math.max(columnCount, colIndex)
    }
  }
  if (!columnCount) return null
  for (const row of cells) for (let col = 0; col < columnCount; col++) row[col] ??= { text: '', rowspan: 1, colspan: 1, mergedInto: null }
  const classes = (table.getAttribute('class') ?? '').split(/\s+/)
  const style = ['grid', 'horizontal', 'none'].find((item) => classes.includes(`qmx-table-${item}`)) ?? 'grid'
  const width = ['auto', '50', '75', '100'].find((item) => classes.includes(`qmx-table-width-${item}`)) ?? '100'
  const align = ['left', 'center', 'right'].find((item) => classes.includes(`qmx-table-align-${item}`)) ?? 'center'
  const spacing = ['compact', 'normal', 'comfortable'].find((item) => classes.includes(`qmx-table-${item}`)) ?? 'normal'
  return {
    rows: String(rows.length), cols: String(columnCount), cells, selected: [], width, align, spacing, style,
    header: [...rows[0].cells].some((cell) => cell.tagName === 'TH'),
    headerColumn: rows.every((row) => row.cells[0]?.tagName === 'TH'),
    striped: classes.includes('qmx-table-striped'), caption: table.querySelector(':scope > caption')?.textContent ?? '',
  }
}

export function mergeTableCells(cells, selection) {
  if (!Array.isArray(cells) || !Array.isArray(selection) || selection.length < 2) return null
  const selected = new Set()
  for (const point of selection) {
    const [row, col] = Array.isArray(point) ? point : [point?.row, point?.col]
    if (!Number.isInteger(row) || !Number.isInteger(col) || !cells[row]?.[col]) return null
    selected.add(`${row}:${col}`)
  }
  if (selected.size < 2) return null
  const points = [...selected].map((point) => point.split(':').map(Number))
  const top = Math.min(...points.map(([row]) => row))
  const left = Math.min(...points.map(([, col]) => col))
  const bottom = Math.max(...points.map(([row]) => row))
  const right = Math.max(...points.map(([, col]) => col))
  if ((bottom - top + 1) * (right - left + 1) !== selected.size) return null
  for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
    const cell = cells[row][col]
    if (cell.mergedInto || cell.rowspan !== 1 || cell.colspan !== 1) return null
  }
  const mergedContent = Object.fromEntries(points.map(([row, col]) => [`${row}:${col}`, { text: String(cells[row][col].text ?? ''), markup: cells[row][col].markup }]))
  const mergedText = points.map(([row, col]) => mergedContent[`${row}:${col}`].text).filter((text) => text !== '').join('\n')
  const mergedMarkup = points.map(([row, col]) => {
    const item = mergedContent[`${row}:${col}`]
    return item.markup ?? escapeText(item.text).replace(/\r?\n/g, '<br>')
  }).filter(Boolean).join('<br>')
  return cells.map((line, row) => line.map((cell, col) => {
    if (row === top && col === left) return { ...cell, text: mergedText, markup: mergedMarkup, mergedContent, rowspan: bottom - top + 1, colspan: right - left + 1 }
    if (row >= top && row <= bottom && col >= left && col <= right) return { ...cell, mergedInto: `${top}:${left}` }
    return { ...cell }
  }))
}

export function splitTableCell(cells, row, col) {
  const cell = cells?.[row]?.[col]
  if (!cell || cell.mergedInto || (cell.rowspan === 1 && cell.colspan === 1)) return null
  const bottom = row + cell.rowspan
  const right = col + cell.colspan
  const mergedContent = cell.mergedContent ?? {}
  return cells.map((line, currentRow) => line.map((currentCell, currentCol) => {
    const key = `${currentRow}:${currentCol}`
    if (currentRow === row && currentCol === col) {
      const original = mergedContent[key]
      const restored = { ...currentCell, text: original?.text ?? currentCell.text, markup: original?.markup, rowspan: 1, colspan: 1 }
      delete restored.mergedContent
      return restored
    }
    if (currentRow >= row && currentRow < bottom && currentCol >= col && currentCol < right && currentCell.mergedInto === `${row}:${col}`) {
      const original = mergedContent[key]
      return { ...currentCell, text: original?.text ?? currentCell.text, markup: original?.markup, mergedInto: null }
    }
    return { ...currentCell }
  }))
}

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
export function insertTable(value, start, end, { rows = 2, cols = 2, header = true, headerColumn = false, striped = false, style = 'grid',
  width = '100', align = 'center', spacing = 'normal', caption = '', cells } = {}) {
  const r = Math.min(Math.max(Number(rows) || 1, 1), 20)
  const c = Math.min(Math.max(Number(cols) || 1, 1), 10)
  const source = Array.isArray(cells) ? cells : createTableCells(r, c)
  const body = Array.from({ length: r }, (_, row) => `<tr>${Array.from({ length: c }, (_, col) => {
    const current = source[row]?.[col] ?? { text: '' }
    if (current.mergedInto) return ''
    const tag = (header && row === 0) || (headerColumn && col === 0) ? 'th' : 'td'
    const colspan = Number.isInteger(current.colspan) && current.colspan >= 2 && current.colspan <= 20 ? ` colspan="${current.colspan}"` : ''
    const rowspan = Number.isInteger(current.rowspan) && current.rowspan >= 2 && current.rowspan <= 20 ? ` rowspan="${current.rowspan}"` : ''
    const text = current.markup ?? escapeText(current.text).replace(/\r?\n/g, '<br>')
    return `<${tag} dir="auto"${colspan}${rowspan}>${text}</${tag}>`
  }).join('')}</tr>`).join('')
  const kind = ['grid', 'horizontal', 'none'].includes(style) ? style : 'grid'
  const tableWidth = ['auto', '50', '75', '100'].includes(String(width)) ? String(width) : '100'
  const tableAlign = ['left', 'center', 'right'].includes(align) ? align : 'center'
  const cellSpacing = ['compact', 'normal', 'comfortable'].includes(spacing) ? spacing : 'normal'
  const classes = ['qmx-table', `qmx-table-${kind}`, `qmx-table-width-${tableWidth}`, `qmx-table-align-${tableAlign}`, `qmx-table-${cellSpacing}`,
    striped ? 'qmx-table-striped' : null].filter(Boolean).join(' ')
  const title = String(caption).trim()
  const captionNode = title ? `<caption>${escapeText(title)}</caption>` : ''
  return splice(value, start, end, `<table class="${classes}">${captionNode}<tbody>${body}</tbody></table>`)
}

/** Text at the cursor (maths from the formula dialog, for one) */
export function insertAt(value, start, end, text) {
  return splice(value, start, end, text)
}

function paragraphEnds(value) {
  const ends = []
  const pattern = /<\/?div\b[^>]*>|<br\s*\/?>|\r?\n/gi
  let depth = 0
  let match
  while ((match = pattern.exec(value)) !== null) {
    const tag = match[0].toLowerCase()
    if (tag.startsWith('</div')) {
      depth = Math.max(0, depth - 1)
      if (depth === 0) ends.push(pattern.lastIndex)
    } else if (tag.startsWith('<div')) depth++
    else if (depth === 0) ends.push(pattern.lastIndex)
  }
  return ends
}

export function insertPicture(value, start, end, mediaId, { width = 100, align = 'center', position = 'cursor', paragraph = 1 } = {}) {
  const id = String(mediaId ?? '')
  if (!/^[1-9]\d{0,9}$/.test(id)) return result(value, start, end)
  const size = Number.isInteger(width) && width >= 10 && width <= 100 ? width : 100
  const side = ['left', 'center', 'right'].includes(align) ? align : 'center'
  let from = start
  let to = end
  if (position === 'start') from = to = 0
  else if (position === 'end') from = to = value.length
  else if (position === 'after') {
    const ends = paragraphEnds(value)
    from = to = ends[Math.min(Math.max(Number(paragraph) || 1, 1), 100) - 1] ?? value.length
  }
  return splice(value, from, to, `<img data-qmx-media="${id}" data-qmx-width="${size}" data-qmx-align="${side}">`)
}

export function transformImagePixels(data, width, height, { rotation = 0, transparentBackground = false, threshold = 245 } = {}) {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 || data.length !== width * height * 4) {
    throw new RangeError('Image pixel dimensions do not match the data')
  }
  if (![0, 90, 180, 270].includes(rotation)) throw new RangeError('Rotation must be a right angle')
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 255) throw new RangeError('Transparency threshold must be between 0 and 255')

  const swapsDimensions = rotation === 90 || rotation === 270
  const outputWidth = swapsDimensions ? height : width
  const outputHeight = swapsDimensions ? width : height
  const transformed = new Uint8ClampedArray(data.length)
  for (let sourceY = 0; sourceY < height; sourceY++) for (let sourceX = 0; sourceX < width; sourceX++) {
    let targetX = sourceX
    let targetY = sourceY
    if (rotation === 90) [targetX, targetY] = [height - 1 - sourceY, sourceX]
    else if (rotation === 180) [targetX, targetY] = [width - 1 - sourceX, height - 1 - sourceY]
    else if (rotation === 270) [targetX, targetY] = [sourceY, width - 1 - sourceX]
    const sourceOffset = (sourceY * width + sourceX) * 4
    const targetOffset = (targetY * outputWidth + targetX) * 4
    transformed.set(data.subarray(sourceOffset, sourceOffset + 4), targetOffset)
  }

  if (transparentBackground) for (let offset = 0; offset < transformed.length; offset += 4) {
    if (transformed[offset] >= threshold && transformed[offset + 1] >= threshold && transformed[offset + 2] >= threshold) transformed[offset + 3] = 0
  }
  return { data: transformed, width: outputWidth, height: outputHeight }
}
