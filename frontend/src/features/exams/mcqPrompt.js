// D158 (5) / D159 (3): the AI prompt and the reader of the AI's JSON answer for the MCQ import

/** the copyable AI prompt - the student list with each permanent ID, the MCQ full marks and a JSON example; the AI answers with JSON only */
export function aiPrompt({ exam, subject, rows, full }) {
  const list = rows.map(r => `${r.code ?? ''}\t${r.roll_no ?? ''}\t${r.batch ?? ''}\t${r.name ?? ''}`).join('\n')
  const first = rows[0] ?? { code: 'ID-0001', roll_no: '1' }
  const example = JSON.stringify({ results: [{ id: String(first.code ?? ''), roll: String(first.roll_no ?? ''), mcq: Math.min(full, 18.5) }] }, null, 2)
  return [
    `Exam: ${exam} — Subject: ${subject} — MCQ full marks: ${full}`,
    'Below is the student list (ID, roll, batch, name) and the MCQ marks I will give you (a table, a photo of a mark sheet, or text).',
    'Reply with ONLY one JSON object, nothing else, in exactly this format:',
    example,
    'Rules: one entry per student; "id" is the student\'s ID exactly as in the list (it never repeats - always give it when the marks show it);',
    'when the marks show only a roll, give "roll" (text) and add "batch" if two batches share that roll;',
    `"mcq" is a number from 0 to ${full}; leave out a student whose mark you do not have; never invent a mark.`,
    '',
    'Students (ID / roll / batch / name):',
    list,
  ].join('\n')
}

/** reads the pasted AI answer: {results:[...]} or a bare array, also inside a ```json block */
export function parseJsonRows(text) {
  const body = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const data = JSON.parse(body)
  const rows = Array.isArray(data) ? data : data?.results
  if (!Array.isArray(rows)) throw new Error('results')
  return rows.map(r => ({ ...(r?.id ? { id: String(r.id) } : {}), roll: r?.roll == null ? '' : String(r.roll), ...(r?.batch ? { batch: String(r.batch) } : {}), mcq: r?.mcq }))
}
