import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import OmrDesigner, { omrFromSaved } from '../features/qb/OmrDesigner'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() }, bindAuthStore: () => {} }))
vi.mock('../features/qb/omrSheet', () => ({ pdfPages: vi.fn(async (blob, onPage) => onPage({ toDataURL: () => 'data:image/png;base64,AA' }, 1)) }))

const saved = { title: 'টেস্ট ১', subtitle: '', roll_digits: 6, option_count: 4, option_labels: ['ক', 'খ', 'গ', 'ঘ'], page_size: 'a4', page_orientation: 'portrait',
  answer_columns: 'auto', question_count: 5, info_boxes: { class: { visible: true, digits: 2 }, roll: { visible: true, digits: 6 }, subject: { visible: true, digits: 3 }, set: { visible: true, digits: 1 } },
  marking: { question_mark: '1.00', negative_mark_enabled: false, negative_mark: '0.00', multiple_answer_policy: 'wrong' } }

function renderDesigner(form) {
  api.get.mockImplementation((path) => Promise.resolve({ data: path.endsWith('/pdf') ? new Blob(['%PDF']) : { data: { id: 9, title: 'টেস্ট ১', sections: [] } } }))
  api.put.mockResolvedValue({ data: { data: form } })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><OmrDesigner id="9" form={form} onSaved={vi.fn()} /></QueryClientProvider>)
}

describe('qbank OMR designer (D133)', () => {
  afterEach(() => { vi.clearAllMocks(); vi.useRealTimers() })

  it('reads saved settings with qbank defaults for the new ones', () => {
    expect(omrFromSaved(saved)).toMatchObject({ title_size: 20, subtitle_size: 14, font: 'default', theme_color: 'black', entry_mode: 'digital', digits: { class: 2, subject: 3, set: 1 } })
  })

  it('shows the preview and qbank controller sections, and saves a change after a pause', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderDesigner({ id: 1, code: 'ABC', settings: saved, layout_version: 1, locked_at: null, set_codes: ['ক'] })
    expect(await screen.findByTestId('omr-preview-frame')).toHaveAttribute('src', 'data:image/png;base64,AA')
    expect(api.get).toHaveBeenCalledWith('/question-bank/papers/9/omr-form/pdf', { params: { preview: 1 }, responseType: 'blob' })
    for (const title of ['Output', 'Marking', 'Title & Subtitle', 'Appearance', 'Candidate Info', 'Candidate Codes', 'Answer Layout']) expect(screen.getByText(title)).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: /^টাইটেলের সাইজ/ })).toHaveAttribute('min', '10')
    fireEvent.change(screen.getByRole('textbox', { name: 'সাব টাইটেল' }), { target: { value: 'অর্ধ-বার্ষিক' } })
    fireEvent.click(screen.getByRole('radio', { name: 'নীল' }))
    fireEvent.click(screen.getByRole('button', { name: 'MANUAL' }))
    expect(api.put).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(800) })
    expect(api.put).toHaveBeenCalledTimes(1)
    expect(api.put.mock.calls[0][1].settings).toMatchObject({ subtitle: 'অর্ধ-বার্ষিক', theme_color: 'blue', entry_mode: 'manual', digits: { class: 2, subject: 3, set: 1 } })
  })
})
