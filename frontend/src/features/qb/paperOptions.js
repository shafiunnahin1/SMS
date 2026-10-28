import { plainText } from './richText'

const DISPLAY_FORMULA = /(?:\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])/
const PICTURE = /<img\b|\[\[qmx-image:/i
const TABLE = /<table\b/i

function rawOption(option) {
  return typeof option === 'string' ? option : String(option?.content_text ?? '')
}

export function optionColumnCount(options, setting = 'auto') {
  if (['1', '2', '4'].includes(String(setting))) return Number(setting)
  const raw = (options ?? []).map(rawOption)
  if (raw.some(text => DISPLAY_FORMULA.test(text) || TABLE.test(text))) return 1
  if (raw.some(text => PICTURE.test(text))) return 2
  const longest = Math.max(0, ...raw.map(text => plainText(text)
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/\\\((.*?)\\\)/g, '$1')
    .trim().length))
  return longest <= 12 ? 4 : longest <= 30 ? 2 : 1
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