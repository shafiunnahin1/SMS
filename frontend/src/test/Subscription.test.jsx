import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import Subscription from '../pages/admin/subscription/Subscription'
import Coupons, { monthsFromToday } from '../pages/super/Coupons'
import ModulePrices from '../pages/super/ModulePrices'
import SubscriptionStatus from '../pages/super/SubscriptionStatus'
import { buildNav } from '../nav/menu'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))

const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const mod = (k, extra = {}) => ({ module_key: k, state: 'trial', billing_cycle: null, trial_ends_at: '2026-12-02T10:00:00+06:00', current_period_end: null,
  cancel_at_period_end: false, requires: [], monthly_price: '300.00', yearly_price: '3000.00', ...extra })

// D187 SUB.3: the institution's subscription page and the Super Admin's prices, coupons and status pages
describe('module subscriptions (D187)', () => {
  afterEach(() => vi.clearAllMocks())

  it('quotes the chosen modules, pays with bKash and removes a module from the next period', async () => {
    api.get.mockImplementation(url => Promise.resolve({ data: { data: url === '/subscription/modules'
      ? { modules: [mod('expenses'), mod('fees', { state: 'active', billing_cycle: 'monthly', current_period_end: '2027-01-02T10:00:00+06:00' }), mod('cashbook', { requires: ['expenses'] })], grace_days: 7, coupon: null }
      : [] } }))
    api.post.mockImplementation(url => Promise.resolve({ data: { data: url === '/subscription/quote'
      ? { lines: [{ module_key: 'expenses', billing_cycle: 'yearly', period_start: '2026-12-02T10:00:00+06:00', period_end: '2027-12-02T10:00:00+06:00', days: 365, unit_price: '3000.00', amount: '3000.00', discount: '0.00' }],
          subtotal: '3000.00', discount: '0.00', tax: '0.00', total: '3000.00', coupon_id: null }
      : url === '/subscription/checkout' ? { paid: false, bkash_url: 'https://sandbox.bkash.test/pay/PAY1', ref: 'SUB1PX', total: '3000.00' } : {} } }))
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const { container } = wrap(<Subscription />)
    await screen.findByTestId('subscription')
    expect(screen.getAllByText(/Needs|সাথে লাগবে/).length).toBeGreaterThan(0)
    fireEvent.change(container.querySelector('select[data-module="expenses"]'), { target: { value: 'yearly' } })
    fireEvent.click(container.querySelector('[data-action="quote"]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/subscription/quote', { items: [{ module_key: 'expenses', billing_cycle: 'yearly' }] }))
    expect((await screen.findByTestId('bill-total')).textContent).toMatch(/3,000|৩,০০০/)
    fireEvent.click(container.querySelector('[data-action="pay"]'))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://sandbox.bkash.test/pay/PAY1'))
    expect(api.post).toHaveBeenCalledWith('/subscription/checkout', { items: [{ module_key: 'expenses', billing_cycle: 'yearly' }] })
    expect(JSON.stringify(api.post.mock.calls)).not.toMatch(/"amount"|"total"/)          // the client never sends money
    fireEvent.click(container.querySelector('[data-cancel="fees"]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/subscription/modules/cancel', { module_key: 'fees' }))
    vi.unstubAllGlobals()
  })

  it('redeems a coupon and shows a running one', async () => {
    let coupon = null
    api.get.mockImplementation(url => Promise.resolve({ data: { data: url === '/subscription/modules' ? { modules: [mod('expenses')], grace_days: 7, coupon } : [] } }))
    api.post.mockImplementation(() => { coupon = { code: 'HELLO25', percent: '25.00', modules: null, until: '2027-02-02T10:00:00+06:00' }; return Promise.resolve({ data: { data: coupon } }) })
    wrap(<Subscription />)
    const form = await screen.findByTestId('coupon-form')
    fireEvent.change(form.querySelector('[name="code"]'), { target: { value: 'hello25' } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/subscription/coupon', { code: 'hello25' }))
    expect((await screen.findByTestId('coupon-running')).textContent).toMatch(/HELLO25/)
  })

  it('creates a coupon with presets, chosen modules and limits, and pauses it', async () => {
    api.get.mockImplementation(url => Promise.resolve({ data: { data: url === '/super/module-prices'
      ? [{ module_key: 'expenses', monthly_price: '0.00', yearly_price: '0.00' }, { module_key: 'fees', monthly_price: '0.00', yearly_price: '0.00' }]
      : [{ id: 4, code: 'HELLO25', percent: '25.00', valid_until: '2027-02-02', discount_months: 3, applies_to_modules: ['expenses'], applies_to_types: null,
          max_redemptions: 2, per_institution_limit: 1, redeemed_count: 1, status: 'active', note: null, discount_given: '75.00' }] } }))
    api.post.mockResolvedValue({ data: { data: {} } })
    api.patch.mockResolvedValue({ data: { data: {} } })
    const { container } = wrap(<Coupons />)
    const form = await screen.findByTestId('coupon-new')
    fireEvent.change(form.querySelector('[name="code"]'), { target: { value: 'NEW10' } })
    fireEvent.change(form.querySelector('[name="value"]'), { target: { value: '10' } })
    fireEvent.change(form.querySelector('[name="until"]'), { target: { value: '6' } })
    fireEvent.change(form.querySelector('[name="months"]'), { target: { value: 'custom' } })
    fireEvent.change(await within(form).findByRole('textbox', { name: /Discount lasts|ছাড় চলবে/ }), { target: { value: '2' } })
    fireEvent.click(form.querySelector('[name="allModules"]'))
    fireEvent.click((await within(form).findByTestId('coupon-modules')).querySelector('input[value="fees"]'))
    fireEvent.click(form.querySelector('input[value="coaching"]'))
    fireEvent.change(form.querySelector('[name="max"]'), { target: { value: '50' } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/super/coupons', { code: 'NEW10', value: '10', valid_until: monthsFromToday(6), discount_months: 2,
      applies_to_modules: ['fees'], applies_to_types: ['coaching'], max_redemptions: 50, per_institution_limit: 1, note: null }))
    fireEvent.click(container.querySelector('[data-coupon="HELLO25"]'))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/super/coupons/4/status', { status: 'paused' }))
  })

  it('month presets never overflow into the next month', () => {
    expect(monthsFromToday(1, new Date(2027, 0, 31))).toBe('2027-02-28')
    expect(monthsFromToday(12, new Date(2026, 10, 2))).toBe('2027-11-02')
  })

  it('saves a module price and lists institution states', async () => {
    api.get.mockImplementation(url => Promise.resolve({ data: url === '/super/module-prices'
      ? { data: [{ module_key: 'expenses', monthly_price: '0.00', yearly_price: '0.00', effective_from: null }] }
      : { data: [{ id: 7, name: 'Alpha School', institution_type: 'school', status: 'active', counts: { trial: 3, active: 1, grace: 0, read_only: 2 }, next_end: null }], meta: { page: 1, last_page: 1 } } }))
    api.post.mockResolvedValue({ data: { data: {} } })
    const p = wrap(<ModulePrices />)
    const row = await waitFor(() => { const r = p.container.querySelector('form[data-module="expenses"]'); if (!r) throw new Error('row'); return r })
    fireEvent.change(row.querySelector('[name="monthly_price"]'), { target: { value: '150.50' } })
    fireEvent.change(row.querySelector('[name="yearly_price"]'), { target: { value: '1500' } })
    fireEvent.submit(row)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/super/module-prices', { module_key: 'expenses', monthly_price: '150.50', yearly_price: '1500' }))
    p.unmount()
    const s = wrap(<SubscriptionStatus />)
    expect((await s.findAllByText('Alpha School'))[0].getAttribute('href')).toBe('/super-admin/institutions/7')
    fireEvent.change(s.getByTestId('state-filter'), { target: { value: 'read_only' } })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/super/subscriptions', { params: { page: 1, state: 'read_only' } }))
  })

  it('is in the right menus', () => {
    const paths = (role) => buildNav(role).flatMap(i => i.children ?? [i]).map(i => i.path)
    for (const p of ['/super-admin/subscriptions', '/super-admin/module-prices', '/super-admin/coupons']) {
      expect(paths('super_admin')).toContain(p)
      expect(paths('admin')).not.toContain(p)
    }
    expect(paths('admin')).toContain('/admin/subscription')
  })
})
