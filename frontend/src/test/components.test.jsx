import { render, screen, fireEvent, act } from '@testing-library/react'
import '../i18n'
import StatusBadge from '../components/StatusBadge'
import ConfirmModal from '../components/ConfirmModal'
import Modal from '../ui/variants/Modal'
import FileUpload from '../components/FileUpload'
import DateRangePicker, { rangePreset } from '../components/DateRangePicker'
import Can from '../components/Can'
import StatCard from '../components/StatCard'
import { useUiStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'

// Step 3.4 shared components (docs/design/component-library.md)
it('StatusBadge shows the word, not only a colour', () => {
  render(<StatusBadge status="paid" />)
  expect(screen.getByText('পরিশোধিত')).toHaveAttribute('data-status', 'paid')
})

it('StatCard shows the delta with a sign, never colour alone', () => {
  render(<StatCard label="L" value="10" delta={-4} />)
  expect(screen.getByText('-4%')).toBeInTheDocument()
})

it('ConfirmModal opens from the store, focuses Cancel, closes on Esc and runs onConfirm', async () => {
  const onConfirm = vi.fn()
  render(<ConfirmModal />)
  act(() => useUiStore.getState().openConfirm({ title: 'Delete?', type: 'danger', onConfirm }))
  expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  expect(document.activeElement).toHaveTextContent('বাতিল')
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('alertdialog')).toBeNull()
  act(() => useUiStore.getState().openConfirm({ title: 'Delete?', onConfirm }))
  await act(async () => { fireEvent.click(screen.getByText('নিশ্চিত')) })
  expect(onConfirm).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

it('Modal keeps a focused field active when the parent callback changes', () => {
  const { rerender } = render(<Modal open onClose={() => {}} title="Table"><textarea aria-label="Cell" /></Modal>)
  const cell = screen.getByRole('textbox', { name: 'Cell' })
  cell.focus()

  rerender(<Modal open onClose={() => {}} title="Table"><textarea aria-label="Cell" /></Modal>)
  fireEvent.change(cell, { target: { value: 'cell text' } })

  expect(cell).toHaveValue('cell text')
  expect(document.activeElement).toBe(cell)
})

it('FileUpload refuses a file over the size limit or of another type', () => {
  const onUpload = vi.fn()
  const { container } = render(<FileUpload accept=".png" maxSize={1} onUpload={onUpload} />)
  const input = container.querySelector('input[type=file]')
  const big = new File([new Uint8Array(2 * 1024 * 1024)], 'a.png', { type: 'image/png' })
  fireEvent.change(input, { target: { files: [big] } })
  expect(screen.getByRole('alert')).toBeInTheDocument()
  fireEvent.change(input, { target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] } })
  expect(onUpload).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
  expect(onUpload).toHaveBeenCalledTimes(1)
})

it('DateRangePicker presets and never an inverted range', () => {
  expect(rangePreset('this_month', new Date(2026, 9, 7))).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  expect(rangePreset('last_month', new Date(2026, 0, 15))).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  const onChange = vi.fn()
  const { container } = render(<DateRangePicker value={{ from: '2026-10-10', to: '2026-10-20' }} onChange={onChange} />)
  fireEvent.change(container.querySelectorAll('input')[1], { target: { value: '2026-10-05' } })
  expect(onChange).toHaveBeenCalledWith({ from: '2026-10-05', to: '2026-10-05' })
})

it('Can shows children to the role and the fallback to others', () => {
  act(() => useAuthStore.setState({ role: 'teacher' }))
  render(<Can role={['admin', 'accountant']} fallback={<span>no</span>}><span>yes</span></Can>)
  expect(screen.getByText('no')).toBeInTheDocument()
})

it('DataTable keeps action columns on phone cards, outside the card button (Step 4.1)', async () => {
  const { default: DataTable } = await import('../components/DataTable')
  const onEdit = vi.fn()
  const { container } = render(<DataTable columns={[
    { key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }, { key: 'd', label: 'D' },
    { key: 'actions', label: 'X', action: true, render: () => <button type="button" onClick={onEdit}>edit-me</button> },
  ]} data={[{ id: 1, a: 'a1', b: 'b1', c: 'c1', d: 'd1' }]} />)
  const card = container.querySelector('ul li')
  expect(card.textContent).toContain('edit-me')
  expect(card.querySelector('button button')).toBeNull()
  expect(card.textContent).not.toContain('d1')                     // still the first 3 information columns only
})
