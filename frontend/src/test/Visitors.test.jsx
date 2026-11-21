import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import { useStaffDepartmentStore } from '../store/staffDepartmentStore'
import Visitors from '../pages/visitor/Visitors'
import { StaffVisitors } from '../pages/staff/StaffCampus'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }, bindAuthStore: () => {} }))
const at = (path, el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>{el}</MemoryRouter></QueryClientProvider>)
const v = (o) => ({ id: 1, visitor_name: 'Karim Uddin', visitor_phone: '01711111111', purpose: 'Admission enquiry', whom_to_meet: 'Principal', department: null, id_type: 'nid', id_number: '1990', badge_no: 'V-07', check_in: '2026-11-21T03:00:00Z', check_out: null, has_photo: false, photo_url: null, ...o })
const day = { date: '2026-11-21', inside: [v({})], left: [v({ id: 2, visitor_name: 'Rahima', check_out: '2026-11-21T04:00:00Z' })] }
const report = { from: '2026-11-21', to: '2026-11-21', total: 2, per_day: { '2026-11-21': 2 }, per_purpose: { 'admission enquiry': 2 }, entries: [v({}), v({ id: 2, visitor_name: 'Rahima' })] }

// D240 VIS.2: the day's lists, check-in with a photo (multipart), check-out, the admin's correction, the report; read-only staff
describe('visitor log screen (D240)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put', 'patch']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {}, openConfirm: (c) => c.onConfirm() })
    useStaffDepartmentStore.getState().clear()
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/visitors/report' ? report : day } }))
    for (const f of ['post', 'put', 'patch']) api[f].mockResolvedValue({ data: { data: {} } })
  })

  it('the admin checks a visitor in with a photo, checks one out and corrects one', async () => {
    useAuthStore.setState({ user: { id: 1, role: 'admin' } })
    at('/admin/visitors', <Visitors />)
    expect(await screen.findByTestId('inside')).toHaveTextContent('Karim Uddin')
    expect(screen.getByTestId('left')).toHaveTextContent('Rahima')
    const form = screen.getByTestId('visitor-form')
    fireEvent.change(form.querySelector('[name=visitor_name]'), { target: { value: 'Jamal' } })
    fireEvent.change(form.querySelector('[name=purpose]'), { target: { value: 'Delivery' } })
    const file = new File(['x'], 'j.png', { type: 'image/png' })
    fireEvent.change(form.querySelector('input[type=file]'), { target: { files: [file] } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, fd] = api.post.mock.calls[0]
    expect(url).toBe('/visitors/check-in')
    expect([fd.get('visitor_name'), fd.get('purpose'), fd.get('photo'), fd.get('visitor_phone')]).toEqual(['Jamal', 'Delivery', file, null])
    fireEvent.click(screen.getByTestId('inside').querySelector('[data-action=check-out]'))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/visitors/1/check-out'))
    expect(screen.getByTestId('left').querySelector('[data-action=check-out]')).toBeNull()
    fireEvent.click(screen.getByTestId('inside').querySelector('[data-action=edit]'))
    const edit = screen.getByTestId('visitor-form')
    expect(edit.querySelector('input[type=file]')).toBeNull()
    fireEvent.change(edit.querySelector('[name=purpose]'), { target: { value: 'Fee enquiry' } })
    fireEvent.submit(edit)
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/visitors/1', expect.objectContaining({ purpose: 'Fee enquiry', visitor_name: 'Karim Uddin', department: null })))
  })

  it('the report shows totals and counts', async () => {
    useAuthStore.setState({ user: { id: 1, role: 'admin' } })
    at('/admin/visitors', <Visitors />)
    await screen.findByTestId('inside')
    fireEvent.click(screen.getByRole('tab', { name: 'Report' }))
    expect(await screen.findByTestId('report-total')).toHaveTextContent('2 visitors in all')
    expect(screen.getByTestId('per-purpose')).toHaveTextContent('admission enquiry')
    expect(api.get).toHaveBeenCalledWith('/visitors/report', expect.objectContaining({ params: expect.objectContaining({ from: expect.any(String), to: expect.any(String) }) }))
  })

  it('read-only staff see the lists without the form or buttons', async () => {
    useAuthStore.setState({ user: { id: 60, role: 'institution_staff' } })
    useStaffDepartmentStore.getState().select({ id: 2, name: 'Gate' }, ['staff.visitor.read'])
    at('/staff/visitors', <StaffVisitors />)
    await screen.findByTestId('inside')
    expect(screen.queryByTestId('visitor-form')).toBeNull()
    expect(document.querySelector('[data-action=check-out]')).toBeNull()
    expect(document.querySelector('[data-action=edit]')).toBeNull()
  })
})
