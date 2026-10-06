import { render, screen, cleanup } from '@testing-library/react'
import '../i18n'
import PageSlot from '../ui/PageSlot'
import { UIProvider } from '../ui/UIProvider'
import { PACKS } from '../ui/packs'

// docs/UI-PACKS.md section 5 "PackContractTest": every pack x slot gets the same fixture; the set of data-action values equals the
// hook's action keys, and every data item (data-row) is shown. Run in ltr and rtl (I18N.md section 4.2).
const FIXTURES = {
  'attendance.take': {
    state: { marks: { 1: 'present', 2: 'absent' }, saving: false, dirty: false, counts: { present: 1, absent: 1, late: 0, leave: 0 } },
    data: { batch: { id: 9, name: 'A', program: 'Class 6' }, date: '2026-10-06', rows: [
      { student_id: 1, name: 'রাহিম', roll_no: 1, status: 'present' }, { student_id: 2, name: 'করিম', roll_no: 2, status: 'absent' }] },
    actions: { setStatus: () => {}, markAll: () => {}, save: () => {}, reset: () => {} },
  },
}

describe.each(Object.keys(PACKS))('pack %s', (packKey) => {
  describe.each(Object.keys(FIXTURES))('slot %s', (slot) => {
    it.each(['ltr', 'rtl'])('keeps the action and data contract (%s)', async (dir) => {
      document.documentElement.dir = dir
      const f = FIXTURES[slot]
      const { container } = render(<UIProvider pack={PACKS[packKey]}><PageSlot name={slot} {...f} /></UIProvider>)
      await screen.findAllByText('রাহিম')
      const actions = new Set([...container.querySelectorAll('[data-action]')].map(e => e.getAttribute('data-action')))
      expect([...actions].sort()).toEqual(Object.keys(f.actions).sort())
      const rows = [...container.querySelectorAll('[data-row]')].map(e => e.getAttribute('data-row'))
      expect(rows.sort()).toEqual(f.data.rows.map(r => String(r.student_id)).sort())
      container.querySelectorAll('[data-action]').forEach(el => expect(el.tagName).toMatch(/BUTTON|INPUT/))   // reachable by keyboard
      cleanup()
    })
  })
})

it('the mobile pack overrides attendance.take and classic uses the default view', () => {
  expect(Object.keys(PACKS.mobile.views)).toEqual(['attendance.take'])
  expect(PACKS.classic.views).toEqual({})
})
