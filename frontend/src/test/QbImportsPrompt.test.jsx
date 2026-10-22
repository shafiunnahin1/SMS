import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import QbImports from '../pages/writer/QbImports'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() }, bindAuthStore: () => {} }))

const curriculum = {
  class_levels: [{ id: 8, name_bn: 'অষ্টম শ্রেণী', name_en: 'Class 8', is_active: true }],
  subjects: [
    { id: 17, name_bn: 'গণিত', name_en: 'Mathematics', class_level_ids: [8], is_active: true,
      chapters: [{ id: 34, name_bn: 'প্যাটার্ন', name_en: 'Patterns', class_level_ids: [8], topics: [{ id: 56, name_bn: 'সংখ্যার প্যাটার্ন', name_en: 'Number patterns' }] }] },
    { id: 18, name_bn: 'ইংরেজি ১ম পত্র', name_en: 'English 1st Paper', class_level_ids: [8], is_active: true,
      chapters: [{ id: 35, name_bn: 'Reading', name_en: 'Reading', class_level_ids: [8], topics: [{ id: 57, name_bn: 'Comprehension', name_en: 'Comprehension' }] }] },
  ],
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter><QbImports /></MemoryRouter></QueryClientProvider>)
}

describe('writer import AI prompt', () => {
  afterEach(() => vi.clearAllMocks())

  it('builds the prompt from the latest selected curriculum and preserves import controls', async () => {
    api.get.mockImplementation(url => Promise.resolve({ data: url === '/writer/curriculum' ? { data: curriculum }
      : url === '/writer/question-types' ? { data: [{ slug: 'mcq' }, { slug: 'creative' }] }
        : { data: [] } }))
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'এআই প্রম্পট' }))
    const classSelect = await screen.findByLabelText('শ্রেণী')
    fireEvent.change(classSelect, { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('বিষয়'), { target: { value: '17' } })

    const output = await screen.findByTestId('qbi-prompt-output')
    await waitFor(() => expect(output.value).toContain('সংখ্যার প্যাটার্ন'))
    expect(output.value).toContain('exam-management.universal-content-json.v5')
    expect(output.value).toContain('topic_proposals')
    expect(output.value).toContain('["mcq","creative"]')
    expect(screen.getByRole('button', { name: 'Schema ডাউনলোড' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /JSON উদাহরণ/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /TOON উদাহরণ/ })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('বিষয়'), { target: { value: '18' } })
    await waitFor(() => expect(output.value).toContain('document.language to "en"'))
    expect(output.value).toContain('"en"')
    expect(output.value).toContain('ইংরেজি ১ম পত্র')
    expect(output.value).toContain('Comprehension')
    expect(output.value).not.toContain('সংখ্যার প্যাটার্ন')
  })
})
