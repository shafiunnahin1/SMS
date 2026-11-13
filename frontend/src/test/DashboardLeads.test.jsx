import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import Dashboard from '../pages/common/Dashboard'
import Leads from '../pages/leads/Leads'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, bindAuthStore: () => {} }))
const at = (path) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <MemoryRouter initialEntries={[path]}><Routes><Route path="/admin/dashboard" element={<Dashboard />} /><Route path="/admin/leads" element={<Leads />} /></Routes></MemoryRouter></QueryClientProvider>)
const base = { students: 3, teachers: 2, batches: 2, sms_balance: '10.00', exams_open: 0,
  attendance_today: { present: 1, absent: 0, leave: 0, batches_taken: 1, batches_total: 2 }, collection: { today: '0.00', month: '0.00', receipts_today: 0 } }

// D204 GAP.2: the admin dashboard's admission card links to the leads list with the matching filter; no card without the module
describe('dashboard admission card (D204 GAP.2)', () => {
  beforeEach(() => { api.get.mockReset(); i18n.changeLanguage('en'); useAuthStore.setState({ role: 'admin', user: { name: 'Admin' } }) })
  afterEach(() => useAuthStore.setState({ role: null, user: null }))

  it('shows the counts with links carrying the filters', async () => {
    api.get.mockResolvedValue({ data: { data: { ...base, leads: { follow_up_today: 2, website_7_days: 5, today: '2030-07-10', since: '2030-07-03' } } } })
    at('/admin/dashboard')
    const card = await screen.findByTestId('dashboard-leads')
    expect(card.querySelector('a[href="/admin/leads?follow_up_date=2030-07-10"]')).toHaveTextContent('2')
    expect([...card.querySelectorAll("a")].map(a => a.getAttribute("href"))).toContain("/admin/leads?source=website&created_from=2030-07-03")
    expect(card).toHaveTextContent("5")
  })

  it('no card without the module', async () => {
    api.get.mockResolvedValue({ data: { data: base } })
    at('/admin/dashboard')
    await screen.findByText('Admin', { exact: false })
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByTestId('dashboard-leads')).toBeNull()
  })

  it('the leads list reads the link filters', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: url === '/leads' ? { data: [], meta: { total: 0, follow_up_today: 0 } }
      : url === '/leads/referral-summary' ? { data: [], meta: { applications: 0, admitted: 0 } } : { data: [] } }))
    at('/admin/leads?source=website&created_from=2030-07-03')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/leads', { params: { source: 'website', created_from: '2030-07-03' } }))
  })
})
