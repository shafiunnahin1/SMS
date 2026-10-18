import { render, screen } from '@testing-library/react'
import '../i18n'
import Loader from '../components/Loader'
import DataTable from '../components/DataTable'

// Owner request 2026-10-06: page and section loading is a skeleton, never a spinner; accessible as a busy status
describe('Loader', () => {
  it('shows a page skeleton (title bar, cards, rows) by default, busy and without a spinner', () => {
    const { container } = render(<Loader />)
    const status = screen.getByTestId('loader-page')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(8)
    expect(container.querySelector('.animate-spin')).toBeNull()
  })

  it('renders the requested number of table rows and form fields', () => {
    const { container, rerender } = render(<Loader type="skeleton" rows={4} />)
    expect(container.querySelectorAll('.h-row')).toHaveLength(4)
    rerender(<Loader type="form" fields={3} />)
    expect(screen.getByTestId('loader-form')).toBeInTheDocument()
  })

  it('keeps the spinner for inline actions only', () => {
    const { container } = render(<Loader type="spinner" />)
    expect(container.querySelector('.animate-spin')).not.toBeNull()
    expect(container.querySelector('.skeleton')).toBeNull()
  })

  it('DataTable shows skeleton rows while loading, then empty and error states', () => {
    const cols = [{ key: 'name', label: 'n' }]
    const { rerender } = render(<DataTable columns={cols} loading />)
    expect(screen.getByTestId('loader-skeleton')).toBeInTheDocument()
    rerender(<DataTable columns={cols} data={[]} />)
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    rerender(<DataTable columns={cols} error onRetry={() => {}} />)
    expect(screen.getByTestId('error-state')).toBeInTheDocument()
  })
})
