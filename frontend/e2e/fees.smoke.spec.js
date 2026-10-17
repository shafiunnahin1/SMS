import { test, expect } from '@playwright/test'
import { login, tenantOf, watchConsole } from './helpers.js'

// Step 4.4 on all three demo tenants: the admin adds a fee head, then sees the collection list and the month report.
// (Counter collection -> receipt -> parent is F2, slice.smoke, on the school.)
test('4.4 fees: a new fee head, the collection list and the month report', async ({ page }, testInfo) => {
  const noErrors = watchConsole(page)
  const name = `Exam ${Date.now().toString().slice(-6)}`
  await login(page, ...tenantOf(testInfo).admin)

  await page.goto('/admin/fees/categories')
  await page.getByRole('button', { name: 'নতুন খাত' }).click()
  const form = page.locator('[role="dialog"] form')
  await form.locator('input[name="name"]').fill(name)
  await form.locator('input[name="amount"]').fill('150')
  await form.locator('select[name="frequency"]').selectOption('once')
  await form.locator('button[type="submit"]').click()
  await expect(page.locator('main')).toContainText(name)

  await page.goto('/admin/fees/dues')
  await expect(page.locator('[data-testid="fee-receipts"]')).toBeVisible()
  await page.getByRole('tab', { name: 'মাসিক রিপোর্ট' }).click()
  await expect(page.locator('[data-testid="fee-report-summary"]')).toContainText('৳')
  noErrors()
})
