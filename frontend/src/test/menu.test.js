import { buildNav, MENU } from '../nav/menu'

const R1 = { modules: ['students', 'enrollments', 'attendance', 'fees', 'exams', 'sms', 'reports', 'data_migration'], settings: { use_programs: true }, roles: ['admin', 'teacher', 'parent', 'accountant'], release: 'R1' }
const keys = (nav) => nav.flatMap(i => [i.key, ...(i.children ?? []).map(c => `${i.key}.${c.key}`)])

describe('buildNav', () => {
  it('shows only shipped modules and releases', () => {
    const k = keys(buildNav('admin', R1))
    expect(k).toContain('students')
    expect(k).toContain('fees.collect')
    expect(k).not.toContain('fees.waivers')          // since R2
    expect(k).not.toContain('expenses')              // module not in R1
    expect(k).not.toContain('settings.appearance')   // since R2
  })

  it('takes the batch/program labels from the institution terms (D5)', () => {
    const nav = buildNav('admin', R1, (k) => ({ batches: 'ব্যাচসমূহ', programs: 'কোর্সসমূহ' })[k])
    const academic = nav.find(i => i.key === 'academic')
    expect(academic.children.map(c => c.label)).toEqual(['কোর্সসমূহ', 'ব্যাচসমূহ', 'বিষয়'])
  })

  it('hides programs when the institution does not use them and teachers when the type has none', () => {
    const k = keys(buildNav('admin', { ...R1, settings: { use_programs: false }, roles: ['admin', 'parent'] }))
    expect(k).not.toContain('academic.programs')
    expect(k).not.toContain('teachers')
  })

  it('has at most four bottom-bar items per role (mobile-compact)', () => {
    for (const role of Object.keys(MENU)) {
      const flat = buildNav(role, R1).flatMap(i => i.children ?? [i])
      expect(flat.filter(i => i.primary).length).toBeLessThanOrEqual(4)
    }
  })
})
