import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { watchConsole } from './helpers.js'

// Step 5.3 on the central host (admin.<base>): the Super Admin opens an institution with its admin, adds SMS money, switches a
// module off, suspends it, and sets the universal SMS rate. Runs once (school-desktop project) - it is not about a tenant theme.
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })
// The Super Admin always signs in with a one-time code; in local/CI the code only goes to the API's log (G17, OtpService::sms)
const API_LOG = process.env.E2E_API_LOG ?? new URL('../../api/storage/logs/laravel.log', import.meta.url).pathname
const readLog = () => { try { return readFileSync(API_LOG, 'utf8') } catch { return '' } }      // a fresh CI checkout has no log until the first line
const lastCode = () => [...readLog().matchAll(/\[dev sms\] to 017\*+00: \D*(\d{4,8})/g)].at(-1)?.[1]

async function loginSuper(page) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  const before = lastCode()
  const fields = page.locator('form input')
  await fields.nth(0).fill('admin@schoolapp.com')
  await fields.nth(1).fill('Admin@1234')
  await page.locator('form button[type="submit"]').click()
  await expect.poll(lastCode).not.toBe(before)
  await page.locator('form input').first().fill(lastCode())
  await page.locator('form button[type="submit"]').click()
  await expect(page).toHaveURL(/\/super-admin\/dashboard/)
}

test('5.3 super admin: institutions, wallet, modules, settings', async ({ page }) => {
  const noErrors = watchConsole(page)
  await loginSuper(page)
  await page.goto('/super-admin/institutions')
  await expect(page.locator('main')).toContainText('dhanmondi-school')

  const slug = `e2e-${Date.now().toString(36)}`
  await page.locator('[data-action="new"]').click()
  const form = page.locator('[data-testid="new-institution"]')
  await form.locator('input[name="name"]').fill('E2E Coaching')
  await form.locator('input[name="slug"]').fill(slug)
  await form.locator('input[name="admin_name"]').fill('E2E Admin')
  await form.locator('input[name="admin_phone"]').fill('01755555555')
  await form.locator('input[name="admin_password"]').fill('E2e-pass-123')
  await form.locator('button[type="submit"]').click()
  await expect(page.locator('[data-testid="institution-detail"]')).toContainText(`${slug}.`)

  const wallet = page.locator('[data-testid="wallet"]')
  await wallet.locator('input[name="amount"]').fill('250')
  await wallet.locator('input[name="note"]').fill('cash')
  await wallet.locator('[data-action="adjust"]').click()
  await expect(wallet).toContainText('250')

  await page.locator('[data-module="exams"]').selectOption('off')
  await expect(page.locator('[data-module="exams"]')).toHaveValue('off')

  await page.locator('[data-action="toggle"]').click()
  await page.getByRole('alertdialog').getByRole('button').last().click()
  await expect(page.locator('[data-testid="institution-detail"] [data-status]').first()).toHaveAttribute('data-status', 'suspended')

  await page.goto('/super-admin/settings')
  await page.locator('input[name="rate"]').fill('0.40')
  await page.locator('[data-action="save"]').click()
  await expect(page.locator('[data-testid="platform-settings"]')).toContainText('0.4')
  noErrors()
})
