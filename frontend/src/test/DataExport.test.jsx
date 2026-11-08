import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import DataExport from '../pages/export/DataExport'
import SuperExports from '../pages/export/SuperExports'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() }, bindAuthStore: () => {} }))

const at = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)

// D193 EXP.1: the admin asks for an export with the password and a passphrase (salary data only when ticked) and downloads it once;
// the Super Admin restores a backup by its number as a new institution
describe('data export (D193 EXP.1)', () => {
  beforeEach(() => {
    api.get.mockReset(); api.post.mockReset(); i18n.changeLanguage('en')
    URL.createObjectURL = vi.fn(() => 'blob:x')
    api.get.mockImplementation((url) => Promise.resolve({ data: url === '/admin/exports' ? { data: [{ id: 3, status: 'ready', rows_count: 120, expires_at: '2026-11-09T10:00:00+06:00' }] }
      : url.startsWith('/super/institutions') ? { data: [{ id: 1, name: 'Alo', slug: 'alo' }] } : new Blob(['x']) }))
    api.post.mockResolvedValue({ data: { data: { id: 4, slug: 'alo-2' } } })
  })

  it('the admin makes an export and downloads it once', async () => {
    at(<DataExport />)
    fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'Secret@1234' } })
    fireEvent.change(screen.getByLabelText('Passphrase for the file'), { target: { value: 'correct horse battery' } })
    fireEvent.change(screen.getByLabelText('Passphrase again'), { target: { value: 'correct horse battery' } })
    fireEvent.click(screen.getByLabelText('Include salary and payroll data'))
    fireEvent.click(screen.getByText('Make the export file'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/exports', { password: 'Secret@1234', passphrase: 'correct horse battery', passphrase_confirmation: 'correct horse battery', include_payroll: true }))
    fireEvent.click((await screen.findAllByText('Download (once)'))[0])
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/admin/exports/3/download', { params: undefined, responseType: 'blob' }))
  })

  it('the Super Admin restores a backup as a new institution', async () => {
    at(<SuperExports />)
    fireEvent.change(screen.getByLabelText('Backup / export number'), { target: { value: '9' } })
    fireEvent.change(screen.getByLabelText('New address (slug)'), { target: { value: 'alo-2' } })
    fireEvent.change(screen.getAllByLabelText('Passphrase for the file')[1], { target: { value: 'correct horse battery' } })
    fireEvent.click(screen.getAllByText('Restore as a new institution')[1])
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/super/institutions/import', expect.any(FormData), expect.anything()))
    const fd = api.post.mock.calls[0][1]
    expect([fd.get('export_id'), fd.get('new_slug'), fd.get('status')]).toEqual(['9', 'alo-2', 'trial'])
  })
})
