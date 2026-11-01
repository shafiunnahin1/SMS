import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// D176 / D177: kept question selections and filters live in localStorage (by design they survive a reload); they must not leak
// from one test into the next, so each test starts with none
afterEach(() => {
  try { Object.keys(window.localStorage).filter(k => k.startsWith('qb.sel.')).forEach(k => window.localStorage.removeItem(k)) } catch { /* no storage */ }
})
