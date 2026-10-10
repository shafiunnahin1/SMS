import { test, expect } from '@playwright/test'
import { login, tenantOf, watchConsole } from './helpers.js'

// Step 4.6 on all three demo tenants: the admin sees the SMS balance and this month's use, the SMS log and the credit ledger
test('4.6 sms: balance, log and ledger', async ({ page }, testInfo) => {
  const noErrors = watchConsole(page)
  await login(page, ...tenantOf(testInfo).admin)
  await page.goto('/admin/sms')
  await expect(page.locator('[data-testid="sms-usage"]')).toBeVisible()
  await expect(page.locator('main')).toContainText(/পাঠানো SMS/)
  await page.getByRole('tab', { name: 'ক্রেডিটের হিসাব' }).click()
  await expect(page.locator('main')).toContainText(/ক্রেডিট/)
  noErrors()
})
