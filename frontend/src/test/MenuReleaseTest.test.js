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

  it('routes admin and teacher study materials separately from Question Bank', () => {
    expect(routePaths).toContain('/admin/study-materials')
    expect(routePaths).toContain('/teacher/materials')
    expect(routePaths).toContain('/admin/question-bank')
  })
})

// R3.12 (docs/AGENT-PLAN-R3.md): every R3 page of the plan's list is in the R3 menu and has a built page (not the NotBuilt placeholder);
// a module that is off hides its items; salary items appear only for the roles that may use them.
const R3_MODULES = [...R1_MODULES, 'question_bank', 'quiz', 'expenses', 'cashbook', 'hr_payroll', 'teacher_attendance', 'inventory', 'accounting', 'donations']
const R3_PAGES = {
  admin: ['/admin/fees/cashbook', '/admin/expenses', '/admin/inventory', '/admin/staff', '/admin/departments', '/admin/hr/staff', '/admin/hr/salary-components',
    '/admin/hr/revisions', '/admin/hr/increments', '/admin/hr/bonus', '/admin/hr/adjustments', '/admin/hr/advances', '/admin/hr/payroll', '/admin/hr/pf', '/admin/hr/leave',
    '/admin/hr/attendance', '/admin/hr/reports', '/admin/accounting/vouchers', '/admin/accounting/accounts', '/admin/accounting/budgets', '/admin/accounting/bank',
    '/admin/accounting/reports', '/admin/donations/donors', '/admin/donations/funds', '/admin/donations/campaigns', '/admin/donations'],
  institution_staff: ['/staff/departments', '/staff/profile'],
}
const builtPaths = tenantRoutes.flatMap(r => (r.children ?? []).filter(c => c.path !== '*' && !c.placeholder).map(c => `${r.path}/${c.path}`))
const r3Nav = (role, modules = R3_MODULES) => buildNav(role, { modules, settings: { use_programs: true }, roles: ['admin', 'teacher', 'parent', 'accountant', 'institution_staff'], release: 'R3' })
  .flatMap(i => i.children ?? [i]).map(i => i.path)

describe('MenuReleaseTest (R3)', () => {
  it.each(Object.entries(R3_PAGES))('%s: every R3 page is in the menu and built', (role, pages) => {
    const visible = r3Nav(role)
    expect(pages.filter(p => !visible.includes(p)), 'menu').toEqual([])
    expect(pages.filter(p => !builtPaths.includes(p)), 'built page').toEqual([])
  })

  it('accountant R3 items have built pages', () => {
    const missing = r3Nav('accountant').filter(p => p.startsWith('/accountant/') && !builtPaths.includes(p))
    expect(missing).toEqual([])
  })

  it('hides a module that is off, and R3 items in R1', () => {
    const off = r3Nav('admin', R3_MODULES.filter(m => !['accounting', 'donations', 'hr_payroll'].includes(m)))
    expect(off.some(p => p.startsWith('/admin/accounting') || p.startsWith('/admin/donations') || p.startsWith('/admin/hr/payroll'))).toBe(false)
    const r1 = buildNav('admin', { modules: R3_MODULES, roles: ['admin'], release: 'R1' }).flatMap(i => i.children ?? [i]).map(i => i.path)
    expect(r1).not.toContain('/admin/staff')
    expect(r1).not.toContain('/admin/fees/refunds')
  })

  it('salary pages only for the roles that may see them', () => {
    expect(r3Nav('parent').some(p => /salary|payroll|hr\//.test(p))).toBe(false)
    expect(r3Nav('institution_staff').some(p => /salary|payroll|hr\//.test(p))).toBe(false)
    expect(r3Nav('teacher')).toContain('/teacher/salary')
    expect(builtPaths).toContain('/teacher/salary')
  })
})
