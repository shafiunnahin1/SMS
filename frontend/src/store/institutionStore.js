import { create } from 'zustand'
import api from '../api/axios'

// docs/templates/react-core-files.md "institutionStore": GET /bootstrap is the one source of theme, terms, modules and locales.
// The last response of this host is cached so the next visit paints the institution's theme at once (no default-blue flash).
const cacheKey = () => 'bootstrap-cache:' + window.location.hostname

export function readCachedBootstrap() {
  try { return JSON.parse(localStorage.getItem(cacheKey()) ?? 'null') } catch { return null }
}

export const useInstitutionStore = create((set, get) => ({
  ready: false,
  error: null,
  isCentral: false,
  institution: null,
  terms: {},
  modules: [],
  roles: [],
  theme: null,
  plan: null,
  settings: {},
  locales: { default: 'bn', enabled: ['bn', 'en'] },
  release: { id: 'R1' },

  loadBootstrap: async () => {
    const cached = readCachedBootstrap()
    if (cached) set({ ...cached, ready: true })
    try {
      const { data } = await api.get('/bootstrap')
      const b = data.data ?? data
      const next = {
        isCentral: Boolean(b.is_central), institution: b.institution ?? null, terms: b.terms ?? {},
        modules: b.modules ?? [], roles: b.roles ?? [], theme: b.theme, plan: b.plan ?? null,
        settings: b.settings ?? {}, locales: b.locales ?? { default: 'bn', enabled: ['bn', 'en'] }, release: b.release ?? { id: 'R1' },
      }
      try { localStorage.setItem(cacheKey(), JSON.stringify(next)) } catch { /* storage blocked: no cache, still works */ }
      set({ ...next, ready: true, error: null })
    } catch (e) {
      if (!cached) set({ error: e, ready: true })
    }
  },

  hasModule: (key) => get().modules.includes(key),
}))
