import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import AiChat from '../pages/ai/AiChat'
import { useAuthStore } from '../store/authStore'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))

const page = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <MemoryRouter><AiChat /></MemoryRouter></QueryClientProvider>)

// D166 (5) AI-Q5: a question asker sends a photo; the server's OCR text lands in the box to be corrected before sending, with its
// formulas offered for MathLive; parents and staff (help guide only) get no photo button
describe('AI chat question from a photo (D166 AI-Q5)', () => {
  afterEach(() => { vi.clearAllMocks(); useAuthStore.setState({ role: null }) })

  it('fills the box with the OCR text and lists the formulas, sending nothing by itself', async () => {
    useAuthStore.setState({ role: 'student' })
    api.get.mockResolvedValue({ data: { data: [] } })
    api.post.mockResolvedValue({ data: { data: { id: 3, status: 'done', text: 'গাড়িটির বেগ কত।\nx + 5 = 12', formulas: [{ line: 1, text: 'x + 5 = 12', latex: 'x + 5 = 12' }] } } })
    const { container } = page()
    await screen.findByTestId('ai-chat')
    const file = new File(['png'], 'q.png', { type: 'image/png' })
    fireEvent.change(screen.getByTestId('ai-photo-input'), { target: { files: [file] } })
    await waitFor(() => expect(container.querySelector('textarea[name="ai_question"]').value).toBe('গাড়িটির বেগ কত।\nx + 5 = 12'))
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post.mock.calls[0][0]).toBe('/ai/attachments')
    expect(api.post.mock.calls[0][1].get('image')).toBe(file)
    expect(screen.getByTestId('ai-formulas')).toBeInTheDocument()
  })

  it('an unsupported photo leaves the box empty and says why', async () => {
    useAuthStore.setState({ role: 'teacher' })
    api.get.mockResolvedValue({ data: { data: [] } })
    api.post.mockResolvedValue({ data: { message: 'not supported', data: { id: 4, status: 'unsupported', text: '', formulas: [] } } })
    const { container } = page()
    await screen.findByTestId('ai-chat')
    fireEvent.change(screen.getByTestId('ai-photo-input'), { target: { files: [new File(['x'], 'h.jpg', { type: 'image/jpeg' })] } })
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(container.querySelector('textarea[name="ai_question"]').value).toBe('')
    expect(screen.queryByTestId('ai-formulas')).toBeNull()
  })

  it('parents and staff get no photo button', async () => {
    api.get.mockResolvedValue({ data: { data: [] } })
    for (const role of ['parent', 'institution_staff']) {
      useAuthStore.setState({ role })
      const { unmount } = page()
      await screen.findByTestId('ai-chat')
      expect(screen.queryByTestId('ai-photo-input')).toBeNull()
      unmount()
    }
  })
})
