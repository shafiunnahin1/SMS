// D73 (QB.13): qbank's question code and source history, shown and stored without new columns.

/** QAE-<type initials>-<id, 6 digits>: one-word slugs in full (MCQ), longer ones by their initials (creative_question -> CQ) */
const SHORT = { creative: 'CQ', true_false: 'TF' }   // qbank's own short forms for slugs that are not their initials

export function questionCode(slug, id) {
  if (!id) return null
  if (SHORT[slug]) return `QAE-${SHORT[slug]}-${String(id).padStart(6, '0')}`
  const parts = String(slug ?? 'q').split(/[_-]+/).filter(Boolean)
  const abbr = (parts.length === 1 ? parts[0] : parts.map(p => p[0]).join('')).toUpperCase()
  return `QAE-${abbr}-${String(id).padStart(6, '0')}`
}

export const SOURCE_TYPES = ['board', 'school', 'college', 'madrasa', 'admission', 'model_test', 'book', 'other']

// a source row <-> the existing occurrence fields: note = source type, institution_name = full name, board = short name
export const sourceToOccurrence = (s) => ({ note: s.type || null, institution_name: s.full || null, board: s.short || null, exam_type: s.exam_type || null, year: s.year ? Number(s.year) : null })
export const occurrenceToSource = (o) => ({ type: SOURCE_TYPES.includes(o.note) ? o.note : (o.note ? 'other' : ''), full: o.institution_name ?? '', short: o.board ?? '', exam_type: o.exam_type ?? '', year: o.year ? String(o.year) : '' })
