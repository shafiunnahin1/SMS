import { shipped, buildNav } from '../nav/menu'
import { tenantRoutes } from '../router'

// docs/TESTING.md "MenuReleaseTest (Vitest)": items with since > release.id are hidden; shipped('R1.1','R1') = false,
// shipped('R1','R1.1') = true; in R1 every visible item has a route of its own (not just the catch-all).
const R1_MODULES = ['students', 'enrollments', 'attendance', 'fees', 'exams', 'sms', 'reports', 'data_migration']
const ROLES = { school: ['admin', 'teacher', 'parent', 'accountant'], coaching: ['admin', 'teacher', 'parent', 'accountant'], private_batch: ['admin', 'parent'] }

const routePaths = tenantRoutes.flatMap(r => (r.children ?? []).filter(c => c.path !== '*').map(c => `${r.path}/${c.path}`).concat(r.children ? [] : [r.path]))

describe('MenuReleaseTest', () => {
  it('compares releases in order', () => {
    expect(shipped('R1.1', 'R1')).toBe(false)
    expect(shipped('R1', 'R1.1')).toBe(true)
    expect(shipped(undefined, 'R1')).toBe(true)
    expect(shipped('R2', 'R1')).toBe(false)
  })

  it.each(Object.entries(ROLES))('%s: every visible R1 menu item has its own route', (type, roles) => {
    for (const role of roles) {
      const nav = buildNav(role, { modules: R1_MODULES, settings: { use_programs: type !== 'private_batch' }, roles, release: 'R1' })
      const paths = nav.flatMap(i => i.children ?? [i]).map(i => i.path)
      expect(paths.length).toBeGreaterThan(0)
      const missing = paths.filter(p => !routePaths.includes(p))
      expect(missing, `${type}/${role}`).toEqual([])
    }
  })

  it('hides later-release items in R1 and shows them once that release ships', () => {
    const keys = (rel) => buildNav('admin', { modules: R1_MODULES, roles: ['admin'], release: rel }).flatMap(i => i.children ?? [i]).map(i => i.key)
    expect(keys('R1')).not.toContain('exports')       // since R1.1
    expect(keys('R1.1')).toContain('exports')
  })
})
