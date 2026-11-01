// D176: selected question ids (never their text or answers) are kept in this browser per page, host (institution) and user, so
// a refresh does not lose them; storage may be blocked, then the selection simply lasts this visit. Cleared at logout.
const PREFIX = 'qb.sel.'

export const selectionKey = (scope, userId) => `${PREFIX}${scope}.${typeof window === 'undefined' ? '' : window.location.host}.${userId ?? 'anon'}`

export function readSelection(key) {
  try {
    const ids = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(ids) ? ids.filter(id => Number.isInteger(id) && id > 0) : []
  } catch { return [] }
}

export function writeSelection(key, ids) {
  try { ids.length ? localStorage.setItem(key, JSON.stringify(ids)) : localStorage.removeItem(key) } catch { /* not kept: this visit only */ }
}

export function clearAllSelections() {
  try { Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k)) } catch { /* nothing kept */ }
}

// D174 / D176 (2): 25, 50, 75 or 100 per page, remembered in this browser (a convenience only)
export const PER_PAGE_OPTIONS = [25, 50, 75, 100]
export function storedPerPage(key) {
  try { const n = Number(localStorage.getItem(key)); return PER_PAGE_OPTIONS.includes(n) ? n : 25 } catch { return 25 }
}
export function storePerPage(key, n) {
  try { localStorage.setItem(key, String(n)) } catch { /* not stored: the choice holds for this visit */ }
}

// D177 QBK.1: the question filters and the page number survive a reload, per page, host (institution) and user, kept under the same
// prefix as the selection so logout clears them; reset writes the empty filters, which removes the entry
export const filterKey = (scope, userId) => selectionKey(`filters.${scope}`, userId)

/** the kept filters shaped like `empty` (unknown keys dropped, ids kept as numbers or strings) and the kept page */
export function readFilters(key, empty) {
  try {
    const kept = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (!kept || typeof kept !== 'object') return { filters: empty, page: 1 }
    const filters = Object.fromEntries(Object.entries(empty).map(([k, v]) => [k, Array.isArray(v)
      ? (Array.isArray(kept.filters?.[k]) ? kept.filters[k].filter(x => typeof x === 'number' || typeof x === 'string') : [])
      : (typeof kept.filters?.[k] === 'string' ? kept.filters[k] : v)]))
    const page = Number.isInteger(kept.page) && kept.page > 0 ? kept.page : 1
    return { filters, page }
  } catch { return { filters: empty, page: 1 } }
}

export function writeFilters(key, filters, page, empty) {
  try {
    const blank = page === 1 && JSON.stringify(filters) === JSON.stringify(empty)
    if (blank) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify({ filters, page }))
  } catch { /* not kept: this visit only */ }
}

/** D177 (1): drop kept ids the curriculum no longer offers (a removed chapter, a class gone) - silently */
export function pruneIds(filters, offered) {
  let changed = false
  const next = { ...filters }
  Object.entries(offered).forEach(([k, ids]) => {
    if (!ids || !Array.isArray(next[k])) return
    const keep = next[k].filter(id => ids.has(String(id)))
    if (keep.length !== next[k].length) { next[k] = keep; changed = true }
  })
  return changed ? next : filters
}
