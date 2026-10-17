import { render, screen, cleanup } from '@testing-library/react'
import '../i18n'
import PageSlot from '../ui/PageSlot'
import { UIProvider } from '../ui/UIProvider'
import { PACKS } from '../ui/packs'
import fixturePack, { broken } from './packs/test-fixture/manifest'

// docs/UI-PACKS.md section 5 "PackContractTest": every pack x slot gets the same fixture; the set of data-action values equals the
// hook's action keys, and every data item (data-row) is shown. Run in ltr and rtl (I18N.md section 4.2). The registry's packs and
// the test-only `test-fixture` pack all go through the same check; a view that drops an action must fail it.
const FIXTURES = {
  'attendance.take': {
    state: { marks: { 1: 'present', 2: 'absent' }, saving: false, dirty: false, counts: { present: 1, absent: 1, late: 0, leave: 0 } },
    data: { batch: { id: 9, name: 'A', program: 'Class 6' }, date: '2026-10-06', rows: [
      { student_id: 1, name: 'রাহিম', roll_no: 1, status: 'present' }, { student_id: 2, name: 'করিম', roll_no: 2, status: 'absent' }], saved: { count: 2, first_saved_at: '2026-10-06T03:15:00Z', taken_by: 'Teacher' } },
    actions: { setStatus: () => {}, markAll: () => {}, save: () => {}, reset: () => {} },
  },
}

/** Renders one pack x slot and returns what the contract compares */
async function renderSlot(pack, slot, dir) {
  document.documentElement.dir = dir
  const f = FIXTURES[slot]
  const { container } = render(<UIProvider pack={pack}><PageSlot name={slot} {...f} /></UIProvider>)
  await screen.findAllByText('রাহিম')
  const result = {
    actions: [...new Set([...container.querySelectorAll('[data-action]')].map(e => e.getAttribute('data-action')))].sort(),
    rows: [...container.querySelectorAll('[data-row]')].map(e => e.getAttribute('data-row')).sort(),
    saved: container.querySelector('[data-saved-state="saved"]') !== null,
    tags: [...container.querySelectorAll('[data-action]')].map(e => e.tagName),
  }
  cleanup()
  return result
}

function expectContract(result, slot) {
  const f = FIXTURES[slot]
  expect(result.actions).toEqual(Object.keys(f.actions).sort())
  expect(result.rows).toEqual(f.data.rows.map(r => String(r.student_id)).sort())
  if (slot === 'attendance.take') expect(result.saved).toBe(true)   // owner 2026-10-07: show it was saved
  result.tags.forEach(tag => expect(tag).toMatch(/BUTTON|INPUT/))     // reachable by keyboard
}

const ALL_PACKS = { ...PACKS, 'test-fixture': fixturePack }

describe.each(Object.keys(ALL_PACKS))('pack %s', (packKey) => {
  describe.each(Object.keys(FIXTURES))('slot %s', (slot) => {
    it.each(['ltr', 'rtl'])('keeps the action and data contract (%s)', async (dir) => {
      expectContract(await renderSlot(ALL_PACKS[packKey], slot, dir), slot)
    })
  })
})

it('fails for a pack view whose data-action set is incomplete', async () => {
  const result = await renderSlot(broken, 'attendance.take', 'ltr')
  expect(result.actions).not.toContain('reset')
  expect(() => expectContract(result, 'attendance.take')).toThrow()
})

it('the test-fixture view really replaces the default and classic uses the default view', async () => {
  expect(PACKS.classic.views).toEqual({})
  expect(Object.keys(fixturePack.views)).toEqual(['attendance.take'])
  const { container } = render(<UIProvider pack={fixturePack}><PageSlot name="attendance.take" {...FIXTURES['attendance.take']} /></UIProvider>)
  await screen.findAllByText('রাহিম')
  expect(container.querySelector('ol > li[data-row]')).not.toBeNull()   // the fixture's markup, not the grid
  cleanup()
})

it('the mobile pack (Spike S5b) overrides only attendance.take', () => {
  expect(Object.keys(PACKS.mobile.views)).toEqual(['attendance.take'])
})
