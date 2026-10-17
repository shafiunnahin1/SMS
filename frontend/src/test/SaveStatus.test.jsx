import { render } from '@testing-library/react'
import '../i18n'
import SaveStatus from '../features/attendance/views/SaveStatus'

// Owner feedback 2026-10-07: reopening a saved attendance sheet must say it is saved; unsaved edits must say so too
it.each([
  [{ count: 0 }, true, 'new'],
  [{ count: 8, first_saved_at: '2026-10-07T09:45:00Z', taken_by: 'T' }, false, 'saved'],
  [{ count: 8, first_saved_at: '2026-10-07T09:45:00Z', taken_by: 'T' }, true, 'changed'],
])('saved=%j dirty=%s shows %s', (saved, dirty, state) => {
  const { container } = render(<SaveStatus saved={saved} dirty={dirty} total={8} />)
  expect(container.querySelector(`[data-saved-state="${state}"]`)).not.toBeNull()
})
