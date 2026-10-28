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
