import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import QbPaperPreview from '../pages/qb/QbPaperPreview'
import { objectStyles } from '../features/qb/paperObjects'

vi.mock('../features/qb/paperImage', () => ({ downloadPaperJpg: vi.fn(), downloadPaperPdf: vi.fn(),
  paperDimensions: vi.fn(() => ({ width: 210, height: 297, widthPt: 595.28, heightPt: 841.89 })) }))
vi.mock('../api/axios', () => ({ default: { get: vi.fn() }, bindAuthStore: () => {} }))

// D181 QBO.3: a question's table / picture can be picked in the preview and laid out (position, bounded size, border) for this paper
// and set only; reset restores the question's own rendering; a stimulus group's passage objects have their own ids
const TABLE = '<table><tr><td>৮</td><td>৬</td></tr></table>'
const PAPER = { id: 7, title: 'T', exam_name: '', duration_minutes: 30, total_marks: '2.00', instructions: '', set: 'A', set_code: 'A', sets_count: 1, institution: 'S', answers: false, media: [], answer_key: [],
  sections: [{ title: 'MCQ', instruction: null, items: [
    { no: 1, marks: '1.00', subject: null, question: { id: 101, question_text: `শূন্য ঘরের মান কত? ${TABLE}`, media: [], options: [{ label: 'ক', content_text: '২', is_correct: true }] } },
    { no: null, marks: '1.00', subject: null, question: { id: 102, question_text: 'Read.', media: [], options: [], stimuli: [{ id: 5, content_text: `Passage ${TABLE}` }], items: [] } },
  ] }] }

function renderPage() {
  window.localStorage.clear()
  api.get.mockResolvedValue({ data: { data: PAPER } })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin/question-bank/papers/7/preview?set=A']}>
    <Routes><Route path="/admin/question-bank/papers/:id/preview" element={<QbPaperPreview />} /></Routes></MemoryRouter></QueryClientProvider>)
}

describe('D181 paper preview object layout', () => {
  it('sizes and bounds an object, keeps proportions for pictures and leaves the source alone without a choice', () => {
    expect(objectStyles(undefined)).toBeNull()
    expect(objectStyles({ width: 5 }).inner.width).toBe('10%')
    expect(objectStyles({ width: 150 }).inner.width).toBe('100%')
    expect(objectStyles({ align: 'right', width: 40, border: 2 })).toMatchObject({ outer: { textAlign: 'end' }, inner: { width: '40%', border: '2pt solid currentColor' } })
    expect(objectStyles({ align: 'float-end', width: 30 }).outer).toMatchObject({ float: 'inline-end', width: '30%' })
  })

  it('picks a table, lays it out for this paper and set, and resets it', async () => {
    renderPage()
    const question = (await screen.findAllByTestId('qb-paper-question'))[0]
    const panel = screen.getByTestId('qb-object-panel')
    expect(within(panel).getByRole('button', { name: 'আগের মতো' })).toBeDisabled()
    const wrap = question.querySelector('[data-qb-object]')
    expect(wrap.dataset.qbObject).toBe('101|question_text|||table1')
    expect(wrap.style.display).toBe('contents')                                  // no choice: the question's own rendering
    fireEvent.click(question.querySelector('table'))
    expect(panel).toHaveTextContent('টেবিল')
    fireEvent.click(within(panel).getByRole('button', { name: 'অবস্থান: ডানে' }))
    fireEvent.change(within(panel).getByRole('slider'), { target: { value: '50' } })
    fireEvent.change(within(panel).getByRole('combobox'), { target: { value: '2' } })
    const laid = question.querySelector('[data-qb-object]')
    expect(laid.style.textAlign).toBe('end')
    expect(laid.firstChild.style.width).toBe('50%')
    expect(laid.firstChild.style.border).toContain('2pt solid')                  // in the text colour (jsdom drops currentColor)
    expect(JSON.parse(window.localStorage.getItem('qb-paper-preview:7:A')).objects).toEqual({ '101|question_text|||table1': { align: 'right', width: 50, border: 2 } })
    fireEvent.click(within(panel).getByRole('button', { name: 'আগের মতো' }))
    expect(question.querySelector('[data-qb-object]').style.display).toBe('contents')
    expect(JSON.parse(window.localStorage.getItem('qb-paper-preview:7:A')).objects).toEqual({})

    // a stimulus passage's table has its own id; the selection outline never prints
    expect(screen.getAllByTestId('qb-paper-stimulus')[0].querySelector('[data-qb-object]').dataset.qbObject).toBe('102|stimulus|5||table1')
    const styles = [...document.querySelectorAll('style')].map(x => x.textContent).join('\n')
    expect(styles).toContain('.qb-paper .qb-object-selected>*,.qb-paper .qb-object-selected.qb-object-sized{outline:none!important}')
  })
})
