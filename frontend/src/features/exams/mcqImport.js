// D158 (5): the AI prompt and the reader of the AI's JSON answer for the MCQ import

/** D158 (5): the copyable AI prompt - the student list, the MCQ full marks and a JSON example; the AI answers with JSON only */
export function aiPrompt({ exam, subject, rows, full }) {
  const list = rows.map(r => `${r.roll_no ?? ''}\t${r.batch ?? ''}\t${r.name ?? ''}`).join('\n')
  const first = rows[0] ?? { roll_no: '1', batch: '' }
  const example = JSON.stringify({ results: [{ roll: String(first.roll_no ?? '1'), ...(first.batch ? { batch: first.batch } : {}), mcq: Math.min(full, 18.5) }] }, null, 2)
  return [
    `Exam: ${exam} — Subject: ${subject} — MCQ full marks: ${full}`,
    'Below is the student list (roll, batch, name) and the MCQ marks I will give you (a table, a photo of a mark sheet, or text).',
    'Reply with ONLY one JSON object, nothing else, in exactly this format:',
    example,
    'Rules: one entry per student; "roll" exactly as in the list (text); add "batch" only when two students share a roll;',
    `"mcq" is a number from 0 to ${full}; leave out a student whose mark you do not have; never invent a mark.`,
    '',
    'Students (roll / batch / name):',
    list,
  ].join('\n')
}

/** reads the pasted AI answer: {results:[...]} or a bare array, also inside a ```json block */
export function parseJsonRows(text) {
  const body = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const data = JSON.parse(body)
  const rows = Array.isArray(data) ? data : data?.results
  if (!Array.isArray(rows)) throw new Error('results')
  return rows.map(r => ({ roll: r?.roll == null ? '' : String(r.roll), ...(r?.batch ? { batch: String(r.batch) } : {}), mcq: r?.mcq }))
}
