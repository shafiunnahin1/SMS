import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import QbLibrary from '../pages/qb/QbLibrary'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() }, bindAuthStore: () => {} }))
vi.mock('../ui/I18nProvider', () => ({ useLocale: () => ({ locale: 'bn' }) }))

function renderPage(path = '/admin/study-materials') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><QbLibrary /></MemoryRouter></QueryClientProvider>)
}

describe('study materials page', () => {
  beforeEach(() => {
    api.get.mockImplementation(path => Promise.resolve({ data: path.endsWith('/curriculum')
      ? { data: { class_levels: [], subjects: [] } }
      : { data: [] } }))
  })
  afterEach(() => vi.clearAllMocks())

  it('shows concepts and resources without a questions tab', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('qb-library')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'শিক্ষা-উপকরণ' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['কনসেপ্ট', 'স্লাইড, বই ও PDF'])
    expect(api.get.mock.calls.map(([path]) => path)).not.toContain('/question-bank/questions')
  })
})
