import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import { useStaffDepartmentStore } from '../store/staffDepartmentStore'
import { buildNav } from '../nav/menu'
import Leads from '../pages/leads/Leads'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const at = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Leads /></MemoryRouter></QueryClientProvider>)
const lead = { id: 3, name: 'Rafi', phone: '01711223344', status: 'new', source: 'walk_in', referred_by: null, referrer: null }
const as = (role, permissions = []) => { useAuthStore.setState({ role }); useStaffDepartmentStore.setState({ department: role === 'institution_staff' ? 5 : null, permissions }) }

// D204 GAP.3: the leads screen draws only what the viewer may do - the accountant reads, a staff member acts by their duty keys,
// admit and delete stay the admin's; the staff menu entry needs staff.lead.read
describe('lead actions by role and duty key (D204 GAP.3)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put', 'delete']) api[f].mockReset(); i18n.changeLanguage('en')
    api.get.mockImplementation((url) => Promise.resolve({ data: url === '/leads' ? { data: [lead], meta: { total: 1, follow_up_today: 0 } }
      : url === '/leads/referral-summary' ? { data: [], meta: { applications: 0, admitted: 0 } } : { data: [] } }))
  })
  afterEach(() => as(null))

  it('the accountant only reads', async () => {
    as('accountant')
    at()
    expect(await screen.findByText('Rafi')).toBeInTheDocument()
    for (const b of ['New application', 'Admit', 'Delete']) expect(screen.queryByText(b)).toBeNull()
    expect(screen.getAllByLabelText('Status')).toHaveLength(1)          // the filter only
  })

  it('staff with the update key edit, without create; never admit or delete', async () => {
    as('institution_staff', ['staff.lead.read', 'staff.lead.update'])
    at()
    expect(await screen.findByText('Rafi')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Status')).toHaveLength(2)          // the filter and the lead's own
    for (const b of ['New application', 'Admit', 'Delete']) expect(screen.queryByText(b)).toBeNull()
  })

  it('staff with the create key may add a lead', async () => {
    as('institution_staff', ['staff.lead.read', 'staff.lead.create'])
    at()
    expect(await screen.findByText('New application')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Status')).toHaveLength(1)
  })

  it('the staff menu shows the leads entry only with staff.lead.read', () => {
    const paths = (keys) => buildNav('institution_staff', { modules: ['leads'], release: 'R3', staffKeys: keys }).flatMap(i => i.children ?? [i]).map(i => i.path)
    expect(paths(['staff.lead.read'])).toContain('/staff/leads')
    expect(paths(['staff.lead.create'])).not.toContain('/staff/leads')
  })
})
