import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import QbImports from '../pages/writer/QbImports'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() }, bindAuthStore: () => {} }))

// D151 R2.1.2-ai-prompt-library: the copied prompt and the downloaded UTF-8 .txt are the same text as shown; a failed curriculum
// load shows the retry state and a class with no subjects says so; the modal works in English too
const curriculum = {
  class_levels: [{ id: 8, name_bn: 'অষ্টম শ্রেণী', name_en: 'Class 8', is_active: true }, { id: 9, name_bn: 'নবম শ্রেণী', name_en: 'Class 9', is_active: true }],
  subjects: [{ id: 17, name_bn: 'গণিত', name_en: 'Mathematics', class_level_ids: [8], is_active: true,
    chapters: [{ id: 34, name_bn: 'প্যাটার্ন', name_en: 'Patterns', class_level_ids: [8], topics: [{ id: 56, name_bn: 'সংখ্যার প্যাটার্ন', name_en: 'Number patterns' }] }] }],
  curriculum_versions: [],
}
const ok = () => api.get.mockImplementation(url => Promise.resolve({ data: url === '/writer/curriculum' ? { data: curriculum }
  : url === '/writer/question-types' ? { data: [{ slug: 'mcq' }] } : { data: [] } }))
const page = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><QbImports /></MemoryRouter></QueryClientProvider>)

describe('writer import AI prompt states (D151)', () => {
  afterEach(async () => { vi.clearAllMocks(); vi.unstubAllGlobals(); await i18n.changeLanguage('bn') })

  it('copies and downloads exactly the shown prompt as UTF-8 text', async () => {
    ok()
    const copied = []
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(text => { copied.push(text); return Promise.resolve() }) }, configurable: true })
    const blobs = []
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(b => { blobs.push(b); return 'blob:x' }), revokeObjectURL: vi.fn() })
    page()
    fireEvent.click(screen.getByRole('button', { name: 'এআই প্রম্পট' }))
    fireEvent.change(await screen.findByLabelText('শ্রেণী'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('বিষয়'), { target: { value: '17' } })
    const shown = (await screen.findByTestId('qbi-prompt-output')).value
    fireEvent.click(screen.getByTestId('qbi-copy-button'))
    await waitFor(() => expect(copied).toEqual([shown]))
    fireEvent.click(screen.getByRole('button', { name: 'TXT ডাউনলোড' }))
    expect(blobs).toHaveLength(1)
    expect(blobs[0].type).toBe('text/plain;charset=utf-8')
    expect(await blobs[0].text()).toBe(shown)
    expect(shown).toContain('সংখ্যার প্যাটার্ন')
  })

  it('shows a retry state when the curriculum cannot load, and says when a class has no subjects', async () => {
    api.get.mockImplementation(url => url === '/writer/curriculum' ? Promise.reject(new Error('down')) : Promise.resolve({ data: { data: [] } }))
    const { unmount } = page()
    fireEvent.click(screen.getByRole('button', { name: 'এআই প্রম্পট' }))
    expect(await screen.findByRole('button', { name: i18n.t('common.retry') })).toBeInTheDocument()
    expect(screen.queryByTestId('qbi-prompt-output')).toBeNull()
    unmount()

    ok()
    page()
    fireEvent.click(screen.getByRole('button', { name: 'এআই প্রম্পট' }))
    fireEvent.change(await screen.findByLabelText('শ্রেণী'), { target: { value: '9' } })
    expect(screen.getByText('এই শ্রেণীর জন্য কোনো বিষয় পাওয়া যায়নি।')).toBeInTheDocument()
    expect(screen.queryByTestId('qbi-prompt-output')).toBeNull()
  })

  it('works in English', async () => {
    await i18n.changeLanguage('en')
    ok()
    page()
    fireEvent.click(screen.getByRole('button', { name: 'AI prompt' }))
    fireEvent.change(await screen.findByLabelText('Class'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: '17' } })
    expect((await screen.findByTestId('qbi-prompt-output')).value).toContain('exam-management.universal-content-json.v5')
    expect(screen.getByRole('button', { name: 'Download TXT' })).toBeInTheDocument()
  })
})
