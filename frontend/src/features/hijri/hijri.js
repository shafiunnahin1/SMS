// D214 MAD.2 (docs/modules/madrasa.md section 2): the Hijri date is DISPLAY ONLY - computed from the Gregorian date with the
// browser's tabular (Umm al-Qura) calendar and shifted by the institution's offset (-2..+2 days, the local moon sighting).
// The occasion list and its spellings are UNVERIFIED (not yet reviewed by a madrasa teacher) - it only suggests, never adds.
const TAG = { bn: 'bn-BD-u-ca-islamic-umalqura-nu-latn', en: 'en-u-ca-islamic-umalqura-nu-latn', ar: 'ar-u-ca-islamic-umalqura-nu-latn' }

const shifted = (date, offset) => {
  const d = new Date(`${String(date).slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + (offset || 0))
  return d
}

/** {year, month, day} of the Hijri date, or null when the browser lacks the calendar */
export function hijriParts(date, offset = 0) {
  try {
    const parts = new Intl.DateTimeFormat(TAG.en, { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }).formatToParts(shifted(date, offset))
    const get = (t) => Number(parts.find(p => p.type === t)?.value)
    const out = { year: get('year'), month: get('month'), day: get('day') }
    return out.month >= 1 && out.month <= 12 && out.year < 2000 ? out : null   // a browser without the calendar answers Gregorian
  } catch { return null }
}

/** "1 Shawwal 1447" in the reader's language, Latin digits, no era word */
export function fmtHijri(date, locale, offset = 0) {
  if (!hijriParts(date, offset)) return null
  const parts = new Intl.DateTimeFormat(TAG[locale] ?? TAG.bn, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).formatToParts(shifted(date, offset))
  const get = (t) => parts.find(p => p.type === t)?.value
  return `${get('day')} ${get('month')} ${get('year')}`
}

// [Hijri month, day, i18n key] - UNVERIFIED list
export const OCCASIONS = [[1, 1, 'new_year'], [1, 10, 'ashura'], [3, 12, 'milad'], [7, 27, 'miraj'], [8, 15, 'barat'], [9, 27, 'qadr'], [10, 1, 'fitr'], [12, 10, 'adha']]

/** the occasion key a Gregorian date falls on (with the offset), or null */
export function occasionOn(date, offset = 0) {
  const h = date ? hijriParts(date, offset) : null
  return h ? (OCCASIONS.find(([m, d]) => m === h.month && d === h.day)?.[2] ?? null) : null
}
